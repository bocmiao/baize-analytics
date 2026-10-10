# 六路集成回交索引

仅汇总现有已合入产物和证据，不新增代码审计或产品范围。remote e441已核、正常push blocked；最新local检查点以 `/workspace/baize-checkpoints/CHECKPOINT_MANIFEST.json` 为准，不追逐文档提交SHA。87e六commit/bundle0与489七commit/bundle0各为已验证历史记录；checkpoint不带runtime keys。

| 路线 | 已合入产物/入口 | 已有证据与剩余边界 |
|---|---|---|
| A分析与容量 | 事实精确查询、阶段观测、负载runner；CAPACITY_EXPLORATION.md | 最后完整应用645/浏览器30及镜像按各SHA记录；低速1000PG/strict实际通过，100批5秒5000探索已结束overallEXIT1：PGPASS、strictFAIL |
| B外部连接器与预算 | SEO/GSC契约、服务端SELECT失败关闭；中英API | 本地实际传输/PG与模拟provider分清；真实Google/SERP/SMTP/企业WeCom/MaxMind/模型质量未测 |
| C采集隐私与存储 | 完整EOF、三批读取、idlefatal、删除fences、正文物理删除/restore | 定向及完整冻结证据按source记录；预算不保证scan/heap/SLO，旧full及5000FAIL保留 |
| D产品UI | 任务导航、白名单URL/筛选、报表成员、日期标记与键盘/画布 | ce42真实30浏览器通过；更多真实设备/读屏/复杂站点兼容仍未全测 |
| E治理与文档 | 接入/Bot/诊断/备注API与卡片；API/迁移CNEN、当前表与本索引 | 真实接收不认证安装、Bot请求不等于PV、诊断未验证不假成功、manual note不作AI因果；旧失败保存 |
| F安装恢复与交接 | 55DDL镜像、signed独立目标、latestjournal、source manifest及checkpoint | d67镜像EXIT0；661ENOSPC与低盘观察保留。Windows执行器错误、Ollama下载网络阻断不是缺账号 |

原固定5000高到达率基准FAIL不被降速探索替代。性能剩余为持续负载/大站/资源隔离与P0 lag<5min、PG日均百万对应验证；目前不能宣称全部性能收工。新5000探索同87e、100批每5秒、30秒查询、默认预算/队列/drain，模式前6GiB及3原服务资源闸；实际结束：PG5000PASS2.324900314秒，strict全accepted但排空deadline/finalassert未执行FAIL，不写完整性或loss结论。1000原证据已489e116保存。托管不触发，不新建凭据、不外网部署。

当前性能结论见CAPACITY_EXPLORATION：1000双PASS不外推strict长5000；后者finalassertwindow非HTTP计时。资源/清理与source1300blob已证明，停止重型追绿，性能欠项与功能645/30/image0分开。
