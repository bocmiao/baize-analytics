let chartTimezone: string | undefined;

export function setChartTimezone(timezone?: string) {
  chartTimezone = timezone || undefined;
}

/** 把接口里的 ISO 时间戳按站点时区显示；非时间字符串原样返回。 */
export function formatChartTime(value: unknown): string {
  if (typeof value !== 'string') return String(value ?? '—');
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isFinite(+date)) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: chartTimezone,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(date);
}
