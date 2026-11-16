// Speech-to-text, in a worker so the page never freezes. Runs Whisper on the visitor's own device with
// Transformers.js, on the processor by default (WASM); config.js can ask for the graphics card (WebGPU) instead.
// Nothing is uploaded; the only downloads are the library and the model files, which the browser then caches.
//
// Messages in:   { type: "load" }                              start fetching the model early
//                { type: "transcribe", id, audio, language, task }
//                    audio = Float32Array, mono, 16 kHz; leave it out to run the previous audio again
//                    language = the spoken language as a code ("en", "es", ...); Whisper here does not detect it
//                    task = "transcribe" (the default) or "translate" (any language into English)
// Messages out:  { type: "model", loaded, total }              download progress in bytes
//                { type: "ready", device }                     "webgpu" or "wasm"
//                { type: "partial", id, fraction, chunks }     long audio only: how far through it is, and the newest words
//                { type: "result", id, text, chunks, seconds } chunks = [{ timestamp: [start, end], text }]
//                { type: "error", id, message }

import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2";

const MODEL = "onnx-community/whisper-base";   // multilingual

// The default is the small model on the processor: the lightest download that works.
// A setup passed in from the page (see ENGINES in app.js) or config.js may name another model, device or precision.
// Measured on an Apple-silicon Mac, November 2026, with the model cached. Time is for a 13.5 second clip; errors
// are the share of words wrong on three short clips (English, Spanish, and a noisy real video), see test/score.js.
//   base,  wasm,   q8                       73 MB    3.2 s    8% / 13% / 16%   <- "standard", the default
//   small, wasm,   q8                      240 MB    9.8 s    0% /  0% / 11%   <- "accurate"
//   small, webgpu, fp16 encoder + q4 dec   393 MB    2.2 s    0% /  0% /  5%   <- "ultra"
//   base,  webgpu, fp32 encoder + q4 dec   197 MB    1.9 s    same words as standard; dropped, not worth the download
//   base,  webgpu, fp16 encoder + q8 dec    91 MB    7.2 s    slower than the processor; dropped
// English-only models (distil-small.en) reject the language setting and were not pursued.
const CPU = { device: "wasm", dtype: "q8" };
let asr = null, loading = null, override = null, lastAudio = null;

function load() {
  loading ??= (async () => {
    const files = new Map();
    const report = (p) => {
      if (p.status !== "progress" || !p.total) return;
      files.set(p.file, [p.loaded, p.total]);
      let loaded = 0, total = 0;
      for (const [l, t] of files.values()) { loaded += l; total += t; }
      postMessage({ type: "model", loaded, total });
    };
    const setups = [override || CPU, ...(override ? [CPU] : [])];   // a setup from config.js is tried first, the default after it
    let device = null;
    for (const setup of setups) {
      try {
        const { model = MODEL, ...how } = setup;   // a setup may name a different model
        asr = await pipeline("automatic-speech-recognition", model, { ...how, progress_callback: report });
        device = setup.device;
        break;
      } catch (e) { if (setup === setups.at(-1)) throw e; }    // a refused setup falls through to the next
    }
    postMessage({ type: "ready", device });
    return asr;
  })();
  loading.catch(() => { loading = null; });      // a failed load can be retried
  return loading;
}

