import assert from "node:assert/strict";
import {stockMetadata,listingFromDescription,inMarketScope,stockIdentity,matchesStockQuery} from "../lib/exchanges/stock-metadata";
import type {Contract,Market} from "../lib/exchanges/types";

const contract=(asset:string,market:Market):Contract=>({id:`test:${market}:${asset}`,asset,name:asset,symbol:`${asset}USDT`,market,venue:"Binance",rate:.0001,intervalHours:4,markPrice:100,volume24h:1000,openInterestUsd:null,nextFundingTime:null,fetchedAt:1,quoteAsset:"USDT",tradeUrl:"https://example.com",...stockMetadata(asset,market)});
const byd=contract("BYD","HK");
assert.equal(byd.stockCode,"01211.HK");
assert.equal(byd.aShareCode,"002594.SZ");
assert.equal(byd.market,"HK");
assert(inMarketScope(byd,"CN"));
assert(inMarketScope(byd,"HK"));
assert(!inMarketScope(byd,"US"));
assert(matchesStockQuery(byd,"002594"));
assert(matchesStockQuery(byd,"01211"));
assert(matchesStockQuery(byd,"比亚迪"));

const gigaA=contract("GIGADEV","CN"),gigaH=contract("GIGADEV","HK"),tencent=contract("TENCENT","HK");
assert.equal(gigaA.stockCode,"603986.SH");
assert.equal(gigaH.stockCode,"03986.HK");
assert.equal(gigaH.aShareCode,"603986.SH");
assert.notEqual(stockIdentity(gigaA),stockIdentity(gigaH));
assert.equal(stockIdentity(tencent),stockIdentity(contract("HK0700","HK")));
assert(!inMarketScope(tencent,"CN"));
assert(!inMarketScope(contract("MINIMAX","HK"),"CN")); // Class A ordinary shares on HKEX are not mainland A shares.
const contracts=[gigaA,gigaH,byd,tencent];
assert.equal(contracts.filter(c=>inMarketScope(c,"all")).length,4);
assert.equal(contracts.filter(c=>inMarketScope(c,"CN")).length,3);
assert.equal(contracts.filter(c=>inMarketScope(c,"HK")).length,3);
assert.equal(new Set(contracts.filter(c=>inMarketScope(c,"all")).map(c=>c.id)).size,4);

assert.equal(stockMetadata("STXX","US").stockCode,"STX");
assert.equal(stockMetadata("BRKB","US").stockCode,"BRK.B");
assert.equal(stockMetadata("USDEX","US").stockCode,"USDE");
assert.equal(stockMetadata("NEW_UNVERIFIED","US").stockCode,undefined);
assert.equal(listingFromDescription("References 1 ADS (NYSE: BABA). Also listed on HKEX: 9988.","US"),"BABA");
assert.equal(listingFromDescription("References 1 ADS (NYSE: BABA). Also listed on HKEX: 9988.","HK"),undefined);
assert.equal(listingFromDescription("References Class A ordinary shares (HKEX: 0100).","HK"),"00100.HK");
assert.equal(listingFromDescription("References A-share (SZSE: 002594).","CN"),"002594.SZ");
assert.equal(listingFromDescription("References A-share (SSE STAR: 688825).","CN"),"688825.SH");
assert.equal(listingFromDescription("References Class B shares (NYSE: BRK.B).","US"),"BRK.B");
console.log("PASS: listing codes, leading zeros, A/H scope without duplicate contracts, underlying identity, code search, verified aliases");
