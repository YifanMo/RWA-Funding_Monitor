import assert from "node:assert/strict";
import {classifyBinance,binance} from "../lib/exchanges/binance";
import {classifyAster} from "../lib/exchanges/aster";
import {hyperliquid,classifyAnnotation} from "../lib/exchanges/hyperliquid";
import {hourlyRate} from "../lib/exchanges/types";
import type {SymbolInfo} from "../lib/exchanges/futures";

// Critical comparisons must not confuse an 8h settlement with an hourly rate.
assert.equal(hourlyRate(.0008,8),hourlyRate(.0004,4));
assert.equal(hourlyRate(.0008,8),hourlyRate(.0001,1));
assert.equal(hourlyRate(.001,null),null);
const symbol=(baseAsset:string,underlyingType="EQUITY"):SymbolInfo=>({symbol:`${baseAsset}USDT`,baseAsset,quoteAsset:"USDT",status:"TRADING",contractType:"TRADIFI_PERPETUAL",underlyingType,underlyingSubType:["TradFi"]});
assert.equal(classifyBinance(symbol("GIGADEV","HK_EQUITY")),"HK");
assert.equal(classifyBinance(symbol("CXMT","CN_EQUITY")),"CN");
assert.equal(classifyBinance(symbol("USDEX")),"US");
assert.equal(classifyBinance(symbol("QQQ")),null);
assert.equal(classifyAster({...symbol("NFLX"),contractType:"PERPETUAL",underlyingSubType:["STOCK"],channel:"nasdaq",tags:["Netflix","Stock"]}),"US");
assert.equal(classifyAnnotation({category:"stocks",displayName:"BABA",description:"References 1 ADS (NYSE: BABA). Also listed on HKEX:9988."}),"US");
assert.equal(classifyAnnotation({category:"stocks",displayName:"QQQ",description:"References an ETF on Nasdaq."}),null);

// Settled history changes cadence and includes a dividend payment: keep only regular funding.
const originalFetch=globalThis.fetch;
const now=Date.now(),t=now-36*3600000;
globalThis.fetch=async()=>Response.json([
 {fundingTime:t,fundingRate:"0.0008",rateType:"Regular"},
 {fundingTime:t+8*3600000,fundingRate:"0.0008",rateType:"Regular"},
 {fundingTime:t+10*3600000,fundingRate:"0.02",rateType:"Special"},
 {fundingTime:t+12*3600000,fundingRate:"0.0004",rateType:"Regular"},
 {fundingTime:t+13*3600000,fundingRate:"0.0001",rateType:"Regular"},
]);
const historic=await binance.history("RATE_TEST",30);
assert.equal(historic.excludedSpecialCount,1);
assert.deepEqual(historic.points.map(p=>p.intervalHours),[null,8,4,1]);
assert.equal(historic.points.length,4);

// Hyperliquid caps pages at 500 records; a 30d graph must not silently stop there.
let pages=0;
globalThis.fetch=async(_url,options)=>{
 const body=JSON.parse(String(options?.body));pages++;
 const count=pages===1?500:220;
 return Response.json(Array.from({length:count},(_,i)=>({time:body.startTime+1+i*3600000,fundingRate:"0.00000625"})));
};
const hl=await hyperliquid.history("xyz:TEST_PAGINATION",30);
assert.equal(pages,2);assert.equal(hl.points.length,720);assert.equal(new Set(hl.points.map(p=>p.time)).size,720);
globalThis.fetch=originalFetch;
console.log("PASS: rate periods, market/ETF classification, dividend exclusion, interval changes, 30-day pagination");
