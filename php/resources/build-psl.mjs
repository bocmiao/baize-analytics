// Build-time helper only; the PHP server never invokes Node or fetches the PSL.
import {readFileSync,writeFileSync} from 'node:fs';
import {domainToASCII} from 'node:url';
const source=new URL('./public_suffix_list.dat',import.meta.url);
const lines=readFileSync(source,'utf8').split(/\r?\n/).flatMap(line=>{
  const rule=line.trim();if(!rule||rule.startsWith('//'))return [];
  const prefix=rule.startsWith('!')?'!':rule.startsWith('*.')?'*.':'';
  const ascii=domainToASCII(rule.slice(prefix.length));if(!ascii)throw new Error('Invalid PSL rule');
  return [prefix+ascii.toLowerCase()];
});
writeFileSync(new URL('./public_suffix_list.ascii.dat',import.meta.url),lines.join('\n')+'\n');
