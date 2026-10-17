import assert from "node:assert/strict";
import {ondo,classifyOndo,type OndoMarket} from "../lib/exchanges/ondo";
import {fundingPairs} from "../lib/cross-exchange";
import {fundingSeries,historicalFundingSummary} from "../lib/funding-history";
import type {Contract} from "../lib/exchanges/types";

const HOUR=3600000;
const now=Date.now(),lastHour=Math.floor(now/HOUR)*HOUR;
const nextFunding=new Date(lastHour+HOUR).toISOString();
const metadata=(base:string,timezone="America/New_York",tags=["Stock"]):OndoMarket=>({
 market:`${base}-USD.P`,underlyingMarket:`${base}-USD`,longName:`Official ${base}`,
 pair:{base,quote:"USD"},tags,schedule:{timezone},
});

// Currency alone cannot identify the listing market, nor can an ambiguous depositary symbol.
assert.equal(classifyOndo(metadata("AAPL")),"US");
assert.equal(classifyOndo(metadata("CXMT","Asia/Shanghai")),"CN");
assert.equal(classifyOndo(metadata("MINIMAX","Asia/Hong_Kong")),"HK");
for(const category of ["ETF","Index","Commodity","Crypto","FX","Pre-IPO","Private Market"]){
 assert.equal(classifyOndo(metadata("FILTERED","America/New_York",[category])),null);
 assert.equal(classifyOndo(metadata("FILTERED","America/New_York",["Stock",category])),null);
}
assert.equal(classifyOndo({...metadata("AAPL"),disabled:true}),null);
assert.equal(classifyOndo({...metadata("AAPL"),tags:undefined}),null);
assert.equal(classifyOndo({...metadata("AAPL"),schedule:undefined}),null);
assert.equal(classifyOndo(metadata("SMSN","Asia/Seoul")),null);
assert.equal(classifyOndo(metadata("SKHYNIX","Asia/Seoul")),null);
assert.equal(classifyOndo(metadata("SKHY")),null);

const configs=[
 metadata("AAPL"),metadata("TSM"),metadata("BABA"),metadata("TSLA"),
 metadata("CXMT","Asia/Shanghai"),metadata("UNITREE","Asia/Shanghai"),
 metadata("MINIMAX","Asia/Hong_Kong"),metadata("ZHIPU","Asia/Hong_Kong"),
 metadata("UNVERIFIED"),metadata("AMD"),{...metadata("MSFT"),disabled:true},
 metadata("QQQ","America/New_York",["ETF"]),metadata("BTC","America/New_York",["Crypto"]),
 metadata("MIXED","America/New_York",["Stock","ETF"]),metadata("SKHY"),
 metadata("SMSN","Asia/Seoul"),metadata("SKHYNIX","Asia/Seoul"),
 metadata("MISMATCH"),metadata("SPOT"),metadata("INVERSE"),
];
const live=configs.map(m=>({
 market:m.market,productType:"perpetual",contractType:"linear",baseCurrency:m.pair.base,quoteCurrency:"USD",
 disabled:false,isClosed:true,reduceOnly:false,indexPrice:"998",lastPrice:"999",
 // A previous settled rate and the funding multiplier must not replace or rescale the prediction.
 fundingRate:"0.123",fundingRateMultiplier:"0.5",nextFundingRate:"0.0000063",
 nextFundingRateTimestamp:nextFunding,usdVolume:"1234567.89",openInterestUsd:"32100.5",
}));
const row=(base:string)=>live.find(r=>r.baseCurrency===base)!;
row("TSM").nextFundingRate="0";
row("BABA").nextFundingRate="-0.0000126";
row("AMD").disabled=true;
row("TSLA").reduceOnly=true;
row("MISMATCH").baseCurrency="DIFFERENT";
row("SPOT").productType="spot";
row("INVERSE").contractType="inverse";
Object.assign(row("UNVERIFIED"),{nextFundingRate:undefined,nextFundingRateTimestamp:"invalid",usdVolume:undefined,openInterestUsd:"NaN"});
live.push({...row("AAPL"),market:"NO_METADATA-USD.P",baseCurrency:"NO_METADATA"});
const marks=Object.fromEntries(configs.filter(c=>c.pair.base!=="UNVERIFIED").map(c=>[c.market,{
 markPrice:"342.669014",oraclePrice:"342.680738",lastUpdatedTime:new Date(now-1000).toISOString().replace("Z","123456Z"),
}]));
marks["UNVERIFIED-USD.P"]={markPrice:"777",oraclePrice:"778",lastUpdatedTime:"invalid"};
// Source timestamps in the live API can have nanosecond precision just after a UTC hour boundary.

