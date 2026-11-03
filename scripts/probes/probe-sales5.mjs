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
const info = async (n) => console.log(n, "| graph", await p.locator(".o_graph_renderer").count(), "pivot", await p.locator(".o_pivot").count(), "list", await p.locator(".o_list_renderer").count(), "kanban", await p.locator(".o_kanban_renderer").count(), "| sw:", await p.locator(".o_cp_switch_buttons .o_switch_view").evaluateAll((e) => e.map((x) => x.className.match(/o_(list|kanban|pivot|graph|calendar|activity|map)\b/)?.[0])).then((a) => a.join(",")), "| rows", await p.locator(".o_data_row").count(), "| cards", await p.locator(".o_kanban_record").count());
for (const [i, t] of [[3, "المبيعات"], [3, "مندوبي"], [3, "المنتجات"], [3, "العملاء"]]) { await menu(i, t); await info("rpt " + t); }
await menu(0, "الطلبات"); await info("orders");
console.log("orders cols:", (await p.locator(".o_list_table thead th").allInnerTexts()).map((t) => t.trim()).filter(Boolean).join(" | "));
console.log("orders row0:", (await p.locator(".o_data_row").first().innerText()).replace(/\s+/g, " "));
await menu(0, "العملاء"); await info("customers");
await menu(1, "الطلبات بانتظار"); await info("toinvoice");
await menu(2, "المنتجات"); await info("products");
await p.locator(".o_searchview_dropdown_toggler").click(); await p.waitForTimeout(500);
await b.close();
