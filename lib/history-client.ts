import type {Contract,HistoryResult} from "./exchanges/types";
type Job={venue:string;run:()=>Promise<void>};
type Entry={promise:Promise<HistoryResult>;status:"pending"|"ready"|"error"};
/** One shared 30-day read per contract/hour, max three reads and one read per venue. */
export class HistoryClient{
 private entries=new Map<string,Entry>();private queue:Job[]=[];private active=0;private venues=new Set<string>();
 private started=new Map<string,number>();private timer:ReturnType<typeof setTimeout>|null=null;
 constructor(private loader:(contract:Contract)=>Promise<HistoryResult>,private concurrency=3,private intervals:Record<string,number>={}){}
 read(contract:Contract,hour:number,retry=false):Promise<HistoryResult>{
  const key=JSON.stringify([hour,contract.id]),existing=this.entries.get(key);
  if(existing&&!(retry&&existing.status==="error"))return existing.promise;
  // Hour rollover removes completed old entries; in-flight reads remain shared until they finish.
  for(const [k,v] of this.entries)if(v.status!=="pending"&&JSON.parse(k)[0]<hour)this.entries.delete(k);
  if(this.entries.size>=512)for(const [k,v] of this.entries){if(v.status!=="pending"){this.entries.delete(k);break;}}
  let resolve!:(result:HistoryResult)=>void,reject!:(error:unknown)=>void;
  const promise=new Promise<HistoryResult>((a,b)=>{resolve=a;reject=b;});
  const entry:Entry={promise,status:"pending"};this.entries.set(key,entry);
  this.queue.push({venue:contract.venue,run:async()=>{
   try{
    const result=await this.loader(contract);entry.status="ready";
    // A paced job may cross an hour boundary. Also cache under its actual source hour for the next refresh.
    const actualHour=Math.floor(result.fetchedAt/3600000),actualKey=JSON.stringify([actualHour,contract.id]);
    if(actualHour>hour&&!this.entries.has(actualKey))this.entries.set(actualKey,entry);
    resolve(result);
   }
   catch(error){entry.status="error";reject(error);}
  }});this.pump();return promise;
 }
 private pump(){
  if(this.timer){clearTimeout(this.timer);this.timer=null;}
  while(this.active<this.concurrency){
   const remaining=(venue:string)=>Math.max(0,(this.started.get(venue)??0)+(this.intervals[venue]??0)-Date.now());
   const index=this.queue.findIndex(job=>!this.venues.has(job.venue)&&remaining(job.venue)===0);
   if(index<0){
    const delays=this.queue.filter(job=>!this.venues.has(job.venue)).map(job=>remaining(job.venue));
    if(delays.length)this.timer=setTimeout(()=>{this.timer=null;this.pump();},Math.max(1,Math.min(...delays)));
    return;
   }
   const [job]=this.queue.splice(index,1);this.active++;this.venues.add(job.venue);this.started.set(job.venue,Date.now());
   void job.run().finally(()=>{this.active--;this.venues.delete(job.venue);this.pump();});
  }
 }
}
const directVenues=new Map<string,number>();
export function resetHistoryFallback(){directVenues.clear();}
async function loadHistory(contract:Contract):Promise<HistoryResult>{
 const hour=Math.floor(Date.now()/3600000);
 if(directVenues.get(contract.venue)!==hour){
  const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),30000);
  try{
   const response=await fetch(`/api/history?id=${encodeURIComponent(contract.id)}&days=30`,{signal:abort.signal});
   const value=await response.json() as HistoryResult&{error?:string};
   if(!response.ok||!Array.isArray(value.points)||!Number.isFinite(value.fetchedAt))throw Error(value.error||`历史接口 HTTP ${response.status}`);
   return value;
  }catch(error){
   // Only a confirmed egress restriction changes the venue path for this hour; transient errors still probe the server.
   if(error instanceof Error&&/HTTP\s*(403|451)\b/.test(error.message))directVenues.set(contract.venue,hour);
  }finally{clearTimeout(timeout);}
 }
 const {directHistory}=await import("./exchanges/client");
 return directHistory(contract.venue,contract.symbol,30);
}
// 30-day HL funding reads usually need two weighted pages; pace cold scans, while cache hits remain instant.
export const historyClient=new HistoryClient(loadHistory,3,{Hyperliquid:5000,Binance:300,Aster:300});
