import {useState} from 'react';
import {t} from './i18n';
import {toggleTheme} from './theme';

export function ThemeToggle(){
 const [dark,setDark]=useState(()=>document.documentElement.dataset.theme==='dark');
 const label=dark?t('切换浅色主题'):t('切换深色主题');
 return <button type="button" className="secondary theme-toggle" aria-pressed={dark} aria-label={label} title={label} onClick={()=>setDark(toggleTheme()==='dark')}>
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d={dark?'M8 2.2 9.1 6 13 7.1 9.1 8.2 8 12 6.9 8.2 3 7.1 6.9 6Z':'M8 1.5a6.5 6.5 0 1 0 6.2 8.4 5 5 0 0 1-6.1-6.1A6.5 6.5 0 0 0 8 1.5Z'}/></svg>
 </button>;
}
