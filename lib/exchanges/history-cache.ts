import type {HistoryResult} from "./types";
const HOUR=3600000;
const stored=new Map<string,{value:HistoryResult;expiresAt:number}>();
const pending=new Map<string,Promise<HistoryResult>>();
function remember(key:string,value:HistoryResult,expiresAt:number,now:number){
 for(const [k,entry] of stored)if(entry.expiresAt<=now)stored.delete(k);
 // Bounded raw history memory, enough for one complete stock universe without keeping old hour buckets.
 const pointBudget=250000;
 let points=[...stored.values()].reduce((sum,entry)=>sum+entry.value.points.length,0);
 while(stored.size&&(stored.size>=512||points+value.points.length>pointBudget)){
  const oldest=stored.keys().next().value!;points-=stored.get(oldest)!.value.points.length;stored.delete(oldest);
 }
 stored.set(key,{value,expiresAt});
}

/** A stable hour bucket caches a whole history result, preserving its original fetchedAt timestamp. */
export async function cachedHistory(venueId:string,symbol:string,days:number,load:()=>Promise<HistoryResult>,now=Date.now()):Promise<HistoryResult>{
 const hour=Math.floor(now/HOUR),expiresAt=(hour+1)*HOUR;
 const key=`${venueId}:${symbol}:${days}:${hour}`;
 const current=stored.get(key);if(current&&current.expiresAt>now)return current.value;
 const inFlight=pending.get(key);if(inFlight)return inFlight;
 const task=(async()=>{
  const edge=(globalThis as unknown as {caches?:{default:Cache}}).caches?.default;
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(key));
  const hash=Array.from(new Uint8Array(digest)).map(n=>n.toString(16).padStart(2,"0")).join("");
  const cacheKey=new Request(`https://rwa-cache.invalid/history-v2/${hash}`);
  try{
   const result=await edge?.match(cacheKey);
   if(result){const value=await result.json() as HistoryResult;remember(key,value,expiresAt,now);return value;}
  }catch{}
  const value=await load();
  remember(key,value,expiresAt,now);
  const ttl=Math.max(1,Math.floor((expiresAt-Date.now())/1000));
  try{await edge?.put(cacheKey,new Response(JSON.stringify(value),{headers:{"Content-Type":"application/json","Cache-Control":`public, max-age=${ttl}`}}));}catch{}
  return value;
 })();
 pending.set(key,task);try{return await task;}finally{pending.delete(key);}
}
