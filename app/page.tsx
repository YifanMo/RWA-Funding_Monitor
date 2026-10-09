"use client";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Activity, RefreshCw, Search, ChevronRight, CircleHelp, Radio, ArrowDownUp, ExternalLink, BarChart3, Globe2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { exchangeInfo } from "@/lib/exchanges/exchange-info";
import type { Contract, Feed, HistoryPoint } from "@/lib/exchanges/types";
import { FundingHistoryChart } from "@/components/funding-history-chart";
import { fundingSeries } from "@/lib/funding-history";

type Market = "CN" | "HK" | "US";
type Snapshot = { contracts:Contract[]; feeds:Feed[]; fetchedAt:number; stale?:boolean };
const marketLabels = {CN:"A 股",HK:"港股",US:"美股"};
const venues = exchangeInfo.map(e=>e.venue);
const REFRESH_INTERVAL_MS=60*60*1000;
const seed:Contract[] = [
  {id:"hyperliquid:xyz:CXMT",asset:"CXMT",symbol:"xyz:CXMT",name:"长鑫科技",market:"CN",venue:"Hyperliquid",builder:"xyz",rate:null,intervalHours:1,markPrice:null,volume24h:null,openInterestUsd:null,nextFundingTime:null,fetchedAt:0,tradeUrl:"https://app.hyperliquid.xyz/trade/xyz:CXMT",quoteAsset:"USD"},
  {id:"hyperliquid:xyz:UNITREE",asset:"UNITREE",symbol:"xyz:UNITREE",name:"宇树科技",market:"CN",venue:"Hyperliquid",builder:"xyz",rate:null,intervalHours:1,markPrice:null,volume24h:null,openInterestUsd:null,nextFundingTime:null,fetchedAt:0,tradeUrl:"https://app.hyperliquid.xyz/trade/xyz:UNITREE",quoteAsset:"USD"},
  {id:"hyperliquid:xyz:GIGADEV",asset:"GIGADEV",symbol:"xyz:GIGADEV",name:"兆易创新",market:"CN",venue:"Hyperliquid",builder:"xyz",rate:null,intervalHours:1,markPrice:null,volume24h:null,openInterestUsd:null,nextFundingTime:null,fetchedAt:0,quoteAsset:"USD",tradeUrl:"https://app.hyperliquid.xyz/trade/xyz:GIGADEV"},
];
const num=(v:number|null)=>v===null?"—":v.toLocaleString("en-US",{maximumFractionDigits:v<1?4:2});
const money=(v:number|null)=>v===null?"—":v>=1e9?`$${(v/1e9).toFixed(2)}B`:v>=1e6?`$${(v/1e6).toFixed(2)}M`:v>=1e3?`$${(v/1e3).toFixed(1)}K`:`$${v.toFixed(0)}`;
const normalized=(c:Contract,h=8)=>c.rate!==null&&c.intervalHours?c.rate*h/c.intervalHours:null;
const pct=(v:number|null,d=4)=>v===null?"—":`${v>0?"+":""}${(v*100).toFixed(d)}%`;
const tone=(v:number|null)=>v===null?"neutral":v>=0?"positive":"negative";
const time=(v:number|null)=>v?new Date(v).toLocaleTimeString("zh-CN",{hour12:false,timeZone:"Asia/Shanghai"}):"待同步";

