import type {Contract,HistoryPoint} from "./exchanges/types";
import {inMarketScope,matchesStockQuery} from "./exchanges/stock-metadata";
import {annualizedFundingRate} from "./funding-history";

export interface FundingPair {
 id:string;stockKey:string;stockCode:string;a:Contract;b:Contract;
 aHourly:number|null;bHourly:number|null;signedHourlySpread:number|null;
 hourlySpread:number|null;short:Contract;long:Contract;
}

function currentHourly(contract:Contract):number|null{
 return typeof contract.rate==="number"&&Number.isFinite(contract.rate)&&typeof contract.intervalHours==="number"&&Number.isFinite(contract.intervalHours)&&contract.intervalHours>0?contract.rate/contract.intervalHours:null;
}

/** Only the same verified listing can join; A/H associations never join different stocks. */
export function fundingPairs(contracts:Contract[]):FundingPair[]{
 const groups=new Map<string,Contract[]>();
 for(const contract of new Map(contracts.map(c=>[c.id,c])).values()){
  if(!contract.stockCode)continue;
  const key=`${contract.market}:${contract.stockCode}`;
  groups.set(key,[...(groups.get(key)??[]),contract]);
 }
 const pairs:FundingPair[]=[];
 for(const [stockKey,rows] of groups){
  const sorted=rows.sort((a,b)=>a.id.localeCompare(b.id));
  for(let i=0;i<sorted.length;i++)for(let j=i+1;j<sorted.length;j++){
   const a=sorted[i],b=sorted[j];if(a.venue===b.venue)continue;
   const aHourly=currentHourly(a),bHourly=currentHourly(b);
   const signedHourlySpread=aHourly!==null&&bHourly!==null?aHourly-bHourly:null;
   const reversed=signedHourlySpread!==null&&signedHourlySpread<0;
   pairs.push({id:JSON.stringify([stockKey,a.id,b.id]),stockKey,stockCode:a.stockCode!,a,b,aHourly,bHourly,signedHourlySpread,hourlySpread:signedHourlySpread===null?null:Math.abs(signedHourlySpread),short:reversed?b:a,long:reversed?a:b});
  }
 }
 return pairs;
}

export function pairCombination(pair:FundingPair):string{return JSON.stringify([pair.a.venue,pair.b.venue].sort());}
export function pairInScope(pair:FundingPair,market:string):boolean{return inMarketScope(pair.a,market)||inMarketScope(pair.b,market);}
export function pairMatchesQuery(pair:FundingPair,query:string):boolean{return matchesStockQuery(pair.a,query)||matchesStockQuery(pair.b,query);}
export function pairLiquidity(pair:FundingPair):number|null{
 const valid=(v:number|null)=>v!==null&&Number.isFinite(v)&&v>=0;
 return valid(pair.a.volume24h)&&valid(pair.b.volume24h)?Math.min(pair.a.volume24h!,pair.b.volume24h!):null;
}

const HOUR=3600000;
type Settlement={time:number;rate:number;hours:number|null};
function settlements(points:HistoryPoint[],end:number):Settlement[]{
 const rows=new Map<number,Settlement>();
 for(const point of [...points].sort((a,b)=>a.time-b.time)){
  if(!Number.isFinite(point.time)||!Number.isFinite(point.rate)||point.time>end)continue;
  const time=Math.round(point.time/HOUR)*HOUR;
  if(Math.abs(time-point.time)>60000)continue;
  const hours=point.intervalHours!==null&&[1,2,4,8].includes(point.intervalHours)?point.intervalHours:null;
  const previous=rows.get(time);
  rows.set(time,{time,rate:point.rate,hours:previous&&(previous.rate!==point.rate||previous.hours!==hours)?null:hours});
 }
 return [...rows.values()].sort((a,b)=>a.time-b.time);
}

export interface PairHistoryPoint {
 time:number;hourlyRatePercent:number|null;cumulativeRatePercent:number|null;
 shortHourlyPercent:number|null;longHourlyPercent:number|null;
}
export interface PairHistory {
 points:PairHistoryPoint[];comparedHours:number;settledHours:number;segments:number;
 averageHourlySpread:number|null;cumulativeSpread:number|null;periodStart:number|null;periodEnd:number|null;
 annualizedGrossReturn:number|null;
}

