/**
 * 构建版本自检。
 *
 * SPA 一旦打开就会一直用内存里的那份 JS：数据接口照常刷新，但界面代码是旧的。
 * 这正是"明明部署了、用户却说没变"的来源（部署站点后尤其明显）。
 *
 * 做法：定期（以及回到前台时）取一次 HTML 外壳，比对入口脚本的文件名；
 * 发现变化就在页面底部提示刷新，不强制打断用户操作。
 */
const current = (() => {
  const script = document.querySelector('script[type="module"]');
  const src = script?.getAttribute('src') || '';
  const match = src.match(/assets\/index-[\w-]+\.js/);
  return match ? match[0] : '';
})();

let notified = false;

function showNotice() {
  if (notified || document.getElementById('build-update-notice')) return;
  notified = true;
  const bar = document.createElement('div');
  bar.id = 'build-update-notice';
  bar.setAttribute('role', 'status');
  bar.className = 'build-update-notice';
  const text = document.createElement('span');
  text.textContent = document.documentElement.lang === 'en' ? 'A new version is available.' : '有新版本已发布。';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = document.documentElement.lang === 'en' ? 'Reload' : '刷新';
  button.addEventListener('click', () => location.reload());
  bar.append(text, button);
  document.body.appendChild(bar);
}

async function check() {
  if (!current) return;
  try {
    const response = await fetch('/app', {cache: 'no-store', headers: {Accept: 'text/html'}});
    if (!response.ok) return;
    const html = await response.text();
    const match = html.match(/assets\/index-[\w-]+\.js/);
    if (match && match[0] !== current) showNotice();
  } catch {
    // 网络失败就等下一次，不打扰用户
  }
}

setTimeout(check, 20000);
setInterval(check, 120000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void check();
});
