// The engine: get the audio, decode it, hand it to the speech-to-text worker. No framework, no page code;
// everything hangs off one object so it can move into the final site unchanged.
//
//   const job = Engine.transcribe(source, { onStatus, language })   source = a File, or a link as a string
//   Engine.translate({ onStatus, language })   runs the same audio again, into English
//   const { chunks, seconds, device, took, meta } = await job
//   meta = { title, creator, platform, source }: whatever is known about the video; title and creator may be missing
//
// onStatus({ stage, text, fraction }) fires as it goes; stage is "fetch", "model", "decode" or "listen".
// While listening, `fraction` is real for audio over three minutes (it goes through in sections) and absent otherwise.
// Failures reject with an Error whose .code is one of: "no-fetcher", "fetch-failed", "empty", "no-video", "no-audio", "engine",
// or "cancelled" when confirmLong said no.

const Engine = (() => {
  const config = () => window.BARTLEBY || {};
  const fail = (code, message) => Object.assign(new Error(message), { code });
  const mb = (n) => (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + " MB";
  const kb = (n) => (n < 1048576 ? Math.round(n / 1024) + " KB" : mb(n));
  const MEDIA = /\.(mp3|m4a|aac|wav|ogg|opus|flac|mp4|mov|webm|mkv)(\?|#|$)/i;

  /* ---- the worker, started on first use ---- */
  let worker = null, device = null, modelReady = null, jobId = 0, haveAudio = false;
  const jobs = new Map(), modelListeners = new Set();
  function start() {
    if (worker) return;
    worker = new Worker(new URL("engine/worker.js", document.baseURI), { type: "module" });
    modelReady = new Promise((resolve, reject) => {
      worker.onmessage = ({ data }) => {
        if (data.type === "model") for (const fn of modelListeners) fn(data);
        if (data.type === "ready") { device = data.device; resolve(device); }
        if (data.type === "partial") jobs.get(data.id)?.onPart?.(data);
        if (data.type === "result") { jobs.get(data.id)?.resolve(data); jobs.delete(data.id); }
        if (data.type === "error") {
          const job = jobs.get(data.id);
          if (job) { job.reject(fail("engine", data.message)); jobs.delete(data.id); }
          else reject(fail("engine", data.message));
        }
      };
      worker.onerror = (e) => reject(fail("engine", e.message || "the speech-to-text worker failed to start"));
    });
    modelReady.catch(() => { worker?.terminate(); worker = null; });   // let a later attempt start fresh
    worker.postMessage({ type: "load", setup: config().setup || null });   // config.js may pin a device and model precision
  }

  // Drops the running worker so the next job starts one with whatever setup config now holds.
  function reset() {
    worker?.terminate();
    worker = null; device = null; modelReady = null; haveAudio = false;
    for (const job of jobs.values()) job.reject(fail("engine", "the engine was switched mid-job"));
    jobs.clear();
  }

  /* ---- getting the bytes ---- */
  async function download(url, onBytes, init) {
    let res;
    try { res = await fetch(url, init); } catch { throw fail("fetch-failed", "the download could not start"); }
    if (!res.ok) throw fail("fetch-failed", `the download answered ${res.status}`);
    const total = Number(res.headers.get("content-length") || res.headers.get("estimated-content-length")) || 0;   // cobalt sends an estimate
    const reader = res.body.getReader(), parts = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value); loaded += value.length;
      onBytes(loaded, total);
    }
    if (!loaded) throw fail("empty", "the download came back empty");   // the site refused the stream: cobalt opens a tunnel that carries nothing
    return new Blob(parts).arrayBuffer();
  }

  // A link is fetched one of two ways: directly if it points straight at an audio or video file, otherwise
  // by asking a cobalt instance (github.com/imputnet/cobalt) for the audio. The instance address comes from
  // config.js; without one, links to social sites cannot be fetched and the caller is told so.
  async function fetchLink(link, onBytes) {
    const url = /^https?:\/\//i.test(link) ? link : "https://" + link;
    if (MEDIA.test(url)) return download(url, onBytes);
    const api = config().cobalt;
    if (!api) throw fail("no-fetcher", "no cobalt instance is configured");
    let answer;
    try {
      const res = await fetch(api, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ url, downloadMode: "audio", audioFormat: "mp3", audioBitrate: "96" }),
      });
      answer = await res.json();
    } catch { throw fail("fetch-failed", "the cobalt instance did not answer"); }
    if (answer.status === "tunnel" || answer.status === "redirect") return download(answer.url, onBytes);
    if (answer.status === "picker") {             // a post with several items: take its audio, or its first video
      const pick = answer.audio || answer.picker?.find((p) => p.type === "video")?.url;
      if (pick) return download(pick, onBytes);
      throw fail("no-video", "that post has pictures but no video");
    }
    throw fail("fetch-failed", answer.error?.code || `cobalt answered "${answer.status}"`);
  }

  /* ---- details about the video ----
     cobalt writes the title and the creator into the audio file's ID3 tags when the platform has them
     (YouTube does; Instagram and TikTok posts have no title). This reads those two tags and nothing else. */
  function readTags(bytes) {
    const b = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 131072));
    if (b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return {};          // no "ID3" header
    const safe = (i) => ((b[i] & 127) << 21) | ((b[i + 1] & 127) << 14) | ((b[i + 2] & 127) << 7) | (b[i + 3] & 127);
    const plain = (i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
    const version = b[3], end = Math.min(10 + safe(6), b.length), found = {};
    for (let p = 10; p + 10 <= end; ) {
      const id = String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]);
      if (!/^[A-Z0-9]{4}$/.test(id)) break;
      const size = version === 4 ? safe(p + 4) : plain(p + 4);
      if (id === "TIT2" || id === "TPE1") {
        const body = b.subarray(p + 10, Math.min(p + 10 + size, b.length));
        const encoding = ["windows-1252", "utf-16", "utf-16be", "utf-8"][body[0]] || "utf-8";
        found[id] = new TextDecoder(encoding).decode(body.subarray(1)).replace(/\0/g, "").trim();
      }
      p += 10 + size;
    }
    return { title: found.TIT2 || undefined, creator: found.TPE1 || undefined };
  }
  const PLATFORMS = { youtu: "youtube", youtube: "youtube", instagram: "instagram", tiktok: "tiktok", x: "x", twitter: "x" };
  function describe(source, bytes) {
    if (typeof source !== "string") {
      return { ...readTags(bytes), title: readTags(bytes).title || source.name.replace(/\.[^.]+$/, ""), platform: "file", source: source.name };
    }
    const url = /^https?:\/\//i.test(source) ? source : "https://" + source;
    let host = "";
    try { host = new URL(url).hostname.replace(/^(www|m|vm|vt)\./, "").split(".")[0]; } catch {}
    return { ...readTags(bytes), platform: MEDIA.test(url) ? "direct link" : PLATFORMS[host] || host || "link", source: url };
  }

  /* ---- decoding: any audio or video file the browser can read, down to mono 16 kHz ---- */
  async function decode(bytes) {
    let buffer;
    try { buffer = await new OfflineAudioContext(1, 1, 16000).decodeAudioData(bytes); }
    catch { throw fail("no-audio", "the file has no audio this browser can decode"); }
    const mono = new Float32Array(buffer.length);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < data.length; i++) mono[i] += data[i] / buffer.numberOfChannels;
    }
    if (!mono.length) throw fail("no-audio", "the file is empty");
    return mono;
  }

  /* ---- the whole job ---- */
  // confirmLong, if given, is called with { seconds } before the listening starts on anything LONG or longer, and
  // must resolve to true to go ahead. It is how the page shows its "this will take about..." popup.
  const LONG = 300;
  async function transcribe(source, { onStatus = () => {}, language = "en", confirmLong } = {}) {
    const t0 = performance.now();
    start();                                       // the model downloads while the audio is being fetched
    const onModel = ({ loaded, total }) => onStatus({ stage: "model", text: total > 2e6 ? `loading model (${mb(loaded)} of ${mb(total)})` : "loading model", fraction: loaded / total });

    let bytes;
    if (typeof source === "string") {
      onStatus({ stage: "fetch", text: "fetching audio", fraction: 0 });
      bytes = await fetchLink(source, (loaded, total) => onStatus({ stage: "fetch", text: `fetching audio (${kb(loaded)})`, fraction: total ? loaded / total : 0 }));
    } else {
      bytes = await source.arrayBuffer();
    }

    const meta = describe(source, bytes);
    onStatus({ stage: "decode", text: "reading the audio", fraction: 0 });
    const audio = await decode(bytes);
    const seconds = audio.length / 16000;

    if (!device) {                                 // still downloading: now show its progress
      modelListeners.add(onModel);
      onStatus({ stage: "model", text: "loading model", fraction: 0 });
      try { await modelReady; } finally { modelListeners.delete(onModel); }
    }

    if (seconds >= LONG && confirmLong && !(await confirmLong({ seconds, meta }))) throw fail("cancelled", "not started");
    const heard = performance.now();
    const result = await listen({ audio, language, task: "transcribe" }, `listening to ${clock(seconds)} of audio`, onStatus, t0);
    haveAudio = true;
    return { chunks: result.chunks, text: result.text, seconds, device, meta, took: (performance.now() - t0) / 1000, listened: (performance.now() - heard) / 1000 };
  }

  // Sends one job to the worker and reports elapsed time while it runs.
  async function listen(job, label, onStatus, t0) {
    const id = ++jobId;
    const began = performance.now();
    let fraction;                                  // stays undefined for short audio; real progress for long audio
    const report = () => onStatus({ stage: "listen", text: label, fraction, elapsed: (performance.now() - t0) / 1000, listening: (performance.now() - began) / 1000 });
    const tick = setInterval(report, 250);
    try {
      return await new Promise((resolve, reject) => {
        jobs.set(id, { resolve, reject, onPart: (part) => { fraction = part.fraction; report(); } });
        worker.postMessage({ type: "transcribe", id, ...job }, job.audio ? [job.audio.buffer] : []);
      });
    } finally { clearInterval(tick); }
  }

  // Runs the audio from the last transcription again with Whisper's translate task, which turns speech in
  // any language into English text. Other target languages need a separate translation model.
  async function translate({ onStatus = () => {}, language = "en" } = {}) {
    if (!haveAudio || !worker) throw fail("no-audio", "there is no audio to translate; transcribe something first");
    const t0 = performance.now();
    const result = await listen({ language, task: "translate" }, "translating into english", onStatus, t0);
    return { chunks: result.chunks, text: result.text, seconds: result.seconds, device, took: (performance.now() - t0) / 1000 };
  }

  const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  return { transcribe, translate, clock, warm: start, reset, canTranslate: () => haveAudio, LONG };
})();
