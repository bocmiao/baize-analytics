import {readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {join, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

/**
 * 找出"tsx 里用了、编译后的 CSS 里却没有"的类名。
 *
 * 背景：这个仓库的样式集中写在 style.css / design-v2.css，组件里新增的类如果
 * 忘了补规则，页面不会报错，只是变成裸文本——这类问题只能在界面上看出来。
 * 先跑 `npm run build`，再跑本脚本，会输出缺失清单。
 *
 * 退出码始终为 0：这是审计工具，不是构建门槛。
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webDir = join(root, 'src/web');
const cssDir = join(root, 'dist/web/assets');
const reportPath = join(root, 'css-class-gaps.txt');

const files = readdirSync(webDir).filter(name => name.endsWith('.tsx') || name.endsWith('.ts'));
const used = new Map();
const prefixes = new Set();

const record = (token, file) => {
  if (!/^[A-Za-z][\w-]*$/.test(token) || token.length < 2) return;
  if (!used.has(token)) used.set(token, new Set());
  used.get(token).add(file);
};

for (const file of files) {
  const text = readFileSync(join(webDir, file), 'utf8');
  const re = /className\s*=\s*(\{[\s\S]{0,400}?\}|"[^"]*"|'[^']*')/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    let expr = match[1].replace(/\$\{[^{}]*\}/g, '§');
    const quoted = expr.match(/'[^']*'|"[^"]*"/g) || [];
    const bare = expr.startsWith('`') ? expr.replace(/[`{}]/g, ' ').split('§').join(' ') : '';
    for (const chunk of [...quoted.map(item => item.slice(1, -1)), bare]) {
      for (const token of chunk.split(/\s+/)) {
        const clean = token.replace(/[^\w-]/g, '');
        if (!clean) continue;
        if (clean.endsWith('-') || clean.includes('§')) prefixes.add(clean.replace(/§/g, '').replace(/-$/, ''));
        record(clean, file);
      }
    }
    for (const tpl of match[1].match(/`([^`]*)`/g) || []) {
      for (const part of tpl.split(/\$\{[^}]*\}/)) {
        const clean = part.replace(/[`\s]/g, '');
        if (clean && clean.endsWith('-')) prefixes.add(clean);
      }
    }
  }
}

const defined = new Set();
for (const file of readdirSync(cssDir).filter(name => name.endsWith('.css'))) {
  for (const match of readFileSync(join(cssDir, file), 'utf8').matchAll(/\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g)) defined.add(match[1]);
}

const missing = [];
for (const [token, filesSet] of used) {
  if (defined.has(token)) continue;
  let covered = false;
  for (const prefix of prefixes) {
    if (!prefix || !token.startsWith(prefix)) continue;
    for (const candidate of defined) if (candidate.startsWith(prefix)) { covered = true; break; }
    if (covered) break;
  }
  if (covered) continue;
  missing.push({token, files: [...filesSet]});
}
missing.sort((a, b) => b.files.length - a.files.length || a.token.localeCompare(b.token));

writeFileSync(reportPath, missing.map(item => `${item.token}\t${item.files.join(',')}`).join('\n') + '\n', 'utf8');
console.log(JSON.stringify({used: used.size, defined: defined.size, missing: missing.length, report: reportPath}, null, 2));
for (const item of missing.slice(0, 30)) console.log(`${item.token.padEnd(34)} ${item.files.slice(0, 3).join(',')}`);
