import assert from "node:assert/strict";
import {newCloudState,applyScan,refreshReminders,pendingAlerts,acknowledge,recordEvent,reminderStage,eventSchema,claimNotifications} from "../lib/dividends/cloud/engine";
import {dividendCatalog} from "../lib/dividends/catalog";
import {eventSettlement} from "../lib/dividends/model";
import type {DividendSnapshot} from "../lib/dividends/binance";
const now=Date.parse("2026-10-15T20:30:00Z");
const snapshot:DividendSnapshot={contracts:[],universeError:"",announcements:[],announcementsError:"",announcementScanned:100,announcementLimit:100,fetchedAt:now,catalogVerifiedAt:"2026-10-11T17:45:00Z",events:dividendCatalog,announcementOldestAt:now-90*86400000,announcementLatestAt:now-86400000};
const old={id:"fd194d0fda6e44f2af6bc6333f61600f",title:"Dividend Adjustment of SAMSUNGUSDT TradFi Perpetual",publishedAt:now-17*86400000,url:"https://www.binance.com/en/support/announcement/detail/fd194d0fda6e44f2af6bc6333f61600f"};
let state=await newCloudState(now);applyScan(state,{...snapshot,announcements:[old]},now);assert.equal(pendingAlerts(state).length,0);assert.ok(state.news[old.id].baseline);assert.equal(state.newsWatermark,snapshot.announcementLatestAt);
const news={...old,id:"new_notice_31chars_not_fixed_length",publishedAt:now+1};applyScan(state,{...snapshot,announcements:[old,news]},now+3600000);assert.equal(pendingAlerts(state).length,1);applyScan(state,{...snapshot,announcements:[old,news]},now+3600001);assert.equal(pendingAlerts(state).length,1);
acknowledge(state,pendingAlerts(state).map(a=>a.id),now+3600001);assert.equal(pendingAlerts(state).length,0);
// Each owner's state is independent; no mutable shared seed references are changed.
const second=await newCloudState(now);assert.equal(Object.keys(second.alerts).length,0);assert.equal(second.lastCheckAt,null);
const msft=dividendCatalog.find(e=>e.asset==="MSFT")!,settlement=eventSettlement(msft)!;
state=await newCloudState(now);refreshReminders(state,settlement-23*3600000);assert.equal(pendingAlerts(state).length,1);assert.equal(pendingAlerts(state)[0].data.stage,"24h");
refreshReminders(state,settlement-5*3600000);assert.equal(pendingAlerts(state).length,1);assert.equal(pendingAlerts(state)[0].data.stage,"6h");assert.equal(Object.values(state.alerts).filter(a=>a.status==="superseded").length,1);
acknowledge(state,pendingAlerts(state).map(a=>a.id),settlement-5*3600000);refreshReminders(state,settlement-3*3600000);assert.equal(pendingAlerts(state).length,0);
refreshReminders(state,settlement-90*60000);assert.equal(pendingAlerts(state)[0].data.stage,"2h");refreshReminders(state,settlement);assert.equal(pendingAlerts(state).length,0);
assert.equal(reminderStage(settlement,settlement-25*3600000),null);assert.equal(reminderStage(settlement,settlement+1),null);
// A late first run emits only the most urgent live stage, and labels rule-derived times.
state=await newCloudState(now);refreshReminders(state,settlement-50*60000);assert.equal(pendingAlerts(state).length,1);assert.equal(pendingAlerts(state)[0].data.stage,"2h");assert.match(String(pendingAlerts(state)[0].data.confirmation),/待确认/);
// Unknown MCD ex-date never produces a synthetic reminder from its record or payment date.
assert.equal(Object.values(state.alerts).some(a=>a.data.eventId==="mcd-2026-12-01"),false);
// Amount/time verification timestamps alone do not reset dedup; substantive changes do.
state=await newCloudState(now);await recordEvent(state,{...msft,verifiedAt:"2026-10-16T00:00:00Z"},false,now);assert.equal(pendingAlerts(state).length,0);
await recordEvent(state,{...msft,grossAmount:1.01},false,now);assert.equal(pendingAlerts(state)[0].kind,"event-change");
await recordEvent(state,{...msft,grossAmount:1.01},true,now);refreshReminders(state,settlement-3600000);assert.equal(pendingAlerts(state).some(a=>a.kind==="reminder"),false);
await assert.rejects(()=>recordEvent(state,{...msft,symbol:"TSMUSDT"},false,now));
assert.equal(eventSchema.safeParse({...msft,exDate:"2026-02-30"}).success,false);assert.equal(eventSchema.safeParse({...msft,exchangeNotice:{url:"https://evil.example/a",settlement:"2026-11-19T01:00:00Z",note:""}}).success,false);
// Source failures are counted once per source/hour; never advance the news watermark.
state=await newCloudState(now);applyScan(state,snapshot,now);const watermark=state.newsWatermark;
for(const t of [1,2,3])applyScan(state,{...snapshot,announcementsError:"HTTP 403"},now+t*3600000);
assert.equal(state.newsWatermark,watermark);assert.equal(state.sources.announcements.failures,3);assert.equal(pendingAlerts(state).filter(a=>a.kind==="source-error").length,1);
applyScan(state,{...snapshot,announcementsError:"HTTP 403"},now+3*3600000+1);assert.equal(state.sources.announcements.failures,3);
acknowledge(state,pendingAlerts(state).map(a=>a.id),now+3*3600000+1);applyScan(state,snapshot,now+4*3600000);assert.equal(pendingAlerts(state).filter(a=>a.kind==="recovery").length,1);
// Serialization is sufficient to resume dedup in a fresh worker, without local files or chat history.
const resumed=JSON.parse(JSON.stringify(state));applyScan(resumed,snapshot,now+4*3600000+1);assert.equal(pendingAlerts(resumed).filter(a=>a.kind==="recovery").length,1);
// Recovery suppresses a stale pending failure, and concurrent notification claim cannot duplicate.
state=await newCloudState(now);applyScan(state,snapshot,now);for(const t of [1,2,3])applyScan(state,{...snapshot,announcementsError:"offline"},now+t*3600000);applyScan(state,snapshot,now+4*3600000);assert.equal(pendingAlerts(state).some(a=>a.kind==="source-error"),false);
state=await newCloudState(now);refreshReminders(state,settlement-3600000);const ids=pendingAlerts(state).map(a=>a.id);const first=claimNotifications(state,ids,"worker-one",now);assert.equal(first.length,1);assert.equal(claimNotifications(state,ids,"worker-two",now+1).length,0);acknowledge(state,ids,now+1,"worker-two");assert.equal(pendingAlerts(state).length,1);acknowledge(state,ids,now+2,"worker-one");assert.equal(pendingAlerts(state).length,0);
console.log("PASS: baseline, opaque IDs, per-owner state, durable dedup, staged reminders, missed-stage coalescing, unknown dates, revisions/cancellations, source incidents and recovery");
