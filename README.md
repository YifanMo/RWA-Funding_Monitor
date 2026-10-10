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

## 跨交易所期货费率套利

网站保留原有“期限套利”页，并新增“跨交易所套利”页。两页共享同一份股票范围、每小时刷新规则及 24h / 7 天 / 30 天历史窗口，不引入其他资产。跨交易所页默认查看全部市场，可按 A 股、港股、美股、交易所组合、股票代码和名称筛选。

- 配对使用已核实的实际 `(market, stockCode)`，保留每份交易合约 ID；只连接不同交易所，不连接同一 Hyperliquid 内的不同 builder。不同股份类别、A 股与 H 股、ADR 与本土股不互配；A/H 关联仅控制市场页归属。
- 当期预计费率先除以各自实际结算小时。空小时费率较高的一腿，多较低的一腿；毛差 = 空腿小时费率 − 多腿小时费率。两腿都为负时规则相同。按 8h 等效毛差排序，并可查看简单年化毛差和两腿较小的 24h 成交额。
- 交易对 ID 按原合约排序固定，不随当前多空方向变化。缺失费率或周期不按零处理；零毛差只展示固定观察方向。每腿显示原始费率、实际周期、报价币及数据时间。
- 历史仅为所选配对并行读取两腿，复用已有小时缓存。每条已结算费率按其观察到的结算周期分摊到覆盖的小时，仅比较两腿都完整覆盖的 UTC 小时；整条历史固定当前方向，不逐点取绝对值或假设无成本切换方向。
- 累计差在两腿共同、完整的结算区间内，按原始结算事件求 `Σ空腿费率 − Σ多腿费率`。不是小时差积分，也不是账户实际美元收益。缺口断线后分段重新起算；存在多段时不提供跨缺口总累计。页面显示实际累计比较的起止及小时数，可能短于所选窗口。
- 历史图新增“所选区间年化毛收益”，随 24h / 7 天 / 30 天切换。跨交易所使用所选窗口内共同覆盖小时的平均毛差 × 8760，固定图中多空方向并保留负值；显示实际覆盖小时，缺口不补零。该估算覆盖的样本可能多于累计曲线的完整结算区间，不使用较短的累计区间替代所选历史窗口。
- 结算时间仅在整点 ±60 秒内对齐，未知周期、重叠期间或冲突记录不作为完整比较区间。Binance / Aster 历史周期仍按相邻普通结算时点推算；这一口径不能独立识别所有数据漏单。分红调整沿用原适配器的排除规则。
- 费率差采用等名义本金口径，未包含手续费、基差、滑点、资金成本、合约乘数和汇率转换。港股合约可能分别跟踪港元股价与美元转换价，不能直接假定一比一数量对冲。此页展示候选配对，不执行交易。

Binance 股票永续的利息基准项为零，不代表实际资金费率恒为零；不同 Hyperliquid HIP-3 builder 的利息项与 funding multiplier 也可能不同。计算使用 API 返回的当期报价和已结算记录，不硬编码默认基线。

## 表格筛选与历史年化排序

两个 tab 的表格同时并排展示 24 小时、7 天、30 天历史年化毛收益，每列均可点击表头独立切换升序或降序，默认按 7 天列降序排列。三列展示各自的周期样本或共同覆盖小时，并复用同一份 30 天原始数据；上方历史窗口下拉已移除。下方历史图仍独立选择 24h / 7 天 / 30 天，切图表窗口不改变表格三列、排序或触发历史重拉。股票代码、当期费率/年化和成交额等列继续支持表头排序。未知、读取失败和非有限值在两个方向都排最后，数值并列按稳定 ID 排列，历史负收益保留负号。

成交额筛选包含不限、前 50%、前 20% 和严格大于 $1M。先应用市场、交易所/组合和搜索，再计算有效成交额的比例门槛，包含门槛并列（可能超过选定比例）；期限页按合约行，跨交易所页按配对行，使用两腿较小的 24h 成交额。缺失或无效成交额不参与比例与固定金额筛选，成交额筛选先于历史读取和表头排序。

历史批量读取只针对筛选后需要的唯一合约，每个合约/小时读取一份 30 天记录并在浏览器共享成功结果和进行中的请求；1/7/30 天窗口在本地推导，切窗口、点击表头和跨 tab 复用数据。全局最多 3 个历史读取、每个场所最多 1 个。Hyperliquid 新合约读取开始间隔至少 5 秒，Binance/Aster 为 300ms，以放缓冷扫描；这不代表能保证所有访客共享出口的限额。首次大范围加载可能较慢，可先缩小成交额范围。页面显示加载进度和失败数量；未完成时排名仍在更新，失败仅在显式重试或新小时再次读取。选中行在后续出队时优先，切筛选后的旧任务只填共享缓存，不写新范围的表格。

