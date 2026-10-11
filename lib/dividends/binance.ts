import {publicJson,message} from "../exchanges/http";
import {KNOWN_ETFS} from "../exchanges/binance";
import type {SymbolInfo} from "../exchanges/futures";
import {stockMetadata} from "../exchanges/stock-metadata";
import {dividendCatalog,CATALOG_VERIFIED_AT,type DividendMarket} from "./catalog";
import type {DividendContract} from "./model";
export type DividendAnnouncement={id:string;title:string;publishedAt:number;url:string};
export type DividendSnapshot={contracts:DividendContract[];universeError:string;announcements:DividendAnnouncement[];announcementsError:string;announcementScanned:number;announcementLimit:number;fetchedAt:number;catalogVerifiedAt:string;events:typeof dividendCatalog};
export function dividendContract(symbol:SymbolInfo):DividendContract|null {
 const mapping:Record<string,DividendMarket>={CN_EQUITY:"CN",HK_EQUITY:"HK",EQUITY:"US",KR_EQUITY:"KR"};
 const market=mapping[symbol.underlyingType];
 if(symbol.status!=="TRADING"||symbol.contractType!=="TRADIFI_PERPETUAL"||!market||KNOWN_ETFS.has(symbol.baseAsset)||(symbol.underlyingSubType??[]).includes("ETF"))return null;
 const metadata=market==="KR"?(symbol.baseAsset==="SAMSUNG"?{stockCode:"005930.KS",name:"三星电子"}:{}):stockMetadata(symbol.baseAsset,market);
 return {id:`binance:${symbol.symbol}`,asset:symbol.baseAsset,symbol:symbol.symbol,venue:"Binance",market,name:metadata.name??symbol.baseAsset,stockCode:metadata.stockCode,tradeUrl:`https://www.binance.com/en/futures/${encodeURIComponent(symbol.symbol)}`};
}
type Article={id?:number;code:string;title:string;releaseDate:number};
type CmsResult={code:string;success:boolean;data?:{catalogs?:{catalogId:number;total:number;articles:Article[]}[]}};
export function dividendAnnouncements(rows:Article[]):DividendAnnouncement[]{
 return [...new Map(rows.filter(a=>/dividend|派息|股息|分红/i.test(a.title)&&/perpetual|futures|tradfi|永续|合约/i.test(a.title)&&!/bstocks|spot|现货/i.test(a.title)&&/^[a-zA-Z0-9_-]{1,128}$/.test(a.code)&&Number.isFinite(a.releaseDate)).map(a=>[a.code,{id:a.code,title:a.title,publishedAt:a.releaseDate,url:`https://www.binance.com/en/support/announcement/detail/${a.code}`}])).values()].sort((a,b)=>b.publishedAt-a.publishedAt);
}
export async function readDividendUniverse(){const info=await publicJson<{symbols:SymbolInfo[]}>("https://fapi.binance.com/fapi/v1/exchangeInfo",undefined,300);if(!Array.isArray(info.symbols))throw Error("合约范围格式异常");return info.symbols.flatMap(s=>{const c=dividendContract(s);return c?[c]:[];});}
export async function readDividendAnnouncements(){
 const rows:Article[]=[];
 for(let page=1;page<=2;page++){
  const result=await publicJson<CmsResult>(`https://www.binance.com/bapi/composite/v1/public/cms/article/list/query?type=1&catalogId=49&pageNo=${page}&pageSize=50`,undefined,3600);
  const catalog=result.data?.catalogs?.find(c=>c.catalogId===49);
  if(result.code!=="000000"||!result.success||!catalog||!Array.isArray(catalog.articles))throw Error("官方公告暂时不可用");
  rows.push(...catalog.articles);if(catalog.articles.length<50||rows.length>=catalog.total)break;
 }
 return {announcements:dividendAnnouncements(rows),scanned:rows.length};
}
export async function readBinanceDividends():Promise<DividendSnapshot>{
 const [universe,news]=await Promise.allSettled([readDividendUniverse(),readDividendAnnouncements()]);
 return {contracts:universe.status==="fulfilled"?universe.value:[],universeError:universe.status==="rejected"?message(universe.reason):"",announcements:news.status==="fulfilled"?news.value.announcements:[],announcementsError:news.status==="rejected"?message(news.reason):"",announcementScanned:news.status==="fulfilled"?news.value.scanned:0,announcementLimit:100,fetchedAt:Date.now(),catalogVerifiedAt:CATALOG_VERIFIED_AT,events:dividendCatalog};
}
