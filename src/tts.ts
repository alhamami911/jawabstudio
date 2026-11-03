import ffmpeg from "ffmpeg-static";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ELEVEN_MODEL_DEFAULT = "eleven_multilingual_v2";

export interface TtsConfig {
  voice: string; // ElevenLabs voice_id
  model: string;
}

// المفتاح والصوت من .env: ELEVENLABS_API_KEY و ELEVENLABS_VOICE_ID (والنموذج اختياري ELEVENLABS_MODEL)
export function resolveTts(): TtsConfig {
  const voice = process.env.ELEVENLABS_VOICE_ID;
  if (!process.env.ELEVENLABS_API_KEY || !voice) {
    console.error("set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in .env (see: npm run voices / npm run voice:design)");
    process.exit(1);
  }
  return { voice, model: process.env.ELEVENLABS_MODEL ?? ELEVEN_MODEL_DEFAULT };
}

// الكلمات الإنجليزية بين أقواس تبقى في الشريط المكتوب فقط ولا تُنطق
export const speechText = (narration: string) =>
  narration
    .replace(/\s*\([A-Za-z][A-Za-z0-9\s&/.\-]*\)/g, "")
    .replace(/JAWAB/g, "جواب") // العلامة تُكتب JAWAB على الشاشة وتُنطق جواب
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/[،,]$/, "."); // جملة تنتهي بفاصلة يقطعها الصوت بحدّة في آخر المقطع (قطعة مسموعة): تُنهى بنقطة

// نطق مطلوب (31 أكتوبر 2026): «الإنجليزية» تُنطق بقاف (الإنقليزية) لا بجيم عربية. يُطبَّق على النص المرسَل للصوت فقط (وعلى مفتاح التخزين المؤقت)، فيبقى المكتوب «الإنجليزية»
const HK = "[\u064B-\u0652]*";
export const pronounce = (t: string) => t.replace(new RegExp(`([إا]${HK}ن${HK})ج(?=${HK}ل${HK}ي${HK}ز)`, "g"), "$1ق");

export interface Clip {
  file: string; // مسار نسبي إلى مجلد المخرجات: audio/xxxx.mp3
  ms: number; // مدة المقطع
}

function durationMs(path: string): number {
  const r = spawnSync(ffmpeg as unknown as string, ["-hide_banner", "-i", path], { encoding: "utf8" });
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(r.stderr ?? "");
  if (!m) throw new Error(`cannot read duration of ${path}`);
  return Math.round((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000);
}

// إعدادات الإلقاء المعتمدة (اختيار المستخدم 28 أكتوبر 2026، العينة C): ثبات أعلى بلا مبالغة تعبيرية، وبذرة ثابتة،
// وسياق الجملة السابقة واللاحقة ليتتابع الإلقاء بدل أن تبدأ كل جملة نغمتها من الصفر
const VOICE_PROFILE = "c1";
async function elevenLabs(text: string, cfg: TtsConfig, outFile: string, ctx: { prev?: string; next?: string } = {}) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(cfg.voice)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY!, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: cfg.model,
        // ثبات أعلى ونبرة قليلة التعبير = إلقاء هادئ تعليمي
        voice_settings: { stability: 0.85, similarity_boost: 0.8, style: 0, use_speaker_boost: true },
        seed: 7,
        ...(ctx.prev ? { previous_text: ctx.prev } : {}),
        ...(ctx.next ? { next_text: ctx.next } : {}),
      }),
    },
  );
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    const hint = res.status === 401 ? " (check ELEVENLABS_API_KEY)" : res.status === 402 || res.status === 429 ? " (plan/quota limit)" : "";
    throw new Error(`ElevenLabs ${res.status}${hint}: ${body}`);
  }
  writeFileSync(outFile, Buffer.from(await res.arrayBuffer()));
}

// ملف ElevenLabs الخام يُحفظ مرة واحدة في cache/tts ويُعاد استعماله في كل إصدار (لا يُصرف رصيد على نص لم يتغير)،
// ثم تُنسخ منه نسخة معالجة إلى مجلد الحلقة: قصّ الصمت الافتتاحي وضغط أي وقفة أطول من نصف ثانية إلى نحو 0.5ث فلا يبدو الإلقاء متوقفًا ومتقطعًا
const SHARED_CACHE = join("cache", "tts");
function tighten(raw: string, out: string) {
  const r = spawnSync(ffmpeg as unknown as string, ["-y", "-loglevel", "error", "-i", raw, "-af",
    "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.04:stop_periods=-1:stop_duration=0.3:stop_threshold=-42dB:stop_silence=0.2",
    "-c:a", "libmp3lame", "-b:a", "128k", out], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("audio tightening failed: " + (r.stderr ?? "").slice(0, 200));
}

export async function synthesizeAll(texts: string[], outDir: string, cfg: TtsConfig): Promise<Map<string, Clip>> {
  const audioDir = join(outDir, "audio");
  mkdirSync(audioDir, { recursive: true });
  const clips = new Map<string, Clip>();

  const ordered = [...new Set(texts)];
  for (const [i, text] of ordered.entries()) {
    // الاسم مشتق من الصوت والنموذج والنص: تغيير جملة يعيد توليدها فقط، وتغيير الصوت يُنتج مقاطع جديدة دون مسح القديمة
    const name = createHash("sha1").update(`${cfg.voice}|${cfg.model}|${VOICE_PROFILE}|${pronounce(text)}`).digest("hex").slice(0, 12) + ".mp3";
    const abs = join(audioDir, name);
    const raw = join(SHARED_CACHE, name.replace(/\.mp3$/, ".raw.mp3"));
    mkdirSync(SHARED_CACHE, { recursive: true });
    if (!existsSync(raw)) {
      await elevenLabs(pronounce(text), cfg, raw, { prev: ordered[i - 1] && pronounce(ordered[i - 1]), next: ordered[i + 1] && pronounce(ordered[i + 1]) });
      console.log(`♪ synthesized: ${text.slice(0, 40)}`);
    }
    if (!existsSync(abs)) tighten(raw, abs);
    clips.set(text, { file: `audio/${name}`, ms: durationMs(abs) });
  }
  return clips;
}
