"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {Activity,ArrowDownUp,BarChart3,ChevronRight,ExternalLink,Globe2,RefreshCw,Search} from "lucide-react";
import {Tabs,TabsList,TabsTrigger} from "@/components/ui/tabs";
import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell} from "@/components/ui/table";
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from "@/components/ui/select";
import type {Contract,HistoryResult} from "@/lib/exchanges/types";
import {compareFundingHistory,fundingPairs,pairCombination,pairInScope,pairLiquidity,pairMatchesQuery,type FundingPair,type PairHistory} from "@/lib/cross-exchange";
import {CrossFundingHistoryChart} from "./cross-funding-history-chart";

const labels={CN:"A 股",HK:"港股",US:"美股"};
const pct=(v:number|null,d=4)=>v===null?"—":`${v>0?"+":""}${(v*100).toFixed(d)}%`;
const tone=(v:number|null)=>v===null?"neutral":v<0?"negative":"positive";
const money=(v:number|null)=>v===null?"—":v>=1e9?`$${(v/1e9).toFixed(2)}B`:v>=1e6?`$${(v/1e6).toFixed(2)}M`:v>=1e3?`$${(v/1e3).toFixed(1)}K`:`$${v.toFixed(0)}`;
const time=(v:number)=>v?new Date(v).toLocaleTimeString("zh-CN",{hour12:false,timeZone:"Asia/Shanghai"}):"待同步";
const date=(v:number|null)=>v===null?"—":new Date(v).toLocaleString("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Shanghai"});
const legTitle=(c:Contract)=>`${c.venue}${c.builder?` · ${c.builder}`:""}`;

