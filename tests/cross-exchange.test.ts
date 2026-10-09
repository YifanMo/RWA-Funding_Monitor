import assert from "node:assert/strict";
import {fundingPairs,pairInScope,pairMatchesQuery,compareFundingHistory} from "../lib/cross-exchange";
import type {Contract,HistoryPoint} from "../lib/exchanges/types";

const make=(id:string,venue:string,rate:number|null,hours:number|null,stockCode="TSM",market:Contract["market"]="US"):Contract=>({id,venue,asset:"TSM",name:"台积电",symbol:id,market,stockCode,rate,intervalHours:hours,markPrice:100,volume24h:1000,openInterestUsd:null,nextFundingTime:null,fetchedAt:1,quoteAsset:"USDT",tradeUrl:"https://example.com"});
const hl=make("hl:xyz:TSM","Hyperliquid",.0001,1),bin=make("bin:TSMUSDT","Binance",0,8),aster=make("aster:TSMUSDT","Aster",-.0004,4);
let pairs=fundingPairs([hl,bin,aster,hl]);
assert.equal(pairs.length,3);
assert.equal(new Set(pairs.map(p=>p.id)).size,3);
const target=pairs.find(p=>[p.a.id,p.b.id].includes(bin.id)&&[p.a.id,p.b.id].includes(hl.id))!;
assert.equal(target.short.id,hl.id);assert.equal(target.long.id,bin.id);assert.equal(target.hourlySpread,.0001);
const reversed=fundingPairs([{...hl,rate:-.0002},bin]).at(0)!;
assert.equal(reversed.id,target.id);assert.equal(reversed.short.id,bin.id);
assert.equal(fundingPairs([make("a","A",-.001,1),make("b","B",-.008,4)])[0].hourlySpread,.001);
assert.equal(fundingPairs([make("a","A",.008,8),make("b","B",.001,1)])[0].hourlySpread,0);
assert.equal(fundingPairs([make("a","A",null,1),bin])[0].hourlySpread,null);
assert.equal(fundingPairs([make("a","A",Infinity,1),bin])[0].hourlySpread,null);
assert.equal(fundingPairs([make("a","A",.1,0),bin])[0].hourlySpread,null);
assert.equal(fundingPairs([hl,{...hl,id:"hl:io:TSM"}]).length,0);
assert.equal(fundingPairs([{...hl,stockCode:undefined},bin]).length,0);
assert.equal(fundingPairs([make("a","A",.1,1,"603986.SH","CN"),{...make("b","B",.2,1,"03986.HK","HK"),aShareCode:"603986.SH"}]).length,0);
assert.equal(fundingPairs([make("a","A",.1,1,"TSM"),make("b","B",.2,1,"2330","CN")]).length,0);
const hPair=fundingPairs([{...make("a","A",.1,1,"01211.HK","HK"),aShareCode:"002594.SZ"},{...make("b","B",.2,1,"01211.HK","HK"),aShareCode:"002594.SZ"}])[0];
assert(pairInScope(hPair,"CN"));assert(pairMatchesQuery(hPair,"002594"));

const H=3600000;
const hours=(rates:number[],start=0):HistoryPoint[]=>rates.map((rate,i)=>({time:(start+i+1)*H,rate,intervalHours:1}));
const short=hours(Array(8).fill(.01)),long=[{time:8*H,rate:.04,intervalHours:8}];
const history=compareFundingHistory(short,long,0,8*H);
assert.equal(history.comparedHours,8);assert.equal(history.settledHours,8);assert.equal(history.segments,1);
assert(Math.abs(history.averageHourlySpread!-.005)<1e-12);
assert(Math.abs(history.annualizedGrossReturn!-.005*8760)<1e-12);
assert(Math.abs(history.cumulativeSpread!-.04)<1e-12);
assert.equal(history.points.find(p=>p.time===H)?.cumulativeRatePercent,1); // Real payments differ from a .5% hourly spread integral.
assert(Math.abs(history.points.at(-1)!.cumulativeRatePercent!-4)<1e-12);
const backward=compareFundingHistory(long,short,0,8*H);
assert(Math.abs(backward.cumulativeSpread!+.04)<1e-12);
assert(Math.abs(backward.annualizedGrossReturn!+.005*8760)<1e-12);
assert(backward.points.filter(p=>p.hourlyRatePercent!==null).every(p=>p.hourlyRatePercent!<0));

