"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {CalendarDays,Clock,ExternalLink,RefreshCw,Search,ShieldCheck} from "lucide-react";
import {Tabs,TabsList,TabsTrigger} from "./ui/tabs";
import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell} from "./ui/table";
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from "./ui/select";
import {SortableHead} from "./table-controls";
import {HistoryBatchProgress} from "./historical-table-cell";
import {compareTableValues,type TableSort} from "@/lib/table-controls";
import {useHistoryBatch} from "@/lib/use-history-batch";
import {dividendCatalog,CATALOG_VERIFIED_AT,RULE_URL} from "@/lib/dividends/catalog";
import {adjustmentSchedule,dividendMarketLabels,eventPhase,eventSettlement,matchingContract,type DividendContract} from "@/lib/dividends/model";
import type {DividendSnapshot} from "@/lib/dividends/binance";
const stamp=(v:number|string|null)=>v===null?"待核实":new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(v));
const date=(v:string|null)=>v??"待核实";
const pct=(v:number)=>`${v>0?"+":""}${(v*100).toFixed(4)}%`;
const blank:DividendSnapshot={contracts:[],universeError:"",announcements:[],announcementsError:"",announcementScanned:0,announcementLimit:100,fetchedAt:0,catalogVerifiedAt:CATALOG_VERIFIED_AT,events:dividendCatalog};
export function DividendMonitor({visible,lastRequest,now}:{visible:boolean;lastRequest:number;now:number}){
 const [snapshot,setSnapshot]=useState(blank),[loading,setLoading]=useState(false),[synced,setSynced]=useState(0),[retry,setRetry]=useState(0);
 const [market,setMarket]=useState("all"),[query,setQuery]=useState(""),[status,setStatus]=useState("future"),[sort,setSort]=useState<TableSort>({key:"settlement",direction:"asc"});
 const [selected,setSelected]=useState("msft-2026-11-19"),[days,setDays]=useState("30");
 const hour=Math.floor((lastRequest||now)/3600000);const requestKey=`${hour}:${retry}`;const currentKey=useRef("");
 useEffect(()=>{
  if(!visible||!now||currentKey.current===requestKey)return;
  currentKey.current=requestKey;let cancelled=false;
  const load=async()=>{
   setLoading(true);
   let body:DividendSnapshot;
   try{const r=await fetch("/api/dividends",{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error("股息接口暂时不可用");body=await r.json();if(!Array.isArray(body.contracts)||!Array.isArray(body.announcements)||!Array.isArray(body.events))throw Error("股息接口格式异常");}
   catch{body={...blank,universeError:"暂时无法读取 Binance 合约范围",announcementsError:"暂时无法读取官方公告",fetchedAt:Date.now()};}
   if(body.universeError||body.announcementsError){
    const source=await import("@/lib/dividends/binance");
    const results=await Promise.allSettled([body.universeError?source.readDividendUniverse():Promise.resolve(body.contracts),body.announcementsError?source.readDividendAnnouncements():Promise.resolve({announcements:body.announcements,scanned:body.announcementScanned})]);
    if(results[0].status==="fulfilled"){body.contracts=results[0].value;body.universeError="";}
    if(results[1].status==="fulfilled"){body.announcements=results[1].value.announcements;body.announcementScanned=results[1].value.scanned;body.announcementsError="";}
   }
   if(!cancelled){setSnapshot(body);setSynced(Date.now());setLoading(false);}
  };
  void load();return()=>{cancelled=true;currentKey.current="";};
 },[visible,now>0,requestKey]);
 const matches=useCallback((c:{market:string;asset:string;name:string;symbol:string;stockCode?:string})=>(market==="all"||c.market===market)&&`${c.asset} ${c.name} ${c.symbol} ${c.stockCode??""}`.toLowerCase().includes(query.trim().toLowerCase()),[market,query]);
 const eligible=useMemo(()=>snapshot.contracts.filter(matches),[snapshot.contracts,matches]);
 const batch=useHistoryBatch(eligible,visible&&synced>0&&!loading,synced,["binance:SAMSUNGUSDT"]);
 const events=useMemo(()=>snapshot.events.filter(e=>{
  const settlement=eventSettlement(e);const future=settlement!==null?settlement>now:e.paymentDate!==null&&Date.parse(`${e.paymentDate}T23:59:59Z`)>now;
  return matches(e)&&(status==="all"||status==="future"&&future||status==="past"&&!future);
 }).sort((a,b)=>compareTableValues(sort.key==="asset"?a.asset:sort.key==="exDate"?a.exDate:eventSettlement(a),sort.key==="asset"?b.asset:sort.key==="exDate"?b.exDate:eventSettlement(b),sort.direction,a.id,b.id)),[snapshot.events,matches,status,now,sort]);
 const active=events.find(e=>e.id===selected)??events[0];
 const schedule=active?.exDate?adjustmentSchedule(active.market,active.exDate):null;
 const specials=useMemo(()=>eligible.flatMap(c=>(batch.rows[c.id]?.data?.specialFunding??[]).filter(p=>p.time>=now-Number(days)*86400000&&p.rateType==="Special").map(p=>({...p,contract:c}))).sort((a,b)=>b.time-a.time),[eligible,batch.rows,days,now]);
 const upcoming=snapshot.events.filter(e=>eventSettlement(e)!==null&&eventSettlement(e)!>now).sort((a,b)=>eventSettlement(a)!-eventSettlement(b)!);
 const next=upcoming[0];const settlementsUnknown=!!snapshot.universeError||!synced||batch.done===batch.failed;const pendingRows=batch.total-batch.done+batch.failed;
 const actualEventStatus=(e:typeof active)=>{if(!e)return "";const settlement=eventSettlement(e);const contract=matchingContract(e,snapshot.contracts);const record=contract&&settlement!==null?batch.rows[contract.id]?.data?.specialFunding?.find(p=>p.rateType==="Special"&&Math.abs(p.time-settlement)<60000):null;return record?"实际 Special 已核对":eventPhase(e,now);};
 const onRefresh=()=>{setRetry(v=>v+1);batch.retry();};
 const [viewRef]=useState(()=>({current:{snapshot,events,specials}}));viewRef.current={snapshot,events,specials};
 useEffect(()=>{
  const context=(document as unknown as {modelContext?:{registerTool:(tool:unknown,options:{signal:AbortSignal})=>void}}).modelContext;if(!context)return;const lifecycle=new AbortController();
  try{Promise.resolve(context.registerTool({name:"read_dividend_monitor",title:"读取股息特殊费率监控",description:"读取 Binance 近期股息调整公告、部分官方公司股息目录、规则推导时间和已执行 Special。公司目录非全量，特殊费率不年化。",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>({...viewRef.current,calendarCoverage:"partial-reviewed-registry",calendarAutoDiscovery:false,announcementCoverage:"latest-100-catalog-49-perpetual-dividend-titles",ruleUrl:RULE_URL})},{signal:lifecycle.signal})).catch(()=>{});}catch{}
  return()=>lifecycle.abort();
 },[viewRef]);
 if(!visible)return null;
 const contractStatus=(e:typeof active)=>e?matchingContract(e,snapshot.contracts)?"Binance 合约在架":snapshot.universeError||loading?"在架状态待同步":"未匹配当前在架合约":"";
 return <div className="dividend-monitor">
  <div className="dividend-intro"><div><div className="eyebrow">DIVIDEND / SPECIAL FUNDING</div><h2>股息特殊费率监控</h2><p>一次性调整与普通 funding 分开查看 · 全部时间为北京时间</p></div><button className="refresh-button" disabled={loading} onClick={onRefresh}><RefreshCw size={14} className={loading?"spinning":""}/>{loading?"同步中":"同步事件"}</button></div>
  <div className="dividend-scope"><ShieldCheck size={17}/><p><strong>当前只接入 Binance 的确定性特殊结算。</strong> Hyperliquid / XYZ 的现金股息由价格与市场费率体现；Aevo 的同类规则尚未核实。<a href={RULE_URL} target="_blank" rel="noreferrer">Binance 规则 <ExternalLink size={12}/></a></p></div>
  <section className="stats dividend-stats"><div><span>已核实未来股息 <CalendarDays size={14}/></span><strong>{snapshot.events.filter(e=>e.paymentDate&&Date.parse(`${e.paymentDate}T23:59:59Z`)>now).length}<small> 家 · 部分覆盖</small></strong><p>公司宣告不等于交易所确认</p></div><div><span>下一规则推导结算 <Clock size={14}/></span><strong className="dividend-next">{next?stamp(eventSettlement(next)):"待核实"}</strong><p>{next?`${next.asset} · 待 Binance 确认`:"未覆盖不代表未来无股息"}</p></div><div><span>{days} 天实际 Special</span><strong>{settlementsUnknown?"—":specials.length}<small>{settlementsUnknown?" · 状态未知":" 条"}{pendingRows>0?" · 扫描未完整":""}</small></strong><p>{batch.done} / {batch.total} 合约已读取 · {batch.failed} 个失败</p></div></section>
  <section className="monitor-panel"><div className="panel-heading"><div><h2>未来股息与调整窗口</h2><span className="subtle">点击事件查看时间线</span></div><div className="filters"><div className="search-field"><Search size={15}/><input aria-label="搜索股息股票" placeholder="代码、公司或合约" value={query} onChange={e=>setQuery(e.target.value)}/></div><Select value={market} onValueChange={setMarket}><SelectTrigger aria-label="股息市场筛选"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">全部市场</SelectItem>{Object.entries(dividendMarketLabels).map(([id,label])=><SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent></Select><Select value={status} onValueChange={setStatus}><SelectTrigger aria-label="股息事件状态筛选"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="future">未来事件</SelectItem><SelectItem value="all">全部已核实事件</SelectItem><SelectItem value="past">历史已核实事件</SelectItem></SelectContent></Select></div></div>
   <p className="table-filter-note">公司日历为已核实目录，当前覆盖 MSFT、MCD、TSM 及三星历史案例；未覆盖的股票不能视为无派息。目录核实：{stamp(snapshot.catalogVerifiedAt)}，不随每小时同步自动更新。</p>
   {snapshot.universeError&&<div className="dividend-error" role="status">{snapshot.universeError}；当前可交易状态无法确认。</div>}
   <Table className="dividend-table"><TableHeader><TableRow><SortableHead label="股票 / 实际代码" column="asset" sort={sort} onSort={setSort} text/><SortableHead label="除息日" column="exDate" sort={sort} onSort={setSort} text/><TableHead>登记 / 支付日</TableHead><TableHead>已宣告税前股息</TableHead><SortableHead label="特殊结算 · 北京时间" column="settlement" sort={sort} onSort={setSort}/><TableHead>确认状态 / 来源</TableHead></TableRow></TableHeader><TableBody>{events.map(e=><TableRow key={e.id} onClick={()=>setSelected(e.id)} className={active?.id===e.id?"selected-row":""}><TableCell><button className="asset-button" aria-label={`查看 ${e.asset} 股息时间线`} onClick={()=>setSelected(e.id)}><span><strong>{e.asset} · {e.name}</strong><small>{e.stockCode} · {dividendMarketLabels[e.market]}</small><small>{e.symbol} · {contractStatus(e)}</small></span></button></TableCell><TableCell>{date(e.exDate)}</TableCell><TableCell>{date(e.recordDate)}<small className="interval">支付 {date(e.paymentDate)}</small></TableCell><TableCell><strong className="dividend-amount">{e.estimatedAmount?"≈ ":""}{e.currency} {e.grossAmount.toLocaleString("en-US")}</strong><small className="interval">每 {e.unit} · {e.estimatedAmount?"估算金额":"公司已宣告"}</small></TableCell><TableCell><strong className="dividend-time">{stamp(eventSettlement(e))}</strong><small className="interval">{eventSettlement(e)===null?"除息日待核实，不推算":e.exchangeNotice?"交易所公告时间":"按现行规则推导"}</small></TableCell><TableCell><span className={`event-status ${e.exchangeNotice?"confirmed":"estimated"}`}>{actualEventStatus(e)}</span><a className="dividend-source" href={e.sourceUrl} target="_blank" rel="noreferrer" onClick={ev=>ev.stopPropagation()}>{e.sourceName}<ExternalLink size={12}/></a></TableCell></TableRow>)}</TableBody></Table>
   {!events.length&&<div className="empty-state"><CalendarDays size={23}/><strong>已核实目录内没有匹配事件</strong><span>不表示这些公司未来没有派息；可切换市场或状态。</span></div>}
  </section>
  {active&&<section className="dividend-timeline-panel"><div className="dividend-timeline-heading"><div><div className="eyebrow">ADJUSTMENT WINDOW</div><h2>{active.asset} 调整时间线</h2></div><span className="event-status estimated">{!schedule?"除息日待核实 · 暂不推导":active.exchangeNotice?"结算时刻已公告 · 其余节点按现行规则参考":"按现行规则推导 · 待 Binance 确认"}</span></div>
   {schedule?<div className="dividend-timeline">{[{label:"调整结算周期",at:schedule.requestAt,detail:`改为 1 小时周期 · ${stamp(schedule.hourlyFrom)} 生效`},{label:"进入只减仓",at:schedule.reduceOnlyAt,detail:"reduce_only · 标记价偏离指数价限制收紧至 1%"},{label:"特殊资金费率结算",at:eventSettlement(active)!,detail:"普通结算之后另付 Special；现金股息通常由空头付多头"},{label:"恢复常规规则",at:schedule.restoreAt,detail:"退出只减仓、恢复价格偏离限制和原结算周期"}].map((step,i)=><div className={i===2?"settlement-step":""} key={step.label}><span className="step-index">0{i+1}</span><strong>{stamp(step.at)}</strong><b>{step.label}</b><p>{step.detail}</p></div>)}</div>:<div className="dividend-no-window">公司仅公布登记日和支付日，暂未核实除息日，因此不估计 Binance 调整时间。</div>}
   <p className="dividend-method">{active.note||active.exchangeNotice?.note||"时间来自 Binance 2026-10-01 版规则；公司股息支付日与交易所特殊结算日不同。"} US 使用除息日前一自然日的纽约时间，自动处理夏令时。<br/>现金 Special 费率由执行时的股息金额、标记价及合约币种规则决定，不受常规费率上限限制。未展示未来确定费率，持有空仓可能需支付这笔调整。</p>
  </section>}
  <section className="dividend-news-panel"><div className="panel-heading"><div><h2>近期官方调整公告</h2><span className="subtle">每小时检查新公告</span></div><span className="subtle">同步：{snapshot.fetchedAt?stamp(snapshot.fetchedAt):"待同步"}</span></div><p className="table-filter-note">扫描 Latest Binance News 最近 {snapshot.announcementScanned || snapshot.announcementLimit} 条，仅筛选永续股息标题，排除 bStocks 现货。新公告先列出原文，时间与金额核实后才能加入上方日历；不是全量公告档案。</p>
   {snapshot.announcementsError?<div className="dividend-error" role="status">{snapshot.announcementsError}；本次公告状态未知，不能视为没有新公告。</div>:snapshot.announcements.length?snapshot.announcements.map(a=><a key={a.id} className="dividend-news" href={a.url} target="_blank" rel="noreferrer"><CalendarDays size={17}/><span><strong>{a.title}</strong><small>{stamp(a.publishedAt)} · 官方原文 · {snapshot.events.some(e=>e.exchangeNotice?.url===a.url)?"已录入核实目录":"事件详情待核对"}</small></span><ExternalLink size={15}/></a>):<div className="dividend-no-window">{loading?"正在扫描官方公告…":"本次扫描范围内未发现永续股息调整标题。"}</div>}
  </section>
  <section className="monitor-panel dividend-settlements"><div className="panel-heading"><div><h2>已执行特殊费率</h2><span className="subtle">只读取 rateType = Special</span></div><Tabs value={days} onValueChange={setDays}><TabsList>{[["1","24h"],["7","7 天"],["30","30 天"]].map(([id,label])=><TabsTrigger key={id} value={id}>{label}</TabsTrigger>)}</TabsList></Tabs></div><p className="table-filter-note">按上述市场与股票搜索扫描当前在架 Binance 单股合约，包括韩股；三档窗口共享 30 天数据。首次全范围扫描可能需要数分钟。只显示实际结算，无法读取的合约不会按零处理。特殊费率不计入原有两个套利 tab 的普通 funding 年化。</p><HistoryBatchProgress done={batch.done} total={batch.total} failed={batch.failed} loading={batch.loading} onRetry={batch.retry}/>
   <Table className="dividend-special-table"><TableHeader><TableRow><TableHead>股票 / 合约</TableHead><TableHead>实际结算 · 北京时间</TableHead><TableHead className="numeric">一次性特殊费率</TableHead><TableHead>支付方向</TableHead><TableHead className="numeric">结算标记价</TableHead><TableHead>核对来源</TableHead></TableRow></TableHeader><TableBody>{specials.map(p=><TableRow key={`${p.contract.id}:${p.time}`}><TableCell><strong>{p.contract.name}</strong><small className="interval">{p.contract.stockCode??"股票代码待核实"} · {p.contract.symbol}</small></TableCell><TableCell className="dividend-time">{stamp(p.time)}<small className="interval">{new Date(p.time).toLocaleTimeString("zh-CN",{timeZone:"Asia/Shanghai",hour12:false})} · 已结算</small></TableCell><TableCell className={`numeric ${p.rate<0?"negative":"positive"}`}>{pct(p.rate)}<small className="interval">单次费率，不年化</small></TableCell><TableCell>{p.rate<0?"空头支付 → 多头收取":p.rate>0?"多头支付 → 空头收取":"零额调整"}</TableCell><TableCell className="numeric">{p.markPrice===null?"—":p.markPrice.toLocaleString("en-US")}<small className="interval">USDT</small></TableCell><TableCell><a className="dividend-source" href={`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${encodeURIComponent(p.contract.symbol)}&startTime=${p.time-1000}&endTime=${p.time+1000}&limit=1000`} target="_blank" rel="noreferrer">公开结算记录 <ExternalLink size={12}/></a></TableCell></TableRow>)}</TableBody></Table>
   {!specials.length&&<div className="dividend-no-window">{snapshot.universeError?"合约范围读取失败，特殊费率状态未知。":!synced||loading||batch.loading?"特殊费率扫描中…":batch.failed?"已成功读取的合约暂未发现 Special，其余合约读取失败。":"已读取范围内，所选期间暂无 Special 记录。"}</div>}
  </section>
  <details className="dividend-research"><summary>交易所规则与覆盖说明</summary><p>Binance 已核实单股现金股息特殊结算；三星 9 月 29 日采用 KRW 4,500／股估计值，最终金额确认后一周内补差，补差是否发生仍需记录核对。<a href={dividendCatalog.find(e=>e.asset==="SAMSUNG")!.sourceUrl} target="_blank" rel="noreferrer">三星官方公告</a></p><p>Hyperliquid 的 <a href="https://docs.trade.xyz/perpetuals/corporate-actions" target="_blank" rel="noreferrer">TradeXYZ 规则</a>：永续持有人不直接领取现金股息，影响通过价格与市场 funding 体现，未采用固定股息支付。该结论只适用于 xyz，其他 HIP-3 builder 需分别核实。Aevo 的 <a href="https://api-docs.aevo.xyz/reference/getfunding" target="_blank" rel="noreferrer">公开资金接口</a>仅提供普通 funding，尚未核实相同的特殊调整机制；没有接入不表示没有。</p><p>股息页打开期间每小时更新在架范围、近期公告和已执行记录；公司未来股息目录仍需官方资料核实，不是完整自动日历。网站关闭时没有后台采集或推送。未来数据源可实现相同事件接口，核实后扩展。</p></details>
 </div>;
}
