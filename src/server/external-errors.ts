// Only these fixed messages may cross the API boundary. Never use provider text as a public message.
export const EXTERNAL_ERRORS = {
  connector_missing: { statusCode: 409, message: '请先配置连接器' },
  connector_secret_required: { statusCode: 400, message: '首次配置需要密钥；更新时省略 secret 可保留现有密钥' },
  external_config_invalid: { statusCode: 400, message: '外部连接器配置无效，请检查地址、属性与凭证字段' },
  external_permission_required: { statusCode: 403, message: '此操作需要相应管理员权限' },
  outbound_url_unsafe: { statusCode: 400, message: '外部请求地址不安全，必须使用无内嵌凭证的 HTTPS 地址' },
  outbound_destination_blocked: { statusCode: 403, message: '外部请求目标或重定向被安全策略阻止' },
  external_timeout: { statusCode: 504, message: '外部服务请求超时，请稍后重试' },
  external_response_too_large: { statusCode: 502, message: '外部服务响应超过安全大小限制' },
  external_provider_failed: { statusCode: 502, message: '外部服务调用失败，请检查连接器与网络；站内看板仍可正常使用' },
  external_response_invalid: { statusCode: 502, message: '外部服务响应格式无效，未使用该响应更新数据' },
  oauth_state_invalid: { statusCode: 400, message: '授权状态无效或已过期，请重新发起授权' },
  google_authorization_required: { statusCode: 409, message: '请先完成 Google 离线授权' },
  external_config_changed: { statusCode: 409, message: '连接器配置在操作期间变更，请重新操作' },
  aggregate_range_invalid: { statusCode: 400, message: '聚合查询时间或过滤范围无效，允许最多 31 天且不得超出授权范围' },
  aggregation_pending: { statusCode: 409, message: '聚合尚未完成，请稍后重试' },
  ai_opt_in_required: { statusCode: 409, message: 'AI 未启用；不会向模型发送数据' },
  ai_budget_exceeded: { statusCode: 429, message: 'AI 月度预算不足' },
  ai_context_too_large: { statusCode: 413, message: '模型上下文超过预算安全边界，请缩小查询范围' },
  evidence_missing: { statusCode: 404, message: '未找到可用证据或站点' },
  suggestion_transition_invalid: { statusCode: 409, message: '建议状态变更无效，请先完成实施记录与复检' },
  sso_not_configured: { statusCode: 409, message: '企业微信 SSO 未配置或当前回调不满足 HTTPS 要求' },
  sso_identity_denied: { statusCode: 403, message: '企业成员身份无效或尚未被管理员授权映射；不会自动创建账号' },
  geoip_not_configured: { statusCode: 409, message: 'GeoIP 未启用或缺少凭证' },
  geoip_refresh_failed: { statusCode: 502, message: 'GeoIP 下载或校验失败，地域可降级 unknown；请检查账户、许可与网络，TLS/SHA256 校验保持启用' },
} as const;
export type ExternalErrorCode = keyof typeof EXTERNAL_ERRORS;
export class ExternalError extends Error {
  readonly code: ExternalErrorCode;
  readonly statusCode: number;
  constructor(code: ExternalErrorCode) {
    super(EXTERNAL_ERRORS[code].message);
    this.name = 'ExternalError';
    this.code = code;
    this.statusCode = EXTERNAL_ERRORS[code].statusCode;
  }
}
