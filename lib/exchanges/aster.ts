import {futuresAdapter,type SymbolInfo} from "./futures";
import {KNOWN_ETFS} from "./binance";
import type {Market} from "./types";
export function classifyAster(s:SymbolInfo):Market|null{
 const subtype=s.underlyingSubType??[],tags=s.tags??[];
 if(s.contractType!=="PERPETUAL"||!subtype.includes("STOCK")||subtype.includes("ETF")||tags.some(t=>t.toUpperCase()==="ETF")||KNOWN_ETFS.has(s.baseAsset))return null;
 const mapping:Record<string,Market>={astock:"CN",hkstock:"HK",nasdaq:"US"};return mapping[s.channel??""]??null;
}
export const aster=futuresAdapter({id:"aster",venue:"Aster",baseUrl:"https://fapi.asterdex.com",classify:classifyAster,tradeUrl:s=>`https://www.asterdex.com/en/futures/${encodeURIComponent(s)}`});
