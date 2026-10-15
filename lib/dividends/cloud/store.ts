import {and,eq} from "drizzle-orm";
import {getDb} from "@/db";
import {dividendMonitors} from "@/db/schema";
import {newCloudState,type CloudState} from "./engine";
export async function readLedger(ownerId:string){
 const db=getDb();let [row]=await db.select().from(dividendMonitors).where(eq(dividendMonitors.ownerId,ownerId));
 if(!row){const now=Date.now(),state=await newCloudState(now);await db.insert(dividendMonitors).values({ownerId,stateJson:JSON.stringify(state),updatedAt:now}).onConflictDoNothing();[row]=await db.select().from(dividendMonitors).where(eq(dividendMonitors.ownerId,ownerId));}
 const state=JSON.parse(row.stateJson) as CloudState;if(state.schemaVersion!==1)throw Error("云端监控状态版本异常");return {state,version:row.version};
}
/** Owner partition + optimistic version check: concurrent callers cannot overwrite receipts. */
export async function saveLedger(ownerId:string,state:CloudState,version:number){
 const saved=await getDb().update(dividendMonitors).set({stateJson:JSON.stringify(state),version:version+1,updatedAt:Date.now()}).where(and(eq(dividendMonitors.ownerId,ownerId),eq(dividendMonitors.version,version))).returning({version:dividendMonitors.version});
 if(saved.length!==1)throw Error("另一轮监控已更新状态，请重新读取后重试");return version+1;
}
