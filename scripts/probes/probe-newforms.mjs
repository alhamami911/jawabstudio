// قراءة فقط: يفتح قوائم المحاسبة بالعربية ثم نموذج «جديد» ويطبع حقوله (بلا حفظ). usage: node scripts/probes/probe-newforms.mjs
import { chromium } from "playwright";
process.loadEnvFile();
const base = process.env.JAWAB_BASE_URL;
if (new URL(base).hostname !== "premium.jawab.pro") process.exit(1);
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await p.goto(base + "/web/login"); await p.fill("input[name=login]", process.env.JAWAB_USER); await p.fill("input[name=password]", process.env.JAWAB_PASSWORD);
await p.click(".oe_login_form button[type=submit]"); await p.waitForSelector(".o_app, .o_home_menu", { timeout: 60000 });
const exact = (t) => new RegExp("^\\s*" + t + "\\s*$");
const targets = [["العملاء", "العملاء"], ["التهيئة", "شروط السداد"], ["التهيئة", "الأوضاع المالية"], ["التهيئة", "الحسابات التحليلية"], ["التهيئة", "فئات المنتجات"], ["العملاء", "فواتير العملاء"], ["الموردين", "الفواتير"], ["الموردين", "الموردين"]];
for (const [menu, item] of targets) {
  try {
    await p.goto(base + "/odoo"); await p.waitForSelector(".o_app");
    await p.locator(".o_app").filter({ hasText: "المحاسبة" }).first().click(); await p.waitForTimeout(1800);
    await p.locator(".o_menu_sections button.dropdown-toggle").filter({ hasText: exact(menu) }).first().click({ timeout: 8000 }); await p.waitForTimeout(400);
    const it = p.locator(".o-dropdown--menu .dropdown-item").filter({ hasText: exact(item) }).first();
    if (!(await it.count())) { console.log("##", menu, ">", item, "NOT FOUND:", (await p.locator(".o-dropdown--menu .dropdown-item").allInnerTexts()).map((t) => t.trim()).join("|")); continue; }
    await it.click(); await p.waitForTimeout(3500);
    const nb = p.locator(".o_control_panel :is(button.o_list_button_add,button.o_form_button_create,button.o-kanban-button-new)").first();
    if (!(await nb.count())) { console.log("##", menu, ">", item, "no new button; buttons:", (await p.locator(".o_control_panel button").allInnerTexts()).map((t) => t.trim()).filter(Boolean).join("|")); continue; }
    await nb.click(); await p.waitForTimeout(2500);
    const names = await p.locator(".o_content .o_field_widget[name]").evaluateAll((els) => els.map((e) => e.getAttribute("name") + ":" + (e.querySelector("select") ? "select" : e.querySelector("input[type=radio]") ? "radio" : e.querySelector("input") ? "input" : e.querySelector("textarea") ? "textarea" : "other")));
    console.log("##", menu, ">", item, "\n  ", names.slice(0, 40).join("  "));
  } catch (e) { console.log("##", menu, ">", item, "ERR", e.message.split("\n")[0]); }
}
await b.close();
