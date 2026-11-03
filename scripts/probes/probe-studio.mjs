// فحص للقراءة فقط لقاعدة الاستديو الجديدة (JAWAB_STUDIO_*): النسخة، الشركات، اللغات، الوحدات المثبّتة.
// لا يكتب شيئًا ولا يطبع كلمة المرور. usage: node scripts/probes/probe-studio.mjs
import { chromium } from "playwright";
process.loadEnvFile();
const u = new URL(process.env.JAWAB_STUDIO_URL);
if (u.hostname !== "premium.jawab.pro") { console.error("host not allowed: " + u.hostname); process.exit(1); }
const base = u.origin;
const b = await chromium.launch(); const ctx = await b.newContext(); const p = await ctx.newPage();
await p.goto(process.env.JAWAB_STUDIO_URL);
await p.fill("input[name=login]", process.env.JAWAB_STUDIO_USER);
await p.fill("input[name=password]", process.env.JAWAB_STUDIO_PASSWORD);
await p.click(".oe_login_form button[type=submit]");
try { await p.waitForSelector(".o_app, .o_home_menu", { timeout: 60000 }); } catch { console.log("login did not reach the app; url =", p.url()); console.log((await p.locator(".alert").allInnerTexts()).join(" | ")); await b.close(); process.exit(2); }
console.log("landed:", new URL(p.url()).pathname);
const rpc = async (path, params = {}) => (await (await ctx.request.post(base + path, { data: { jsonrpc: "2.0", method: "call", params } })).json());
const call = async (model, method, args, kwargs = {}) => { const r = await rpc(`/web/dataset/call_kw/${model}/${method}`, { model, method, args, kwargs }); if (r.error) return { error: r.error.data?.message ?? r.error.message }; return r.result; };
const si = (await rpc("/web/session/get_session_info")).result;
console.log("db:", si.db, "| uid:", si.uid, "| version:", JSON.stringify(si.server_version_info?.slice(0, 3)), "| lang:", si.user_context?.lang);
console.log("companies:", JSON.stringify(si.user_companies?.allowed_companies ? Object.values(si.user_companies.allowed_companies).map((c) => `${c.id}:${c.name}`) : si.user_companies));
console.log("langs:", JSON.stringify((await call("res.lang", "search_read", [[["active", "=", true]]], { fields: ["code"] })).map?.((l) => l.code)));
const mods = await call("ir.module.module", "search_read", [[["state", "=", "installed"], ["application", "=", true]]], { fields: ["name", "shortdesc"], order: "shortdesc" });
console.log("apps installed:", Array.isArray(mods) ? mods.map((m) => `${m.name}(${m.shortdesc})`).join(", ") : JSON.stringify(mods));
const n = async (model) => { const r = await call(model, "search_count", [[]]); return typeof r === "number" ? r : "n/a"; };
console.log("counts → partners", await n("res.partner"), "| products", await n("product.template"), "| moves", await n("account.move"), "| sale orders", await n("sale.order"));
await b.close();
