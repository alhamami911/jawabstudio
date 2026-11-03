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
const menu = async (i, t) => { await p.locator(".o_menu_sections button.dropdown-toggle").nth(i).click(); await p.waitForTimeout(500); await p.locator(".o-dropdown--menu .dropdown-item").filter({ hasText: t }).first().click(); await p.waitForTimeout(3500); };
await menu(0, "عروض الأسعار");
await p.locator(".o_searchview_dropdown_toggler").click(); await p.waitForTimeout(800);
console.log("dd:", (await p.locator(".o_search_bar_menu, .o-dropdown--menu").last().innerText()).replace(/\s+/g, " "));
await p.keyboard.press("Escape");
await p.locator("button.o_list_button_add").click(); await p.waitForTimeout(2500);
await p.locator(".o_field_widget[name=partner_id] input").fill("مكتب الريادة"); await p.waitForTimeout(1500);
await p.locator(".o-autocomplete--dropdown-item").first().click(); await p.waitForTimeout(1500);
console.log("pricelist now:", await p.locator(".o_field_widget[name=pricelist_id] input").inputValue());
await p.locator(".o_optional_columns_dropdown_toggle, .o_optional_columns_dropdown button").last().click().catch(() => {}); await p.waitForTimeout(600);
console.log("optional:", (await p.locator(".o-dropdown--menu").last().innerText().catch(() => "")).replace(/\s+/g, " "));
await p.keyboard.press("Escape");
// existing quote: open first row
await menu(0, "عروض الأسعار");
await p.locator(".o_data_row").first().click(); await p.waitForTimeout(3000);
console.log("hdr:", (await p.locator(".o_form_statusbar button").allInnerTexts()).map((t) => t.trim()).filter(Boolean).join(" | "));
console.log("smart:", (await p.locator(".oe_button_box button").allInnerTexts()).map((t) => t.replace(/\s+/g, " ")).join(" | "));
console.log("preview btn sel:", await p.locator(".o_form_statusbar button[name=action_preview_sale_order]").count(), await p.locator(".o_form_statusbar button[name=action_quotation_send]").count(), await p.locator(".o_form_statusbar button[name=action_confirm]").count());
console.log("gear:", await p.locator(".o_cp_action_menus button").count());
// reporting
await menu(3, "المبيعات");
console.log("rpt views:", await p.locator(".o_cp_switch_buttons button").evaluateAll((e) => e.map((x) => x.className.split(" ").filter((c) => c.startsWith("o_")).join("."))));
console.log("rpt body:", (await p.locator(".o_content").innerText()).replace(/\s+/g, " ").slice(0, 300));
console.log("rpt dims:", await p.locator(".o_graph_renderer, .o_pivot, canvas").count());
await b.close();