原始历史缓存按整点清理，上限 512 个结果 / 250,000 个点。表格跨所年化复用小时比较的轻量摘要缓存，只有选中配对计算完整结算累计曲线。两腿读取时间不一致时以较早的 fetchedAt 作为共同窗口终点；历史年化计算并不直接相减两腿各自年化。分红排除数量来自原始 30 天记录，界面明确标注该口径。

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
- 表格当期简单年化 = 原始费率 / 结算小时 × 24 × 365。历史图的“所选区间年化毛收益”使用历史样本：期限套利为 `Σ已确认周期的已结算费率 ÷ Σ对应结算小时 × 8760`，按模拟空永续方向；未知周期不计入，并显示样本时长。结算期间可能跨越滚动窗口起点，因此样本时长不声称是连续、完整的持仓时长。
- 两类历史年化均以单腿名义本金为分母，采用简单年化，不复利；未计手续费、基差、资金成本或杠杆，也不是账户收益或未来收益承诺。
- Hyperliquid 返回小时费率，已包含 builder multiplier；历史最多 500 条，使用时间游标翻页。
- Binance / Aster 读取 `fundingInfo` 的实际周期，历史周期按相邻普通结算时间推算；无法确认的记录保留原始值，但不参加归一化曲线或平均费率计算。
- Binance `rateType=Special` 是分红调整，单独计数并排除普通资金费率曲线。
- 按实际上市市场分类，Binance GIGADEV 是 H 股，Hyperliquid GIGADEV 是 A 股；同名不表示同一可对冲标的。
- 市场页使用实际股票代码识别标的；同一股票的不同合约别名合并标的计数，但保留每份交易合约的独立行。
- ETF、商品、外汇、加密货币、日韩股、未确认的预上市产品不在三类股票列表中。Binance 的 ETF 分类采用已核实的排除表，新上市资产应继续复核。
- 标记价格以合约报价币显示；成交额以 USD / USDT / USD1 的近似美元等值展示。

## 校验

```sh
npx tsc --noEmit --incremental false
node_modules/.bin/esbuild tests/exchanges.test.ts --bundle --platform=node --format=esm --define:import.meta.env.DEV=false --outfile=/tmp/rwa-exchange-tests.mjs
node /tmp/rwa-exchange-tests.mjs
node_modules/.bin/esbuild tests/funding-history.test.ts --bundle --platform=node --format=esm --outfile=/tmp/rwa-funding-history-tests.mjs
node /tmp/rwa-funding-history-tests.mjs
node_modules/.bin/esbuild tests/stock-metadata.test.ts --bundle --platform=node --format=esm --outfile=/tmp/rwa-stock-metadata-tests.mjs
node /tmp/rwa-stock-metadata-tests.mjs
node_modules/.bin/esbuild tests/cross-exchange.test.ts --bundle --platform=node --format=esm --outfile=/tmp/rwa-cross-exchange-tests.mjs
node /tmp/rwa-cross-exchange-tests.mjs
node_modules/.bin/esbuild tests/table-history.test.ts --bundle --platform=node --format=esm --define:import.meta.env.DEV=false --outfile=/tmp/rwa-table-history-tests.mjs
node /tmp/rwa-table-history-tests.mjs
npm run build
```

测试覆盖资金周期换算、A/H 股分类和关联筛选、代码前导零、合约别名、去重统计、ETF 排除、分红调整排除、历史周期变化、30 天分页、累计费率、双轴零线对齐与小时缓存。WebMCP 提供读取监控和设置筛选两个工具，只操作监控页面。

跨交易所测试额外覆盖同股严格配对、稳定 ID、双负费率、多种结算周期、固定方向、共同覆盖、原始结算累计、跨块付款、冲突记录和缺口分段。历史年化测试覆盖三个时间窗口、按结算时长加权、负值、零值、未知周期以及覆盖小时与完整结算时长的区别。WebMCP 新增读取跨交易所配对及设置其筛选两个工具；历史返回绑定配对、方向、区间和刷新时间，避免切换视图后误读旧历史。

表格测试覆盖比例基数与边界并列、严格 $1M 条件、负值及缺失值排序、三个历史窗口、表格/图表一致性、方向翻转、按合约去重、小时缓存、全局/场所并发、节奏控制和显式失败重试。WebMCP 筛选提供 days 和 volumeFilter；days / chartDays 仅表示图表窗口，读取结果同时包含按 1/7/30 天划分的历史年化与样本小时，并保留旧的按图表窗口取值字段及加载状态。三列测试覆盖不同窗口产生不同排序、每列双向切换、缺失值末尾以及共享摘要缓存。

## 官方来源

- [Hyperliquid Perpetuals API](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals)
- [Hyperliquid API Rate Limits](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits)
- [Hyperliquid Funding](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/funding)
- [Binance Market Data](https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/market-data)
- [Aster 官方 API](https://github.com/asterdex/api-docs)
- [Binance GIGADEV H 股公告](https://www.binance.com/en/support/announcement/detail/e8bfd0c5adaf4d8a880bb1b7327107ef)
- [Binance TSM 股票永续规格](https://www.binance.com/en/support/announcement/detail/4cde981dc32d4268b7645e9d16e8d63a)
- [XYZ 合约规格](https://docs.trade.xyz/perpetuals/specifications-and-schedules/specification-index)
- [XYZ 资金费率公式调整](https://docs.trade.xyz/perpetuals/changelog/funding-rate-formula-updates)