// Short audio goes through in one piece. Anything over three minutes goes through in sections of about two
// minutes, so real progress can be reported after each one. Sections are cut at the quietest moment within
// three seconds of the two-minute mark, so a cut does not land in the middle of a word.
const RATE = 16000, SECTION = 120 * RATE;
function quietest(a, from, to) {
  const step = RATE / 10;
  let best = Math.min(a.length, to), least = Infinity;
  for (let i = Math.max(0, from); i + step <= Math.min(a.length, to); i += step) {
    let energy = 0;
    for (let j = i; j < i + step; j++) energy += a[j] * a[j];
    if (energy < least) { least = energy; best = i + (step >> 1); }
  }
  return best;
}
// Whisper sometimes gets stuck and repeats itself instead of following the audio. Three signs of it: more words
// than anyone can say in the time, one phrase three or more times running inside a segment, or three or more
// segments running with the same words. Seen on the ten-minute test file: one 375-word segment, and a sentence
// nobody said repeated nine times. Running the stuck stretch again on its own came back clean.
const plain = (text) => text.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, "").trim().split(/\s+/).filter(Boolean);
function repeats(words) {                       // a phrase of 3 to 12 words, three times in a row
  for (let size = 3; size <= 12; size++) {
    for (let i = 0; i + size * 3 <= words.length; i++) {
      let same = true;
      for (let j = 0; same && j < size * 2; j++) same = words[i + j] === words[i + j + size];
      if (same) return true;
    }
  }
  return false;
}
function stuck(chunks) {                        // the indexes of the segments that look stuck
  const bad = new Set(), words = chunks.map((c) => plain(c.text)), said = words.map((w) => w.join(" "));
  chunks.forEach((c, i) => {
    const seconds = Math.max(1, c.timestamp[1] - c.timestamp[0]);
    if ((words[i].length > 30 && words[i].length / seconds > 6) || repeats(words[i])) bad.add(i);
  });
  for (let i = 0; i + 2 < chunks.length; i++) {
    if (words[i].length > 2 && said[i] === said[i + 1] && said[i] === said[i + 2]) { bad.add(i); bad.add(i + 1); bad.add(i + 2); }
  }
  return bad;
}

// Runs one stretch of the audio and gives its segments times measured from the start of the whole recording.
async function piece(pipe, audio, from, to, options) {
  const out = await pipe(audio.subarray(from, to), options), offset = from / RATE;
  return (out.chunks || []).map((c) => ({ text: c.text, timestamp: [c.timestamp[0] + offset, c.timestamp[1] == null ? to / RATE : c.timestamp[1] + offset] }));
}

// The same, then one repair pass: each stuck run, with the segment either side of it, is run again on its own.
// The second go lines up differently with the audio, which is usually enough. It is kept only if it is less stuck.
async function careful(pipe, audio, from, to, options) {
  const chunks = await piece(pipe, audio, from, to, options), bad = stuck(chunks);
  if (!bad.size) return chunks;
  const redo = chunks.map((_, i) => bad.has(i - 1) || bad.has(i) || bad.has(i + 1)), out = [];
  for (let i = 0; i < chunks.length; i++) {
    if (!redo[i]) { out.push(chunks[i]); continue; }
    let last = i;
    while (redo[last + 1]) last++;
    const old = chunks.slice(i, last + 1);
    const a = Math.max(from, Math.round(old[0].timestamp[0] * RATE)), b = Math.min(to, Math.round(old.at(-1).timestamp[1] * RATE));
    let kept = old;
    if (b - a > RATE && !(a === from && b === to)) {          // the whole stretch again would only give the same answer
      const again = await piece(pipe, audio, a, b, options);
      if (again.length && stuck(again).size < stuck(old).size) kept = again;
    }
    out.push(...kept);
    i = last;
  }
  return out;
}

async function hear(pipe, audio, options, id) {
  const chunks = [];
  if (audio.length <= SECTION * 1.5) chunks.push(...await careful(pipe, audio, 0, audio.length, options));
  else {
    let start = 0;
    while (start < audio.length) {
      let end = Math.min(audio.length, start + SECTION);
      end = audio.length - end < 20 * RATE ? audio.length : quietest(audio, end - 3 * RATE, end + 3 * RATE);   // no tiny last section
      const part = await careful(pipe, audio, start, end, options);
      chunks.push(...part);
      start = end;
      postMessage({ type: "partial", id, fraction: end / audio.length, chunks: part });
    }
  }
  return { text: chunks.map((c) => c.text).join(""), chunks };
}

onmessage = async ({ data }) => {
  try {
    if (data.type === "load") { override = data.setup || null; await load(); }
    if (data.type === "transcribe") {
      const pipe = await load();
      if (data.audio) lastAudio = data.audio;
      if (!lastAudio) throw new Error("there is no audio to run again");
      const out = await hear(pipe, lastAudio, {
        chunk_length_s: 30, stride_length_s: 5, return_timestamps: true,
        language: data.language || "en", task: data.task || "transcribe",
      }, data.id);
      postMessage({ type: "result", id: data.id, text: out.text, chunks: out.chunks || [], seconds: lastAudio.length / 16000 });
    }
  } catch (e) {
    postMessage({ type: "error", id: data.id, message: String(e?.message || e) });
  }
};