/** Uniformly allocate settled rates to covered hours, then compare only complete shared hours. */
function hourlyComparison(shortPoints:HistoryPoint[],longPoints:HistoryPoint[],start:number,end:number){
 const from=Math.ceil(start/HOUR)*HOUR,to=Math.floor(end/HOUR)*HOUR;
 const short=settlements(shortPoints,end),long=settlements(longPoints,end);
 const coverage=(rows:Settlement[])=>{
  const values=new Map<number,number|null>(),boundaries=new Set<number>();
  for(const row of rows){
   if(row.hours===null)continue;
   const begin=row.time-row.hours*HOUR;boundaries.add(begin);boundaries.add(row.time);
   for(let time=Math.max(begin+HOUR,from+HOUR);time<=Math.min(row.time,to);time+=HOUR){
    // Overlapping inferred periods are ambiguous rather than extra payments per hour.
    values.set(time,values.has(time)?null:row.rate/row.hours);
   }
  }
  return {values,boundaries};
 };
 const a=coverage(short),b=coverage(long),points:PairHistoryPoint[]=[];
 for(let time=from;time<=to;time+=HOUR){
  const ah=a.values.get(time),bh=b.values.get(time);
  points.push({time,hourlyRatePercent:ah!==undefined&&ah!==null&&bh!==undefined&&bh!==null?(ah-bh)*100:null,cumulativeRatePercent:null,shortHourlyPercent:ah==null?null:ah*100,longHourlyPercent:bh==null?null:bh*100});
 }
 return {from,to,short,long,a,b,points};
}
function rateSummary(points:PairHistoryPoint[]){
 const differences=points.flatMap(p=>p.hourlyRatePercent===null?[]:[p.hourlyRatePercent/100]);
 const averageHourlySpread=differences.length?differences.reduce((sum,r)=>sum+r,0)/differences.length:null;
 return {comparedHours:differences.length,averageHourlySpread,annualizedGrossReturn:annualizedFundingRate(averageHourlySpread)};
}
/** Table summaries skip the full cash-settlement curve, while sharing exactly its hourly comparison. */
export function compareFundingRateSummary(shortPoints:HistoryPoint[],longPoints:HistoryPoint[],start:number,end:number){
 return rateSummary(hourlyComparison(shortPoints,longPoints,start,end).points);
}
/** Uniformly allocate settled rates to covered hours, then compare only complete shared hours. */
export function compareFundingHistory(shortPoints:HistoryPoint[],longPoints:HistoryPoint[],start:number,end:number):PairHistory{
 const {from,to,short,long,a,b,points}=hourlyComparison(shortPoints,longPoints,start,end);
 const byTime=new Map(points.map(p=>[p.time,p]));
 const shared=[...a.boundaries].filter(t=>t>=from&&t<=to&&b.boundaries.has(t)).sort((x,y)=>x-y);
 let cumulative=0,correction=0,previousEnd:number|null=null,segments=0,settledHours=0,periodStart:number|null=null,periodEnd:number|null=null;
 const shortEvents=new Map(short.map(r=>[r.time,r])),longEvents=new Map(long.map(r=>[r.time,r]));
 const settledPartition=(rows:Settlement[],begin:number,finish:number)=>{
  let cursor=begin;
  for(const row of rows.filter(r=>r.time>begin&&r.time<=finish)){
   if(row.hours===null||row.time-row.hours*HOUR!==cursor)return false;
   cursor=row.time;
  }
  return cursor===finish;
 };
 for(let i=1;i<shared.length;i++){
  const begin=shared[i-1],finish=shared[i];let complete=true;
  for(let time=begin+HOUR;time<=finish;time+=HOUR)if(byTime.get(time)?.hourlyRatePercent==null){complete=false;break;}
  // An event covering time before the block cannot be counted as a whole payment inside it.
  if(!settledPartition(short,begin,finish)||!settledPartition(long,begin,finish))complete=false;
  if(!complete)continue;
  if(previousEnd!==begin){
   segments++;cumulative=0;correction=0;periodStart=begin;
   // Keep a null break when a new segment follows a missing interval.
   if(segments===1)byTime.get(begin)!.cumulativeRatePercent=0;
  }
  for(let time=begin+HOUR;time<=finish;time+=HOUR){
   const delta=(shortEvents.get(time)?.rate??0)-(longEvents.get(time)?.rate??0);
   const adjusted=delta-correction,next=cumulative+adjusted;
   correction=(next-cumulative)-adjusted;cumulative=next;
   byTime.get(time)!.cumulativeRatePercent=cumulative*100;
  }
  settledHours+=(finish-begin)/HOUR;previousEnd=finish;periodEnd=finish;
 }
 return {points,...rateSummary(points),settledHours,segments,cumulativeSpread:segments===1?cumulative:null,periodStart,periodEnd};
}
