"use client";
import {useId,useMemo} from "react";
import {ResponsiveContainer,LineChart,Line,XAxis,YAxis,CartesianGrid,Tooltip,ReferenceLine} from "recharts";
import {fundingSeries,fundingDomains,type FundingChartPoint} from "@/lib/funding-history";
import type {HistoryPoint} from "@/lib/exchanges/types";

const percentage=(value:number|null)=>value===null?"—":`${value>0?"+":""}${value.toFixed(4)}%`;
const color=(value:number|null)=>value===null?"#90a2af":value<0?"#f194a1":"#85e6c0";

export function FundingHistoryChart({points}:{points:HistoryPoint[]}){
 const series=useMemo(()=>fundingSeries(points),[points]);
 const domains=useMemo(()=>fundingDomains(series),[series]);
 const gradientId=`funding-rate-${useId().replace(/[^a-zA-Z0-9]/g,"")}`;
 return <div className="funding-chart" aria-label="资金费率与累计资金费率双轴曲线">
  <div className="funding-chart-legend"><span><i className="rate-key"/>左轴 · 费率 / 1h</span><span><i className="cumulative-key"/>右轴 · 累计费率</span></div>
  <ResponsiveContainer width="100%" height={280}>
   <LineChart data={series} margin={{top:12,right:5,left:0,bottom:0}}>
    <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset={`${domains.rateZeroOffset}%`} stopColor="#85e6c0"/><stop offset={`${domains.rateZeroOffset}%`} stopColor="#f194a1"/></linearGradient></defs>
    <CartesianGrid stroke="#26333d" strokeDasharray="3 6" vertical={false}/>
    <XAxis dataKey="time" type="number" domain={["dataMin","dataMax"]} tickFormatter={v=>new Date(v).toLocaleString("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",timeZone:"Asia/Shanghai"})} stroke="#6f8291" tick={{fontSize:12}} minTickGap={60} axisLine={false} tickLine={false}/>
    <YAxis yAxisId="rate" domain={domains.rate} allowDataOverflow tickFormatter={v=>`${Number(v).toFixed(3)}%`} stroke="#85baa9" tick={{fontSize:12}} width={72} axisLine={false} tickLine={false}/>
    <YAxis yAxisId="cumulative" orientation="right" domain={domains.cumulative} allowDataOverflow tickFormatter={v=>`${Number(v).toFixed(3)}%`} stroke="#a4b2bd" tick={{fontSize:12}} width={72} axisLine={false} tickLine={false}/>
    <Tooltip content={({active,payload})=>{
     const point=payload?.[0]?.payload as FundingChartPoint|undefined;
     if(!active||!point)return null;
     return <div className="funding-tooltip"><strong>{new Date(point.time).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai"})}</strong><div><span>资金费率 / 1h</span><b style={{color:color(point.hourlyRatePercent)}}>{percentage(point.hourlyRatePercent)}</b></div><div><span>累计资金费率</span><b style={{color:color(point.cumulativeRatePercent)}}>{percentage(point.cumulativeRatePercent)}</b></div></div>;
    }}/>
    <ReferenceLine yAxisId="rate" y={0} stroke="#506570" strokeDasharray="4 4"/>
    <Line yAxisId="rate" type="linear" dataKey="hourlyRatePercent" name="资金费率 / 1h" stroke={`url(#${gradientId})`} strokeWidth={1.7} dot={false} activeDot={{r:4}} isAnimationActive={false} connectNulls={false}/>
    <Line yAxisId="cumulative" type="linear" dataKey="cumulativeRatePercent" name="累计资金费率" stroke="#aebbc5" strokeWidth={2} dot={series.length===1?{r:3}:false} activeDot={{r:4}} isAnimationActive={false}/>
   </LineChart>
  </ResponsiveContainer>
  <p className="chart-method">累计曲线为所选区间内已结算费率之和，随区间重新计算，不复利。</p>
 </div>;
}
