// لقطة جوال لمنتصف الصفحة (قسم الدليل). usage: node scripts/probes/probe-dashboard-m.mjs <shot.png> [selector-to-scroll-to]
import { chromium } from "playwright";
const [shot, sel = ".gsec"] = process.argv.slice(2);
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
await p.goto("http://127.0.0.1:4173/"); await p.waitForTimeout(3500);
await p.locator(sel).first().scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
console.log("horizontal overflow:", await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth));
await p.screenshot({ path: shot }); await b.close();
