export type SortDirection="asc"|"desc";
export type TableSort={key:string;direction:SortDirection};
export type VolumeFilter="all"|"top50"|"top20"|"over1m";
export function nextTableSort(current:TableSort,key:string,text=false):TableSort{
 return {key,direction:current.key===key?(current.direction==="desc"?"asc":"desc"):text?"asc":"desc"};
}
export function compareTableValues(a:number|string|null,b:number|string|null,direction:SortDirection,aId:string,bId:string):number{
 const valid=(v:number|string|null)=>v!==null&&(typeof v!=="number"||Number.isFinite(v));
 if(!valid(a)&&!valid(b))return aId.localeCompare(bId);if(!valid(a))return 1;if(!valid(b))return -1;
 const diff=typeof a==="string"&&typeof b==="string"?a.localeCompare(b):Number(a)-Number(b);
 return (direction==="asc"?diff:-diff)||aId.localeCompare(bId);
}
/** Percentiles are computed after other filters, before this volume filter; include boundary ties. */
export function filterByVolume<T>(rows:T[],filter:VolumeFilter,volume:(row:T)=>number|null):T[]{
 if(filter==="all")return rows;
 const valid=(value:number|null):value is number=>value!==null&&Number.isFinite(value)&&value>=0;
 if(filter==="over1m")return rows.filter(row=>{const v=volume(row);return valid(v)&&v>1_000_000;});
 const values=rows.map(volume).filter(valid).sort((a,b)=>b-a);if(!values.length)return [];
 const threshold=values[Math.max(1,Math.ceil(values.length*(filter==="top20"?.2:.5)))-1];
 return rows.filter(row=>{const v=volume(row);return valid(v)&&v>=threshold;});
}
