import {sanitizeDailyDimensions,sanitizeDailyValue} from './daily-privacy-policy.js';
import {canonical} from './security.js';
const devices=new Set(['desktop','mobile','tablet','unknown']);
function record(value:unknown):value is Record<string,unknown>{return value!==null&&typeof value==='object'&&!Array.isArray(value);}
/** Validate original cache bodies without rewriting/resealing privacy-unsafe data.
 * Device is a categorical dimension only at these explicit Bucket schema paths.
 * Encoded segment dimension keys require inspection too: recursive sanitization
 * cannot see identifiers embedded inside a JSON object-key string. */
export function sanitizeDailyCacheBucket(value:unknown):unknown{
 const sanitized=sanitizeDailyValue(value);
 if(!record(value)||!record(sanitized))return sanitized;
 if(record(value.audience)&&record(value.audience.device)){
  const counts=value.audience.device;
  if(Object.entries(counts).every(([key,count])=>devices.has(key)&&typeof count==='number'&&Number.isSafeInteger(count)&&count>=0)){
   if(!record(sanitized.audience))sanitized.audience={};
   (sanitized.audience as Record<string,unknown>).device={...counts};
  }
 }
 if(record(value.segments)){
  for(const [key,segment]of Object.entries(value.segments)){
   let dimensions:unknown;
   try{dimensions=JSON.parse(key);}catch{throw Error('CACHE_MIGRATION_DAILY_UNSAFE_BODY');}
   if(!record(dimensions)||canonical(sanitizeDailyDimensions(dimensions))!==canonical(dimensions))throw Error('CACHE_MIGRATION_DAILY_UNSAFE_BODY');
   if(record(segment)&&record(segment.dimensions)&&record(sanitized.segments)){
    const cleanSegment=sanitized.segments[key];
    if(record(cleanSegment))cleanSegment.dimensions=sanitizeDailyDimensions(segment.dimensions);
   }
  }
 }
 return sanitized;
}
