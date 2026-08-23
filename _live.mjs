import { chromium } from '@playwright/test';
const B = 'https://kinetiqui.vercel.app';
const slugs = process.argv.slice(2);
const b = await chromium.launch(); const ctx = await b.newContext();
let bad = 0;
for (const slug of slugs) {
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 70)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 70)); });
  const r = await p.goto(`${B}/preview/blocks/${slug}`);
  await p.waitForSelector('body[data-hydrated]', { timeout: 60000 });
  await p.waitForTimeout(900);
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const ok = r.status() === 200 && overflow <= 0 && !errs.length;
  if (!ok) bad++;
  console.log(`${slug.padEnd(24)} http=${r.status()} overflow=${overflow} errors=${errs.length ? errs.join('|') : 'none'}  ${ok ? 'PASS' : 'FAIL'}`);
  await p.close();
}
await b.close();
process.exit(bad ? 1 : 0);
