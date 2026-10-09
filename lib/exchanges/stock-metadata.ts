import listings from "./stock-listings.json";
import type {Contract, Market} from "./types";

type Listing={asset:string;market:Market;code:string;name?:string;relatedA?:string;source:string};
const reviewed=new Map((listings as Listing[]).map(row=>[`${row.market}:${row.asset}`,row]));

/** Read the actual listing reference, preserving leading zeros and share classes. */
export function listingFromDescription(description:string,market:Market):string|undefined{
 const reference=description.match(/\b(Nasdaq|NYSE|AMEX|HKEX|SSE(?: STAR)?|SZSE)\s*:\s*([A-Z0-9]+(?:[.-][A-Z0-9]+)*)/i);
 if(!reference)return undefined;
 const exchange=reference[1].toUpperCase(),ticker=reference[2].toUpperCase();
 const actualMarket=exchange==="HKEX"?"HK":exchange.startsWith("SSE")||exchange==="SZSE"?"CN":"US";
 if(actualMarket!==market)return undefined;
 if(market==="HK")return /^\d{1,5}$/.test(ticker)?`${ticker.padStart(5,"0")}.HK`:undefined;
 if(market==="CN")return /^\d{6}$/.test(ticker)?`${ticker}.${exchange==="SZSE"?"SZ":"SH"}`:undefined;
 return ticker;
}

export function stockMetadata(asset:string,market:Market,description?:string):Pick<Contract,"stockCode"|"aShareCode"|"stockCodeSource">&{name?:string}{
 const listing=reviewed.get(`${market}:${asset}`);
 const code=listing?.code??(description?listingFromDescription(description,market):undefined);
 return {stockCode:code,aShareCode:market==="HK"?listing?.relatedA:undefined,stockCodeSource:listing?.source??(code?"https://api.hyperliquid.xyz/info":undefined),...(listing?.name?{name:listing.name}:{})};
}

/** A/H association adds a view membership; it never changes the contract's underlying market. */
export function inMarketScope(contract:Contract,market:string):boolean{
 return market==="all"||contract.market===market||market==="CN"&&contract.market==="HK"&&Boolean(contract.aShareCode);
}

export function stockIdentity(contract:Contract):string{
 return `${contract.market}:${contract.stockCode??contract.asset}`;
}

export function matchesStockQuery(contract:Contract,query:string):boolean{
 return `${contract.asset} ${contract.name} ${contract.symbol} ${contract.builder??""} ${contract.stockCode??""} ${contract.aShareCode??""}`.toLowerCase().includes(query.trim().toLowerCase());
}
