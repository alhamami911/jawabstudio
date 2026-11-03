// قراءة فقط: يفتح مسارًا في قاعدة الاستديو ويطبع عدد العناصر ومقاساتها لكل محدد. usage: node scripts/probes/probe-sel.mjs <path> <selector> [<selector> ...]
import { chromium } from "playwright";
process.loadEnvFile();
const base = process.env.JAWAB_BASE_URL;
if (new URL(base).hostname !== "premium.jawab.pro") process.exit(1);
const [path, ...sels] = process.argv.slice(2);
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: process.env.VERT ? { width: 900, height: 1600 } : { width: 1280, height: 720 } })).newPage();
await p.goto(base + "/web/login"); await p.fill("input[name=login]", process.env.JAWAB_USER); await p.fill("input[name=password]", process.env.JAWAB_PASSWORD);
await p.click(".oe_login_form button[type=submit]"); await p.waitForSelector(".o_app, .o_home_menu", { timeout: 60000 });
await p.goto(base + path); await p.waitForTimeout(6000);
for (const s of sels) {
  const l = p.locator(s); const n = await l.count();
  const bb = n ? await l.first().boundingBox().catch(() => null) : null;
  console.log(n, s, bb ? `${Math.round(bb.width)}x${Math.round(bb.height)}` : "");
}
await b.close();
