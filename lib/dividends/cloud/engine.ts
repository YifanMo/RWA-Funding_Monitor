import {z} from "zod";
import {dividendCatalog,RULE_URL,type DividendEvent} from "../catalog";
import {eventSettlement,adjustmentSchedule,validExDate} from "../model";
import type {DividendSnapshot,DividendAnnouncement} from "../binance";
const dateSchema=z.string().refine(validExDate,"有效除息日期").nullable();
const httpsSchema=z.string().url().refine(s=>{const u=new URL(s);return u.protocol==="https:"&&!u.username&&!u.password&&!u.port;},"只允许公开 HTTPS 来源");
export const eventSchema=z.object({
 id:z.string().regex(/^[a-zA-Z0-9:_-]{1,128}$/),asset:z.string().min(1).max(30),name:z.string().min(1).max(100),symbol:z.string().regex(/^[A-Z0-9_]{1,40}$/),market:z.enum(["CN","HK","US","KR"]),stockCode:z.string().min(1).max(40),
 exDate:dateSchema,recordDate:dateSchema,paymentDate:dateSchema,grossAmount:z.number().finite().nonnegative(),currency:z.string().regex(/^[A-Z]{3,6}$/),unit:z.string().min(1).max(40),estimatedAmount:z.boolean(),
 sourceUrl:httpsSchema,sourceName:z.string().min(1).max(100),verifiedAt:z.string().datetime({offset:true}),note:z.string().max(1500).optional(),
 exchangeNotice:z.object({url:httpsSchema.refine(s=>new URL(s).hostname==="www.binance.com"&&/^\/en\/support\/announcement\/detail\/[a-zA-Z0-9_-]+$/.test(new URL(s).pathname),"使用 Binance 官方公告链接"),settlement:z.string().datetime({offset:true}),note:z.string().max(1500)}).optional(),
}).strict();
export type CloudEvent={event:DividendEvent;revision:string;cancelled:boolean;contractStatus:"listed"|"unverified"};
export type Alert={id:string;kind:"announcement"|"event-change"|"reminder"|"source-error"|"recovery";createdAt:number;status:"pending"|"delivered"|"superseded";data:Record<string,unknown>;deliveredAt?:number;claimToken?:string;claimUntil?:number};
export type SourceState={lastSuccess:number|null;lastFailureHour:number|null;failures:number;error:string|null};
export type CloudState={schemaVersion:1;createdAt:number;lastCheckAt:number|null;lastScanHour:number|null;newsWatermark:number|null;news:Record<string,DividendAnnouncement&{baseline:boolean;detailHash?:string;reviewedHash?:string}>;events:Record<string,CloudEvent>;alerts:Record<string,Alert>;sources:{announcements:SourceState;universe:SourceState};coverageGaps:string[];rulesUrl:string;rulesVerifiedAt:string};
export async function fingerprint(value:unknown){const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(value)));return [...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,"0")).join("");}
function material(event:DividendEvent,cancelled:boolean){return {id:event.id,symbol:event.symbol,market:event.market,stockCode:event.stockCode,exDate:event.exDate,recordDate:event.recordDate,paymentDate:event.paymentDate,grossAmount:event.grossAmount,currency:event.currency,unit:event.unit,estimatedAmount:event.estimatedAmount,notice:event.exchangeNotice?{url:event.exchangeNotice.url,settlement:event.exchangeNotice.settlement,note:event.exchangeNotice.note}:null,cancelled};}
export async function newCloudState(now:number):Promise<CloudState>{
 const events:Record<string,CloudEvent>={};for(const event of dividendCatalog)events[event.id]={event,revision:await fingerprint(material(event,false)),cancelled:false,contractStatus:"unverified"};
 const source=():SourceState=>({lastSuccess:null,lastFailureHour:null,failures:0,error:null});
 return {schemaVersion:1,createdAt:now,lastCheckAt:null,lastScanHour:null,newsWatermark:null,news:{},events,alerts:{},sources:{announcements:source(),universe:source()},coverageGaps:[],rulesUrl:RULE_URL,rulesVerifiedAt:"2026-10-11T17:45:00Z"};
}
function enqueue(state:CloudState,id:string,kind:Alert["kind"],data:Record<string,unknown>,now:number){if(!state.alerts[id])state.alerts[id]={id,kind,data,createdAt:now,status:"pending"};}
export function pendingAlerts(state:CloudState){return Object.values(state.alerts).filter(a=>a.status==="pending").sort((a,b)=>a.createdAt-b.createdAt);}
export function reminderStage(settlement:number,now:number):"24h"|"6h"|"2h"|null{const hours=(settlement-now)/3600000;return hours<=0||hours>24?null:hours<=2?"2h":hours<=6?"6h":"24h";}
export function refreshReminders(state:CloudState,now:number){
 for(const record of Object.values(state.events)){
  const {event,revision,cancelled}=record,settlement=eventSettlement(event);
  const stage=!cancelled&&settlement!==null?reminderStage(settlement,now):null;
  const id=stage?`reminder:${event.id}:${revision}:${stage}`:null;
  for(const alert of Object.values(state.alerts))if(alert.kind==="reminder"&&alert.data.eventId===event.id&&alert.status==="pending"&&alert.id!==id)alert.status="superseded";
  if(id&&settlement!==null){const schedule=event.exDate?adjustmentSchedule(event.market,event.exDate):null;enqueue(state,id,"reminder",{eventId:event.id,event,stage,settlementAt:settlement,remainingMinutes:Math.ceil((settlement-now)/60000),schedule,confirmation:event.exchangeNotice?"交易所已公告":"按规则推导，交易所待确认",contractStatus:record.contractStatus},now);}
 }
}
function sourceResult(state:CloudState,key:"announcements"|"universe",error:string,now:number){
 const source=state.sources[key],hour=Math.floor(now/3600000);
 if(error){if(source.lastFailureHour!==hour){source.failures++;source.lastFailureHour=hour;}source.error=error;
  const near=Object.values(state.events).some(r=>!r.cancelled&&eventSettlement(r.event)!==null&&eventSettlement(r.event)!>now&&eventSettlement(r.event)!-now<=6*3600000);
  if(source.failures>=3||near){const incident=`source:${key}:${source.lastSuccess??state.createdAt}`;enqueue(state,incident,"source-error",{source:key,error,failures:source.failures,coverage:"数据状态未知，不能当成无事件"},now);}
 }else{
  const incident=`source:${key}:${source.lastSuccess??state.createdAt}`;
  if(state.alerts[incident]?.status==="pending")state.alerts[incident].status="superseded";
  if(source.failures>0&&state.alerts[incident]?.status==="delivered")enqueue(state,`recovery:${incident}`,"recovery",{source:key,recoveredAt:now},now);
  source.lastSuccess=now;source.failures=0;source.lastFailureHour=null;source.error=null;
 }
}
export function applyScan(state:CloudState,snapshot:DividendSnapshot,now:number){
 sourceResult(state,"announcements",snapshot.announcementsError,now);sourceResult(state,"universe",snapshot.universeError,now);
 if(!snapshot.announcementsError){
  for(const notice of snapshot.announcements){
   if(!state.news[notice.id]){const baseline=notice.publishedAt<=state.createdAt;state.news[notice.id]={...notice,baseline};if(!baseline)enqueue(state,`announcement:${notice.id}`,"announcement",{...notice,confirmation:"官方永续股息公告，执行时间和金额待读原文核实"},now);}
  }
  if(state.sources.announcements.lastSuccess!==null&&snapshot.announcementOldestAt&&state.newsWatermark!==null&&snapshot.announcementOldestAt>state.newsWatermark)state.coverageGaps=["最新100条公告未覆盖上次成功水位，需要分页或官方检索补查"];
  state.newsWatermark=Math.max(state.newsWatermark??0,snapshot.announcementLatestAt??0,...snapshot.announcements.map(n=>n.publishedAt));
 }
 if(!snapshot.universeError)for(const record of Object.values(state.events)){const e=record.event;record.contractStatus=snapshot.contracts.some(c=>c.symbol===e.symbol&&c.market===e.market&&c.stockCode===e.stockCode)?"listed":"unverified";}
 state.lastCheckAt=now;state.lastScanHour=Math.floor(now/3600000);refreshReminders(state,now);
 const news=Object.values(state.news).sort((a,b)=>b.publishedAt-a.publishedAt).slice(0,500);state.news=Object.fromEntries(news.map(n=>[n.id,n]));
 // Retain all pending notifications; old delivered receipts have a bounded retention.
 for(const [id,a] of Object.entries(state.alerts))if(a.status!=="pending"&&a.createdAt<now-90*86400000)delete state.alerts[id];
 return state;
}
export async function recordEvent(state:CloudState,input:unknown,cancelled:boolean,now:number){
 const event=eventSchema.parse(input);eventSettlement(event);
 const previous=state.events[event.id];if(previous&&(previous.event.symbol!==event.symbol||previous.event.market!==event.market||previous.event.stockCode!==event.stockCode))throw Error("不能将既有事件改成其他股票；请使用新事件ID");
 if(!previous&&Object.keys(state.events).length>=250)throw Error("事件记录已达上限");
 const revision=await fingerprint(material(event,cancelled));
 state.events[event.id]={event,revision,cancelled,contractStatus:previous?.contractStatus??"unverified"};
 if(previous&&previous.revision!==revision)enqueue(state,`change:${event.id}:${revision}`,"event-change",{eventId:event.id,event,cancelled,previousEvent:previous.event,confirmation:event.exchangeNotice?"交易所已公告":"按规则推导，交易所待确认"},now);
 refreshReminders(state,now);return state.events[event.id];
}
export function claimNotifications(state:CloudState,ids:string[],token:string,now:number){const claimed:Alert[]=[];for(const id of ids){const a=state.alerts[id];if(a?.status==="pending"&&(!a.claimUntil||a.claimUntil<=now||a.claimToken===token)){a.claimToken=token;a.claimUntil=now+5*60000;claimed.push(a);}}return claimed;}
export function acknowledge(state:CloudState,ids:string[],now:number,claimToken?:string){for(const id of ids){const a=state.alerts[id];if(a?.status==="pending"&&(!claimToken||a.claimToken===claimToken&&(a.claimUntil??0)>now)){a.status="delivered";a.deliveredAt=now;}}}
export function summary(state:CloudState){return {schemaVersion:state.schemaVersion,createdAt:state.createdAt,lastCheckAt:state.lastCheckAt,newsWatermark:state.newsWatermark,sources:state.sources,coverage:"partial-reviewed-calendar-and-official-announcements",coverageGaps:state.coverageGaps,rulesUrl:state.rulesUrl,rulesVerifiedAt:state.rulesVerifiedAt,events:Object.values(state.events),pendingNotifications:pendingAlerts(state),deliveredCount:Object.values(state.alerts).filter(a=>a.status==="delivered").length};}
