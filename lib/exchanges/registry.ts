import {cachedHistory} from "./history-cache";
import {hyperliquid} from "./hyperliquid";
import {binance} from "./binance";
import {aster} from "./aster";
import {message} from "./http";
import type {ExchangeAdapter,Contract,Feed} from "./types";
/** Register another venue here; dashboard and HTTP endpoints consume this common interface. */
export const adapters:ExchangeAdapter[]=[hyperliquid,binance,aster];
type Snapshot={contracts:Contract[];feeds:Feed[];fetchedAt:number};
let current:Snapshot|null=null;
let pending:Promise<Snapshot>|null=null;
export async function markets():Promise<Snapshot>{
 if(current&&Date.now()-current.fetchedAt<45000)return current;
 if(pending)return pending;
 pending=(async()=>{
  const results=await Promise.allSettled(adapters.map(a=>a.discover()));
  const contracts:Contract[]=[],feeds:Feed[]=[];
  for(let i=0;i<results.length;i++){
   const r=results[i],adapter=adapters[i];
   if(r.status==="fulfilled"){contracts.push(...r.value.contracts);feeds.push(r.value.feed);}
   else{feeds.push({venue:adapter.venue,status:"error",count:0,fetchedAt:null,error:message(r.reason)});}
  }
  const result={contracts,feeds,fetchedAt:Date.now()};
  // Never silently reuse old rates after a failed refresh.
  current=result;return result;
 })();try{return await pending;}finally{pending=null;}
}
export async function contractHistory(id:string,days:1|7|30){
 const separator=id.indexOf(":");const adapter=adapters.find(a=>a.id===id.slice(0,separator));
 if(!adapter)throw Error("不支持的交易所");
 // Historical reads do not depend on the live snapshot or another venue's connection.
 const symbol=id.slice(separator+1);
 return cachedHistory(adapter.id,symbol,days,()=>adapter.history(symbol,days));
}