export default function Home(){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[loading,setLoading]=useState(true),[fetchError,setFetchError]=useState("");
 const [market,setMarket]=useState("CN"),[venue,setVenue]=useState("all"),[query,setQuery]=useState(""),[sort,setSort]=useState("rate-desc");
 const [selected,setSelected]=useState("hyperliquid:xyz:CXMT"),[range,setRange]=useState("7"),[history,setHistory]=useState<HistoryPoint[]>([]),[historyLoading,setHistoryLoading]=useState(false),[historyError,setHistoryError]=useState("");
 const [now,setNow]=useState(0),[lastRequest,setLastRequest]=useState(0);
 const refreshing=useRef(false);
 const refresh=useCallback(async()=>{
  if(refreshing.current)return;refreshing.current=true;
  setLoading(true);setFetchError("");
  try{
   const abort=new AbortController();const timeout=setTimeout(()=>abort.abort(),9000);
   let body:Snapshot;
   try{const r=await fetch("/api/markets",{cache:"no-store",signal:abort.signal});if(!r.ok)throw Error("数据请求失败");body=await r.json() as Snapshot;}
   catch{body={contracts:[],feeds:venues.map(v=>({venue:v as Feed["venue"],status:"error",count:0,fetchedAt:null,error:"暂时无法连接"})),fetchedAt:Date.now()};}
   finally{clearTimeout(timeout);}
   setSnapshot(body);
   if(body.feeds.some(f=>f.status==="error")){const {recoverPublicFeeds}=await import("@/lib/exchanges/client");body=await recoverPublicFeeds(body);setSnapshot(body);}
   }catch{setFetchError("暂时无法连接数据源，请稍后重试");}finally{refreshing.current=false;setLoading(false);setLastRequest(Date.now());setNow(Date.now());}
 },[]);
 useEffect(()=>{void refresh();const clock=setInterval(()=>setNow(Date.now()),60000);return()=>clearInterval(clock);},[refresh]);
 useEffect(()=>{if(!lastRequest)return;const timer=setTimeout(()=>void refresh(),REFRESH_INTERVAL_MS);return()=>clearTimeout(timer);},[lastRequest,refresh]);
 const contracts=snapshot?.contracts??seed;
 const filtered=useMemo(()=>contracts.filter(c=>(market==="all"||c.market===market)&&(venue==="all"||c.venue===venue)&&`${c.asset} ${c.name} ${c.symbol} ${c.builder??""}`.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>{if(sort==="name")return a.asset.localeCompare(b.asset);const av=sort==="volume"?a.volume24h:normalized(a),bv=sort==="volume"?b.volume24h:normalized(b);if(av===null)return 1;if(bv===null)return -1;return sort==="rate-asc"?av-bv:bv-av;}),[contracts,market,venue,query,sort]);
 const active=filtered.find(c=>c.id===selected)??filtered[0];
 const [historyMeta,setHistoryMeta]=useState({excludedSpecialCount:0,intervalMethod:""});
 useEffect(()=>{
  if(!active){setHistory([]);return;}let cancelled=false;const abort=new AbortController();
  setHistoryLoading(true);setHistoryError("");setHistory([]);setHistoryMeta({excludedSpecialCount:0,intervalMethod:""});
  (async()=>{
   type Result={points:HistoryPoint[];error?:string;excludedSpecialCount:number;intervalMethod:string};
   let result:Result;
   const timeout=setTimeout(()=>abort.abort(),10000);
   try{const r=await fetch(`/api/history?id=${encodeURIComponent(active.id)}&days=${range}`,{signal:abort.signal});const j=await r.json() as Result;if(!r.ok)throw Error(j.error||"读取失败");result=j;}
   catch{if(cancelled)return;const {directHistory}=await import("@/lib/exchanges/client");result=await directHistory(active.venue,active.symbol,Number(range) as 1|7|30);}
   finally{clearTimeout(timeout);}
   if(!cancelled){setHistory(result.points);setHistoryMeta({excludedSpecialCount:result.excludedSpecialCount,intervalMethod:result.intervalMethod});}
  })().catch(()=>{if(!cancelled)setHistoryError("暂时无法读取该合约历史，请稍后重试");}).finally(()=>{if(!cancelled)setHistoryLoading(false);});
  return()=>{cancelled=true;abort.abort();};
 },[active?.id,range,lastRequest]);
 const stateRef=useRef({snapshot,market,venue,query,sort});stateRef.current={snapshot,market,venue,query,sort};
 useEffect(()=>{
  type Tool={name:string;title:string;description:string;inputSchema:object;annotations:{readOnlyHint:boolean;untrustedContentHint:boolean};execute:(input:unknown)=>unknown};
  const context=(document as unknown as {modelContext?:{registerTool:(tool:Tool,options:{signal:AbortSignal})=>void}}).modelContext;
  if(!context?.registerTool)return;const lifecycle=new AbortController();
  const register=(tool:Tool)=>{try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
  register({name:"read_funding_monitor",title:"读取股票资金费率",description:"读取当前三个场所的公开股票永续合约费率、结算周期及连接状态。",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>{const s=stateRef.current;return {feeds:s.snapshot?.feeds??[],filters:{market:s.market,venue:s.venue,query:s.query,sort:s.sort},contracts:s.snapshot?.contracts??[]};}});
  register({name:"set_funding_filters",title:"筛选股票费率监控",description:"更新页面的市场、交易所或股票搜索筛选，不进行交易。",inputSchema:{type:"object",properties:{market:{type:"string",enum:["all","CN","HK","US"]},venue:{type:"string",enum:["all",...venues]},query:{type:"string"}},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:async input=>{if(!input||typeof input!=="object")throw Error("Invalid filters");const v=input as Record<string,unknown>;if(Object.keys(v).some(k=>!["market","venue","query"].includes(k))||v.market!==undefined&&!["all","CN","HK","US"].includes(String(v.market))||v.venue!==undefined&&!["all",...venues].includes(String(v.venue))||v.query!==undefined&&(typeof v.query!=="string"||v.query.length>100))throw Error("Invalid filters");if(v.market!==undefined)setMarket(String(v.market));if(v.venue!==undefined)setVenue(String(v.venue));if(v.query!==undefined)setQuery(String(v.query));await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));return {market:stateRef.current.market,venue:stateRef.current.venue,query:stateRef.current.query};}});
  return()=>lifecycle.abort();
 },[]);
 const unique=new Set(filtered.map(c=>`${c.market}:${c.asset}`)).size;
 const knownRates=filtered.map(c=>normalized(c)).filter((r):r is number=>r!==null);
 const max=knownRates.length?Math.max(...knownRates):null;
 const countdown=lastRequest?Math.max(0,Math.ceil((REFRESH_INTERVAL_MS-((now||lastRequest)-lastRequest))/60000)):60;
 const cumulativePoints=useMemo(()=>fundingSeries(history),[history]);
 const cumulativeRate=cumulativePoints.length?cumulativePoints[cumulativePoints.length-1].cumulativeRatePercent/100:null;
 const completePoints=history.filter(p=>p.intervalHours!==null);
 const historyAvg=completePoints.length?completePoints.reduce((s,p)=>s+p.rate,0)/completePoints.reduce((s,p)=>s+p.intervalHours!,0):null;
 return <main className="dashboard">
  <header className="topbar"><a className="brand" href="/" aria-label="RWA Funding 首页"><span className="brand-icon"><Activity size={23}/></span><span>RWA<span className="brand-light">FUNDING</span></span></a><span className="header-divider"/><span className="workspace-label">股票资金费率监控</span><div className="top-right"><span className="live-label"><Radio size={14}/> {loading?"同步中":snapshot?.feeds.every(f=>f.status==="error")?"连接异常":"每小时监控"}</span><span className="timezone">UTC+8</span></div></header>
  <div className="content"><div className="title-row"><div><div className="eyebrow">MARKET MONITOR <span>/ 01</span></div><h1>股票资金费率</h1><p className="intro">Hyperliquid · Binance · Aster</p></div><button className="refresh-button" onClick={refresh} disabled={loading}><RefreshCw size={15} className={loading?"spinning":""}/>{loading?"正在同步":"刷新数据"}</button></div>
  <div className="feed-strip">{venues.map(v=>{const f=snapshot?.feeds.find(f=>f.venue===v);return <button key={v} onClick={()=>setVenue(venue===v?"all":v)} className={`feed-card ${venue===v?"chosen":""}`} aria-pressed={venue===v}><span className={`venue-logo ${v.toLowerCase()}`}>{exchangeInfo.find(e=>e.venue===v)?.initial??v.slice(0,1)}</span><span className="feed-name">{v}<small>{f?f.status==="ok"?`${f.count} 个股票合约`:f.status==="partial"?"部分数据缺失":f.status==="stale"?"报价数据延迟":"暂时无法连接":"等待数据源"}</small></span><span className={`status-dot ${f?.status==="ok"?"ok":f?.status==="partial"||f?.status==="stale"?"partial":"waiting"}`}/></button>})}<div className="sync-meta"><span>每 1 小时更新</span><span>{loading?"读取交易所公开数据…":`${countdown} 分钟后刷新 · ${time(snapshot?.fetchedAt??null)}`}</span></div></div>
  {(fetchError||snapshot?.feeds.some(f=>f.status!=="ok"))&&<div className="notice" role="status">{fetchError||snapshot?.feeds.filter(f=>f.status!=="ok").map(f=>`${f.venue}：${f.error||"部分市场暂时不可用"}`).join("；")}。已成功读取的数据仍可查看。</div>}
  <Tabs value={market} onValueChange={setMarket} className="market-tabs"><TabsList variant="line">{[["all","全部市场"],["CN","A 股"],["HK","港股"],["US","美股"]].map(([id,label])=><TabsTrigger value={id} key={id}>{label}<span className="tab-count">{snapshot?new Set(contracts.filter(c=>id==="all"||c.market===id).map(c=>`${c.market}:${c.asset}`)).size:"—"}</span></TabsTrigger>)}</TabsList></Tabs>
  <section className="stats" aria-label="当前筛选统计"><div><span>监控标的 <Globe2 size={14}/></span><strong>{snapshot?unique:"—"}<small> 个</small></strong><p>{snapshot?`${filtered.length} 个可交易合约` : "正在发现可交易股票合约"}</p></div><div><span>最高资金费率 <Activity size={14}/></span><strong className={tone(max)}>{pct(max)}<small> / 8h</small></strong><p>按当前费率等比换算</p></div><div><span>24h 合约成交额 <BarChart3 size={14}/></span><strong>{filtered.some(c=>c.volume24h!==null)?money(filtered.reduce((s,c)=>s+(c.volume24h??0),0)):"—"}</strong><p>{market==="all"?"全部市场":marketLabels[market as Market]} · {venue==="all"?"全部交易所":venue}</p></div></section>
  <section className="monitor-panel"><div className="panel-heading"><div><h2>资金费率一览</h2><span className="subtle">点击合约查看历史走势</span></div><div className="filters"><div className="search-field"><Search size={15}/><input aria-label="搜索股票" placeholder="搜索代码或名称" value={query} onChange={e=>setQuery(e.target.value)}/></div><Select value={venue} onValueChange={setVenue}><SelectTrigger aria-label="交易所筛选"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">全部交易所</SelectItem>{venues.map(v=><SelectItem value={v} key={v}>{v}</SelectItem>)}</SelectContent></Select><Select value={sort} onValueChange={setSort}><SelectTrigger aria-label="排序方式"><ArrowDownUp size={14}/><SelectValue/></SelectTrigger><SelectContent><SelectItem value="rate-desc">费率从高到低</SelectItem><SelectItem value="rate-asc">费率从低到高</SelectItem><SelectItem value="volume">成交额从高到低</SelectItem><SelectItem value="name">按股票代码</SelectItem></SelectContent></Select></div></div>
   <Table className="funding-table"><TableHeader><TableRow><TableHead>股票 / 合约</TableHead><TableHead>交易场所</TableHead><TableHead className="numeric">当前预计费率</TableHead><TableHead className="numeric">统一费率 / 8h</TableHead><TableHead className="numeric">简单年化 <CircleHelp size={12} className="inline-icon"/></TableHead><TableHead className="numeric">24h 成交额</TableHead><TableHead className="numeric">标记价格</TableHead><TableHead/></TableRow></TableHeader><TableBody>{filtered.map(c=><TableRow key={c.id} className={active?.id===c.id?"selected-row":""} onClick={()=>setSelected(c.id)}><TableCell><button className="asset-button" onClick={()=>setSelected(c.id)} aria-label={`查看 ${c.symbol} ${c.venue} 历史`}><span className={`ticker-icon market-${c.market}`}>{c.asset.slice(0,2)}</span><span><strong>{c.asset}</strong><small>{c.name}</small></span></button></TableCell><TableCell><span className={`venue-text ${c.venue.toLowerCase()}`}>{c.venue}</span><small className="contract-id">{c.symbol}</small></TableCell><TableCell className={`numeric ${tone(c.rate)}`}>{pct(c.rate)}<small className="interval">{c.intervalHours?`每 ${c.intervalHours} 小时`:"周期待确认"}</small></TableCell><TableCell className={`numeric rate-emphasis ${tone(normalized(c))}`}>{pct(normalized(c))}</TableCell><TableCell className={`numeric ${tone(normalized(c,8760))}`}>{pct(normalized(c,8760),2)}</TableCell><TableCell className="numeric">{money(c.volume24h)}</TableCell><TableCell className="numeric">{num(c.markPrice)}<small className="interval">{c.quoteAsset}</small></TableCell><TableCell><ChevronRight size={15} className="row-chevron"/></TableCell></TableRow>)}</TableBody></Table>
   {!filtered.length&&<div className="empty-state"><Search size={25}/><strong>没有符合条件的股票合约</strong><span>试试切换市场、交易所，或清空搜索。</span><button onClick={()=>{setQuery("");setVenue("all");}}>重置筛选</button></div>}
   <div className="table-footer"><span>{snapshot?`${filtered.length} 个合约 · ${unique} 个标的` : "仅显示已核实标的，费率等待实时数据"}</span><span>正费率：多头支付 · 负费率：空头支付</span></div>
  </section>
  <section className="history-panel"><div className="chart-header"><div><div className="eyebrow">FUNDING HISTORY</div><h2>{active?`${active.asset} 资金费率历史`:"资金费率历史"}</h2><span className="subtle">{active?`${active.name} · ${active.venue} · ${active.symbol}`:"选择一个合约查看"} <span className="chart-unit">费率 + 累计</span></span></div><Tabs value={range} onValueChange={setRange}><TabsList>{[["1","24h"],["7","7 天"],["30","30 天"]].map(([v,l])=><TabsTrigger value={v} key={v}>{l}</TabsTrigger>)}</TabsList></Tabs></div>
   <div className="chart-layout"><div className="chart-area">{historyLoading?<div className="chart-empty"><RefreshCw size={20} className="spinning"/><span>读取资金费率历史…</span></div>:historyError?<div className="chart-empty"><Activity size={23}/><span>{historyError}</span></div>:history.length?<FundingHistoryChart points={history}/>:<div className="chart-empty"><Activity size={23}/><span>{active?"该合约暂无历史资金费率":"选择一个合约查看历史"}</span></div>}</div><div className="chart-summary"><span>当前预计费率</span><strong className={tone(active?.rate??null)}>{pct(active?.rate??null)}</strong><p>{active?.intervalHours?`每 ${active.intervalHours} 小时结算` : "结算周期待确认"}{active?.nextFundingTime?` · 下次 ${time(active.nextFundingTime)}`:""}</p><div className="summary-divider"/><span>所选区间平均 / 1h</span><strong className={tone(historyAvg)}>{pct(historyAvg)}</strong><p>{history.length} 条结算记录</p><div className="summary-divider"/><span>所选区间累计费率</span><strong className={tone(cumulativeRate)}>{pct(cumulativeRate)}</strong><p>正值多头支付 · 负值空头支付{historyMeta.excludedSpecialCount>0?` · 已排除 ${historyMeta.excludedSpecialCount} 条分红调整`:""}</p>{active&&<a href={active.tradeUrl} target="_blank" rel="noreferrer" className="trade-link">在 {active.venue} 查看 <ExternalLink size={13}/></a>}</div></div>
  </section>
  <footer className="page-footer"><div><CircleHelp size={15}/><p>简单年化 = 原始费率 ÷ 结算小时 × 24 × 365。当前费率是预估值，历史曲线为已结算记录；除 Hyperliquid 外，历史周期按相邻结算时间推算，无法确认的记录不参与换算。<br/>按合约跟踪的上市市场分类；A 股与 H 股分别展示。标记价以报价币计，成交额按美元等值展示。</p></div><span>数据来自交易所公开 API</span></footer>
  </div>
 </main>;
}
