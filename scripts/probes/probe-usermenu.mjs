// قراءة فقط: يفتح قائمة المستخدم في قاعدة الاستديو ويطبع عناصرها
import { chromium } from "playwright";
process.loadEnvFile();
const base = process.env.JAWAB_BASE_URL;
if (new URL(base).hostname !== "premium.jawab.pro") process.exit(1);
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await p.goto(base + "/web/login"); await p.fill("input[name=login]", process.env.JAWAB_USER); await p.fill("input[name=password]", process.env.JAWAB_PASSWORD);
await p.click(".oe_login_form button[type=submit]"); await p.waitForSelector(".o_app, .o_home_menu", { timeout: 60000 });
await p.goto(base + "/odoo/action-base_setup.action_general_configuration"); await p.waitForTimeout(5000);
await p.click(".o_user_menu .o_user_avatar"); await p.waitForTimeout(1200);
console.log(JSON.stringify(await p.locator(".o-dropdown--menu .dropdown-item, .o-dropdown--menu [data-menu]").evaluateAll((els) => els.map((e) => ({ t: e.textContent.trim().replace(/\s+/g, " "), d: e.getAttribute("data-menu") })))));
console.log("toggle exists:", await p.locator(".o_menu_toggle").count(), "| lang_toggle:", await p.locator("[data-menu=lang_toggle]").count());
await b.close();
