// يحذف حسابًا من شجرة الحسابات بكوده، لإعادة تسجيل سيناريو أنشأه سابقًا.
// usage: node scripts/ops/delete-account.mjs 101200
import { chromium } from "playwright";
process.loadEnvFile();
const code = process.argv[2];
if (!code) { console.error("usage: node scripts/ops/delete-account.mjs <code>"); process.exit(1); }
const base = process.env.JAWAB_BASE_URL;
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await p.goto(base + "/web/login");
await p.fill("input[name=login]", process.env.JAWAB_USER);
await p.fill("input[name=password]", process.env.JAWAB_PASSWORD);
await p.click(".oe_login_form button[type=submit]");
await p.waitForSelector(".o_app");
await p.goto(base + "/jawab/action-295"); // Accounting > Configuration > Chart of Accounts
await p.waitForSelector(".o_list_table");
await p.locator(".o_searchview_input").fill(code);
await p.keyboard.press("Enter");
await p.waitForTimeout(2000);
const rows = await p.locator(".o_data_row").allInnerTexts();
const exact = rows.filter((r) => r.trim().startsWith(code));
if (exact.length !== 1) { console.log(`found ${rows.length} rows, ${exact.length} exact match; nothing deleted`); await b.close(); process.exit(0); }
await p.locator(".o_data_row .o_list_record_selector input").check();
await p.locator(".o_cp_action_menus button, .o_control_panel button:has-text('Actions')").first().click();
await p.getByRole("menuitem", { name: "Delete" }).click();
await p.locator(".modal button:has-text('Delete')").click();
await p.waitForTimeout(2000);
console.log(`deleted account ${code}`);
await b.close();
