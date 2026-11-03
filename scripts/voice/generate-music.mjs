// يولّد موسيقى خلفية بالتركيب الصوتي (خالية من حقوق النشر). بديل مؤقت حتى تضع موسيقاك في assets/music/.
// usage: npm run music:gen                 (uplifting: محفّزة وتعليمية، الافتراضي)
//        npm run music:gen -- ambient      (هادئة جدًا: أوتار ممتدة)
import ffmpeg from "ffmpeg-static";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const style = process.argv[2] ?? "uplifting";
const SR = 44100;
mkdirSync("assets/music", { recursive: true });

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const TAU = Math.PI * 2;

function writeWav(path, L, R) {
  const n = L.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.max(-1, Math.min(1, L[i])) * 32767 | 0, 44 + i * 4);
    buf.writeInt16LE(Math.max(-1, Math.min(1, R[i])) * 32767 | 0, 46 + i * 4);
  }
  writeFileSync(path, buf);
}

function encode(wav, out, extraFilter) {
  const r = spawnSync(ffmpeg, ["-loglevel", "error", "-y", "-i", wav, ...(extraFilter ? ["-af", extraFilter] : []), "-c:a", "libmp3lame", "-b:a", "192k", out], { stdio: "inherit" });
  rmSync(wav, { force: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
  console.log(`Done → ${out}`);
}

if (style === "ambient") {
  // أوتار Am9 ممتدة بتذبذب بطيء
  const DUR = 120, notes = [110, 164.81, 220, 261.63, 329.63, 392, 493.88];
  const n = DUR * SR, L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let l = 0, r = 0;
    notes.forEach((f, k) => {
      const a = 0.11 / (1 + k * 0.35), lfo = 0.55 + 0.45 * Math.sin(TAU * (0.05 + k * 0.013) * t + k * 1.3);
      l += a * Math.sin(TAU * f * (1 - 0.0016 * (k % 3 + 1)) * t) * lfo;
      r += a * Math.sin(TAU * f * (1 + 0.0016 * (k % 3 + 1)) * t) * lfo;
    });
    L[i] = l; R[i] = r;
  }
  writeWav("assets/music/_tmp.wav", L, R);
  encode("assets/music/_tmp.wav", "assets/music/ambient-generated.mp3", `lowpass=f=2200,aecho=0.8:0.7:420|610:0.35|0.25,afade=t=in:d=4,afade=t=out:st=${DUR - 5}:d=5`);
  process.exit(0);
}

// ---------- uplifting ----------
const BPM = 104, beat = 60 / BPM, step = beat / 2, bar = beat * 4;
const BARS = 52; // نحو 120 ثانية
const total = Math.ceil(BARS * bar * SR) + SR * 2;
const L = new Float32Array(total), R = new Float32Array(total);

// تتابع I–V–vi–IV في دو الكبير: جذر الباص + نغمات الوتر
const chords = [
  { bass: 36, tones: [60, 64, 67] }, // C
  { bass: 43, tones: [59, 62, 67] }, // G
  { bass: 45, tones: [57, 60, 64] }, // Am
  { bass: 41, tones: [57, 60, 65] }, // F
];

function add(startSec, lenSec, fn, gain, pan = 0) {
  const s0 = Math.floor(startSec * SR), n = Math.floor(lenSec * SR);
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4), gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = 0; i < n && s0 + i < total; i++) {
    const v = fn(i / SR);
    L[s0 + i] += v * gl; R[s0 + i] += v * gr;
  }
}

const pluck = (f) => (t) => {
  const env = Math.min(t / 0.004, 1) * Math.exp(-t * 6.5);
  return env * (Math.sin(TAU * f * t) + 0.35 * Math.sin(TAU * 2 * f * t) * Math.exp(-t * 9) + 0.12 * Math.sin(TAU * 3 * f * t));
};
const padVoice = (f, len) => (t) => {
  const env = Math.min(t / 0.5, 1) * Math.min(Math.max((len - t) / 0.6, 0), 1);
  return env * (Math.sin(TAU * f * t) + 0.4 * Math.sin(TAU * f * 1.003 * t) + 0.25 * Math.sin(TAU * 2 * f * t));
};
const bassNote = (f) => (t) => Math.min(t / 0.01, 1) * Math.exp(-t * 2.6) * (Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * 2 * f * t));
const kick = (t) => Math.exp(-t * 16) * Math.sin(TAU * (45 * t + (95 / 22) * (1 - Math.exp(-22 * t))));
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const hat = () => { let prev = 0; return (t) => { const w = rnd(); const h = w - prev; prev = w; return h * Math.exp(-t * 70); }; };

for (let b = 0; b < BARS; b++) {
  const c = chords[b % 4], t0 = b * bar;
  // وسادة هادئة طوال المقطع
  for (const m of c.tones) add(t0, bar + 0.3, padVoice(mtof(m - 12), bar + 0.3), 0.045, 0);
  // أرپيجيو: ثمانيات متحركة تتبدّل بين اليسار واليمين
  const pat = [0, 1, 2, 3, 2, 1, 3, 1]; // 3 = الجذر أعلى بأوكتاف
  for (let s = 0; s < 8; s++) {
    const m = (pat[s] === 3 ? c.tones[0] + 12 : c.tones[pat[s]]) + 12;
    const ts = t0 + s * step;
    add(ts, 0.9, pluck(mtof(m)), 0.17, s % 2 ? 0.35 : -0.35);
    add(ts + step * 1.5, 0.9, pluck(mtof(m)), 0.055, s % 2 ? -0.5 : 0.5); // صدى
  }
  // باص من الميزان 3
  if (b >= 2) { add(t0, bar / 2, bassNote(mtof(c.bass)), 0.26); add(t0 + beat * 2, bar / 2, bassNote(mtof(c.bass)), 0.2); }
  // إيقاع خفيف من الميزان 5
  if (b >= 4) {
    for (const k of [0, 2]) add(t0 + k * beat, 0.4, kick, 0.34);
    for (let s = 1; s < 8; s += 2) add(t0 + s * step, 0.08, hat(), 0.07, s % 4 === 1 ? 0.25 : -0.25);
  }
}

// تطبيع القمة إلى -1 ديسيبل تقريبًا
let peak = 0;
for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const k = 0.89 / peak;
for (let i = 0; i < total; i++) { L[i] *= k; R[i] *= k; }

writeWav("assets/music/_tmp.wav", L, R);
encode("assets/music/_tmp.wav", "assets/music/uplifting-generated.mp3", `aecho=0.7:0.5:90:0.18,afade=t=in:d=1.5,afade=t=out:st=${(BARS * bar - 3).toFixed(1)}:d=3`);
