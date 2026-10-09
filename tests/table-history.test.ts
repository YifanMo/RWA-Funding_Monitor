import assert from "node:assert/strict";
import {compareTableValues,filterByVolume,nextTableSort} from "../lib/table-controls";
import {historyWindow,termHistoryMetric,pairHistoryMetric} from "../lib/historical-table";
import {compareFundingHistory,fundingPairs,pairLiquidity} from "../lib/cross-exchange";
import {HistoryClient} from "../lib/history-client";
import type {Contract,HistoryResult} from "../lib/exchanges/types";
const values=[{id:"a",v:10},{id:"b",v:8},{id:"c",v:8},{id:"d",v:4},{id:"e",v:0},{id:"f",v:null},{id:"g",v:NaN},{id:"h",v:Infinity},{id:"i",v:-1}];
assert.deepEqual(filterByVolume(values,"top50",r=>r.v).map(r=>r.id),["a","b","c"]);
assert.deepEqual(filterByVolume(values,"top20",r=>r.v).map(r=>r.id),["a"]);
assert.equal(filterByVolume([{v:1e6},{v:1e6+1},{v:null}],"over1m",r=>r.v).length,1);
assert.deepEqual(filterByVolume(values.filter(r=>["b","c","d"].includes(r.id)),"top20",r=>r.v).map(r=>r.id),["b","c"]); // Based on scoped rows, includes ties.
assert.deepEqual(filterByVolume([{v:null}],"top50",r=>r.v),[]);
const rates=[{id:"negative",v:-.2},{id:"positive",v:.1},{id:"zero",v:0},{id:"missing",v:null},{id:"invalid",v:NaN}];
for(const direction of ["asc","desc"] as const){
 const sorted=[...rates].sort((a,b)=>compareTableValues(a.v,b.v,direction,a.id,b.id));
 assert.deepEqual(sorted.slice(-2).map(r=>r.id),["invalid","missing"]);
 assert.equal(sorted[0].id,direction==="asc"?"negative":"positive");
}
assert.deepEqual(nextTableSort({key:"historical",direction:"desc"},"historical"),{key:"historical",direction:"asc"});
assert.deepEqual(nextTableSort({key:"historical",direction:"asc"},"volume"),{key:"volume",direction:"desc"});
assert.deepEqual(nextTableSort({key:"historical",direction:"asc"},"code",true),{key:"code",direction:"asc"});
const H=3600000,end=720*H+1000;
const result=(rate:number):HistoryResult=>({points:Array.from({length:720},(_,i)=>({time:(i+1)*H,rate:i<552?-rate:i<696?0:rate,intervalHours:1})),fetchedAt:end,excludedSpecialCount:0,intervalMethod:"test"});
const short=result(.00001),long=result(0);
for(const days of [1,7,30]){
 assert.equal(historyWindow(short,days).length,days*24);
 assert.equal(termHistoryMetric(short,days).sampleHours,days*24);
 const summary=pairHistoryMetric(short,long,days),full=compareFundingHistory(short.points,long.points,end-days*24*H,end);
 assert.equal(summary.annualizedGrossReturn,full.annualizedGrossReturn);assert.equal(summary.comparedHours,full.comparedHours);
 assert.equal(pairHistoryMetric(short,long,days),summary);assert.equal(termHistoryMetric(short,days),termHistoryMetric(short,days));
 assert.ok(Math.abs(pairHistoryMetric(long,short,days).annualizedGrossReturn!+summary.annualizedGrossReturn!)<1e-12);
}
assert.ok(termHistoryMetric(short,1).annualizedRate!>0);assert.ok(termHistoryMetric(short,30).annualizedRate!<0);
const contract=(id:string,venue:string):Contract=>({id,venue,symbol:id,stockCode:"TSM",asset:"TSM",name:"台积电",market:"US",rate:0,intervalHours:8,markPrice:100,volume24h:1e6,openInterestUsd:null,nextFundingTime:null,fetchedAt:1,quoteAsset:"USD",tradeUrl:"https://example.com"});
assert.equal(pairLiquidity(fundingPairs([contract("a","A"),{...contract("b","B"),volume24h:NaN}])[0]),null);
let active=0,max=0,calls=0;const running=new Set<string>();
const releases:Map<string,()=>void>=new Map();
const client=new HistoryClient(async c=>{
 calls++;active++;max=Math.max(max,active);assert.ok(!running.has(c.venue));running.add(c.venue);
 await new Promise<void>(resolve=>releases.set(c.id,resolve));active--;running.delete(c.venue);return short;
});
const rows=[contract("a1","A"),contract("a2","A"),contract("b1","B"),contract("c1","C"),contract("c2","C")];
const promises=rows.map(c=>client.read(c,1));
assert.equal(client.read(rows[0],1),promises[0]);assert.equal(calls,3);assert.equal(max,3);
releases.get("a1")!();releases.get("b1")!();releases.get("c1")!();
await Promise.all(promises.slice(0,1));await new Promise(resolve=>setTimeout(resolve,0));
releases.get("a2")!();releases.get("c2")!();await Promise.all(promises);
assert.equal(calls,5);assert.equal(await client.read(rows[0],1),short);assert.equal(calls,5);
const newHour=client.read(rows[0],2);assert.equal(calls,6);releases.get("a1")!();await newHour;
let attempts=0;const retryClient=new HistoryClient(async()=>{attempts++;if(attempts===1)throw Error("offline");return short;});
await assert.rejects(retryClient.read(rows[0],1));await assert.rejects(retryClient.read(rows[0],1));assert.equal(attempts,1);
await retryClient.read(rows[0],1,true);assert.equal(attempts,2);
const starts:number[]=[];const paced=new HistoryClient(async()=>{starts.push(Date.now());return short;},3,{A:20});
await Promise.all([paced.read(rows[0],1),paced.read(rows[1],1)]);assert.ok(starts[1]-starts[0]>=20);
let rolloverLoads=0;
const rollover=new HistoryClient(async()=>{rolloverLoads++;return {...short,fetchedAt:2*H+1000};});
const late=await rollover.read(rows[0],1);await rollover.read(rows[1],1); // A later old-generation job must not delete the fresh-hour alias.
assert.equal(await rollover.read(rows[0],2),late);assert.equal(rolloverLoads,2);
console.log("PASS: scoped volume percentiles/ties, strict $1M threshold, signed/null sorting, all history windows, table/chart agreement, direction, cache, deduplication, per-venue/global concurrency, pacing and retry");
