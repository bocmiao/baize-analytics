import {it,expect} from 'vitest';
import {publicLinkText} from '../../packages/tracker/src/link-text.js';
it('minimizes visible public text to 50 Unicode codepoints after whitespace and obvious identity redaction',()=>{
 expect(publicLinkText('  了解\n  白泽   统计 ')).toBe('了解 白泽 统计');
 const long='公开链接😀'.repeat(15);expect(Array.from(publicLinkText(long))).toHaveLength(50);expect(publicLinkText(long)).toBe(Array.from(long).slice(0,50).join(''));
 expect(publicLinkText('Contact person@example.test +86 138 1234 5678 or 192.168.1.12')).toBe('Contact [redacted] [redacted] or [redacted]');
 expect(publicLinkText('IPv6 2001:db8:abcd::1')).toBe('IPv6 [redacted]');
});
