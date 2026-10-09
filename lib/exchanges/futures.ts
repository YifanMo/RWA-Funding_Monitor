import names from "./stock-names.json";
import {stockMetadata} from "./stock-metadata";
import {publicJson} from "./http";
import {finite,type Contract,type ExchangeAdapter,type Market,type HistoryPoint} from "./types";
export type SymbolInfo={symbol:string;baseAsset:string;quoteAsset:string;status:string;contractType:string;underlyingType:string;underlyingSubType:string[];channel?:string;tags?:string[];name?:string};
type Premium={symbol:string;lastFundingRate:string;markPrice:string;nextFundingTime:number;time:number};
type FundingInfo={symbol:string;fundingIntervalHours:number};
type Ticker={symbol:string;quoteVolume:string};
export type FuturesConfig={id:string;venue:"Binance"|"Aster";baseUrl:string;classify:(symbol:SymbolInfo)=>Market|null;tradeUrl:(symbol:string)=>string};
/** Shared public REST transport; classification remains venue-specific. */
export function futuresAdapter(config:FuturesConfig):ExchangeAdapter{
 const get=<T>(path:string,ttl=45)=>publicJson<T>(`${config.baseUrl}/fapi/v1/${path}`,undefined,ttl).catch(error=>{console.error("Exchange request failed",config.venue,path,error instanceof Error?error.message:"unknown");throw error;});
 return {id:config.id,venue:config.venue,
  async discover(){
   const [info,premiums,funding,volume]=await Promise.all([get<{symbols:SymbolInfo[]}>("exchangeInfo",300),get<Premium[]>("premiumIndex"),get<FundingInfo[]>("fundingInfo",300),get<Ticker[]>("ticker/24hr").catch(()=>null)]);
   if(!Array.isArray(info?.symbols)||!Array.isArray(premiums)||!Array.isArray(funding))throw Error(`${config.venue} 合约信息格式异常`);
   const rates=new Map(premiums.map(p=>[p.symbol,p])),intervals=new Map(funding.map(p=>[p.symbol,p.fundingIntervalHours])),volumes=new Map((volume??[]).map(p=>[p.symbol,p.quoteVolume]));
   const contracts:Contract[]=[];const updatedAt=Date.now();
   for(const s of info.symbols){
    if(s.status!=="TRADING")continue;const market=config.classify(s);if(!market)continue;
    const p=rates.get(s.symbol);const interval=finite(intervals.get(s.symbol));
    const rate=finite(p?.lastFundingRate);
    const tags=s.tags??[];const chinese=tags.find(t=>/[\u4e00-\u9fff]/.test(t)&&t.length>1&&!['股票','科技','金融','汽车','能源','指数','美股'].includes(t));
    contracts.push({id:`${config.id}:${s.symbol}`,asset:s.baseAsset,symbol:s.symbol,name:(names as Record<string,string>)[s.baseAsset]||chinese||s.baseAsset,market,venue:config.venue,rate,intervalHours:interval&&interval>0?interval:null,markPrice:finite(p?.markPrice),volume24h:finite(volumes.get(s.symbol)),openInterestUsd:null,nextFundingTime:finite(p?.nextFundingTime),fetchedAt:p?.time||updatedAt,quoteAsset:s.quoteAsset,tradeUrl:config.tradeUrl(s.symbol),underlying:market==="HK"&&s.baseAsset==="GIGADEV"?"兆易创新 H 股 · HKEX 3986":undefined,...stockMetadata(s.baseAsset,market)});
   }
   const incomplete=contracts.some(c=>c.intervalHours===null||c.rate===null)||volume===null;
   const stale=contracts.some(c=>updatedAt-c.fetchedAt>300000);
   return {contracts,feed:{venue:config.venue,status:stale?"stale":incomplete?"partial":"ok",count:contracts.length,fetchedAt:contracts.length?Math.min(...contracts.map(c=>c.fetchedAt)):updatedAt,...(stale?{error:"交易所报价时间超过 5 分钟，请留意数据时间"}:incomplete?{error:"部分费率、周期或成交额暂时缺失"}:{})}};
  },
  async history(symbol,days){
   const end=Date.now(),start=end-days*86400000;let cursor=start-86400000;
   type Row={fundingTime:number;fundingRate:string;rateType?:string};
   const rows:Row[]=[];let complete=false;
   for(let page=0;page<5;page++){
    const batch=await get<Row[]>(`fundingRate?symbol=${encodeURIComponent(symbol)}&startTime=${cursor}&endTime=${end}&limit=1000`,120);
    if(!Array.isArray(batch))throw Error("历史费率返回格式异常");
    const sorted=batch.filter(r=>r.fundingTime>=cursor&&r.fundingTime<=end).sort((a,b)=>a.fundingTime-b.fundingTime);
    rows.push(...sorted);
    if(!sorted.length||batch.length<1000){complete=true;break;}
    const next=sorted[sorted.length-1].fundingTime+1;if(next<=cursor)throw Error("历史分页游标异常");cursor=next;
   }
   if(!complete)throw Error("历史记录超过分页上限，请缩短时间范围");
   const unique=[...new Map(rows.map(r=>[`${r.fundingTime}:${r.rateType??"Regular"}`,r])).values()].sort((a,b)=>a.fundingTime-b.fundingTime);
   const special=unique.filter(r=>r.rateType&&r.rateType!=="Regular"&&r.fundingTime>=start);
   const regular=unique.filter(r=>!r.rateType||r.rateType==="Regular");
   const points:HistoryPoint[]=[];
   for(let i=0;i<regular.length;i++){
    const r=regular[i];if(r.fundingTime<start)continue;const rate=finite(r.fundingRate);if(rate===null)continue;
    // Derive each historical interval from adjacent regular settlements; do not apply today's cadence to old data.
    const rawHours=i>0?(r.fundingTime-regular[i-1].fundingTime)/3600000:null;
    const rounded=rawHours!==null?Math.round(rawHours):null;
    const hours=rounded&&[1,2,4,8].includes(rounded)&&Math.abs(rawHours!-rounded)<.02?rounded:null;
    points.push({time:r.fundingTime,rate,intervalHours:hours});
   }
   return {points,fetchedAt:end,excludedSpecialCount:special.length,intervalMethod:"observed-settlement-spacing"};
  }
 };
}
