import {expect,type Page} from '@playwright/test';
/** Uses actual link semantics and opens only the containing task group. */
export async function openWorkspaceNavigation(page:Page){const nav=page.locator('#workspace-navigation');await expect(nav).toBeAttached({timeout:15000});const mobile=await page.evaluate(()=>matchMedia('(max-width:767px)').matches);if(mobile&&!await nav.isVisible()){const menu=page.getByRole('button',{name:/^(Menu|菜单)$/});await expect(menu).toBeVisible({timeout:15000});await menu.click();}await expect(nav).toBeVisible({timeout:15000});return nav;}
export async function navigateWorkspace(page:Page,name:string){const nav=await openWorkspaceNavigation(page);const target=nav.locator('nav.v3-tabs').getByRole('link',{name,exact:true});if(!await target.isVisible()){const group=nav.locator('.navigation-group').filter({has:page.getByRole('link',{name,exact:true,includeHidden:true})});await group.getByRole('button').click();}await expect(target).toBeVisible();await target.click();}
export async function selectWorkspaceSite(page:Page,id:string){const nav=page.locator('#workspace-navigation');if(await nav.getAttribute('aria-modal')==='true')await page.keyboard.press('Escape');const selector=page.getByLabel(/^(Select site|选择站点)$/);await selector.selectOption(id);await expect(selector).toHaveValue(id);}

/** Opens the real account disclosure through visible navigation controls. */
export async function openWorkspaceAccount(page:Page){const nav=await openWorkspaceNavigation(page);const details=nav.locator('details.nav-account');await expect(details).toBeVisible();if(!await details.evaluate(element=>(element as HTMLDetailsElement).open))await details.locator(':scope > summary').click();await expect(details).toHaveAttribute('open','');return details;}

/** Opens the date layer, then returns the page so date fields and refresh can be used. */
export async function revealDateInputs(page:Page){
 const field=page.getByLabel(/^(开始|结束|From|To)$/).first();
 if(await field.isVisible().catch(()=>false))return page;
 const trigger=page.locator('.date-range-trigger');
 await expect(trigger).toBeVisible();
 if((await trigger.getAttribute('aria-expanded'))!=='true')await trigger.click();
 await expect(field).toBeVisible();
 return page;
}

/** Closes the date popover or phone sheet after a fill or refresh so the next control can be reached. */
export async function closeDateSheet(page:Page){
 const sheet=page.locator('#date-range-sheet');
 if(!(await sheet.isVisible().catch(()=>false)))return;
 await page.locator('.date-sheet-close').click();
 await expect(sheet).toBeHidden();
}

export async function closeWorkspaceAccount(page:Page){
 const account=page.locator('details.nav-account');
 if(!(await account.evaluate(element=>(element as HTMLDetailsElement).open).catch(()=>false)))return;
 await account.locator(':scope > summary').click();
 await expect(account).not.toHaveAttribute('open','');
}

export async function openWorkspacePreferences(page:Page){const account=await openWorkspaceAccount(page);const details=account.locator('details.toolbar-preferences');await expect(details).toBeVisible();if(!await details.evaluate(element=>(element as HTMLDetailsElement).open))await details.locator(':scope > summary').click();return details;}
export async function openOverviewInterpretation(page:Page){
 const details=page.locator('.query-health > details');
 await expect(details).toBeAttached();
 const insideAccount=await details.evaluate(element=>Boolean(element.closest('details.nav-account')));
 if(!await details.isVisible()||insideAccount)await openWorkspacePreferences(page);
 else await closeWorkspaceAccount(page);
 await expect(details).toBeVisible();
 if(!await details.evaluate(element=>(element as HTMLDetailsElement).open))await details.locator(':scope > summary').click();
 return details;
}
