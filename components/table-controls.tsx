"use client";
import {ArrowDown,ArrowUp,ArrowDownUp} from "lucide-react";
import {TableHead} from "./ui/table";
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from "./ui/select";
import {nextTableSort,type TableSort,type VolumeFilter} from "@/lib/table-controls";
export function SortableHead({label,column,sort,onSort,numeric=false,text=false}:{label:string;column:string;sort:TableSort;onSort:(sort:TableSort)=>void;numeric?:boolean;text?:boolean}){
 const active=sort.key===column,Icon=active?(sort.direction==="asc"?ArrowUp:ArrowDown):ArrowDownUp;
 return <TableHead className={numeric?"numeric":""} aria-sort={active?(sort.direction==="asc"?"ascending":"descending"):"none"}><button className={`table-sort-button ${active?"active":""}`} onClick={()=>onSort(nextTableSort(sort,column,text))} aria-label={`${label}，${active?`当前${sort.direction==="asc"?"升序":"降序"}，点击切换`:"点击排序"}`}>{label}<Icon size={13}/></button></TableHead>;
}
export function VolumeFilterSelect({value,onChange,pair=false}:{value:VolumeFilter;onChange:(v:VolumeFilter)=>void;pair?:boolean}){
 return <Select value={value} onValueChange={v=>onChange(v as VolumeFilter)}><SelectTrigger aria-label={pair?"较小腿24小时成交额筛选":"24小时成交额筛选"}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">24h 成交额 · 不限</SelectItem><SelectItem value="top50">24h 成交额 · 前 50%</SelectItem><SelectItem value="top20">24h 成交额 · 前 20%</SelectItem><SelectItem value="over1m">24h 成交额 · &gt; $1M</SelectItem></SelectContent></Select>;
}
export function HistoryWindowSelect({value,onChange}:{value:string;onChange:(v:string)=>void}){
 return <Select value={value} onValueChange={onChange}><SelectTrigger aria-label="历史年化时间窗口"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="1">历史年化 · 24 小时</SelectItem><SelectItem value="7">历史年化 · 7 天</SelectItem><SelectItem value="30">历史年化 · 30 天</SelectItem></SelectContent></Select>;
}