export function CrossExchangeMonitor({contracts,visible,hasSnapshot,lastRequest,venue,onOpen}:{contracts:Contract[];visible:boolean;hasSnapshot:boolean;lastRequest:number;venue:string;onOpen:()=>void}){
 const [market,setMarket]=useState("all"),[query,setQuery]=useState(""),[combination,setCombination]=useState("all"),[sort,setSort]=useState("spread-desc");
 const [selected,setSelected]=useState(""),[range,setRange]=useState("7");
 const [historyState,setHistoryState]=useState<{key:string;data:PairHistory|null;loading:boolean;error:string;excluded:number}>({key:"",data:null,loading:false,error:"",excluded:0});
 const pairs=useMemo(()=>fundingPairs(contracts),[contracts]);
 const combinations=useMemo(()=>[...new Set(pairs.map(pairCombination))].sort(),[pairs]);
 const filtered=useMemo(()=>pairs.filter(p=>pairInScope(p,market)&&pairMatchesQuery(p,query)&&(combination==="all"||pairCombination(p)===combination)&&(venue==="all"||p.a.venue===venue||p.b.venue===venue)).sort((a,b)=>{
  if(sort==="name")return a.stockCode.localeCompare(b.stockCode)||a.id.localeCompare(b.id);
  const av=sort==="liquidity"?pairLiquidity(a):a.hourlySpread,bv=sort==="liquidity"?pairLiquidity(b):b.hourlySpread;
  if(av===null&&bv===null)return a.id.localeCompare(b.id);if(av===null)return 1;if(bv===null)return -1;
  return (sort==="spread-asc"?av-bv:bv-av)||a.id.localeCompare(b.id);
 }),[pairs,market,query,combination,sort,venue]);
 const active=filtered.find(p=>p.id===selected)??filtered[0];
 const historyKey=active?JSON.stringify([active.id,active.short.id,active.long.id,range,lastRequest]):"";
 const currentHistory=historyState.key===historyKey?historyState:{key:historyKey,data:null,loading:visible&&Boolean(active),error:"",excluded:0};
 const history=visible?currentHistory.data:null,historyLoading=visible&&currentHistory.loading,historyError=visible?currentHistory.error:"",excluded=history?currentHistory.excluded:0;
 useEffect(()=>{
  if(!visible)return;
  if(!active){setHistoryState({key:"",data:null,loading:false,error:"",excluded:0});return;}
  let cancelled=false;
  const abort=new AbortController();setHistoryState({key:historyKey,data:null,loading:true,error:"",excluded:0});
  const load=async(leg:Contract):Promise<HistoryResult>=>{
   const timeout=setTimeout(()=>abort.abort(),10000);
   try{
    const response=await fetch(`/api/history?id=${encodeURIComponent(leg.id)}&days=${range}`,{signal:abort.signal});
    const body=await response.json() as HistoryResult&{error?:string};
    if(!response.ok||!Array.isArray(body.points)||!Number.isFinite(body.fetchedAt))throw Error(body.error||"历史数据无效");
    return body;
   }catch{
    if(cancelled)throw Error("Cancelled");
    const {directHistory}=await import("@/lib/exchanges/client");
    try{return await directHistory(leg.venue,leg.symbol,Number(range) as 1|7|30);}
    catch{throw Error(`${legTitle(leg)} 历史暂时不可用`);}
   }finally{clearTimeout(timeout);}
  };
  void Promise.all([load(active.short),load(active.long)]).then(([short,long])=>{
   if(cancelled)return;const end=Math.min(short.fetchedAt,long.fetchedAt,Date.now());
   setHistoryState({key:historyKey,data:compareFundingHistory(short.points,long.points,end-Number(range)*86400000,end),loading:false,error:"",excluded:short.excludedSpecialCount+long.excludedSpecialCount});
  }).catch(error=>{if(!cancelled)setHistoryState({key:historyKey,data:null,loading:false,error:error instanceof Error?error.message:"暂时无法读取两腿历史",excluded:0});});
  return()=>{cancelled=true;abort.abort();};
 },[visible,historyKey,active?.id,active?.short.id,active?.long.id,range]);

 const stateRef=useRef({pairs,filtered,active,history,historyKey,historyLoading,historyError,market,query,combination,sort,range,visible,venue});
 stateRef.current={pairs,filtered,active,history,historyKey,historyLoading,historyError,market,query,combination,sort,range,visible,venue};
 const setFilters=useCallback(async(input:unknown)=>{
  if(!input||typeof input!=="object"||Array.isArray(input))throw Error("Invalid filters");const v=input as Record<string,unknown>;
  if(Object.keys(v).some(k=>!["market","query","pairId","days"].includes(k))||v.market!==undefined&&(typeof v.market!=="string"||!["all","CN","HK","US"].includes(v.market))||v.query!==undefined&&(typeof v.query!=="string"||v.query.length>100)||v.days!==undefined&&(typeof v.days!=="number"||![1,7,30].includes(v.days))||v.pairId!==undefined&&(typeof v.pairId!=="string"||!stateRef.current.pairs.some(p=>p.id===v.pairId)))throw Error("Invalid filters");
  onOpen();if(v.market!==undefined)setMarket(String(v.market));if(v.query!==undefined)setQuery(String(v.query));if(v.days!==undefined)setRange(String(v.days));
  if(v.pairId!==undefined){setSelected(String(v.pairId));setMarket("all");setQuery("");setCombination("all");}
  await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
  return {market:stateRef.current.market,query:stateRef.current.query,days:Number(stateRef.current.range),selectedPairId:stateRef.current.active?.id??null};
 },[onOpen]);
 useEffect(()=>{
  type Tool={name:string;title:string;description:string;inputSchema:object;annotations:{readOnlyHint:boolean;untrustedContentHint:boolean};execute:(input:unknown)=>unknown};
  const registry=(document as unknown as {modelContext?:{registerTool:(tool:Tool,options:{signal:AbortSignal})=>void}}).modelContext;
  if(!registry?.registerTool)return;const lifecycle=new AbortController();
  const register=(tool:Tool)=>{try{void Promise.resolve(registry.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
  register({name:"read_cross_exchange_pairs",title:"读取跨交易所费率配对",description:"读取当前同股票、跨交易所的候选配对、两腿费率、方向和小时毛差。可按股票代码筛选并读取所选配对的历史。",inputSchema:{type:"object",properties:{stockCode:{type:"string"},includeHistory:{type:"boolean"}},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:input=>{
   const v=(input??{}) as Record<string,unknown>;if(!v||typeof v!=="object"||Array.isArray(v)||Object.keys(v).some(k=>!["stockCode","includeHistory"].includes(k))||v.stockCode!==undefined&&(typeof v.stockCode!=="string"||v.stockCode.length>30)||v.includeHistory!==undefined&&typeof v.includeHistory!=="boolean")throw Error("Invalid query");
   const s=stateRef.current;return {visible:s.visible,filters:{market:s.market,query:s.query,combination:s.combination,venue:s.venue,sort:s.sort,days:Number(s.range)},selectedPairId:s.active?.id??null,pairs:s.filtered.filter(p=>!v.stockCode||p.stockCode.toLowerCase()===String(v.stockCode).toLowerCase()).map(p=>({id:p.id,stockCode:p.stockCode,market:p.a.market,a:p.a,b:p.b,shortId:p.short.id,longId:p.long.id,directionConfirmed:p.hourlySpread!==null&&p.hourlySpread>0,hourlySpread:p.hourlySpread})),...(v.includeHistory?{history:s.history,historyStatus:{key:s.historyKey,shortId:s.active?.short.id??null,longId:s.active?.long.id??null,loading:s.historyLoading,error:s.historyError}}:{})};
  }});
  register({name:"set_cross_exchange_filters",title:"筛选跨交易所套利",description:"打开跨交易所页，按市场或股票代码筛选，选择配对及1/7/30天历史；不进行交易。",inputSchema:{type:"object",properties:{market:{type:"string",enum:["all","CN","HK","US"]},query:{type:"string"},pairId:{type:"string"},days:{type:"number",enum:[1,7,30]}},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:setFilters});
  return()=>lifecycle.abort();
 },[setFilters]);
 if(!visible)return null;
 const unique=new Set(filtered.map(p=>p.stockKey)).size;
 const spreads=filtered.flatMap(p=>p.hourlySpread===null?[]:[p.hourlySpread]);
 const max=spreads.length?Math.max(...spreads):null;
 return <div className="cross-monitor">
  <Tabs value={market} onValueChange={setMarket} className="market-tabs"><TabsList variant="line">{[["all","全部市场"],["CN","A 股"],["HK","港股"],["US","美股"]].map(([id,label])=><TabsTrigger value={id} key={id}>{label}<span className="tab-count">{hasSnapshot?new Set(pairs.filter(p=>pairInScope(p,id)).map(p=>p.stockKey)).size:"—"}</span></TabsTrigger>)}</TabsList></Tabs>
  <div className="scope-note"><Globe2 size={14}/><span>{market==="CN"?"沿用 A 股及 A/H 关联范围；":""}仅配对同一实际股票代码的跨交易所合约。费率差按等名义本金估算，合约单位与汇率需核对。</span></div>
  <section className="stats" aria-label="跨交易所配对统计"><div><span>可配对标的 <Globe2 size={14}/></span><strong>{hasSnapshot?unique:"—"}<small> 个</small></strong><p>{hasSnapshot?`${filtered.length} 组跨交易所合约` : "正在发现同股合约"}</p></div><div><span>最高毛费率差 <Activity size={14}/></span><strong className={tone(max)}>{pct(max===null?null:max*8)}<small> / 8h</small></strong><p>空高小时费率 · 多低小时费率</p></div><div><span>可计算配对 <BarChart3 size={14}/></span><strong>{hasSnapshot?spreads.length:"—"}<small> 组</small></strong><p>使用当期预计费率及实际周期</p></div></section>
  <section className="monitor-panel"><div className="panel-heading"><div><h2>跨交易所费率差</h2><span className="subtle">点击配对查看历史差值</span></div><div className="filters"><div className="search-field"><Search size={15}/><input aria-label="搜索配对股票" placeholder="搜索股票代码或名称" value={query} onChange={e=>setQuery(e.target.value)}/></div><Select value={combination} onValueChange={setCombination}><SelectTrigger aria-label="交易所组合筛选"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">全部交易所组合</SelectItem>{combinations.map(c=><SelectItem value={c} key={c}>{(JSON.parse(c) as string[]).join(" ↔ ")}</SelectItem>)}</SelectContent></Select><Select value={sort} onValueChange={setSort}><SelectTrigger aria-label="配对排序方式"><ArrowDownUp size={14}/><SelectValue/></SelectTrigger><SelectContent><SelectItem value="spread-desc">毛费率差从高到低</SelectItem><SelectItem value="spread-asc">毛费率差从低到高</SelectItem><SelectItem value="liquidity">较小腿成交额从高到低</SelectItem><SelectItem value="name">按股票代码</SelectItem></SelectContent></Select></div></div>
   <Table className="funding-table pair-table"><TableHeader><TableRow><TableHead>股票 / 实际标的</TableHead><TableHead>合约 A / 当前费率</TableHead><TableHead>合约 B / 当前费率</TableHead><TableHead>当前方向</TableHead><TableHead className="numeric">毛费率差 / 8h</TableHead><TableHead className="numeric">简单年化毛差</TableHead><TableHead className="numeric">较小腿 24h 成交额</TableHead><TableHead/></TableRow></TableHeader><TableBody>{filtered.map(p=><TableRow key={p.id} className={active?.id===p.id?"selected-row":""} onClick={()=>setSelected(p.id)}><TableCell><button className="asset-button" onClick={()=>setSelected(p.id)} aria-label={`查看 ${p.stockCode} ${legTitle(p.a)} 与 ${legTitle(p.b)} 费率差历史`}><span className={`ticker-icon market-${p.a.market}`}>{p.a.asset.slice(0,2)}</span><span><strong>{p.stockCode}</strong><small>{p.a.name} · {labels[p.a.market]}</small>{p.a.aShareCode&&<small className="a-share-reference">A 股关联 {p.a.aShareCode}</small>}</span></button></TableCell>{[p.a,p.b].map(leg=><TableCell className="pair-leg" key={leg.id}><span className={`venue-text ${leg.venue.toLowerCase()}`}>{legTitle(leg)}</span><small className="contract-id">{leg.symbol} · {leg.quoteAsset}</small><span className={`pair-leg-rate ${tone(leg.rate)}`}>{pct(leg.rate)}<small>{leg.intervalHours?` / ${leg.intervalHours}h`:" / 周期待核实"}</small></span><small className="quote-time">报价 {time(leg.fetchedAt)}</small></TableCell>)}<TableCell className="pair-direction">{p.hourlySpread===null?<span className="neutral">费率待同步</span>:p.hourlySpread===0?<span className="neutral">当前费率相同</span>:<><span><b className="short-label">空</b>{legTitle(p.short)}</span><span><b className="long-label">多</b>{legTitle(p.long)}</span></>}</TableCell><TableCell className={`numeric rate-emphasis ${tone(p.hourlySpread)}`}>{pct(p.hourlySpread===null?null:p.hourlySpread*8)}</TableCell><TableCell className={`numeric ${tone(p.hourlySpread)}`}>{pct(p.hourlySpread===null?null:p.hourlySpread*8760,2)}</TableCell><TableCell className="numeric">{money(pairLiquidity(p))}</TableCell><TableCell><ChevronRight size={15} className="row-chevron"/></TableCell></TableRow>)}</TableBody></Table>
   {!filtered.length&&<div className="empty-state"><Search size={25}/><strong>{hasSnapshot?"没有符合条件的跨交易所配对":"正在发现同股合约"}</strong><span>至少两个场所需要有同一股票的可交易合约；A 股与 H 股不会相互配对。</span><button onClick={()=>{onOpen();setMarket("all");setQuery("");setCombination("all");}}>查看全部配对</button></div>}
   <div className="table-footer"><span>{filtered.length} 组配对 · {unique} 个标的</span><span>毛费率差不含交易费用、价差及资金成本</span></div>
  </section>
  <section className="history-panel"><div className="chart-header"><div><div className="eyebrow">FUNDING SPREAD HISTORY</div><h2>{active?`${active.stockCode} 费率差历史`:"费率差历史"}</h2><span className="subtle">{active?`${active.a.name} · ${labels[active.a.market]}`:"选择一组配对"}<span className="chart-unit">{active?.hourlySpread?"固定方向":"观察方向"} · 等名义本金</span></span>{active&&<div className="history-listing"><span>空 {legTitle(active.short)} · {active.short.symbol}</span><span>多 {legTitle(active.long)} · {active.long.symbol}</span>{active.hourlySpread===null?<span>当前费率或周期待同步，方向仅供历史比较。</span>:active.hourlySpread===0?<span>当前毛差为零，方向仅供历史比较。</span>:null}</div>}</div><Tabs value={range} onValueChange={setRange}><TabsList>{[["1","24h"],["7","7 天"],["30","30 天"]].map(([v,l])=><TabsTrigger value={v} key={v}>{l}</TabsTrigger>)}</TabsList></Tabs></div>
   <div className="chart-layout"><div className="chart-area">{historyLoading?<div className="chart-empty"><RefreshCw size={20} className="spinning"/><span>读取两腿历史并对齐结算周期…</span></div>:historyError?<div className="chart-empty"><Activity size={23}/><span>{historyError}</span></div>:history?.comparedHours?<CrossFundingHistoryChart points={history.points} directionConfirmed={active?.hourlySpread!=null&&active.hourlySpread>0}/>:<div className="chart-empty"><Activity size={23}/><span>{active?"该区间暂无双腿共同覆盖的完整小时":"选择一组配对查看历史"}</span></div>}</div><div className="chart-summary"><span>当前毛费率差 / 8h</span><strong className={tone(active?.hourlySpread??null)}>{pct(active?.hourlySpread==null?null:active.hourlySpread*8)}</strong><p>按当前方向等比换算</p><div className="summary-divider"/><span>区间平均毛差 / 1h</span><strong className={tone(history?.averageHourlySpread??null)}>{pct(history?.averageHourlySpread??null)}</strong><p>{history?.comparedHours??0} 个共同覆盖小时</p><div className="summary-divider"/><span>共同区间已结算累计差</span><strong className={tone(history?.cumulativeSpread??null)}>{pct(history?.cumulativeSpread??null)}</strong><p>{history?.segments===1?`${date(history.periodStart)} 至 ${date(history.periodEnd)} · ${history.settledHours}h`:history&&history.segments>1?`${history.segments} 段数据，缺口前后不合并` : "等待完整共同结算区间"}{excluded>0?` · 已排除 ${excluded} 条分红调整`:""}</p>{active&&<><a href={active.short.tradeUrl} target="_blank" rel="noreferrer" className="trade-link">查看空腿合约 <ExternalLink size={13}/></a><a href={active.long.tradeUrl} target="_blank" rel="noreferrer" className="trade-link">查看多腿合约 <ExternalLink size={13}/></a></>}</div></div>
  </section>
  <p className="cross-method">当前差值 = 空腿费率 ÷ 空腿结算小时 − 多腿费率 ÷ 多腿结算小时。图表为已结算记录，历史方向不会逐点切换；费率差不等于账户实际收益。合约乘数、汇率转换、标记价差和费用需要另行核对。</p>
 </div>;
}
