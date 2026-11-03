// رفع حزم يوتيوب (من scripts/build-youtube-package.mjs) كمسودات خاصة فقط. لا نشر علني آلي أبدًا: النشر يدوي من YouTube Studio.
//   node scripts/publish/youtube-upload.mjs auth                      تفويض القناة مرة واحدة (يفتح المتصفح؛ تسجيل الدخول والموافقة بيد مالك القناة)
//   node scripts/publish/youtube-upload.mjs plan [series] [--ep N]    ما سيُرفع (الافتراضي، لا يتصل بيوتيوب)
//   node scripts/publish/youtube-upload.mjs upload [series] [--ep N] [--limit N] [--vertical] --apply   الرفع الفعلي (يتطلب --apply)
// يحتاج في .env: YOUTUBE_CLIENT_ID و YOUTUBE_CLIENT_SECRET (OAuth client من نوع Desktop في Google Cloud مع تفعيل YouTube Data API v3)
// الحصة: الرفع ≈ 1600 وحدة + الغلاف 50 + الترجمة 400 + القائمة 50 من 10,000 يوميًا افتراضيًا، فالحد الافتراضي 3 فيديوهات في التشغيل.
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { join } from "node:path";

try { process.loadEnvFile(); } catch {}
const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (n) => argv.includes(n);
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const onlySeries = argv[1] && !argv[1].startsWith("--") ? argv[1] : undefined;
const onlyEp = val("--ep");
const limit = Number(val("--limit") ?? 3);
const TOKEN_FILE = "data/youtube-token.json";
const LEDGER = "data/youtube-uploads.json";
const SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube", "https://www.googleapis.com/auth/youtube.force-ssl"];
const PORT = 53682, REDIRECT = `http://127.0.0.1:${PORT}/`;

const readJson = (f, d) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return d; } };
const writeJson = (f, o) => { mkdirSync("data", { recursive: true }); writeFileSync(f, JSON.stringify(o, null, 2)); };
const need = () => { if (!process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_CLIENT_SECRET) { console.error("ضع YOUTUBE_CLIENT_ID و YOUTUBE_CLIENT_SECRET في .env أولًا (انظر أعلى هذا الملف)."); process.exit(1); } };

// ---------- التفويض ----------
async function auth() {
  need();
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(8).toString("hex");
  const url = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({ client_id: process.env.YOUTUBE_CLIENT_ID, redirect_uri: REDIRECT, response_type: "code", scope: SCOPES.join(" "), access_type: "offline", prompt: "consent", code_challenge: challenge, code_challenge_method: "S256", state });
  const code = await new Promise((resolve, reject) => {
    const srv = createServer((req, res) => {
      const u = new URL(req.url, REDIRECT);
      if (u.searchParams.get("state") !== state) { res.writeHead(400); return void res.end("bad state"); }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end("<p style='font-family:sans-serif'>تم التفويض. يمكنك إغلاق هذه الصفحة والعودة إلى الطرفية.</p>");
      srv.close(); u.searchParams.get("code") ? resolve(u.searchParams.get("code")) : reject(new Error(u.searchParams.get("error") ?? "no code"));
    }).listen(PORT, "127.0.0.1", () => { console.log("افتح هذا الرابط وسجّل الدخول بحساب قناة JAWAB ووافق:\n" + url); spawn("cmd", ["/c", "start", "", url.replace(/&/g, "^&")], { stdio: "ignore", detached: true }).unref(); });
  });
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: process.env.YOUTUBE_CLIENT_ID, client_secret: process.env.YOUTUBE_CLIENT_SECRET, redirect_uri: REDIRECT, grant_type: "authorization_code", code_verifier: verifier }) });
  const j = await r.json();
  if (!j.refresh_token) { console.error("لم يصل refresh_token:", JSON.stringify(j)); process.exit(1); }
  writeJson(TOKEN_FILE, { refresh_token: j.refresh_token, saved: new Date().toISOString() });
  console.log("تم حفظ التفويض في", TOKEN_FILE);
}

