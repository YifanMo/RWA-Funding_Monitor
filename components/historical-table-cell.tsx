"use client";
import {TableCell} from "./ui/table";
export function HistoricalTableCell({rate,sampleHours,days,error,ready,cross=false}:{rate:number|null;sampleHours:number;days:number;error?:string;ready:boolean;cross?:boolean}){
 const sample=Number.isInteger(sampleHours)?String(sampleHours):sampleHours.toFixed(1);
 const hint=cross?`共同 ${sample}/${days*24}h`:`周期样本 ${sample}h`;
 return <TableCell className={`numeric historical-table-value ${rate===null?"neutral":rate<0?"negative":"positive"}`} title={error||`${cross?"固定所示多空方向，按共同覆盖小时":"模拟空永续方向，按已确认周期"}简单年化；单腿名义本金，不复利，未计费用。`}>
  <strong>{rate===null?"—":`${rate>0?"+":""}${(rate*100).toFixed(2)}%`}</strong><small className={`interval ${cross&&ready&&sampleHours<days*24?"partial-coverage":""}`}>{error?"历史读取失败":!ready?"等待读取…":rate===null?"无可用周期样本":hint}</small>
 </TableCell>;
}
export function HistoryBatchProgress({done,total,failed,loading,onRetry}:{done:number;total:number;failed:number;loading:boolean;onRetry:()=>void}){
 return <div className="history-batch-progress" role="status"><span>历史已读取 {done} / {total} 个合约{loading?" · 排序随数据补齐，当前排名尚未完整":" · 缺失值始终排在最后"}{failed?` · ${failed} 个失败`:""}</span>{failed>0&&<button onClick={onRetry}>重试失败</button>}</div>;
}