// A rate reversal stays signed through the history instead of assuming free intrahour switching.
const changing=compareFundingHistory(hours([.02,-.02]),hours([0,0]),0,2*H);
assert.deepEqual(changing.points.slice(1).map(p=>p.hourlyRatePercent),[2,-2]);
assert.equal(changing.cumulativeSpread,0);
assert.equal(changing.annualizedGrossReturn,0);
const gapShort=hours([.01,.01,.01,.01,.01,.01]).filter(p=>p.time!==3*H);
const gap=compareFundingHistory(gapShort,hours([0,0,0,0,0,0]),0,6*H);
assert.equal(gap.points.find(p=>p.time===3*H)?.hourlyRatePercent,null);
assert.equal(gap.points.find(p=>p.time===3*H)?.cumulativeRatePercent,null);
assert.equal(gap.segments,2);assert.equal(gap.cumulativeSpread,null);
assert.equal(gap.comparedHours,5);assert(Math.abs(gap.annualizedGrossReturn!-.01*8760)<1e-12); // Missing hour isn't filled with zero.
assert.equal(gap.points.find(p=>p.time===4*H)?.cumulativeRatePercent,1);
assert.equal(compareFundingHistory(hours([.01]),[{time:H,rate:0,intervalHours:null}],0,H).comparedHours,0);
const millisecond=compareFundingHistory(short,long.map(p=>({...p,time:p.time+1})),0,8*H+1000);
assert.equal(millisecond.comparedHours,8);assert(Math.abs(millisecond.cumulativeSpread!-.04)<1e-12);
assert.equal(compareFundingHistory(short,long.map(p=>({...p,time:p.time+120000})),0,8*H+120000).comparedHours,0);
assert.equal(compareFundingHistory([],[],0,24*H).cumulativeSpread,null);
assert.equal(compareFundingHistory([],[],0,24*H).annualizedGrossReturn,null);
// The chosen window includes usable hourly samples beyond the shorter complete-settlement cumulative block.
const varyingShort=hours(Array.from({length:720},(_,i)=>i<552?-.00002:i<696?-.00001:.00003));
const zeroLong=Array.from({length:90},(_,i)=>({time:(i+1)*8*H,rate:0,intervalHours:8}));
for(const days of [1,7,30]){
 const selected=compareFundingHistory(varyingShort,zeroLong,(720-days*24)*H,720*H);
 const expected=varyingShort.slice(-days*24).reduce((sum,p)=>sum+p.rate,0)/(days*24)*8760;
 assert.equal(selected.comparedHours,days*24);assert.ok(Math.abs(selected.annualizedGrossReturn!-expected)<1e-12);
}
const partial=compareFundingHistory(hours(Array.from({length:24},(_,i)=>i<8?.001:.002)),[{time:8*H,rate:0,intervalHours:8},{time:16*H,rate:0,intervalHours:8},{time:24*H,rate:0,intervalHours:8}],H,24*H);
assert.equal(partial.comparedHours,23);assert.equal(partial.settledHours,16);
assert.ok(Math.abs(partial.annualizedGrossReturn!-(7*.001+16*.002)/23*8760)<1e-12);
assert.ok(Math.abs(partial.annualizedGrossReturn!-partial.cumulativeSpread!/partial.settledHours*8760)>1);
const overlapping=compareFundingHistory([{time:4*H,rate:.04,intervalHours:4},{time:8*H,rate:.08,intervalHours:8}],[{time:8*H,rate:.04,intervalHours:4}],0,8*H);
assert.equal(overlapping.comparedHours,4);
assert.equal(overlapping.averageHourlySpread,0);
assert.equal(overlapping.settledHours,0);
assert.equal(overlapping.cumulativeSpread,null); // Never include a full payment whose period begins before the shared block.
const conflict=compareFundingHistory([{time:H,rate:.01,intervalHours:1},{time:H+1,rate:.99,intervalHours:1}],hours([0]),0,H+1000);
assert.equal(conflict.comparedHours,0);assert.equal(conflict.cumulativeSpread,null);
console.log("PASS: exact listing pairs, stable IDs, negative rates, period normalization, fixed direction, shared coverage, actual settlement sums, gap segments");
