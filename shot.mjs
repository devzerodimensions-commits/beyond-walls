import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 1100 } });
await p.goto('http://localhost:5173/?x=' + Date.now(), { waitUntil: 'networkidle' });
await p.waitForTimeout(2000);
const box = await p.evaluate(() => {
  const s = [...document.querySelectorAll('main section')].find(x => /where is it going/i.test(x.textContent||''));
  if (!s) return null;
  s.scrollIntoView();
  return true;
});
await p.waitForTimeout(800);
const r = await p.evaluate(() => {
  const s = [...document.querySelectorAll('main section')].find(x => /where is it going/i.test(x.textContent||''));
  const b = s.getBoundingClientRect();
  return { x: Math.max(0, b.x), y: Math.max(0, b.y), width: Math.min(1440, b.width), height: Math.min(1100, b.height) };
});
await p.screenshot({ path: '.shots/finder-noimages.png', clip: r });
console.log('captured', JSON.stringify(r));
await b.close();
