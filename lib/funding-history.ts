import type {HistoryPoint} from "./exchanges/types";

export interface FundingChartPoint extends HistoryPoint {
 hourlyRatePercent:number|null;
 cumulativeRatePercent:number;
}

/** Sum actual settled rates, including negative payments. Period normalization is ONLY for the rate curve. */
export function fundingSeries(points:HistoryPoint[]):FundingChartPoint[]{
 const ordered=[...new Map(points.filter(p=>Number.isFinite(p.time)&&Number.isFinite(p.rate)).map(p=>[p.time,p])).values()].sort((a,b)=>a.time-b.time);
 let cumulative=0,correction=0;
 return ordered.map(point=>{
  const adjusted=point.rate-correction;
  const next=cumulative+adjusted;
  correction=(next-cumulative)-adjusted;
  cumulative=next;
  return {...point,hourlyRatePercent:point.intervalHours&&point.intervalHours>0?point.rate/point.intervalHours*100:null,cumulativeRatePercent:cumulative*100};
 });
}

/** Both percentage axes share the same pixel position for zero, while retaining their own scales. */
export function fundingDomains(series:ReadonlyArray<{hourlyRatePercent:number|null;cumulativeRatePercent:number|null}>){
 const rates=series.map(p=>p.hourlyRatePercent).filter((r):r is number=>r!==null);
 const cumulative=series.map(p=>p.cumulativeRatePercent).filter((r):r is number=>r!==null);
 const extent=(values:number[])=>({negative:Math.max(0,...values.map(v=>-v)),positive:Math.max(0,...values)});
 const a=extent(rates),b=extent(cumulative);
 const hasNegative=a.negative>0||b.negative>0,hasPositive=a.positive>0||b.positive>0;
 const fractions=[a,b].filter(e=>e.negative+e.positive>0).map(e=>e.negative/(e.negative+e.positive));
 const negativeFraction=hasNegative&&hasPositive?Math.min(.85,Math.max(.15,fractions.reduce((s,v)=>s+v,0)/fractions.length)):hasNegative?1:0;
 const domain=(e:{negative:number;positive:number}):[number,number]=>{
  const scale=Math.max(negativeFraction?e.negative/negativeFraction:0,negativeFraction<1?e.positive/(1-negativeFraction):0,.0001)*1.08;
  return [-negativeFraction*scale,(1-negativeFraction)*scale];
 };
 return {rate:domain(a),cumulative:domain(b),zeroOffset:(1-negativeFraction)*100,rateZeroOffset:(a.positive+a.negative?a.positive/(a.positive+a.negative):1)*100};
}
