// قراءة فقط: يفتح مسارًا في قاعدة الاستديو ويطبع نصوص عناصر محددة ويحفظ لقطة. usage: node scripts/probes/probe-page.mjs <path> <css> [shot.png]
import { chromium } from "playwright";
process.loadEnvFile();
const base = process.env.JAWAB_BASE_URL;
if (new URL(base).hostname !== "premium.jawab.pro") process.exit(1);
const [path, css, shot] = process.argv.slice(2);
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await p.goto(base + "/web/login"); await p.fill("input[name=login]", process.env.JAWAB_USER); await p.fill("input[name=password]", process.env.JAWAB_PASSWORD);
await p.click(".oe_login_form button[type=submit]"); await p.waitForSelector(".o_app, .o_home_menu", { timeout: 60000 });
await p.goto(base + path); await p.waitForTimeout(6000);
console.log((await p.locator(css).allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 60).join("\n"));
if (shot) await p.screenshot({ path: shot });
await b.close();
