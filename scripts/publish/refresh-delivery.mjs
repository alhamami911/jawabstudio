// يحدّث مجلدات «production to publish» الحالية بملفات يوتيوب (youtube.txt، captions.srt المزاحة، youtube-thumbnail.jpg) من حزم المكتبة.
// usage: node scripts/publish/refresh-delivery.mjs
import { copyFileSync, existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const root = process.env.JAWAB_EXPORT_DIR ?? join(process.env.USERPROFILE ?? ".", "Desktop", "JAWAB Studio", "production to publish");
let n = 0;
for (const sid of readdirSync("library")) {
  const sdir = join("library", sid);
  let eps; try { eps = readdirSync(sdir).filter((x) => /^ep-\d+$/.test(x)); } catch { continue; }
  for (const ep of eps) {
    const vs = readdirSync(join(sdir, ep)).filter((x) => /^v\d+$/.test(x)).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
    if (!vs.length) continue;
    const rel = join(sdir, ep, vs[vs.length - 1]);
    const pk = join(rel, "youtube", "package.json");
    if (!existsSync(pk)) continue;
    const p = JSON.parse(readFileSync(pk, "utf8"));
    const meta = JSON.parse(readFileSync(join(rel, "metadata.json"), "utf8"));
    const safe = meta.title.ar.replace(/[\/:*?"<>|]/g, " ").replace(/\s{2,}/g, " ").trim();
    // اسم المجلد بتسلسل الدليل: «S01E01 - العنوان» (الرقم وحده يتكرر بين الأقسام)؛ المجلد القديم «NN - العنوان» يُعاد تسميته
    let code = ""; try { code = JSON.parse(readFileSync(join("series", sid, "series.json"), "utf8")).catalogCode ?? ""; } catch {}
    const num = Number(ep.slice(3)), nn = String(num).padStart(2, "0");
    const old = join(root, `${nn} - ${safe}`);
    const dest = join(root, `${code ? code + "E" + nn : nn} - ${safe}`);
    if (dest !== old && existsSync(old) && !existsSync(dest)) renameSync(old, dest);
    if (!existsSync(dest)) continue;
    copyFileSync(join(rel, "youtube", "captions.ar.srt"), join(dest, "captions.srt"));
    if (existsSync(join(rel, "youtube", "thumbnail.jpg"))) copyFileSync(join(rel, "youtube", "thumbnail.jpg"), join(dest, "youtube-thumbnail.jpg"));
    writeFileSync(join(dest, "youtube.txt"), `${p.video.title}\n\n${p.video.description}\n\nالوسوم: ${p.video.tags.join(", ")}\nقائمة التشغيل: ${p.playlist.title}\nالخصوصية: مسودة خاصة (النشر العلني يدوي بعد المراجعة)\n`);
    n++; console.log("updated", dest);
  }
}
console.log(`${n} delivery folder(s) refreshed`);
