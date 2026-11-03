// قراءة فقط: يفتح كل تطبيق من الشاشة الرئيسية ويتحقق من وجود اسم التطبيق في الشريط العلوي (يُستعمل للإشارة إليه). usage: node scripts/probes/probe-brand.mjs "Sales" "CRM" ...
import { chromium } from "playwright";
process.loadEnvFile();
const base = process.env.JAWAB_BASE_URL;
if (new URL(base).hostname !== "premium.jawab.pro") process.exit(1);
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await p.goto(base + "/web/login"); await p.fill("input[name=login]", process.env.JAWAB_USER); await p.fill("input[name=password]", process.env.JAWAB_PASSWORD);
await p.click(".oe_login_form button[type=submit]"); await p.waitForSelector(".o_app, .o_home_menu", { timeout: 60000 });
for (const label of process.argv.slice(2)) {
  await p.goto(base + "/odoo"); await p.waitForSelector(".o_app", { timeout: 30000 });
  const tile = p.locator(".o_app").filter({ hasText: label });
  if (!(await tile.count())) { console.log(label.padEnd(16), "no tile"); continue; }
  await tile.first().click(); await p.waitForTimeout(2500);
  const out = [];
  for (const s of [".o_main_navbar .o_menu_brand", ".o_main_navbar .o_menu_sections", ".o_control_panel"]) {
    const l = p.locator(s); const n = await l.count(); const bb = n ? await l.first().boundingBox().catch(() => null) : null;
    out.push(`${s.split(" ").pop()}=${n}${bb ? `(${Math.round(bb.width)}x${Math.round(bb.height)})` : ""}`);
  }
  console.log(label.padEnd(16), out.join("  "));
}
await b.close();
