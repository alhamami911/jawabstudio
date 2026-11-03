// قراءة فقط: يفتح تقارير المحاسبة من القوائم (واجهة عربية) ويطبع أزرار لوحة التحكم لكل تقرير. usage: node scripts/probes/probe-reports.mjs
import { chromium } from "playwright";
process.loadEnvFile();
const base = process.env.JAWAB_BASE_URL;
if (new URL(base).hostname !== "premium.jawab.pro") process.exit(1);
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await p.goto(base + "/web/login"); await p.fill("input[name=login]", process.env.JAWAB_USER); await p.fill("input[name=password]", process.env.JAWAB_PASSWORD);
await p.click(".oe_login_form button[type=submit]"); await p.waitForSelector(".o_app, .o_home_menu", { timeout: 60000 });
const reports = ["الميزانية العمومية", "الربح والخسارة", "ميزان المراجعة", "دفتر الأستاذ العام", "المتأخر المدين", "حسابات دائنة مستحقة متأخرة", "دفتر الأستاذ العام للشركاء"];
for (const r of reports) {
  await p.goto(base + "/odoo"); await p.waitForSelector(".o_app");
  await p.locator(".o_app").filter({ hasText: "المحاسبة" }).first().click(); await p.waitForTimeout(2000);
  await p.locator(".o_menu_sections button.dropdown-toggle").filter({ hasText: "إعداد التقارير" }).first().click().catch(() => {});
  await p.waitForTimeout(500);
  const item = p.locator(".o-dropdown--menu .dropdown-item").filter({ hasText: new RegExp("^\s*" + r + "\s*$") }).first();
  if (!(await item.count())) { console.log("NOT FOUND in menu:", r); continue; }
  await item.click(); await p.waitForTimeout(5000);
  const btns = (await p.locator(".o_control_panel button").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
  console.log("##", r, "| table:", await p.locator(".o_action.account_report table, .account_report table").count(), "\n  ", btns.join(" | "));
}
await b.close();
