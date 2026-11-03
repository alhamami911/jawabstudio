// يفحص نظام Jawab الحقيقي ويحفظ ما فيه فعلًا في catalog/ ليُبنى التخطيط عليه، لا على التخمين.
// usage: npm run discover            → catalog/menus.json (كل التطبيقات والقوائم)
//        npm run discover -- <model> → catalog/models/<model>.json (حقول النموذج الفعلية)
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

try { process.loadEnvFile(); } catch {}
const base = process.env.JAWAB_BASE_URL;
if (!base || !process.env.JAWAB_USER || !process.env.JAWAB_PASSWORD) {
  console.error("JAWAB_BASE_URL / JAWAB_USER / JAWAB_PASSWORD missing in .env");
  process.exit(1);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
await page.goto(new URL("/web/login", base).toString());
await page.fill("input[name=login]", process.env.JAWAB_USER);
await page.fill("input[name=password]", process.env.JAWAB_PASSWORD);
await page.click(".oe_login_form button[type=submit]");
await page.waitForSelector(".o_app");

const rpc = async (path: string, params: object) => {
  const r = await ctx.request.post(new URL(path, base).toString(), { data: { jsonrpc: "2.0", method: "call", params } });
  const body = await r.json();
  if (body.error) throw new Error(body.error.data?.message ?? body.error.message);
  return body.result;
};
const callKw = (model: string, method: string, args: unknown[], kwargs: object = {}) =>
  rpc(`/web/dataset/call_kw/${model}/${method}`, { model, method, args, kwargs });

const model = process.argv[2];
mkdirSync("catalog", { recursive: true });

if (!model) {
  const versionRes = await ctx.request.post(new URL("/web/webclient/version_info", base).toString(), {
    data: { jsonrpc: "2.0", method: "call", params: {} },
  });
  const version = (await versionRes.json()).result;
  const res = await ctx.request.get(new URL("/web/webclient/load_menus/discover", base).toString());
  const raw = await res.json();
  const all = Object.values(raw) as any[];
  const byId = new Map(all.map((m) => [m.id, m]));
  const walk = (id: number, path: string[]): any[] => {
    const m = byId.get(id);
    if (!m) return [];
    const here = m.id === "root" ? path : [...path, m.name];
    const self = m.actionID ? [{ id: m.id, path: here.join(" > "), actionId: m.actionID, actionModel: m.actionModel, actionPath: m.actionPath || undefined, xmlid: m.xmlid }] : [];
    return [...self, ...(m.children ?? []).flatMap((c: number) => walk(c, here))];
  };
  const apps = (raw.root?.children ?? []).map((id: number) => byId.get(id)).filter(Boolean);
  const out = {
    discoveredAt: new Date().toISOString(),
    baseUrl: base,
    version: version?.server_version,
    apps: apps.map((a: any) => ({ id: a.id, name: a.name, xmlid: a.xmlid, menus: walk(a.id, []) })),
  };
  writeFileSync(join("catalog", "menus.json"), JSON.stringify(out, null, 2));
  for (const a of out.apps) console.log(`${a.name}: ${a.menus.length} menus`);
  console.log(`Done → catalog/menus.json (${out.apps.length} apps, version ${out.version})`);
} else {
  const fields = await callKw(model, "fields_get", [], { attributes: ["string", "type", "required", "relation", "selection", "readonly"] });
  mkdirSync(join("catalog", "models"), { recursive: true });
  const slim = Object.fromEntries(
    Object.entries<any>(fields)
      .filter(([, f]) => !f.readonly || f.required)
      .map(([k, f]) => [k, { label: f.string, type: f.type, required: f.required || undefined, relation: f.relation, selection: f.selection }]),
  );
  writeFileSync(join("catalog", "models", `${model}.json`), JSON.stringify(slim, null, 2));
  console.log(`Done → catalog/models/${model}.json (${Object.keys(slim).length} editable fields)`);
}
await browser.close();
