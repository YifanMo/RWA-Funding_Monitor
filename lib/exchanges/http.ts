/// <reference types="vite/client" />
type Cached = { value:unknown; expires:number };
const memory = new Map<string,Cached>();
const inFlight = new Map<string,Promise<unknown>>();
/** Edge cache shares public exchange responses; local memory and in-flight coalescing limit upstream requests. */
export async function publicJson<T=unknown>(url:string,body?:unknown,ttl=45):Promise<T>{
 const key=url+(body?JSON.stringify(body):"");const entry=memory.get(key);
 if(entry&&entry.expires>Date.now())return entry.value as T;
 const pending=inFlight.get(key);if(pending)return pending as Promise<T>;
 const task=(async()=>{
  const edge=(globalThis as unknown as {caches?:{default:Cache}}).caches?.default;
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(key));
  const hash=Array.from(new Uint8Array(digest)).map(n=>n.toString(16).padStart(2,"0")).join("");
  const cacheKey=new Request(`https://rwa-cache.invalid/v1/${hash}`);
  try{const cached=await edge?.match(cacheKey);if(cached){const value=await cached.json();memory.set(key,{value,expires:Date.now()+ttl*1000});return value as T;}}catch{}
  const abort=new AbortController();const timeout=setTimeout(()=>abort.abort(),25000);
  try{
   const target=import.meta.env.DEV&&typeof window==="undefined"?`http://127.0.0.1:5173/__dev_public_feed?url=${encodeURIComponent(url)}`:url;
   const r=await fetch(target,{method:body?"POST":"GET",headers:body?{"Content-Type":"application/json"}:{Accept:"application/json"},body:body?JSON.stringify(body):undefined,signal:abort.signal});
   if(!r.ok)throw Error(`上游接口 HTTP ${r.status}`);
   const value=await r.json();
   if(value&&typeof value==="object"&&!Array.isArray(value)&&"code" in value&&(value as {code:number}).code<0)throw Error("交易所拒绝了数据请求");
   if(memory.size>=180)memory.delete(memory.keys().next().value!);
   memory.set(key,{value,expires:Date.now()+ttl*1000});
   try{await edge?.put(cacheKey,new Response(JSON.stringify(value),{headers:{"Content-Type":"application/json","Cache-Control":`public, max-age=${ttl}`}}));}catch{}
   return value as T;
  }catch(e){if(e instanceof Error&&e.name==="AbortError")throw Error("交易所响应超时");throw e;}finally{clearTimeout(timeout);}
 })();
 inFlight.set(key,task);try{return await task;}finally{inFlight.delete(key);}
}
export function message(error:unknown){return error instanceof Error?error.message:"暂时无法连接交易所";}
