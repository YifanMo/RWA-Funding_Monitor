import {futuresAdapter,type SymbolInfo} from "./futures";
import type {Market} from "./types";
// Explicitly reviewed ETFs. Unknown new assets can be added here without changing the adapter API.
export const KNOWN_ETFS=new Set(["BITO", "BWET", "CSOPSAMSUNG2L", "CSOPSKHYNIX2L", "DRAM", "EWJ", "EWT", "EWY", "EWZ", "GDX", "IGV", "INTW", "IWM", "KODEX200", "KORU", "KSTR", "LYTE", "MAGS", "MUU", "MVLL", "NCLD", "NVDL", "QQQ", "RAM", "SKDD", "SKUU", "SMH", "SNXX", "SOXL", "SOXS", "SPY", "SQQQ", "TBT", "TLT", "TMF", "TQQQ", "TSLL", "TZA", "URNM", "UVXY", "XBI", "XLE"]);
export function classifyBinance(s:SymbolInfo):Market|null{
 if(s.contractType!=="TRADIFI_PERPETUAL"||KNOWN_ETFS.has(s.baseAsset)||(s.underlyingSubType??[]).includes("ETF"))return null;
 const mapping:Record<string,Market>={CN_EQUITY:"CN",HK_EQUITY:"HK",EQUITY:"US"};return mapping[s.underlyingType]??null;
}
export const binance=futuresAdapter({id:"binance",venue:"Binance",baseUrl:"https://fapi.binance.com",classify:classifyBinance,tradeUrl:s=>`https://www.binance.com/en/futures/${encodeURIComponent(s)}`});
