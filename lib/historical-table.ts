import type {HistoryResult,HistoryPoint} from "./exchanges/types";
import {historicalFundingSummary} from "./funding-history";
import {compareFundingRateSummary} from "./cross-exchange";
export const HISTORY_WINDOWS=[{days:1,label:"24h",column:"historical-1"},{days:7,label:"7 天",column:"historical-7"},{days:30,label:"30 天",column:"historical-30"}] as const;
export type HistoryDays=typeof HISTORY_WINDOWS[number]["days"];
export function historicalSortWindow(column:string):HistoryDays|undefined{return HISTORY_WINDOWS.find(window=>window.column===column)?.days;}
export function historyWindow(result:HistoryResult,days:number):HistoryPoint[]{
 const start=result.fetchedAt-days*86400000;
 return result.points.filter(p=>p.time>start&&p.time<=result.fetchedAt);
}
const termCache=new WeakMap<HistoryResult,Map<number,ReturnType<typeof historicalFundingSummary>>>();
export function termHistoryMetric(result:HistoryResult,days:number){
 let ranges=termCache.get(result);if(!ranges){ranges=new Map();termCache.set(result,ranges);}
 let metric=ranges.get(days);if(!metric){metric=historicalFundingSummary(historyWindow(result,days));ranges.set(days,metric);}return metric;
}
type SpreadMetric=ReturnType<typeof compareFundingRateSummary>;
const pairCache=new WeakMap<HistoryResult,WeakMap<HistoryResult,Map<number,SpreadMetric>>>();
export function pairHistoryMetric(short:HistoryResult,long:HistoryResult,days:number){
 let longCache=pairCache.get(short);if(!longCache){longCache=new WeakMap();pairCache.set(short,longCache);}
 let ranges=longCache.get(long);if(!ranges){ranges=new Map();longCache.set(long,ranges);}
 let metric=ranges.get(days);if(!metric){const end=Math.min(short.fetchedAt,long.fetchedAt);metric=compareFundingRateSummary(short.points,long.points,end-days*86400000,end);ranges.set(days,metric);}return metric;
}
export function termHistoryMetrics(result:HistoryResult){return {1:termHistoryMetric(result,1),7:termHistoryMetric(result,7),30:termHistoryMetric(result,30)};}
export function pairHistoryMetrics(short:HistoryResult,long:HistoryResult){return {1:pairHistoryMetric(short,long,1),7:pairHistoryMetric(short,long,7),30:pairHistoryMetric(short,long,30)};}
