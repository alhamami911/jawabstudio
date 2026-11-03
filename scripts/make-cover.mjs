// يركّب اسم السلسلة (العربي، من series/<id>/series.json) على الغلاف الأساسي assets/covers/_base.png
// ويكتب assets/covers/<id>.png بحجم 1920x1080. الخط Dubai (يشكّل العربية صحيحًا عبر المتصفح).
// usage: node scripts/make-cover.mjs <series-id> [--title "نص بديل"]
import { chromium } from "playwright";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const id = process.argv[2];
if (!id) { console.error("usage: node scripts/make-cover.mjs <series-id> [--title ...]"); process.exit(1); }
const basePath = resolve("assets/covers/_base.png");
if (!existsSync(basePath)) { console.error("missing assets/covers/_base.png"); process.exit(1); }
const ti = process.argv.indexOf("--title");
const title = ti > 0 ? process.argv[ti + 1] : JSON.parse(readFileSync(`series/${id}/series.json`, "utf8")).title.ar;
const bg = `data:image/png;base64,${readFileSync(basePath).toString("base64")}`;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
// JAWAB لاتينية تبقى كما هي داخل النص العربي
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:1280px;height:720px;overflow:hidden}
body{background:url(${bg}) center/cover;font-family:'Dubai','Segoe UI',Tahoma,sans-serif}
.box{position:absolute;left:70px;top:230px;width:560px;direction:rtl;text-align:right}
.kicker{display:inline-block;color:#fff;background:#10b981;border-radius:999px;padding:6px 22px;font-size:25px;font-weight:700}
.bar{width:90px;height:7px;background:#10b981;border-radius:4px;margin:20px 0 18px auto}
.t{color:#1e3a8a;font-size:68px;font-weight:800;line-height:1.35;text-wrap:balance}
</style></head><body><div class="box"><span class="kicker">سلسلة شرح تعليمي</span><div class="bar"></div><div class="t">${esc(title)}</div></div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
const out = resolve(`assets/covers/${id}.png`);
await page.screenshot({ path: out });
await browser.close();
console.log(`cover → ${out}  («${title}»)`);
