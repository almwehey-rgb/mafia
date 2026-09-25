// Run with PLAYWRIGHT_MODULE pointing to an installed playwright/index.mjs.
// All requests are served from dist or blocked; no live game is contacted.
import assert from 'node:assert/strict';
import {readFile, mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
const page=await browser.newPage();
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!=='https://mafia.test')return route.abort();
  const file=url.pathname==='/'?'/game.html':url.pathname;
  try{
    const body=await readFile(new URL('../dist'+file,import.meta.url));
    const ext=file.split('.').pop();
    await route.fulfill({body,contentType:({html:'text/html',js:'text/javascript',css:'text/css',png:'image/png',webp:'image/webp'})[ext]||'application/octet-stream'});
  }catch{await route.fulfill({status:404,body:''});}
});
try{
  await page.goto('https://mafia.test/');
  await page.evaluate(()=>{
    game={code:'TEST',matchId:'one',phase:'reveal',round:1,players:[{id:'me',name:'لاعب',alive:true}],enabledRoles:{},me:{id:'me',name:'لاعب',role:'doctor',alive:true,acknowledged:false}};
    playerId='me';renderPlayer();
  });
  for(const size of [{width:390,height:844},{width:844,height:390},{width:1280,height:900}]){
    await page.setViewportSize(size);
    for(const role of await page.evaluate(()=>Object.keys(roleNames))){
      await page.evaluate(role=>{game.me.role=role;renderPlayer();},role);
      const image=page.locator('.personal-role-card img');
      await image.evaluate(img=>img.decode());
      assert.ok(await image.evaluate(img=>img.naturalWidth>0));
      await page.locator('.personal-role-card').click();
      await page.waitForFunction(()=>personalCardState.open);
      assert.ok(await page.locator('.personal-card-properties').isVisible());
      await page.evaluate(()=>renderPlayer());
      assert.ok(await page.locator('.personal-card-properties').isVisible(),'Polling preserves open properties');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
    }
  }
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{game.me.role='doctor';renderPlayer();});
  for(const size of [{width:320,height:568},{width:390,height:844}]){
    await page.setViewportSize(size);
    await page.evaluate(()=>{game.me.role='citizen';game.me.acknowledged=false;game.phase='reveal';renderPlayer();});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight&&document.documentElement.scrollWidth<=innerWidth),'Private role page fits the phone viewport');
    assert.ok(await page.locator('.role-acknowledge button').evaluate(button=>button.getBoundingClientRect().bottom<=innerHeight),'Role confirmation stays visible');
    await page.locator('.personal-role-card').click();
    await page.locator('.personal-role-card .role-rule-item summary').first().click();
    assert.equal(await page.locator('.personal-role-card').getAttribute('data-view'),'details','Opening a rule does not flip the card back');
  }
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{game.me.role='doctor';renderPlayer();});
  await mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});
  await page.screenshot({path:new URL('../artifacts/role-card-mobile.png',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true});
  await page.evaluate(()=>{game.me.acknowledged=true;game.me.doctorAvailable=true;game.phase='night';game.round=2;renderPlayer();});
  assert.equal(await page.locator('.personal-role-card.compact').count(),1);
  assert.ok(await page.getByText('من ستحمي الليلة؟').isVisible());
  await page.locator('.role-reference > summary').click();
  await page.locator('.personal-role-card').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>personalCardState.open);
  await page.screenshot({path:new URL('../artifacts/role-card-night.png',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true});
  await page.evaluate(()=>{game.me.role='mafia_boss';renderPlayer();});
  assert.equal(await page.locator('.personal-role-card img').getAttribute('src'),'/assets/role-cards-v3/mafia_boss.webp');
  await page.locator('.personal-role-card img').evaluate(img=>img.decode());
  assert.equal(await page.locator('.personal-role-card').getAttribute('aria-pressed'),'false');
  await page.evaluate(()=>{game.phase='lobby';renderPlayer();});
  assert.equal(await page.locator('.personal-role-card').count(),0);
  await page.evaluate(()=>{game.phase='reveal';game.me.role='doctor';game.me.acknowledged=false;renderPlayer();});
  await page.locator('.personal-role-card').click();
  await page.waitForTimeout(700);
  assert.equal(await page.locator('.personal-role-card .role-rule-item').count(),4);
  await page.screenshot({path:'artifacts/detailed-doctor.png',fullPage:true});
  await page.evaluate(()=>document.body.classList.add('light'));
  await page.screenshot({path:'artifacts/detailed-doctor-light.png',fullPage:true});
  await page.evaluate(()=>document.body.classList.remove('light'));
  await page.evaluate(()=>showGuide());
  assert.equal(await page.locator('.role-gallery .role-reader').count(),14);
  for (const card of await page.locator('.role-gallery .role-reader').all()) {
    await card.click();
    assert.equal(await card.getAttribute('aria-pressed'),'true');
    await card.press('Enter');
    assert.equal(await card.getAttribute('aria-pressed'),'false');
  }
  await page.evaluate(()=>renderHostHome());
  assert.equal(await page.locator('.cinema-character').count(),3);
  for (const card of await page.locator('.cinema-character').all()) {
    await card.click();
    assert.equal(await page.locator('[role="dialog"] .role-reader').getAttribute('aria-pressed'),'true');
    await page.locator('[role="dialog"] .role-reader').press('Enter');
    assert.equal(await page.locator('[role="dialog"] .role-reader').getAttribute('aria-pressed'),'false');
    await page.keyboard.press('Escape');
  }
  await page.waitForTimeout(750);
  await page.screenshot({path:'artifacts/flipped-home-mobile.png',fullPage:true});
  await page.evaluate(()=>document.body.classList.add('light'));
  await page.screenshot({path:'artifacts/flipped-home-light.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS: 14 cards, 3 viewport sizes, image loading, details, polling, keyboard, night actions, role changes and lobby privacy.');
}finally{await browser.close();}