const historySymbol="ONDOREGRESSION30D-USD.P";
const loopSymbol="ONDOREGRESSIONLOOP-USD.P";
const mismatchSymbol="ONDOREGRESSIONMISMATCH-USD.P";
const conflictSymbol="ONDOREGRESSIONCONFLICT-USD.P";
// Missing one actual hourly settlement is a coverage gap, never a zero-rate payment.
const history=Array.from({length:720},(_,age)=>({
 market:historySymbol,time:new Date(lastHour-age*HOUR+6).toISOString().replace("Z","262948Z"),
 fundingRate:String(age<24?.00002:age<168?-.00001:-.00003),
})).filter((_,age)=>age!==110);
const requests:URL[]=[];
const originalFetch=globalThis.fetch;
globalThis.fetch=async(input)=>{
 const url=new URL(input instanceof Request?input.url:String(input));requests.push(url);
 assert.equal(url.origin,"https://api.ondoperps.xyz");
 const success=(result:unknown,pageInfo?:{nextCursor:string})=>Response.json({success:true,result,...(pageInfo?{pageInfo}:{})});
 if(url.pathname==="/v1/markets")return success({perps:{tradingPairs:configs}});
 if(url.pathname==="/v1/perps/contracts")return success(live);
 if(url.pathname==="/v1/perps/mark_prices")return success(marks);
 assert.equal(url.pathname,"/v1/perps/funding_rate_history");
 const symbol=url.searchParams.get("market")!;
 assert.equal(url.searchParams.get("limit"),"1000");
 assert.ok(Number(url.searchParams.get("startTime"))<Number(url.searchParams.get("endTime")));
 const settled=(market:string,rate="0.0000063")=>({market,time:new Date(lastHour-HOUR+6).toISOString(),fundingRate:rate});
 if(symbol===historySymbol){
  assert.ok(Math.abs(Number(url.searchParams.get("endTime"))-Number(url.searchParams.get("startTime"))-30*24*HOUR)<1);
  if(!url.searchParams.has("cursor"))return success(history.slice(0,500),{nextCursor:"page 2+/="});
  assert.equal(url.searchParams.get("cursor"),"page 2+/=");
  return success([history[499],...history.slice(500)],{nextCursor:""});
 }
 if(symbol===loopSymbol)return success([settled(symbol)],{nextCursor:"repeated-cursor"});
 if(symbol===mismatchSymbol)return success([settled("OTHER-USD.P")],{nextCursor:""});
 if(symbol===conflictSymbol)return success([settled(symbol),settled(symbol,"-0.001")],{nextCursor:""});
 throw Error(`Unexpected test request ${url}`);
};

