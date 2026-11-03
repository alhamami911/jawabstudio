// قراءة فقط: يطبع عناصر قائمة علوية في تطبيق بالواجهة العربية. usage: node scripts/probes/probe-menu.mjs <نص التطبيق> <نص القائمة العلوية>
import { chromium } from "playwright";
process.loadEnvFile();
const base = process.env.JAWAB_BASE_URL;
if (new URL(base).hostname !== "premium.jawab.pro") process.exit(1);
const [app, menu] = process.argv.slice(2);
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await p.goto(base + "/web/login"); await p.fill("input[name=login]", process.env.JAWAB_USER); await p.fill("input[name=password]", process.env.JAWAB_PASSWORD);
await p.click(".oe_login_form button[type=submit]"); await p.waitForSelector(".o_app, .o_home_menu", { timeout: 60000 });
await p.goto(base + "/odoo"); await p.waitForSelector(".o_app");
await p.locator(".o_app").filter({ hasText: app }).first().click(); await p.waitForTimeout(2000);
console.log("top menus:", (await p.locator(".o_menu_sections .dropdown-toggle, .o_menu_sections .o_nav_entry").allInnerTexts()).map((t) => t.trim()).join(" | "));
await p.locator(".o_menu_sections button.dropdown-toggle").filter({ hasText: menu }).first().click(); await p.waitForTimeout(600);
console.log("items:", (await p.locator(".o-dropdown--menu .dropdown-item").allInnerTexts()).map((t) => JSON.stringify(t.trim())).join(" | "));
await b.close();
