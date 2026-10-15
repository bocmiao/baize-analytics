import {ownValue} from './dictionary';
import {API_ERRORS,type ApiErrorCode} from '../shared/error-codes';
import {EXTERNAL_ERRORS,type ExternalErrorCode} from '../server/external-errors';
import { language } from './i18n';
const englishErrors: Record<string, string> = {
    connector_missing: 'Configure the connector first.',
    connector_secret_required: 'The first configuration requires a secret. Omit it when updating to retain the existing secret.',
    external_config_invalid: 'Invalid connector configuration. Check the endpoint, property and credential fields.',
    external_permission_required: 'This action requires the relevant administrator permission.',
    outbound_url_unsafe: 'The external URL must use HTTPS and contain no embedded credentials.',
    outbound_destination_blocked: 'The destination or redirect was blocked by the network security policy.',
    external_timeout: 'The external request timed out. Try again later.',
    external_response_too_large: 'The external response exceeded the safe size limit.',
    external_provider_failed: 'The external service failed. Check the connector and network; local analytics remain available.',
    external_response_invalid: 'The external response had an invalid format and was not used to update data.',
    oauth_state_invalid: 'The authorization state is invalid or expired. Start authorization again.',
    google_authorization_required: 'Complete Google offline authorization first.',
    external_config_changed: 'The connector changed during this operation. Try again.',
    aggregate_range_invalid: 'Invalid aggregate period or filters. The maximum is 31 days within the authorized scope.',
    aggregation_pending: 'Aggregation is pending. Try again later.',
    ai_opt_in_required: 'AI is disabled. No data will be sent to the model.',
    ai_budget_exceeded: 'The AI monthly budget is insufficient.',
    ai_context_too_large: 'The model context exceeds the safe budget boundary. Reduce the query period.',
    evidence_missing: 'No available evidence or site was found.',
    suggestion_transition_invalid: 'Invalid suggestion transition. Complete the implementation record and recheck first.',
    sso_not_configured: 'WeCom SSO is not configured, or its callback does not meet the HTTPS requirement.',
    sso_identity_denied: 'This enterprise identity is invalid or has no administrator mapping. No account will be created automatically.',
    geoip_not_configured: 'GeoIP is disabled or lacks credentials.',
    geoip_refresh_failed: 'GeoIP download or verification failed. Geography remains unknown. Check the account, license and network; TLS and SHA256 checks remain enabled.',
};
export function localizedErrorCode(code:unknown,status=500):string {
    const key=typeof code==='string'?code:'';
    if(key==='invalid_api_response')return language()==='en'?'The server returned an invalid response. Reload the page or retry the request.':'服务器返回的数据格式不正确，请重新加载或重试请求。';
    if(key==='replay_sequence_conflict')return language()==='en'?'This replay sequence already contains different masked content. The conflicting event was rejected.':'此回放序号已存在不同的脱敏内容，冲突事件已拒绝。';
    if(Object.hasOwn(API_ERRORS,key)) {const value=API_ERRORS[key as ApiErrorCode];return language()==='en'?value.en:value.zh;}
    if(Object.hasOwn(EXTERNAL_ERRORS,key)) return language()==='en'?ownValue(englishErrors,key)||API_ERRORS.internal_error.en:EXTERNAL_ERRORS[key as ExternalErrorCode].message;
    const fallback=status>=500?API_ERRORS.internal_error:API_ERRORS.client_request_failed;
    return language()==='en'?fallback.en:fallback.zh;
}
export function apiErrorMessage(result: {code?:unknown;error?:unknown;message?:unknown}, status:number): string {
    return `HTTP ${status}: ${localizedErrorCode(typeof result.code==='string'?result.code:result.error,status)}`;
}
