import assert from "node:assert/strict";
import {fundingSeries,fundingDomains} from "../lib/funding-history";
import {cachedHistory} from "../lib/exchanges/history-cache";
import type {HistoryResult} from "../lib/exchanges/types";

// Mix actual 1h / 8h / 4h settlements. Cumulative must use the raw payment, not the hourly conversion.
const input=[{time:3,rate:-.0004,intervalHours:4},{time:1,rate:.0001,intervalHours:1},{time:2,rate:.0008,intervalHours:8},{time:4,rate:.0002,intervalHours:null}];
const series=fundingSeries(input);
assert.deepEqual(series.map(p=>p.time),[1,2,3,4]);
assert.ok(Math.abs(series.at(-1)!.cumulativeRatePercent-.07)<1e-12);
assert.equal(series[2].hourlyRatePercent,-.01);
assert.equal(series[3].hourlyRatePercent,null);
assert.ok(series[2].cumulativeRatePercent<series[1].cumulativeRatePercent);
assert.equal(fundingSeries([input[0]])[0].cumulativeRatePercent,-.04); // New window resets the cumulative sum.
assert.equal(fundingSeries([...input,input[0]]).length,4); // Duplicate settlement is never charged twice.
assert.equal(fundingSeries([]).length,0);
assert.equal(fundingSeries([{time:1,rate:NaN,intervalHours:1}]).length,0);
const domains=fundingDomains(series);
const zero=(d:[number,number])=>-d[0]/(d[1]-d[0]);
assert.ok(Math.abs(zero(domains.rate)-zero(domains.cumulative))<1e-12);
for(const p of series){if(p.hourlyRatePercent!==null)assert.ok(p.hourlyRatePercent>=domains.rate[0]&&p.hourlyRatePercent<=domains.rate[1]);assert.ok(p.cumulativeRatePercent>=domains.cumulative[0]&&p.cumulativeRatePercent<=domains.cumulative[1]);}
for(const samples of [[{time:1,rate:.01,intervalHours:1}],[{time:1,rate:-.01,intervalHours:1}],[{time:1,rate:0,intervalHours:1}]]){const d=fundingDomains(fundingSeries(samples));assert.ok(d.rate.every(Number.isFinite)&&d.cumulative.every(Number.isFinite));}

const now=Math.floor(Date.now()/3600000)*3600000+10000;
let loads=0;
const load=async():Promise<HistoryResult>=>{loads++;return {points:input,fetchedAt:loads,excludedSpecialCount:0,intervalMethod:"test"};};
const first=await cachedHistory("test","CXMT",7,load,now);
const sameHour=await cachedHistory("test","CXMT",7,load,now+60000);
assert.equal(loads,1);assert.equal(first.fetchedAt,sameHour.fetchedAt);
await cachedHistory("test","CXMT",7,load,now+3600000);
assert.equal(loads,2);
await Promise.all([cachedHistory("test","UNITREE",7,load,now),cachedHistory("test","UNITREE",7,load,now)]);
assert.equal(loads,3);
let attempts=0;
const retry=async():Promise<HistoryResult>=>{attempts++;if(attempts===1)throw Error("upstream failure");return load();};
await assert.rejects(cachedHistory("test","GIGADEV",7,retry,now));
await cachedHistory("test","GIGADEV",7,retry,now);
assert.equal(attempts,2);
console.log("PASS: raw signed cumulative payments, window reset, deduplication, aligned axes, hourly cache, concurrent reads, retry after failure");
