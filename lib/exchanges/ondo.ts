import names from "./stock-names.json";
import {stockMetadata} from "./stock-metadata";
import {publicJson} from "./http";
import {finite,type Contract,type ExchangeAdapter,type HistoryPoint,type Market} from "./types";

const API="https://api.ondoperps.xyz";
const HOUR=3600000;
export type OndoMarket={market:string;underlyingMarket?:string;longName?:string;pair:{base:string;quote:string};tags?:string[];disabled?:boolean;schedule?:{timezone?:string}};
type Ticker={market:string;productType:string;contractType:string;baseCurrency:string;quoteCurrency:string;disabled:boolean;nextFundingRate?:string;nextFundingRateTimestamp?:string;usdVolume?:string;openInterestUsd?:string;reduceOnly?:boolean};
type Mark={markPrice?:string;lastUpdatedTime?:string};
type Envelope<T>={success:boolean;result:T;error?:string;pageInfo?:{nextCursor?:string}};
type FundingRow={market:string;time:string;fundingRate:string};

// Public reads share a conservative one-request/second queue, including pagination.
// The client also limits scans to one contract at a time for this venue.
let queue=Promise.resolve();let lastStarted=0;
function get<T>(path:string,ttl=45):Promise<Envelope<T>>{
 const task=queue.then(async()=>{
  const delay=Math.max(0,lastStarted+1100-Date.now());
  if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
  lastStarted=Date.now();
  const value=await publicJson<Envelope<T>>(`${API}${path}`,undefined,ttl);
  if(value?.success!==true)throw Error("Ondo Perps 公开数据暂时不可用");
  return value;
 });
 queue=task.then(()=>{},()=>{});return task;
}

/** Official category + underlying trading calendar; never classify all USD quotes as US stocks. */
export function classifyOndo(row:OndoMarket):Market|null{
 if(row.disabled||!row.tags?.includes("Stock")||row.tags.some(t=>["ETF","Index","Commodity","Crypto","FX","Pre-IPO","Private Market"].includes(t)))return null;
 // This ticker's depositary-share identity still needs venue-specific verification.
 if(row.pair.base==="SKHY")return null;
 const zones:Record<string,Market>={"America/New_York":"US","Asia/Shanghai":"CN","Asia/Hong_Kong":"HK"};
 return zones[row.schedule?.timezone??""]??null;
}

export const ondo:ExchangeAdapter={
 id:"ondo",venue:"Ondo Perps",
 async discover(){
  const [config,live,marks]=await Promise.all([
   get<{perps:{tradingPairs:OndoMarket[]}}>("/v1/markets",300),
   get<Ticker[]>("/v1/perps/contracts"),
   get<Record<string,Mark>>("/v1/perps/mark_prices").catch(()=>null),
  ]);
  if(!Array.isArray(config.result?.perps?.tradingPairs)||!Array.isArray(live.result))throw Error("Ondo Perps 合约目录格式异常");
  const metadata=new Map(config.result.perps.tradingPairs.map(m=>[m.market,m]));
  const fetchedAt=Date.now(),contracts:Contract[]=[];let unverified=0,restricted=0;
  for(const row of live.result){
   const info=metadata.get(row.market);
   if(!info||row.disabled!==false||row.productType!=="perpetual"||row.contractType!=="linear")continue;
   if(info.tags?.includes("Stock")&&info.pair.base==="SKHY")unverified++;
   const market=classifyOndo(info);if(!market)continue;
   if(row.baseCurrency!==info.pair.base||!row.market.endsWith(".P"))continue;
   if(row.reduceOnly){restricted++;continue;}
   const mark=marks?.result?.[row.market],sourceTime=mark?.lastUpdatedTime?Date.parse(mark.lastUpdatedTime):NaN;
   const next=row.nextFundingRateTimestamp?Date.parse(row.nextFundingRateTimestamp):NaN;
   const listing=stockMetadata(row.baseCurrency,market);
   contracts.push({id:`ondo:${row.market}`,asset:row.baseCurrency,symbol:row.market,name:(names as Record<string,string>)[row.baseCurrency]||info.longName||row.baseCurrency,market,venue:"Ondo Perps",
    // API fractions are already hourly and include the configured funding multiplier.
    rate:finite(row.nextFundingRate),intervalHours:1,markPrice:Number.isFinite(sourceTime)?finite(mark?.markPrice):null,volume24h:finite(row.usdVolume),openInterestUsd:finite(row.openInterestUsd),nextFundingTime:Number.isFinite(next)?next:null,
    fetchedAt:Number.isFinite(sourceTime)?Math.min(sourceTime,fetchedAt):fetchedAt,quoteAsset:row.quoteCurrency,tradeUrl:`https://app.ondoperps.xyz/trade/perps/${encodeURIComponent(row.market)}`,
    underlying:info.longName||row.baseCurrency,kind:"stock",...listing});
  }
  const issues:string[]=[];
  if(unverified)issues.push(`${unverified} 个股票上市标的待核实，暂未纳入`);
  if(restricted)issues.push(`${restricted} 个合约当前仅减仓，暂不作为可开仓候选`);
  if(!marks||contracts.some(c=>c.rate===null||c.markPrice===null||c.volume24h===null))issues.push("部分费率、标记价或成交额缺失");
  const stale=contracts.some(c=>fetchedAt-c.fetchedAt>300000||c.nextFundingTime!==null&&c.nextFundingTime<fetchedAt);
  if(stale)issues.push("部分报价或预计结算时间已过期");
  return {contracts,feed:{venue:"Ondo Perps",status:stale?"stale":issues.length?"partial":"ok",count:contracts.length,fetchedAt:contracts.length?Math.min(...contracts.map(c=>c.fetchedAt)):fetchedAt,...(issues.length?{error:issues.join("；")}:{})}};
 },
 async history(symbol,days){
  if(!/^[A-Z0-9][A-Z0-9.-]{0,40}-USD\.P$/.test(symbol))throw Error("无效的 Ondo Perps 合约");
  const end=Date.now(),start=end-days*86400000,points=new Map<number,HistoryPoint>();
  const cursors=new Set<string>();let cursor="",complete=false;
  for(let page=0;page<8;page++){
   const params=new URLSearchParams({market:symbol,startTime:String(start),endTime:String(end),limit:"1000"});
   if(cursor)params.set("cursor",cursor);
   const response=await get<FundingRow[]>(`/v1/perps/funding_rate_history?${params}`,120);
   if(!Array.isArray(response.result))throw Error("Ondo Perps 历史费率格式异常");
   for(const row of response.result){
    if(row.market!==symbol)throw Error("Ondo Perps 历史合约不匹配");
    const time=Date.parse(row.time),rate=finite(row.fundingRate);
    if(!Number.isFinite(time)||rate===null)throw Error("Ondo Perps 历史记录缺少有效时间或费率");
    if(time<start||time>end)continue;
    const previous=points.get(time);
    if(previous&&previous.rate!==rate)throw Error("Ondo Perps 历史记录存在冲突");
    // Each record is one actual hourly payment; a missing hour is never filled with zero.
    points.set(time,{time,rate,intervalHours:1});
   }
   const next=response.pageInfo?.nextCursor;
   if(!next){complete=true;break;}
   if(!response.result.length||cursors.has(next))throw Error("Ondo Perps 历史分页游标异常");
   cursors.add(next);cursor=next;
  }
  if(!complete)throw Error("Ondo Perps 历史超过分页上限，请稍后重试");
  return {points:[...points.values()].sort((a,b)=>a.time-b.time),fetchedAt:end,excludedSpecialCount:0,intervalMethod:"exchange-hourly"};
 }
};
