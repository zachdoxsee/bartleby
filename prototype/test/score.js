// Accuracy check: runs the engine on recordings whose words are known and reports the word error rate
// (0% = every word right). Load it from the browser console on the prototype page:
//   await import("./test/score.js"); scoreEngine({ device: "wasm", dtype: "q8" })
const REFS = [
  ["en", "http://localhost:4174/prototype/test/sample.mp3", "Okay, three things nobody tells you about posting every day. First, your hook matters more than your edit. Second, say it out loud before you film it. Third, write down the sentence that made people stop, and use it again."],
  ["es", "http://localhost:4174/prototype/test/es.mp3", "Hola a todos. Hoy quiero contarles tres cosas sobre cómo publicar videos cada día. Primero, la primera frase importa más que la edición. Segundo, dilo en voz alta antes de grabar."],
  ["en", "https://www.youtube.com/watch?v=jNQXAC9IVRw", "All right, so here we are in front of the elephants. The cool thing about these guys is that they have really, really, really long trunks, and that's cool. And that's pretty much all there is to say."],
];
const words = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/alright/g, "all right").replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean);
function wer(ref, hyp) {
  const a = words(ref), b = words(hyp), d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return Math.round((d[a.length][b.length] / a.length) * 100);
}
window.scoreEngine = async (setup, only) => {
  window.BARTLEBY.setup = setup; Engine.reset();
  const out = { setup: JSON.stringify(setup), rows: [], done: false, status: "" };
  window.__score = out;
  for (const [language, url, ref] of REFS.filter((r) => !only || r[0] === only)) {
    try {
      const t0 = performance.now();
      const r = await Engine.transcribe(url, { language, onStatus: (s) => { out.status = s.text; } });
      out.rows.push({ clip: url.split("/").pop().slice(0, 22), language, errorPct: wer(ref, r.text), seconds: +((performance.now() - t0) / 1000).toFixed(1), heard: r.text.trim().slice(0, 160) });
    } catch (e) { out.rows.push({ clip: url.split("/").pop().slice(0, 22), error: e.message }); }
  }
  out.done = true;
  return out;
};
