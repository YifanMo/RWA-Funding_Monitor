export type Market = "CN" | "HK" | "US";
export type Venue = string;
export interface Contract {
 id:string; asset:string; symbol:string; name:string; market:Market; venue:Venue; builder?:string;
 rate:number|null; intervalHours:number|null; markPrice:number|null; volume24h:number|null;
 openInterestUsd:number|null; nextFundingTime:number|null; fetchedAt:number; quoteAsset:string;
 tradeUrl:string; underlying?:string; kind?:string;
}
export interface Feed { venue:Venue; status:"ok"|"partial"|"error"|"stale"; count:number; fetchedAt:number|null; error?:string }
export interface MarketResult { contracts:Contract[]; feed:Feed }
export interface HistoryPoint { time:number; rate:number; intervalHours:number|null }
export interface HistoryResult { points:HistoryPoint[]; fetchedAt:number; excludedSpecialCount:number; intervalMethod:string }
/** Implement both methods and add the adapter to registry.ts to connect another venue. */
export interface ExchangeAdapter {
 id:string; venue:Venue; discover():Promise<MarketResult>;
 history(symbol:string, days:1|7|30):Promise<HistoryResult>;
}
export function finite(value:unknown):number|null { if(value===null||value===undefined||value==="")return null;const n=Number(value);return Number.isFinite(n)?n:null; }
export function hourlyRate(rate:number|null,hours:number|null):number|null { return rate!==null&&hours!==null&&hours>0?rate/hours:null; }