let access;
async function token() {
  if (access && access.exp > Date.now() + 60000) return access.t;
  need();
  const tk = readJson(TOKEN_FILE);
  if (!tk?.refresh_token) { console.error("لا يوجد تفويض: شغّل auth أولًا."); process.exit(1); }
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: process.env.YOUTUBE_CLIENT_ID, client_secret: process.env.YOUTUBE_CLIENT_SECRET, refresh_token: tk.refresh_token, grant_type: "refresh_token" }) });
  const j = await r.json();
  if (!j.access_token) { console.error("فشل تجديد الدخول:", JSON.stringify(j)); process.exit(1); }
  access = { t: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return access.t;
}
const api = async (url, opt = {}) => {
  const r = await fetch(url, { ...opt, headers: { authorization: `Bearer ${await token()}`, ...(opt.headers ?? {}) } });
  if (!r.ok) throw new Error(`${opt.method ?? "GET"} ${url.split("?")[0]} → ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r;
};

// ---------- الحزم ----------
function packages() {
  const out = [];
  if (!existsSync("library")) return out;
  for (const sid of readdirSync("library")) {
    if (onlySeries && onlySeries !== sid) continue;
    const sdir = join("library", sid);
    if (!statSync(sdir).isDirectory()) continue;
    for (const ep of readdirSync(sdir).filter((x) => /^ep-\d+$/.test(x)).sort()) {
      if (onlyEp && Number(onlyEp) !== Number(ep.slice(3))) continue;
      const vs = readdirSync(join(sdir, ep)).filter((x) => /^v\d+$/.test(x)).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
      if (!vs.length) continue;
      const dir = join(sdir, ep, vs[vs.length - 1]);
      const f = join(dir, "youtube", "package.json");
      if (existsSync(f)) out.push({ sid, ep, dir, pkg: JSON.parse(readFileSync(f, "utf8")) });
    }
  }
  return out;
}

// ---------- الرفع ----------
async function uploadVideo(file, snippet) {
  const size = statSync(file).size;
  const init = await api("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: { "content-type": "application/json; charset=UTF-8", "x-upload-content-length": String(size), "x-upload-content-type": "video/mp4" },
    body: JSON.stringify({ snippet, status: { privacyStatus: "private", selfDeclaredMadeForKids: false } }), // خاص دائمًا
  });
  const loc = init.headers.get("location");
  const put = await fetch(loc, { method: "PUT", headers: { "content-length": String(size), "content-type": "video/mp4" }, body: createReadStream(file), duplex: "half" });
  if (!put.ok) throw new Error(`upload → ${put.status} ${(await put.text()).slice(0, 300)}`);
  return (await put.json()).id;
}
async function setThumbnail(videoId, file) {
  await api(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`, { method: "POST", headers: { "content-type": "image/jpeg" }, body: readFileSync(file) });
}
async function addCaptions(videoId, file, c) {
  const b = "jawab" + randomBytes(6).toString("hex");
  const meta = JSON.stringify({ snippet: { videoId, language: c.language, name: c.name, isDraft: false } });
  const body = Buffer.concat([Buffer.from(`--${b}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${b}\r\ncontent-type: application/octet-stream\r\n\r\n`), readFileSync(file), Buffer.from(`\r\n--${b}--`)]);
  await api("https://www.googleapis.com/upload/youtube/v3/captions?uploadType=multipart&part=snippet", { method: "POST", headers: { "content-type": `multipart/related; boundary=${b}` }, body });
}
const playlistCache = {};
async function playlistId(pl) {
  if (playlistCache[pl.title]) return playlistCache[pl.title];
  const list = await (await api("https://www.googleapis.com/youtube/v3/playlists?part=snippet&mine=true&maxResults=50")).json();
  let id = list.items?.find((x) => x.snippet.title === pl.title)?.id;
  if (!id) id = (await (await api("https://www.googleapis.com/youtube/v3/playlists?part=snippet,status", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ snippet: { title: pl.title, description: pl.description, defaultLanguage: "ar" }, status: { privacyStatus: "private" } }) })).json()).id;
  return (playlistCache[pl.title] = id);
}
async function addToPlaylist(pl, videoId) {
  await api("https://www.googleapis.com/youtube/v3/playlistItems?part=snippet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ snippet: { playlistId: await playlistId(pl), resourceId: { kind: "youtube#video", videoId } } }) });
}

async function run() {
  const ledger = readJson(LEDGER, {});
  const jobs = [];
  for (const p of packages()) {
    if (p.pkg.privacyStatus !== "private") { console.error(`${p.sid}/${p.ep}: privacyStatus must be private, skipped`); continue; }
    const base = `${p.sid}/${p.ep}/v${p.pkg.contentVersion}`;
    if (!ledger[`${base}/16x9`]) jobs.push({ ...p, kind: "16x9", key: `${base}/16x9`, file: join(p.dir, p.pkg.video.file), title: p.pkg.video.title, desc: p.pkg.video.description });
    if (flag("--vertical") && p.pkg.vertical?.upload && !ledger[`${base}/vertical`]) jobs.push({ ...p, kind: "vertical", key: `${base}/vertical`, file: join(p.dir, p.pkg.vertical.file), title: p.pkg.vertical.title, desc: p.pkg.video.description });
  }
  const todo = jobs.slice(0, limit);
  console.log(`${jobs.length} item(s) not yet uploaded; this run: ${todo.length} (limit ${limit}). Mode: ${flag("--apply") ? "APPLY (private drafts)" : "plan only"}`);
  for (const j of todo) console.log(` - ${j.key}  "${j.title}"  ${(statSync(j.file).size / 1048576).toFixed(1)} MB${j.pkg.thumbnail && j.kind === "16x9" ? "  +thumbnail" : ""}${j.kind === "16x9" ? "  +captions" : ""}  +playlist "${j.pkg.playlist.title}"`);
  if (cmd !== "upload" || !flag("--apply")) { if (cmd === "upload") console.log("لم يُرفع شيء: أضف --apply للرفع الفعلي (مسودات خاصة)."); return; }
  for (const j of todo) {
    try {
      const v = j.pkg.video;
      const id = await uploadVideo(j.file, { title: j.title, description: j.desc, tags: v.tags, categoryId: v.categoryId, defaultLanguage: v.defaultLanguage, defaultAudioLanguage: v.defaultAudioLanguage });
      ledger[j.key] = { videoId: id, url: `https://studio.youtube.com/video/${id}/edit`, at: new Date().toISOString(), privacy: "private" };
      writeJson(LEDGER, ledger);
      console.log(`✓ ${j.key} → ${ledger[j.key].url}`);
      // الإضافات اختيارية: فشلها لا يُبطل الرفع (الغلاف يتطلب قناة موثَّقة)
      if (j.kind === "16x9" && j.pkg.thumbnail) await setThumbnail(id, join(j.dir, j.pkg.thumbnail)).catch((e) => console.warn("  thumbnail:", e.message));
      if (j.kind === "16x9") await addCaptions(id, join(j.dir, j.pkg.captions.file), j.pkg.captions).catch((e) => console.warn("  captions:", e.message));
      await addToPlaylist(j.pkg.playlist, id).catch((e) => console.warn("  playlist:", e.message));
    } catch (e) { console.error(`✗ ${j.key}: ${e.message}`); if (/quota/i.test(e.message)) break; }
  }
}

if (cmd === "auth") await auth();
else if (cmd === "plan" || cmd === "upload") await run();
else console.log("usage: auth | plan [series] [--ep N] | upload [series] [--ep N] [--limit N] [--vertical] --apply");
