// قراءة فقط: يفتح نموذج عرض سعر جديد (دون حفظ) ويطبع حقوله وأزراره وعلامات تبويبه. usage: node scripts/probes/probe-sales.mjs
import { chromium } from "playwright";
process.loadEnvFile();
const base = process.env.JAWAB_BASE_URL;
if (new URL(base).hostname !== "premium.jawab.pro") process.exit(1);
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await p.goto(base + "/web/login"); await p.fill("input[name=login]", process.env.JAWAB_USER); await p.fill("input[name=password]", process.env.JAWAB_PASSWORD);
await p.click(".oe_login_form button[type=submit]"); await p.waitForSelector(".o_app, .o_home_menu", { timeout: 60000 });
await p.goto(base + "/odoo"); await p.waitForSelector(".o_app");
await p.locator(".o_app").filter({ hasText: "المبيعات" }).first().click(); await p.waitForTimeout(2500);
console.log("view:", await p.locator(".o_content > div").first().getAttribute("class"));
console.log("kanban/list buttons:", (await p.locator(".o_control_panel button").allInnerTexts()).map((t) => t.trim()).filter(Boolean).join(" | "));
await p.locator(".o_menu_sections button.dropdown-toggle").nth(2).click(); await p.waitForTimeout(500);
await p.locator(".o-dropdown--menu .dropdown-item").filter({ hasText: "قوائم الأسعار" }).first().click(); await p.waitForTimeout(3000);
console.log((await p.locator(".o_data_row").allInnerTexts()).map((t) => t.replace(/\s+/g, " ")).join("\n"));
await b.close();
