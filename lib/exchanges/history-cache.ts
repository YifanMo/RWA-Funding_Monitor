import type {HistoryResult} from "./types";
const HOUR=3600000;
const stored=new Map<string,{value:HistoryResult;expiresAt:number}>();
const pending=new Map<string,Promise<HistoryResult>>();

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
   if(result){const value=await result.json() as HistoryResult;stored.set(key,{value,expiresAt});return value;}
  }catch{}
  const value=await load();
  if(stored.size>=180)stored.delete(stored.keys().next().value!);
  stored.set(key,{value,expiresAt});
  const ttl=Math.max(1,Math.floor((expiresAt-Date.now())/1000));
  try{await edge?.put(cacheKey,new Response(JSON.stringify(value),{headers:{"Content-Type":"application/json","Cache-Control":`public, max-age=${ttl}`}}));}catch{}
  return value;
 })();
 pending.set(key,task);try{return await task;}finally{pending.delete(key);}
}
