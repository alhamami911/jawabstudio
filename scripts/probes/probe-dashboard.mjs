// يفتح لوحة الإنتاج المحلية في متصفح ويطبع أخطاء الصفحة وعناوين الأقسام ويحفظ لقطة. usage: node scripts/probes/probe-dashboard.mjs [lang] [shot.png]
import { chromium } from "playwright";
const [lang = "ar", shot] = process.argv.slice(2);
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: Number(process.env.VW || 1100), height: Number(process.env.VH || 900) }, isMobile: !!process.env.VW, hasTouch: !!process.env.VW })).newPage();
await p.addInitScript((l) => localStorage.setItem("lang", l), lang);
const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
await p.goto(process.env.DASH_URL || "http://127.0.0.1:4173/"); await p.waitForTimeout(3500);
console.log("errors:", errs.length ? errs.join(" | ") : "none");
console.log("cards/h2:", (await p.locator("#app h2").allInnerTexts()).join(" | "));
console.log("sections:", await p.locator("details.gsec").count(), "open:", await p.locator("details.gsec[open]").count(), "previewButtons:", await p.locator("[data-play]").count());
console.log("pill:", (await p.locator("#wpill").innerText()));
if (shot) await p.screenshot({ path: shot, fullPage: false });
await b.close();
