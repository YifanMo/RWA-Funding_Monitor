"use client";

export function HistoricalAnnualizedReturn({rate,days,sampleHours,crossExchange,unknownPeriodCount=0}:{rate:number|null;days:number;sampleHours:number;crossExchange:boolean;unknownPeriodCount?:number}){
 const selectedHours=days*24;
 const label=days===1?"24 小时":`${days} 天`;
 const hours=Number.isInteger(sampleHours)?String(sampleHours):sampleHours.toFixed(1);
 const percent=rate===null?"—":`${rate>0?"+":""}${(rate*100).toFixed(2)}%`;
 return <div className="historical-return-card" aria-label="所选区间年化毛收益">
  <div className="historical-return-value"><span>所选区间年化毛收益</span><strong className={rate===null?"neutral":rate<0?"negative":"positive"}>{percent}</strong><small>历史估算 · 单腿名义本金</small></div>
  <div className="historical-return-context"><strong>{label}窗口{crossExchange?` · 共同覆盖 ${hours} / ${selectedHours}h`:` · 已确认周期样本 ${hours}h`}</strong><span>{crossExchange?"历史平均小时毛差 × 24 × 365 · 固定图中多空方向":"历史费率之和 ÷ 对应结算小时 × 24 × 365 · 模拟空永续方向"}</span><span>简单年化，不复利；未含手续费、价差、资金成本和杠杆。</span>{crossExchange&&sampleHours<selectedHours&&rate!==null&&<span className="historical-return-incomplete">覆盖不足：仅按可比较小时估算，首尾未对齐、未结算或缺失时段未按零补齐。</span>}{unknownPeriodCount>0&&<span className="historical-return-incomplete">{unknownPeriodCount} 条周期未确认的记录未计入年化。</span>}{rate===null&&<span>等待所选区间可用的历史结算数据。</span>}</div>
 </div>;
}
