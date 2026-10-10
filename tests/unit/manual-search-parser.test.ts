import {describe,it,expect} from 'vitest';
import {csvRecords,parseManualSearch,manualSearchInput,safeCsvCell,MANUAL_CSV_BYTES,MANUAL_CSV_ROWS} from '../../src/server/manual-search-parser.js';
const mapping={day:'day',query:'query',page:'page',clicks:'clicks',impressions:'impressions',position:'position'};
const input=(csv:string)=>manualSearchInput.parse({csv,label:'User source',mapping,customTemplateAcknowledged:true});
const header='day,query,page,clicks,impressions,position\n';
describe('custom search CSV',()=>{
 it('reads BOM, quoted multiline/comma/doubled quotes and deterministic digest',()=>{const csv='\uFEFF'+header+'2026-01-01,"keyword, ""quoted""\nsecond",https://example.test/page?token=redact#fragment,2,10,4.5\r\n';const parsed=parseManualSearch(input(csv),'example.test');expect(parsed.rows).toEqual([{day:'2026-01-01',query:'keyword, "quoted"\nsecond',page:'https://example.test/page',clicks:2,impressions:10,position:4.5}]);expect(parsed.digest).toBe(parseManualSearch(input(csv),'example.test').digest)});
 it('rejects malformed CSV, dates, numbers and foreign/credential page URLs',()=>{for(const row of ['2026-02-30,q,https://example.test/,1,2,1','2026-01-01,q,https://foreign.test/,1,2,1','2026-01-01,q,https://user@example.test/,1,2,1','2026-01-01,q,https://example.test/,-1,2,1','2026-01-01,q,https://example.test/,3,2,1','2026-01-01,q,https://example.test/,1,2,NaN','2026-01-01,"q"junk,https://example.test/,1,2,1'])expect(()=>parseManualSearch(input(header+row),'example.test')).toThrow();expect(()=>csvRecords('a,b\n"unfinished,b')).toThrow();});
 it('enforces decoded byte and row caps',()=>{expect(()=>csvRecords('x'.repeat(MANUAL_CSV_BYTES+1))).toThrow();expect(()=>csvRecords('x\n'+'a\n'.repeat(MANUAL_CSV_ROWS+1))).toThrow();});
 it('neutralizes spreadsheet formula cells including leading spaces and escapes quotes',()=>{for(const cell of ['=SUM(1)',' +1','-cmd','@cmd','\t=cmd','\r=cmd','\n=cmd','\u00a0=cmd'])expect(safeCsvCell(cell)).toMatch(/^"'/);expect(safeCsvCell('normal"text')).toBe('"normal""text"');});
});
