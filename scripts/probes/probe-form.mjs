// يفحص نموذج "جديد" في أي شاشة Jawab ويطبع حقوله الظاهرة (للمساعدة في كتابة الحلقات بلا تخمين). لا يحفظ شيئًا.
// usage: node scripts/probes/probe-form.mjs <actionId> [<actionId> ...]
import { chromium } from "playwright";
process.loadEnvFile();
const base = process.env.JAWAB_BASE_URL;
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await p.goto(base + "/web/login");
await p.fill("input[name=login]", process.env.JAWAB_USER);
await p.fill("input[name=password]", process.env.JAWAB_PASSWORD);
await p.click(".oe_login_form button[type=submit]");
await p.waitForSelector(".o_app");
for (const id of process.argv.slice(2)) {
  await p.goto(`${base}/jawab/action-${id}`);
  await p.waitForSelector(".o_control_panel", { timeout: 30000 });
  await p.waitForTimeout(1500);
  const title = await p.locator(".o_breadcrumb, .breadcrumb").first().innerText().catch(() => "?");
  const btn = p.locator(".o_control_panel button:text-is('New')").first();
  if (!(await btn.count())) { console.log(`\n## action ${id} (${title.trim()}): no New button`); continue; }
  await btn.click();
  await p.waitForTimeout(1800);
  const kind = (await p.locator(".o_form_view").count()) ? "form" : "list-inline";
  const fields = await p.evaluate(() => [...document.querySelectorAll(".o_content .o_field_widget[name]")]
    .filter((e) => e.offsetParent !== null)
    .map((e) => `${e.getAttribute("name")}${e.classList.contains("o_required_modifier") ? "*" : ""}[${[...e.classList].find((c) => /^o_field_/.test(c) && c !== "o_field_widget")?.replace("o_field_", "") ?? "?"}]`));
  const tabs = await p.locator(".o_notebook_headers a").allInnerTexts().catch(() => []);
  const btns = await p.locator(".o_control_panel button").allInnerTexts();
  console.log(`\n## action ${id} (${title.trim().replace(/\s+/g, " ")}) ${kind}\nfields: ${fields.join(" ")}\ntabs: ${tabs.join(" | ")}\nbuttons: ${btns.map((x) => x.trim()).filter(Boolean).join(" | ")}`);
}
await b.close();
