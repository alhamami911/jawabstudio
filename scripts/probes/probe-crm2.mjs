// قراءة فقط: بطاقات مسار CRM (أسماء الفرص والعملاء والإيرادات) وقائمة العملاء المهتمين وأسباب الضياع وشاشة الأنشطة. usage: node scripts/probes/probe-crm2.mjs
import { chromium } from "playwright";
process.loadEnvFile();
const base = process.env.JAWAB_BASE_URL;
if (new URL(base).hostname !== "premium.jawab.pro") process.exit(1);
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await p.goto(base + "/web/login"); await p.fill("input[name=login]", process.env.JAWAB_USER); await p.fill("input[name=password]", process.env.JAWAB_PASSWORD);
await p.click(".oe_login_form button[type=submit]"); await p.waitForSelector(".o_app, .o_home_menu", { timeout: 60000 });
await p.goto(base + "/odoo"); await p.waitForSelector(".o_app");
await p.locator(".o_app").filter({ hasText: /إدارة علاقات العملاء/ }).first().click(); await p.waitForTimeout(3500);
console.log("company switcher:", (await p.locator(".o_switch_company_menu").innerText().catch(() => "")).replace(/\s+/g, " "));
console.log("CARDS:");
for (const t of await p.locator(".o_kanban_record").allInnerTexts()) console.log("  -", t.replace(/\s+/g, " ").slice(0, 110));
// فتح بطاقة لرؤية حقول النموذج الكامل
await p.locator(".o_kanban_record").first().click(); await p.waitForTimeout(3000);
console.log("form fields:", (await p.locator(".o_form_view .o_field_widget").evaluateAll((e) => e.map((x) => x.getAttribute("name")))).join(","));
console.log("statusbar:", (await p.locator(".o_statusbar_status button").allInnerTexts()).map((t) => t.trim()).join(" | "));
console.log("header btns:", (await p.locator(".o_form_statusbar button").allInnerTexts()).map((t) => t.trim()).filter(Boolean).join(" | "));
console.log("tabs:", (await p.locator(".o_notebook .nav-link").allInnerTexts()).map((t) => t.trim()).join(" | "));
console.log("chatter btns:", (await p.locator(".o-mail-Chatter-topbar button").allInnerTexts()).map((t) => t.trim()).filter(Boolean).join(" | "));
await p.goBack(); await p.waitForTimeout(2000);
for (const [menu, item] of [["المبيعات", "أنشطتي"], ["إعداد التقارير", "المتوقع"], ["إعداد التقارير", "مخطط سير العمل"], ["التهيئة", "أسباب الضياع"]]) {
  await p.locator(".o_menu_sections button.dropdown-toggle").filter({ hasText: menu }).first().click(); await p.waitForTimeout(400);
  await p.locator(".o-dropdown--menu .dropdown-item").filter({ hasText: item }).first().click(); await p.waitForTimeout(3000);
  console.log(`[${item}] view:`, await p.locator(".o_content > div").first().getAttribute("class").catch(() => ""), "| rows:", await p.locator(".o_data_row, .o_kanban_record").count(), "| switchers:", await p.locator(".o_cp_switch_buttons button").count());
  console.log("   body:", (await p.locator(".o_content").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 220));
}
await b.close();
