import {type DividendEvent,type DividendMarket} from "./catalog";
export const dividendMarketLabels:Record<DividendMarket,string>={CN:"A 股",HK:"港股",US:"美股",KR:"韩股"};
export type AdjustmentSchedule={zone:string;localDate:string;requestAt:number;hourlyFrom:number;reduceOnlyAt:number;settlementAt:number;restoreAt:number};
export function validExDate(date:string){return /^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(`${date}T00:00:00Z`))&&new Date(`${date}T00:00:00Z`).toISOString().slice(0,10)===date;}
/** Resolve exchange local wall times using IANA timezones, including US DST. */
export function zonedTimestamp(date:string,clock:string,zone:string){
 if(!validExDate(date)||!/^\d{2}:\d{2}$/.test(clock))throw Error("无效的事件日期");
 const [y,m,d]=date.split("-").map(Number),[h,min]=clock.split(":").map(Number);
 if(h>23||min>59)throw Error("无效的事件时间");
 const target=Date.UTC(y,m-1,d,h,min);let timestamp=target;
 const format=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
 for(let i=0;i<3;i++){const p=Object.fromEntries(format.formatToParts(timestamp).filter(v=>v.type!=="literal").map(v=>[v.type,Number(v.value)]));const wall=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);timestamp+=target-wall;}
 return timestamp;
}
export function adjustmentSchedule(market:DividendMarket,exDate:string):AdjustmentSchedule {
 if(!validExDate(exDate))throw Error("除息日期待核实");
 const rules:Record<DividendMarket,{zone:string;request:string;from:string;reduce:string;settle:string;restore:string}>= {
  US:{zone:"America/New_York",request:"15:30",from:"16:00",reduce:"19:30",settle:"20:00",restore:"20:01"},
  KR:{zone:"Asia/Seoul",request:"03:30",from:"04:00",reduce:"07:30",settle:"08:00",restore:"08:01"},
  HK:{zone:"Asia/Hong_Kong",request:"04:30",from:"05:00",reduce:"08:30",settle:"09:00",restore:"09:01"},
  CN:{zone:"Asia/Shanghai",request:"04:45",from:"05:00",reduce:"08:45",settle:"09:15",restore:"09:16"},
 };
 const rule=rules[market];if(!rule)throw Error("该市场调整规则待核实");
 // US FAQ uses the previous calendar day, including weekends and holidays.
 const localDate=market==="US"?new Date(Date.parse(`${exDate}T00:00:00Z`)-86400000).toISOString().slice(0,10):exDate;
 const at=(clock:string)=>zonedTimestamp(localDate,clock,rule.zone);
 return {zone:rule.zone,localDate,requestAt:at(rule.request),hourlyFrom:at(rule.from),reduceOnlyAt:at(rule.reduce),settlementAt:at(rule.settle),restoreAt:at(rule.restore)};
}
export type DividendContract={id:string;asset:string;name:string;symbol:string;venue:"Binance";market:DividendMarket;stockCode?:string;tradeUrl:string};
export function matchingContract(event:DividendEvent,contracts:DividendContract[]){return contracts.find(c=>c.symbol===event.symbol&&c.market===event.market&&c.stockCode===event.stockCode);}
export function eventSettlement(event:DividendEvent){if(event.exchangeNotice){const value=event.exchangeNotice.settlement;if(!/(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))throw Error("公告结算时间必须包含有效时区");return Date.parse(value);}
 return event.exDate?adjustmentSchedule(event.market,event.exDate).settlementAt:null;}
export function eventPhase(event:DividendEvent,now:number){const settlement=eventSettlement(event);if(settlement===null)return "除息日待核实";if(now>=settlement+60000)return "等待核对结算";if(now>=adjustmentSchedule(event.market,event.exDate!).requestAt)return "调整窗口中";return event.exchangeNotice?"交易所已公告":"规则推导 · 待确认";}
