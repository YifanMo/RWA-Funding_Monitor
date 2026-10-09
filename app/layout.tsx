import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"RWA Funding · 股票资金费率监控",description:"按 A 股、港股、美股分类，监控 Hyperliquid、Binance、Aster 的股票永续合约资金费率与历史走势。",icons:{icon:"/favicon.svg",shortcut:"/favicon.svg"}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>;}
