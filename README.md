# RWA Funding

股票永续合约资金费率监控网站。按 A 股、港股、美股分类，接入 Hyperliquid HIP-3、Binance USDⓈ-M TradFi、Aster Pro。

当前网站：[RWA Funding Monitor](https://rwa-funding-monitor.q961017025.chatgpt.site/)。网站访问权限由 Sites 管理。

技术栈：React 19、TypeScript、Vinext / Vite、Cloudflare Workers、Recharts。本仓库保存当前网站源码；推送 GitHub 不会自动部署 Sites。

## 本地运行

需要 Node.js ≥ 22.13。克隆仓库后安装锁定的依赖：

```sh
git clone https://github.com/YifanMo/RWA-Funding_Monitor.git
cd RWA-Funding_Monitor
npm ci
npm run dev
```

默认预览地址为 http://127.0.0.1:5173。页面打开后立即同步，之后每 1 小时刷新一次；没有自动交易或账户密钥。交易所 `TRADING` 状态表示市场在架，个人账户权限仍以交易所为准。

当前没有独立的后台定时采集器、持久化行情数据库或 Your dot 自动任务。关闭页面后，该页面的刷新计时器停止；再次打开会重新同步。标的范围在同步时从交易所公开合约列表重新发现，并按股票分类规则筛选。

本地预览通过 `build/public-feed-preview.ts` 使用系统已有的 HTTP/HTTPS 代理读取公开行情。这仅用于开发环境，生产 Worker 直接读取官方 API；当生产出口无法访问某平台时，浏览器会尝试公开接口直连。Aster 历史接口没有 CORS，需网站服务端可访问其官方接口。

`.openai/hosting.json` 保留现有 Sites 项目绑定，供构建使用，不包含 API 密钥。`build/` 和 `scripts/` 是构建与本地运行所需源码；依赖、构建产物、本地运行状态和 `.env*` 文件均不提交。

## 股票代码与 A 股关联

表格与历史详情分别显示永续合约代码和实际跟踪的股票代码。例如 Binance `BYDUSDT` 跟踪 `01211.HK`，并标明关联 A 股 `002594.SZ`。股票代码保留前导零、美股股份类别，以及 `.SH` / `.SZ` / `.HK` 后缀；搜索支持实际代码和关联 A 股代码。

A 股页同时展示实际 A 股合约，以及已核实在 A/H 股同时上市公司的港股合约。关联只影响筛选范围，不改变 `Contract.market`；全部市场中同一份合约只有一行，费率和成交额不会因跨页展示重复统计。当前已确认的关联包括比亚迪、兆易创新和中际旭创。此筛选不以 A/H 溢价为条件，也不将两类股票合并为同一个套利标的。

`lib/exchanges/stock-listings.json` 保存按 `(market, asset)` 核实的代码、名称、来源及可选 `relatedA`。美股采用官方上市目录或合约公告；Hyperliquid 可从明确的上市引用中提取代码，新标的无法核实代码时显示“待核实”。港股 Class A 普通股、拟 A 股上市均不自动视为已经 A/H 双重上市。新增股票可在此目录补充代码和关联。

## 新增交易所

1. 在 `lib/exchanges/` 新建适配器，实现 `ExchangeAdapter` 的 `discover()` 和 `history(symbol, days)`。
2. 在 `registry.ts` 注册适配器；在 `exchange-info.ts` 添加显示名称。界面的交易所筛选和客户端备用连接会随配置扩展。
3. `discover()` 仅返回交易所明确在架的股票合约。统一返回 decimal 费率及实际 `intervalHours`；缺失信息返回 `null`，不要按默认周期猜测。
4. 历史请求支持 1、7、30 天并完整分页；记录原始结算费率和每条记录的周期，分红调整须另行处理。
5. 新的股票元数据可补充 `stock-names.json`、ETF 排除集合和 Hyperliquid 分类目录；目录只用于标的分类，行情和上下架状态始终实时获取。

公共接口：`GET /api/markets`、`GET /api/history?id=hyperliquid:xyz:CXMT&days=30`。历史查询结果按「交易所、合约、区间、当前小时」缓存，在下一个整点失效；切换视图可复用当小时结果，避免每次重拉整个区间。响应包含连接状态和时间，不会在读取失败后静默复用旧费率。

## 数据口径

- 当期预计费率与已结算历史分开展示。
- Funding History 同时显示小时等效费率（左轴）和实际结算累计费率（右轴），零线对齐。累计按所选区间的实际结算费率顺序相加，不复利、不乘年化，也不先除以结算周期；负费率会降低累计值，分红调整保持排除。
- 8h 等效费率 = 原始费率 / 结算小时 × 8。
- 简单年化 = 原始费率 / 结算小时 × 24 × 365；该值不是未来收益预测。
- Hyperliquid 返回小时费率，已包含 builder multiplier；历史最多 500 条，使用时间游标翻页。
- Binance / Aster 读取 `fundingInfo` 的实际周期，历史周期按相邻普通结算时间推算；无法确认的记录保留原始值，但不参加归一化曲线或平均费率计算。
- Binance `rateType=Special` 是分红调整，单独计数并排除普通资金费率曲线。
- 按实际上市市场分类，Binance GIGADEV 是 H 股，Hyperliquid GIGADEV 是 A 股；同名不表示同一可对冲标的。
- 市场页使用实际股票代码识别标的；同一股票的不同合约别名合并标的计数，但保留每份交易合约的独立行。
- ETF、商品、外汇、加密货币、日韩股、未确认的预上市产品不在三类股票列表中。Binance 的 ETF 分类采用已核实的排除表，新上市资产应继续复核。
- 标记价格以合约报价币显示；成交额以 USD / USDT / USD1 的近似美元等值展示。

## 校验

```sh
npx tsc --noEmit
node_modules/.bin/esbuild tests/exchanges.test.ts --bundle --platform=node --format=esm --define:import.meta.env.DEV=false --outfile=/tmp/rwa-exchange-tests.mjs
node /tmp/rwa-exchange-tests.mjs
node_modules/.bin/esbuild tests/funding-history.test.ts --bundle --platform=node --format=esm --outfile=/tmp/rwa-funding-history-tests.mjs
node /tmp/rwa-funding-history-tests.mjs
node_modules/.bin/esbuild tests/stock-metadata.test.ts --bundle --platform=node --format=esm --outfile=/tmp/rwa-stock-metadata-tests.mjs
node /tmp/rwa-stock-metadata-tests.mjs
npm run build
```

测试覆盖资金周期换算、A/H 股分类和关联筛选、代码前导零、合约别名、去重统计、ETF 排除、分红调整排除、历史周期变化、30 天分页、累计费率、双轴零线对齐与小时缓存。WebMCP 提供读取监控和设置筛选两个工具，只操作监控页面。

## 官方来源

- [Hyperliquid Perpetuals API](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals)
- [Hyperliquid Funding](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/funding)
- [Binance Market Data](https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/market-data)
- [Aster 官方 API](https://github.com/asterdex/api-docs)
- [Binance GIGADEV H 股公告](https://www.binance.com/en/support/announcement/detail/e8bfd0c5adaf4d8a880bb1b7327107ef)
