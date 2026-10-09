"use client";
import {useEffect,useRef,useState} from "react";
import type {Contract,HistoryResult} from "./exchanges/types";
import {historyClient,resetHistoryFallback} from "./history-client";
export type HistoryRead={data:HistoryResult|null;error:string};
export function useHistoryBatch(contracts:Contract[],enabled:boolean,lastRequest:number,priorityIds:string[]=[]){
 const hour=Math.floor(lastRequest/3600000);
 const ids=[...new Set(contracts.map(c=>c.id))].sort();
 const key=JSON.stringify([hour,ids]);
 const contractsRef=useRef(contracts);contractsRef.current=contracts;
 const priorityRef=useRef(priorityIds);priorityRef.current=priorityIds;
 const retryRef=useRef(0);
 const [retry,setRetry]=useState(0),[state,setState]=useState<{key:string;rows:Record<string,HistoryRead>}>({key:"",rows:{}});
 useEffect(()=>{
  if(!enabled||!contractsRef.current.length)return;
  let cancelled=false;
  const retryFailures=retryRef.current!==retry;retryRef.current=retry;
  const unique=[...new Map(contractsRef.current.map(c=>[c.id,c])).values()];
  // Alternate venues so one large market doesn't block every other venue behind it.
  const groups=new Map<string,Contract[]>();for(const c of unique)groups.set(c.venue,[...(groups.get(c.venue)??[]),c]);
  const queue:Contract[]=[];while([...groups.values()].some(g=>g.length))for(const g of groups.values()){const c=g.shift();if(c)queue.push(c);}
  setState({key,rows:{}});
  const worker=async()=>{while(!cancelled&&queue.length){
   const index=queue.findIndex(c=>priorityRef.current.includes(c.id));
   const [contract]=queue.splice(index<0?0:index,1);let row:HistoryRead;
   try{row={data:await historyClient.read(contract,hour,retryFailures),error:""};}
   catch(error){row={data:null,error:error instanceof Error?error.message:"历史暂不可用"};}
   if(!cancelled)setState(previous=>({key,rows:{...(previous.key===key?previous.rows:{}),[contract.id]:row}}));
  }};
  void Promise.all(Array.from({length:Math.min(3,queue.length)},worker));
  return()=>{cancelled=true;};
 },[enabled,key,hour,retry]);
 const rows=enabled&&state.key===key?state.rows:{};
 const done=ids.filter(id=>rows[id]).length,failed=ids.filter(id=>rows[id]?.error).length;
 return {rows,done,failed,total:ids.length,loading:enabled&&done<ids.length,retry:()=>{resetHistoryFallback();setRetry(n=>n+1);},key};
}
