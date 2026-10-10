import {z} from 'zod';
export const reportFilterKeys=['path','channel','utm_source','utm_medium','utm_campaign','utm_term','utm_content'] as const;
export const reportFilterSchema=z.object({path:z.string().max(1024).optional(),channel:z.string().max(100).optional(),utm_source:z.string().max(500).optional(),utm_medium:z.string().max(500).optional(),utm_campaign:z.string().max(500).optional(),utm_term:z.string().max(500).optional(),utm_content:z.string().max(500).optional()}).strict();
export const reportDefinitionSchema=reportFilterSchema.extend({from:z.iso.datetime(),to:z.iso.datetime()}).strict().refine(value=>Date.parse(value.from)<=Date.parse(value.to),'Ordered report range required');
export type ReportFilters=z.infer<typeof reportFilterSchema>;
export type ReportDefinition=z.infer<typeof reportDefinitionSchema>;
/** Omitted and empty filters retain historical unrestricted semantics. */
export function reportFilters(definition:ReportDefinition):ReportFilters{return Object.fromEntries(reportFilterKeys.flatMap(key=>definition[key]?[ [key,definition[key]] ]:[])) as ReportFilters;}
