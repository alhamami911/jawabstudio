// اختبار دخول المسؤول عبر الواجهة. usage: DASH_URL=<رابط اللوحة> node scripts/probes/probe-dashboard-login.mjs <user> <password> [shot.png]
import { chromium } from "playwright";
const [user, pw, shot] = process.argv.slice(2);
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1100, height: 900 } })).newPage();
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto(process.env.DASH_URL); await p.waitForTimeout(3000);
console.log("before:", await p.locator("#admbtn").innerText(), "| controls visible:", await p.locator("#pausebtn").isVisible());
await p.click("#admbtn"); await p.fill("#luser", user); await p.fill("#lpass", pw); await p.click("#lgo"); await p.waitForTimeout(3500);
console.log("after:", await p.locator("#admbtn").innerText(), "| controls visible:", await p.locator("#pausebtn").isVisible(), "| run buttons:", await p.locator("button.pri").count(), "| errors:", errs.length ? errs.join("|") : "none");
if (shot) await p.screenshot({ path: shot });
await b.close();
