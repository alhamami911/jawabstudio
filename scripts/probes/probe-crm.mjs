// قراءة فقط: يفتح تطبيق CRM ويطبع قوائمه العليا وعناصرها ومراحل المسار وحقول الفرصة الجديدة (دون حفظ). usage: node scripts/probes/probe-crm.mjs
import { chromium } from "playwright";
process.loadEnvFile();
const base = process.env.JAWAB_BASE_URL;
if (new URL(base).hostname !== "premium.jawab.pro") process.exit(1);
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await p.goto(base + "/web/login"); await p.fill("input[name=login]", process.env.JAWAB_USER); await p.fill("input[name=password]", process.env.JAWAB_PASSWORD);
await p.click(".oe_login_form button[type=submit]"); await p.waitForSelector(".o_app, .o_home_menu", { timeout: 60000 });
await p.goto(base + "/odoo"); await p.waitForSelector(".o_app");
console.log("apps:", (await p.locator(".o_app").allInnerTexts()).map((t) => t.trim()).join(" | "));
const crm = p.locator(".o_app").filter({ hasText: /CRM|علاقات/ }).first();
if (!(await crm.count())) { console.log("NO CRM APP"); await b.close(); process.exit(0); }
await crm.click(); await p.waitForTimeout(3500);
console.log("view:", await p.locator(".o_content > div").first().getAttribute("class"));
console.log("top menus:", (await p.locator(".o_menu_sections > *").allInnerTexts()).map((t) => t.trim()).join(" | "));
console.log("stages:", (await p.locator(".o_kanban_header .o_column_title").allInnerTexts()).map((t) => t.trim()).join(" | "));
console.log("cards per stage:", await p.locator(".o_kanban_group").evaluateAll((g) => g.map((x) => x.querySelectorAll(".o_kanban_record").length)));
console.log("switchers:", await p.locator(".o_cp_switch_buttons button").evaluateAll((e) => e.map((x) => x.className.split(" ").filter((c) => c.startsWith("o_")).join("."))));
console.log("cp buttons:", (await p.locator(".o_control_panel button").allInnerTexts()).map((t) => t.trim()).filter(Boolean).join(" | "));
for (const i of [0, 1, 2, 3, 4]) {
  const t = p.locator(".o_menu_sections button.dropdown-toggle").nth(i);
  if (!(await t.count())) break;
  const name = (await t.innerText()).trim();
  await t.click(); await p.waitForTimeout(500);
  console.log(`menu[${name}]:`, (await p.locator(".o-dropdown--menu .dropdown-item").allInnerTexts()).map((x) => x.trim()).join(" | "));
  await p.keyboard.press("Escape");
}
await p.locator("button.o-kanban-button-new, .o_kanban_quick_create, button:has-text('جديد')").first().click().catch(() => {}); await p.waitForTimeout(2000);
console.log("quick create fields:", await p.locator(".o_kanban_quick_create .o_field_widget, .o_form_view .o_field_widget").evaluateAll((e) => e.map((x) => x.getAttribute("name"))));
await b.close();
