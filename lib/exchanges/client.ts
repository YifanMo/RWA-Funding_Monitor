import {cachedHistory} from "./history-cache";
import {adapters as direct} from "./registry";
import type {Contract,Feed,HistoryResult} from "./types";

type Snapshot={contracts:Contract[];feeds:Feed[];fetchedAt:number};
/** Use the visitor's public API access when a hosted egress route is unavailable. */
export async function recoverPublicFeeds(snapshot:Snapshot):Promise<Snapshot>{
 const failed=snapshot.feeds.filter(f=>f.status==="error").map(f=>f.venue);
 if(!failed.length)return snapshot;
 const results=await Promise.allSettled(direct.filter(a=>failed.includes(a.venue)).map(a=>a.discover()));
 const recovered=results.filter((r):r is PromiseFulfilledResult<Awaited<ReturnType<typeof direct[number]["discover"]>>>=>r.status==="fulfilled").map(r=>r.value);
 const successful=new Set(recovered.map(r=>r.feed.venue));
 return {contracts:[...snapshot.contracts.filter(c=>!successful.has(c.venue)),...recovered.flatMap(r=>r.contracts)],feeds:snapshot.feeds.map(f=>recovered.find(r=>r.feed.venue===f.venue)?.feed??f),fetchedAt:Date.now()};
}
export async function directHistory(venue:string,symbol:string,days:1|7|30):Promise<HistoryResult>{
 const adapter=direct.find(a=>a.venue===venue);if(!adapter)throw Error("不支持的交易所");
 return cachedHistory(adapter.id,symbol,days,()=>adapter.history(symbol,days));
}
