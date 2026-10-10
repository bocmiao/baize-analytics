/** Experimental policy only. No production bridge invokes this helper. */
export function shouldAnalyzeTempRows(rows:number,threshold:number):boolean{
 if(!Number.isSafeInteger(rows)||rows<0||!Number.isSafeInteger(threshold)||threshold<1)throw Error('TEMP_ANALYZE_POLICY_INVALID');
 return rows>=threshold;
}