try{
 const discovered=await ondo.discover();
 assert.deepEqual(discovered.contracts.map(c=>c.asset).sort(),["AAPL","BABA","CXMT","MINIMAX","TSM","UNITREE","UNVERIFIED","ZHIPU"].sort());
 const byAsset=new Map(discovered.contracts.map(c=>[c.asset,c]));
 const apple=byAsset.get("AAPL")!;
 assert.equal(apple.venue,"Ondo Perps");assert.equal(apple.intervalHours,1);
 assert.equal(apple.rate,.0000063);assert.equal(apple.markPrice,342.669014);
 assert.notEqual(apple.markPrice,Number(row("AAPL").indexPrice));
 assert.equal(apple.volume24h,1234567.89);assert.equal(apple.openInterestUsd,32100.5);
 assert.equal(apple.nextFundingTime,Date.parse(nextFunding));
 assert.ok(Math.abs(apple.fetchedAt-(now-1000))<1);
 assert.equal(apple.tradeUrl,"https://app.ondoperps.xyz/trade/perps/AAPL-USD.P");
 assert.equal(byAsset.get("TSM")!.rate,0);assert.equal(byAsset.get("BABA")!.rate,-.0000126);
 assert.equal(byAsset.has("TSLA"),false);assert.match(discovered.feed.error!,/仅减仓/);
 const missing=byAsset.get("UNVERIFIED")!;
 assert.equal(missing.rate,null);assert.equal(missing.markPrice,null);assert.equal(missing.volume24h,null);
 assert.equal(missing.openInterestUsd,null);assert.equal(missing.nextFundingTime,null);assert.equal(missing.stockCode,undefined);
 assert.equal(discovered.feed.status,"partial");assert.equal(discovered.feed.count,8);
 assert.match(discovered.feed.error!,/待核实/);assert.match(discovered.feed.error!,/缺失/);

 // Keep exact listings and leading zeroes: ADRs do not join a company's local shares.
 const expectedListings:Record<string,[Contract["market"],string]>={
  AAPL:["US","AAPL"],TSM:["US","TSM"],BABA:["US","BABA"],
  CXMT:["CN","688825.SH"],UNITREE:["CN","688836.SH"],MINIMAX:["HK","00100.HK"],ZHIPU:["HK","02513.HK"],
 };
 for(const [asset,[market,stockCode]] of Object.entries(expectedListings)){
  const contract=byAsset.get(asset)!;
  assert.equal(contract.market,market);assert.equal(contract.stockCode,stockCode);assert.ok(contract.stockCodeSource);
  const other={...contract,id:`other:${asset}`,venue:"Other venue",intervalHours:8,rate:0};
  const pairs=fundingPairs([contract,other]);assert.equal(pairs.length,1);assert.equal(pairs[0].stockCode,stockCode);
 }
 const tsm=byAsset.get("TSM")!,baba=byAsset.get("BABA")!;
 assert.equal(fundingPairs([tsm,{...tsm,id:"other:2330",venue:"Other venue",market:"CN",stockCode:"2330"}]).length,0);
 assert.equal(fundingPairs([baba,{...baba,id:"other:9988",venue:"Other venue",market:"HK",stockCode:"09988.HK"}]).length,0);
 assert.equal(fundingPairs([missing,{...missing,id:"other:unknown",venue:"Other venue"}]).length,0);

 const result=await ondo.history(historySymbol,30);
 assert.equal(result.points.length,719);assert.equal(result.intervalMethod,"exchange-hourly");assert.equal(result.excludedSpecialCount,0);
 assert.equal(new Set(result.points.map(p=>p.time)).size,719);
 assert.ok(result.points.every((p,i)=>p.intervalHours===1&&(i===0||p.time>result.points[i-1].time)));
 assert.equal(result.points.at(-1)!.rate,.00002);assert.equal(result.points[0].rate,-.00003);
 const missingHour=lastHour-110*HOUR+6;
 assert.equal(result.points.some(p=>p.time===missingHour),false);
 assert.equal(result.points.filter(p=>Math.abs(p.time-missingHour)<HOUR).length,0);
 for(const days of [1,7,30] as const){
  const selected=result.points.filter(p=>p.time>lastHour+6-days*24*HOUR&&p.time<=lastHour+6);
  const summary=historicalFundingSummary(selected);
  assert.equal(summary.sampleHours,days*24-(days===1?0:1));
  const expected=selected.reduce((sum,p)=>sum+p.rate,0)/selected.length*8760;
  assert.ok(Math.abs(summary.annualizedRate!-expected)<1e-12);
  const cumulative=selected.reduce((sum,p)=>sum+p.rate,0)*100;
  assert.ok(Math.abs(fundingSeries(selected).at(-1)!.cumulativeRatePercent-cumulative)<1e-12);
  assert.equal(Math.sign(summary.annualizedRate!),days===1?1:-1);
 }
 const historyRequests=requests.filter(u=>u.searchParams.get("market")===historySymbol);
 assert.equal(historyRequests.length,2);
 assert.equal(historyRequests[0].searchParams.get("startTime"),historyRequests[1].searchParams.get("startTime"));
 assert.equal(historyRequests[0].searchParams.get("endTime"),historyRequests[1].searchParams.get("endTime"));
 await assert.rejects(ondo.history(loopSymbol,1),/游标异常/);
 await assert.rejects(ondo.history(mismatchSymbol,1),/合约不匹配/);
 await assert.rejects(ondo.history(conflictSymbol,1),/记录存在冲突/);
 const requestsBeforeInvalid=requests.length;
 for(const invalid of ["AAPL","aapl-USD.P","AAPL-USD.P?other=1","../AAPL-USD.P"]){
  await assert.rejects(ondo.history(invalid,1),/无效/);
 }
 assert.equal(requests.length,requestsBeforeInvalid);
}finally{globalThis.fetch=originalFetch;}

console.log("PASS: Ondo public market filters, actual listing identities and cross-venue pairs, predicted hourly fractions, mark prices, missing data, 30-day cursor pagination, deduplication, unfilled gaps, 24h/7d/30d annualization, conflicting records and invalid cursors");
