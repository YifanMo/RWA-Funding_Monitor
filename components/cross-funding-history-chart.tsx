"use client";
import {useId,useMemo} from "react";
import {ResponsiveContainer,LineChart,Line,XAxis,YAxis,CartesianGrid,Tooltip,ReferenceLine} from "recharts";
import {fundingDomains} from "@/lib/funding-history";
import type {PairHistoryPoint} from "@/lib/cross-exchange";

const percentage=(v:number|null)=>v===null?"—":`${v>0?"+":""}${v.toFixed(4)}%`;
export function CrossFundingHistoryChart({points,directionConfirmed}:{points:PairHistoryPoint[];directionConfirmed:boolean}){
 const domains=useMemo(()=>fundingDomains(points),[points]);
 const gradientId=`cross-rate-${useId().replace(/[^a-zA-Z0-9]/g,"")}`;
 return <div className="funding-chart" aria-label="跨交易所小时费率差与累计费率差曲线">
  <div className="funding-chart-legend"><span><i className="rate-key"/>左轴 · 毛费率差 / 1h</span><span><i className="cumulative-key"/>右轴 · 已结算累计差</span></div>
  <ResponsiveContainer width="100%" height={280}><LineChart data={points} margin={{top:12,right:5,left:0,bottom:0}}>
   <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset={`${domains.rateZeroOffset}%`} stopColor="#85e6c0"/><stop offset={`${domains.rateZeroOffset}%`} stopColor="#f194a1"/></linearGradient></defs>
   <CartesianGrid stroke="#26333d" strokeDasharray="3 6" vertical={false}/>
   <XAxis dataKey="time" type="number" domain={["dataMin","dataMax"]} tickFormatter={v=>new Date(v).toLocaleString("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",timeZone:"Asia/Shanghai"})} stroke="#6f8291" tick={{fontSize:12}} minTickGap={60} axisLine={false} tickLine={false}/>
   <YAxis yAxisId="rate" domain={domains.rate} allowDataOverflow tickFormatter={v=>`${Number(v).toFixed(3)}%`} stroke="#85baa9" tick={{fontSize:12}} width={72} axisLine={false} tickLine={false}/>
   <YAxis yAxisId="cumulative" orientation="right" domain={domains.cumulative} allowDataOverflow tickFormatter={v=>`${Number(v).toFixed(3)}%`} stroke="#a4b2bd" tick={{fontSize:12}} width={72} axisLine={false} tickLine={false}/>
   <Tooltip content={({active,payload})=>{const point=payload?.[0]?.payload as PairHistoryPoint|undefined;if(!active||!point)return null;return <div className="funding-tooltip"><strong>{new Date(point.time).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai"})}</strong><div><span>空腿费率 / 1h</span><b>{percentage(point.shortHourlyPercent)}</b></div><div><span>多腿费率 / 1h</span><b>{percentage(point.longHourlyPercent)}</b></div><div><span>毛费率差 / 1h</span><b className={(point.hourlyRatePercent??0)<0?"negative":"positive"}>{percentage(point.hourlyRatePercent)}</b></div><div><span>已结算累计差</span><b>{percentage(point.cumulativeRatePercent)}</b></div></div>;}}/>
   <ReferenceLine yAxisId="rate" y={0} stroke="#506570" strokeDasharray="4 4"/>
   <Line yAxisId="rate" type="linear" dataKey="hourlyRatePercent" name="毛费率差 / 1h" stroke={`url(#${gradientId})`} strokeWidth={1.7} dot={false} activeDot={{r:4}} isAnimationActive={false} connectNulls={false}/>
   <Line yAxisId="cumulative" type="stepAfter" dataKey="cumulativeRatePercent" name="已结算累计差" stroke="#aebbc5" strokeWidth={2} dot={false} activeDot={{r:4}} isAnimationActive={false} connectNulls={false}/>
  </LineChart></ResponsiveContainer>
  <p className="chart-method">{directionConfirmed?"整段历史固定当前多空方向。":"按固定观察方向比较历史，不代表当前可套利方向。"}小时差按结算周期分摊；累计差按原始结算费率计算，仅包含共同完整结算区间。缺口断线，跨缺口重新起算。</p>
 </div>;
}
