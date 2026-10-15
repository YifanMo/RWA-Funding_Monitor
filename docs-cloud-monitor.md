# 股息监控的云端运行约定

调度由 Sites 关联的 ChatGPT 云端任务提供。任务使用已发布站点的 OAuth MCP 工具、公开 Binance 数据及官方公司资料，不依赖本机、localhost、本机状态文件或 heartbeat。具体任务归属以平台显示为准，不能仅凭 Sites 计划推断 Your dot 归属。

D1 的 dividend_monitors 按平台注入的 Site 用户 ID 分区保存账本。调用者不能指定其他 owner，匿名 tools/call 返回401；OAuth token 不进入源码、提示词或客户端。乐观版本检查拒绝并发覆盖。

每轮先 check_dividend_cloud_monitor。核对新公告及仍相关的旧公告正文，使用 read_binance_dividend_notice；observed/processed hash 分开保存，读取中断不会丢失更正。record_dividend_cloud_event 保存核实后的公司股息、取消或特殊结算；改期必须复用原事件ID，不能留下旧事件继续提醒。登记日、支付日不能替代除息日。原文处理完再 acknowledge_dividend_notice_review。

提醒档为24h、6h、2h，只保留当前最紧迫阶段；最后一档通常提前1–2小时。新公告、实质变更、取消和补差另行提醒，采用北京时间，特殊费率不年化。不自动交易，无变化不发常规报告。

内容核实完成后，以 claim_dividend_cloud_alerts 领取5分钟发送租约，只交付成功领取的通知。最后一次工具调用使用租约 token 确认已准备交付的内容，随即交付；失败不确认。通知与数据库确认跨系统，不能宣称严格 exactly-once。租约防止重叠任务同时领取相同通知。

连续三轮关键来源失败，或临近六小时内无法核实时，生成一次故障提醒；恢复后撤销未交付的过期故障，已交付故障才产生恢复通知。成功水位和各源错误分别保留。最近100条公告和部分已核实日历不构成完整市场覆盖，覆盖缺口需补查。

发布后须通过实际云端工具写入并读回D1。创建计划后回读已启用状态和时区，再暂停本机rwa。计划保存不等于一次检查已成功执行，也不能据此宣称通知送达。
