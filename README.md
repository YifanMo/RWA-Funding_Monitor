# RWA Funding

股票永续合约资金费率监控网站。按 A 股、港股、美股分类，接入 Hyperliquid HIP-3、Binance USDⓈ-M TradFi、Aster Pro、Ondo Perps。

## 本地运行

```sh
npm install
npm run dev
```

默认预览地址为 http://127.0.0.1:5173。页面打开后立即同步，之后每 1 小时刷新一次；没有自动交易或账户密钥。交易所 `TRADING` 状态表示市场在架，个人账户权限仍以交易所为准。

本地预览通过 `build/public-feed-preview.ts` 使用系统已有的 HTTP/HTTPS 代理读取公开行情。这仅用于开发环境，生产 Worker 直接读取官方 API；当生产出口无法访问某平台时，浏览器会尝试公开接口直连。Aster 历史接口没有 CORS，需网站服务端可访问其官方接口。

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

历史批量读取只针对筛选后需要的唯一合约，每个合约/小时读取一份 30 天记录并在浏览器共享成功结果和进行中的请求；1/7/30 天窗口在本地推导，切窗口、点击表头和跨 tab 复用数据。全局最多 3 个历史读取、每个场所最多 1 个。Hyperliquid 新合约读取开始间隔至少 5 秒，Binance 为 1200ms、Aster 为 300ms、Ondo Perps 为 1100ms，以放缓冷扫描；这不代表能保证所有访客共享出口的限额。首次大范围加载可能较慢，可先缩小成交额范围。页面显示加载进度和失败数量；未完成时排名仍在更新，失败仅在显式重试或新小时再次读取。选中行在后续出队时优先，切筛选后的旧任务只填共享缓存，不写新范围的表格。

原始历史缓存按整点清理，上限 512 个结果 / 250,000 个点。表格跨所年化复用小时比较的轻量摘要缓存，只有选中配对计算完整结算累计曲线。两腿读取时间不一致时以较早的 fetchedAt 作为共同窗口终点；历史年化计算并不直接相减两腿各自年化。分红排除数量来自原始 30 天记录，界面明确标注该口径。

## 股息特殊费率监控

第三个 tab 单独监控 Binance 单股股息调整。Binance 定期发现当前在架的 US/CN/HK/KR `TRADIFI_PERPETUAL` 股票合约，继续排除 ETF；韩股仅纳入事件扫描，不扩展原来两个套利页的三市场范围。独立使用该 tab 自己的市场与搜索筛选，不受顶栏交易所选择影响。

- 未来公司股息目前是 `lib/dividends/catalog.ts` 的部分已核实目录：MSFT、MCD、TSM ADR 及三星历史例子。保留除息、登记、支付日、税前原币股息、单位、估算状态、官方来源和核实时间。MCD 原文未明确除息日，暂不生成调整窗口；TSM 跟踪 NYSE ADR，美元股息是估算值。
- 按 Binance 2026-10-01 股息规则生成“规则推导、待交易所确认”时间线。US 为除息日前一自然日的纽约时间，使用 IANA 时区处理夏令时；KR/HK/CN 分别用首尔／香港／上海时区。展示周期调整与生效、只减仓和 1% 标记价偏离限制、特殊结算、恢复时刻。已核实公告可覆盖结算时刻，过去案例其余节点仅为现行规则参考。
- 公开网页 CMS 目录 49（Latest Binance News）每次读取最多两页、100 条，每小时检查永续股息标题；排除 bStocks / spot。它是未经 FAPI 稳定性承诺的网页接口，失败时显示未知。新公告先显示原文，不通过标题自动断言金额或执行时间；确认详情后才能加入规范化日历。最近 100 条不是完整公告库，公司未来股息也不是全量自动日历。
- 已执行记录来自 FAPI `fundingRate` 的 `rateType=Special`，保留原始费率、时间和结算标记价。扫描当前在架、符合筛选的合约，复用所有 tab 的 30 天缓存和限流队列，支持 24h / 7 天 / 30 天切换，展示扫描进度与失败数量。特殊费率以单次支付显示，不年化；只有类型严格等于 `Special` 才标为股息特殊结算。未知非普通类型仍排除常规曲线。
- `HistoryResult.specialFunding` 为可选扩展字段；普通 `points` 及两个套利页的年化仍排除非 Regular 记录。公告日历里只有严格匹配实际市场／股票代码／合约、且时间吻合的 Special 才标“实际已核对”，不据此确认后续补差完成。
- 网页在该 tab 可见时按小时同步；Sites 关联的 ChatGPT 云端计划使用独立 OAuth MCP 工具运行，网站关闭、电脑关机不影响云端计划。D1 持久保存公告、水位、事件修订、提醒阶段和故障状态，并通过用户分区、版本检查和通知租约防止串改与重复领取。目录核实时间与 API 同步时间分开展示，未覆盖或失败不能视为无事件。云端执行与迁移约定见 `docs-cloud-monitor.md`。

