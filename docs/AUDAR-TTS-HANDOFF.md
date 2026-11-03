# Audar-TTS-V1 — handoff for developer

Goal: run Arabic zero-shot voice cloning locally (CPU) so Jawab tutorial narration no longer depends on ElevenLabs credits.
Reference voice: `assets/voice/<VOICE_ID>/Female_Voice_Only.wav` (13 s, mono). Only voices we own / have consent for.

- Repo: https://github.com/AudarAI/Audar-TTS-V1 (code Apache-2.0)
- Weights (open, not gated): https://huggingface.co/audarai/Audar-TTS-V1-Flash (Flash: AudarAI Open License v1.0, commercial use allowed)
- Codec (REQUIRED, gated): https://huggingface.co/neuphonic/neucodec

## Local state (already done)
- Repo cloned: `tools/audar/repo`
- Python venv: `tools/audar/venv` (Python 3.11, CPU torch, transformers, neucodec 0.0.6, torchao 0.11.0, soundfile, librosa, faster-whisper)
- Reference clip resampled to 24 kHz: `tools/audar/work/ref_female.wav`
- Candidate comparison samples (ElevenLabs): `voice-samples/`

## Decision (user): voice source = our saved voice copy (NOT live ElevenLabs)
Reference prepared from `voice-backup/clips/accounting-basics-e01-08-step.mp3` (10 s) -> `tools/audar/work/ref_saved.wav` (24 kHz) with its exact transcript in `tools/audar/work/ref_saved.txt` (from `voice-backup/dataset.csv`). This removes the Whisper/transcript blocker (#2 below); Whisper is no longer needed.
Remaining blocker: Hugging Face token for the gated codec (#1). Note: clips are ElevenLabs outputs; user accepts using them as the zero-shot reference.

## Blockers
1. **Codec is gated (401 GatedRepoError).** `neuphonic/neucodec` (and `distill-neucodec`, `neucodec-onnx-decoder`) are `gated: auto`.
   Fix: log in to huggingface.co, open the neucodec page, accept the terms (auto-approved), create a read token, then set `HF_TOKEN` (env or `.env`) or run `huggingface-cli login`.
2. **Reference transcript missing.** Audar needs `--ref-text` = exact transcript of the 13 s clip. Whisper medium download stalls at ~1.4/1.5 GB on this network; simplest fix is a human-written transcript of the clip.
3. **Slow / unreliable downloads.** Sizes: Flash GGUF Q4 462 MB, Flash Transformers 1.1 GB, neucodec `model.safetensors` 2.5 GB. If the network can't do it, download elsewhere and place in `~/.cache/huggingface/hub` (or pass local paths).
4. **Already fixed (for reference):** `neucodec>=0.1` is not on PyPI, so 0.0.6 is installed; it pulled `torchtune`, which crashed with `No module named 'torchao.dtypes.nf4tensor'` -> fixed with `pip install torchao==0.11.0` (pip prints a harmless "requires torchao>=0.12" warning).

## Steps to finish
```bash
cd tools/audar/repo
export HF_TOKEN=hf_xxx            # after accepting neucodec terms
../venv/Scripts/python.exe -c "from neucodec import NeuCodec; NeuCodec.from_pretrained('neuphonic/neucodec'); print('codec ok')"

# Option A — Transformers (Flash, bf16; pass device cpu — default is cuda:0)
../venv/Scripts/python.exe examples/synthesize.py "أَهْلًا بِكُمْ فِي جَوَاب" \
  --ref ../work/ref_female.wav --ref-text "<EXACT TRANSCRIPT>" --out ../../../voice-samples/4-clone-female-audar.wav

# Option B — GGUF on CPU (needs llama-cpp-python; on Windows use a prebuilt CPU wheel, compiling needs MSVC)
../venv/Scripts/python.exe examples/synthesize_gguf.py "أَهْلًا بِكُمْ فِي جَوَاب" \
  --ref ../work/ref_female.wav --ref-text "<EXACT TRANSCRIPT>" --tier flash --out ../../../voice-samples/4-clone-female-audar.wav
```
Check `examples/synthesize.py` for a `--device` flag; `load_model(..., device="cuda:0")` defaults to CUDA and this machine has no NVIDIA GPU (Intel Iris Xe, 32 GB RAM) — pass `cpu` and `dtype=torch.float32` if bf16 is slow/unsupported on CPU.

## Acceptance
- A `.wav` (24 kHz) of the Jawab phrase in the cloned voice, with generation time per sentence measured on this CPU.
- If a typical tutorial sentence takes longer than ~1 min on CPU, cloning is only viable as an offline batch step, not inside the queue.

## If it works: integration
Jawab TTS is `src/tts.ts` (`synthesizeAll`, per-sentence cache in `cache/tts`, ElevenLabs REST at line ~55). Add a provider switch (e.g. `TTS_PROVIDER=audar`) that shells out to a Python script per sentence, writes mp3/wav to the same cache path, and returns the same `Clip {file, ms}`. Queue error handling is in `src/queue/worker.ts` (`ProviderDown` on `ElevenLabs 401|402|403|429|quota`).

## Unrelated blocker (production)
ElevenLabs quota exhausted (40,000 chars used; ~20 credits left). Queued CRM episodes E03–E07 are paused until credits renew/are added, or until a local provider exists. Resume: `npm run queue -- resume-all`.
