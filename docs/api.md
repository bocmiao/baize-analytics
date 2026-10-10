# API 与事件接口

以 packages/contracts 的运行时协议 schema 与 server 路由为准。设计背景见 PROJECT_SPEC.md 第二部分，实施修正见 IMPLEMENTATION_NOTES.md。

`GET /healthz`：进程与存储健康。`POST /api/collect`：协议 v1 envelope，202 表示脱敏事件已持久化，重试保留 event_id，同 ID 不同内容为冲突；accepted 不重复累加。浏览器只持公开站点 ID，不放写入密钥。页面实例 ID 关联 SPA、多标签与心跳。

管理接口以登录会话或受 scope/站点限制的 API token 验证，每个站点请求检查授权。分享接口不授予管理权限。API 用法与已实现路径应以真实端点测试为准，不能把设计规格里的未来接口当作已实现。