TradeXYZ (`xyz`) 官方规则没有固定的现金股息补偿，经济影响由价格与市场 funding 体现；不能推广到所有 HIP-3 builder。Aevo 的同类特殊股息规则尚未核实，当前不接入事件扫描，也不宣称没有。每条规则和公司资料均可从页面跳转官方原文。

公开事件接口：`GET /api/dividends`，返回日历、在架范围、近期公告、各来源错误和时间。浏览器服务端访问失败后尝试公开数据直连，不保证上游始终可达。浏览器 WebMCP 增加 `read_dividend_monitor`，明确返回部分覆盖和非自动公司日历口径。

## Ondo Perps

通过官方公开 REST API 接入现有两个套利页：`/v1/markets` 动态发现股票类别与底层交易日历，`/v1/perps/contracts` 读取可交易状态、下一期预测费率、美元成交额及持仓量，`/v1/perps/mark_prices` 读取真正的标记价和报价时间。底层股票休市（`isClosed`）仍可交易；`disabled=true` 合约不纳入。仅减仓合约暂不作为可开仓候选，并在连接状态提示。CN/HK/US 分类结合官方 Stock 标签和上海／香港／纽约交易日历，排除 ETF、指数、商品、外汇、加密货币、预上市及现货；日韩市场不扩展到普通三市场页。

股票代码复用已核实的上市目录，ADR 和 A/H 股保持独立。SKHY 的场所特定存托股身份尚未核实，暂不纳入并在连接状态提示；新股票缺少已核实证券代码时仍可观察费率，但不自动跨所配对。2026-10-17 接入实测为 39 个三市场股票合约，数量以后端实时在架接口为准，不固定这一清单。

Ondo 按 UTC 整点后的首个 tick 每小时结算。当前使用 `nextFundingRate`，历史使用 `funding_rate_history` 中的已结算 fraction，均原样作为 1h 费率；不再除以 8 或重复乘 `fundingRateMultiplier`。理论利息基准不替代实时费率。历史按 `pageInfo.nextCursor` 完整翻页、保留负值、缺失小时不补零；24h / 7 天 / 30 天三列、累计曲线和跨所差值复用同一份 30 天历史。实测单次 `limit=1000` 可取得 720 个小时样本，分页有上限和重复游标保护。公开读取按场所串行、请求启动至少间隔 1100ms，并复用公共响应及小时历史缓存。

本次仅接入普通资金费率；股息特殊费率页继续按已核实的 Binance 规则运行。

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
- ETF、商品、外汇、加密货币、日韩股、未确认的预上市产品不在三类普通资金费率股票列表中；事件 tab 单独包含 Binance 韩股。Binance 的 ETF 分类采用已核实的排除表，新上市资产应继续复核。
- 标记价格以合约报价币显示；成交额以 USD / USDT / USD1 的近似美元等值展示。

## 校验

```sh
npx tsc --noEmit --incremental false
node_modules/.bin/esbuild tests/exchanges.test.ts --bundle --platform=node --format=esm --define:import.meta.env.DEV=false --outfile=/tmp/rwa-exchange-tests.mjs
node /tmp/rwa-exchange-tests.mjs
node_modules/.bin/esbuild tests/ondo.test.ts --bundle --platform=node --format=esm --define:import.meta.env.DEV=false --outfile=/tmp/rwa-ondo-tests.mjs
node /tmp/rwa-ondo-tests.mjs
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
- [Ondo Perps 公开 API](https://docs.ondoperps.xyz/api-reference/market-data/get-contracts)
- [Ondo Perps 历史费率 API](https://docs.ondoperps.xyz/api-reference/funding-rate/get-funding-rate-history)
- [Ondo Perps 资金费率规则](https://docs.ondoperps.xyz/funding-rates)
- [Binance GIGADEV H 股公告](https://www.binance.com/en/support/announcement/detail/e8bfd0c5adaf4d8a880bb1b7327107ef)
- [Binance TSM 股票永续规格](https://www.binance.com/en/support/announcement/detail/4cde981dc32d4268b7645e9d16e8d63a)
- [XYZ 合约规格](https://docs.trade.xyz/perpetuals/specifications-and-schedules/specification-index)
- [XYZ 资金费率公式调整](https://docs.trade.xyz/perpetuals/changelog/funding-rate-formula-updates)
