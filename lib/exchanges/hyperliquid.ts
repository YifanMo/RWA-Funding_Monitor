import excluded from "./hyperliquid-excluded.json";
import catalog from "./hyperliquid-catalog.json";
import names from "./stock-names.json";
import {publicJson,message} from "./http";
import {finite,type Contract,type Market,type ExchangeAdapter,type HistoryPoint} from "./types";
const INFO="https://api.hyperliquid.xyz/info";
type Annotation={category:string;displayName:string;description?:string;keywords?:string[]};
type Meta={universe:{name:string;isDelisted?:boolean}[]};
type Ctx={funding:string;markPx:string;dayNtlVlm:string;openInterest:string};
const excludedCoins=new Set(excluded);
const reviewed=new Map(catalog.map(c=>[c.coin,c]));
export function classifyAnnotation(annotation:Annotation):Market|null{
 const desc=annotation.description??"";
 if(!/^(stock|stocks)$/.test(annotation.category)||/\b(ETF|exchange.traded|index|pre.ipo|pre.listing)\b/i.test(desc))return null;
 // The FIRST referenced listing wins: US ADR descriptions may mention an HK listing later.
 const match=desc.match(/\b(Nasdaq|NYSE|AMEX|HKEX|SSE(?: STAR)?|SZSE)\b/i);
 if(!match)return null;const listing=match[1].toUpperCase();
 return listing==="HKEX"?"HK":listing.startsWith("SSE")||listing==="SZSE"?"CN":"US";
}
export const hyperliquid:ExchangeAdapter={
 id:"hyperliquid",venue:"Hyperliquid",
 async discover(){
  const concise=await publicJson<[string,Annotation][]>(INFO,{type:"perpConciseAnnotations"},300);
  if(!Array.isArray(concise))throw Error("Hyperliquid 股票目录格式异常");
  const candidates=concise.filter(([coin,a])=>/^(stock|stocks)$/.test(a.category)&&!excludedCoins.has(coin));
  const dexes=[...new Set(candidates.map(([coin])=>coin.includes(":")?coin.split(":")[0]:""))];
  const responses=await Promise.allSettled(dexes.map(dex=>publicJson<[Meta,Ctx[]]>(INFO,{type:"metaAndAssetCtxs",dex},45)));
  const contracts:Contract[]=[];let failed=0;const updatedAt=Date.now();
  for(let i=0;i<responses.length;i++){
   const result=responses[i];if(result.status!=="fulfilled"){failed++;continue;}
   const [meta,contexts]=result.value;if(!Array.isArray(meta?.universe)||!Array.isArray(contexts)){failed++;continue;}
   for(let j=0;j<meta.universe.length;j++){
    const m=meta.universe[j],ctx=contexts[j];if(m.isDelisted||!ctx)continue;
    const conciseRow=candidates.find(([coin])=>coin===m.name);if(!conciseRow)continue;
    const known=reviewed.get(m.name);let annotation:Annotation=conciseRow[1];let market:Market|null=known?.market as Market??null;
    // Known catalog is classification only; every rate and trading status is fetched live.
    if(!known){try{annotation=await publicJson<Annotation>(INFO,{type:"perpAnnotation",coin:m.name},3600);market=classifyAnnotation(annotation);}catch{continue;}}
    if(!market)continue;
    const asset=known?.displayName||annotation.displayName||m.name.split(":").pop()!;
    const description=known?.description||annotation.description;
    const markPrice=finite(ctx.markPx),oi=finite(ctx.openInterest);
    contracts.push({id:`hyperliquid:${m.name}`,asset,symbol:m.name,name:(names as Record<string,string>)[asset]||asset,market,venue:"Hyperliquid",builder:dexes[i]||undefined,rate:finite(ctx.funding),intervalHours:1,markPrice,volume24h:finite(ctx.dayNtlVlm),openInterestUsd:oi!==null&&markPrice!==null?oi*markPrice:null,nextFundingTime:(Math.floor(updatedAt/3600000)+1)*3600000,fetchedAt:updatedAt,quoteAsset:"USD",tradeUrl:`https://app.hyperliquid.xyz/trade/${encodeURIComponent(m.name)}`,underlying:description});
   }
  }
  if(failed===dexes.length&&dexes.length)throw Error("Hyperliquid 所有股票市场读取失败");
  return {contracts,feed:{venue:"Hyperliquid",status:failed?"partial":"ok",count:contracts.length,fetchedAt:updatedAt,...(failed?{error:`${failed} 个部署市场暂时不可用`}:{})}};
 },
 async history(symbol,days){
  const endTime=Date.now(),start=endTime-days*86400000;let cursor=start;
  const points:HistoryPoint[]=[];let complete=false;
  for(let page=0;page<8;page++){
   const rows=await publicJson<{time:number;fundingRate:string}[]>(INFO,{type:"fundingHistory",coin:symbol,startTime:cursor,endTime},120);
   if(!Array.isArray(rows))throw Error("历史费率返回格式异常");
   const sorted=rows.filter(r=>r.time>=cursor&&r.time<=endTime).sort((a,b)=>a.time-b.time);
   for(const r of sorted){const rate=finite(r.fundingRate);if(rate!==null)points.push({time:r.time,rate,intervalHours:1});}
   if(!sorted.length||rows.length<500){complete=true;break;}
   const next=sorted[sorted.length-1].time+1;if(next<=cursor)throw Error("历史分页游标异常");cursor=next;
  }
  if(!complete)throw Error("历史记录超过分页上限，请缩短时间范围");
  return {points:[...new Map(points.map(p=>[p.time,p])).values()],fetchedAt:endTime,excludedSpecialCount:0,intervalMethod:"exchange-hourly"};
 }
};
