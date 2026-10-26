import {test,expect} from '@playwright/test';
import {navigateWorkspace,revealDateInputs,closeDateSheet} from './navigation';
// Controlled browser API responses exercise UI lifecycle, not backend export throughput.
test('clipboard absence, rejection, success and stale consent results provide honest feedback',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/app');await navigateWorkspace(page,'站点设置');
 const copy=page.getByRole('button',{name:'复制追踪代码',exact:true});
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined}));
 await copy.click();await expect(page.getByRole('alert').filter({hasText:'复制失败，请手动复制代码。'})).toBeVisible();
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new Error('denied'))}}));
 await copy.click();await expect(page.getByRole('alert').filter({hasText:'复制失败，请手动复制代码。'})).toBeVisible();
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.resolve()}}));
 await copy.click();await expect(page.getByRole('status').filter({hasText:'代码已复制。'})).toBeVisible();
 await page.getByLabel('包含同意横幅').check();await expect(page.getByRole('status').filter({hasText:'代码已复制。'})).toHaveCount(0);
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>new Promise<void>(resolve=>{(window as unknown as {finishCopy:()=>void}).finishCopy=resolve;})}}));
 await page.getByRole('button',{name:'复制追踪代码',exact:true}).click();await page.getByLabel('包含同意横幅').uncheck();
 await page.evaluate(()=>(window as unknown as {finishCopy:()=>void}).finishCopy());
 await expect(page.getByRole('status').filter({hasText:'代码已复制。'})).toHaveCount(0);expect(errors).toEqual([]);
});
test('exports poll until complete, stop on failed and allow retry after HTTP error',async({page})=>{
 let reads=0,mode:'progress'|'failed'|'error'|'complete'='progress';
 await page.route('**/api/v1/sites/*/exports?**',route=>{reads++;if(mode==='error')return route.fulfill({status:503,json:{error:'fixture unavailable'}});const status=mode==='progress'?(reads===1?'pending':reads===2?'running':'complete'):mode;return route.fulfill({json:[{id:'fixture-export',status,format:'csv'}]});});
 await page.goto('/app');await navigateWorkspace(page,'数据导出');
 const download=page.getByRole('link',{name:'下载fixture-export'});await expect(download).toBeVisible({timeout:12000});const doneReads=reads;
 await page.waitForTimeout(2300);expect(reads).toBe(doneReads);
 mode='failed';await (await revealDateInputs(page), page).getByRole('button',{name:'刷新',exact:true}).click();await closeDateSheet(page);await expect(page.getByText('failed',{exact:true})).toBeVisible();const failedReads=reads;await page.waitForTimeout(2300);expect(reads).toBe(failedReads);
 mode='error';await (await revealDateInputs(page), page).getByRole('button',{name:'刷新',exact:true}).click();await closeDateSheet(page);await expect(page.getByRole('button',{name:'重试当前视图'})).toBeVisible();const errorReads=reads;await page.waitForTimeout(2300);expect(reads).toBe(errorReads);
 mode='complete';await page.getByRole('button',{name:'重试当前视图'}).click();await expect(download).toBeVisible();
});
