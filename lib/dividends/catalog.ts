export type DividendMarket="CN"|"HK"|"US"|"KR";
export interface DividendEvent {
 id:string;asset:string;name:string;symbol:string;market:DividendMarket;stockCode:string;
 exDate:string|null;recordDate:string|null;paymentDate:string|null;
 grossAmount:number;currency:string;unit:string;estimatedAmount:boolean;
 sourceUrl:string;sourceName:string;verifiedAt:string;note?:string;
 exchangeNotice?:{url:string;settlement:string;note:string};
}
export const RULE_URL="https://www.binance.com/en/support/faq/detail/7ced719b5e9a4859a1864c2fe657309f";
export const CATALOG_VERIFIED_AT="2026-10-11T17:45:00Z";
// Reviewed official declarations. Absence from this partial registry never means 'no dividend'.
// Add future calendar providers behind the same normalized event interface.
export const dividendCatalog:DividendEvent[]=[
 {id:"msft-2026-11-19",asset:"MSFT",name:"微软",symbol:"MSFTUSDT",market:"US",stockCode:"MSFT",exDate:"2026-11-19",recordDate:"2026-11-19",paymentDate:"2026-12-10",grossAmount:.98,currency:"USD",unit:"普通股",estimatedAmount:false,sourceUrl:"https://news.microsoft.com/source/2026/09/15/microsoft-announces-quarterly-dividend-increase-7/",sourceName:"Microsoft 官方公告",verifiedAt:CATALOG_VERIFIED_AT},
 {id:"mcd-2026-12-01",asset:"MCD",name:"麦当劳",symbol:"MCDUSDT",market:"US",stockCode:"MCD",exDate:null,recordDate:"2026-12-01",paymentDate:"2026-12-15",grossAmount:1.93,currency:"USD",unit:"普通股",estimatedAmount:false,sourceUrl:"https://mcdonalds.mediaroom.com/2026-09-17-McDONALDS-MARKS-50-CONSECUTIVE-YEARS-OF-DIVIDEND-INCREASES%2C-JOINING-THE-RANKS-OF-DIVIDEND-KINGS",sourceName:"McDonald’s 官方公告",verifiedAt:CATALOG_VERIFIED_AT,note:"官方公告仅明确登记日和支付日，除息日待核实，暂不推算特殊结算时间。"},
 {id:"tsm-2026-12-10",asset:"TSM",name:"台积电 ADR",symbol:"TSMUSDT",market:"US",stockCode:"TSM",exDate:"2026-12-10",recordDate:"2026-12-10",paymentDate:"2027-01-07",grossAmount:1.08,currency:"USD",unit:"ADR",estimatedAmount:true,sourceUrl:"https://investor.tsmc.com/english/latest-dividend",sourceName:"TSMC 官方股息表",verifiedAt:CATALOG_VERIFIED_AT,note:"美元股息为汇率估算值。合约跟踪 NYSE ADR，不能套用台湾普通股 NT$7 的金额。"},
 {id:"samsung-2026-09-29",asset:"SAMSUNG",name:"三星电子",symbol:"SAMSUNGUSDT",market:"KR",stockCode:"005930.KS",exDate:"2026-09-29",recordDate:null,paymentDate:null,grossAmount:4500,currency:"KRW",unit:"普通股",estimatedAmount:true,sourceUrl:"https://www.binance.com/en/support/announcement/detail/fd194d0fda6e44f2af6bc6333f61600f",sourceName:"Binance 三星调整公告",verifiedAt:CATALOG_VERIFIED_AT,exchangeNotice:{url:"https://www.binance.com/en/support/announcement/detail/fd194d0fda6e44f2af6bc6333f61600f",settlement:"2026-09-28T23:00:00Z",note:"按估计股息结算，真实金额确认后一周内补差；不代表补差已经执行。"}},
];
