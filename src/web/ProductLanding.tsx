import {language} from './i18n';
import {CommunityContact} from './CommunityContact';

export function ProductLanding(){
 const en=language()==='en';
 return <div className="product-entry">
  <header><a className="brand" href="/"><img src="/brand/baize-head-96.png" width="36" height="36" alt=""/><span>{en?'Baize Analytics':'白泽统计'}</span></a><a className="button" href="/app">{en?'Open workspace':'进入工作台'}</a></header>
  <main>
   <section className="product-intro"><h1>{en?'Understand every visit.':'看清每一次访问。'}</h1><p>{en?'Understand your audience, find your best content and measure what converts.':'了解访客从哪里来、在看什么，以及哪些访问带来了转化。'}</p><a className="button" href="/app">{en?'View analytics':'查看统计'}</a></section>
   <section className="product-capabilities" aria-label={en?'Features':'产品功能'}>{(en?[['Traffic & sources','Track trends, channels and campaigns.'],['Audience & content','Explore regions, devices and popular pages.'],['Events & conversions','Follow goals, funnels and visitor journeys.']]:[['流量与来源','查看流量趋势，比较渠道与推广效果。'],['访客与内容','了解地域、设备和热门页面。'],['事件与转化','跟踪关键操作、转化目标和访问路径。']]).map(([title,copy])=><article key={title}><h2>{title}</h2><p>{copy}</p></article>)}</section>
  </main>
  <footer><span>{en?'Baize Analytics':'白泽统计'}</span><CommunityContact placement="footer"/><a href="/setup">{en?'Set up an instance':'初始化实例'}</a></footer>
 </div>;
}
