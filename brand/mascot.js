// Bartleby as a 20x18 pixel sprite. Each frame is composed from parts (hat, head, eyes, hoodie, hands,
// props) and drawn as SVG rects, so it stays crisp at any whole-number scale. About 2 KB, no images.
// Usage: BT.set(svgElement, "idle" | "sigh" | "listening" | "typing" | "done" | "error")
// Calling set() again at any time cancels the animation in progress and starts the new state from its first frame.
const BT = (() => {
  const W = 20, H = 18, SCREEN = 13;
  const PAL = { t: "#8b5e34", h: "#4e2e1a", k: "#0f1412", w: "#fbfbf8", g: "#1f5c45", d: "#123b2c", s: "#8dbfa6",
                p: "#f3a3a3" }; // blush
  const FACE = "....kwwwwwwwwwwk....";
  const HEAD = [
    ".........tttt.......", // bowler hat, tipped down toward his left eye: crown
    ".......ttttttt......",
    "......tttttttkk.....", // black band, stepping down to the left with the brim
    ".....tttkkkkktttt...",
    ".....kkkttttthhk....", // brim crosses the forehead; hair shows at the right temple
    "...tttttwwwwwwhk....", // low end of the brim, just above his left eye
    FACE, FACE, FACE, FACE, // rows 6-8 hold the eyes
  ];
  // Each eye is a 2x2 dot inside a 3x3 cell: [left eye, right eye]. Where the dot sits is where he is looking.
  const dot = (l, r) => [l, r || l];
  const EYES = {
    center: dot(["www", "wkk", "wkk"], ["www", "kkw", "kkw"]),
    left: dot(["www", "kkw", "kkw"]), right: dot(["www", "wkk", "wkk"]),
    up: dot(["wkk", "wkk", "www"], ["kkw", "kkw", "www"]),
    down: dot(["www", "www", "wkk"], ["www", "www", "kkw"]),
    blink: dot(["www", "www", "kkk"]), half: dot(["www", "www", "wkk"], ["www", "www", "kkw"]),
    happy: dot(["www", "wkw", "kwk"]),
    boredL: dot(["www", "www", "kkw"]), boredR: dot(["www", "www", "wkk"]),
  };
  const px = (rows, r0, c0) => rows.flatMap((row, i) => [...row].map((ch, j) => [r0 + i, c0 + j, ch]));
  const PROPS = {
    arcs1: px(["g", "g"], 7, 2),
    arcs2: [...px(["g", "g"], 7, 2), ...px(["g", "g", "g", "g"], 6, 0)],
    riseA: [...px(["s", "s"], 9, 2), ...px(["s", "s"], 9, 17)],       // motion lines beside the head
    riseB: [...px(["s", "s"], 6, 2), ...px(["s", "s"], 6, 17)],
    puff1: px([".ss", "sss"], 9, 16),
    puff2: px(["ss.", "sss"], 7, 17),
    puff3: px(["s"], 5, 19),
    slam: [...px(["s"], 10, 1), ...px(["s"], 9, 3), ...px(["s"], 10, 18), ...px(["s"], 9, 16)],   // impact marks
    tapL: [...px(["s"], 8, 0), ...px(["s"], 7, 2), ...px(["s"], 8, 3)],   // tap marks over the left hand
    tapR: [...px(["s"], 8, 19), ...px(["s"], 7, 17), ...px(["s"], 8, 16)],
    paperLow: px(["kkkkk", "kwwwk", "kgggk", "kwwwk", "kgggk", "kwwwk", "kkkkk"], 8, 15),   // sliding up from behind his hand
    paper: px(["kkkkk", "kwwwk", "kgggk", "kwwwk", "kgggk", "kwwwk", "kkkkk"], 5, 15),
    paperOK: px(["kkkkk", "kwwwk", "kwwgk", "kgwgk", "kwgwk", "kwwwk", "kkkkk"], 5, 15),     // stamped with a green tick
    pop: [...px(["s"], 4, 15), ...px(["s"], 3, 17), ...px(["s"], 4, 19)],                      // marks as the stamp lands
  };

  function compose({ eyes = "center", lift = 0, blush = false, mouth = "flat", hands = [0, 0], prop } = {}) {
    const g = Array.from({ length: H }, () => Array(W).fill("."));
    const put = (r, c, ch) => { if (ch !== "." && r >= 0 && r < H && c >= 0 && c < W) g[r][c] = ch; };
    for (let r = 0; r < SCREEN; r++) {            // head, shifted up by `lift` rows
      const i = r - 1 + lift;
      if (i < 0) continue;
      let row = HEAD[i] || FACE;
      if (i >= 6 && i <= 8) { const [l, r] = EYES[eyes]; row = row.slice(0, 6) + l[i - 6] + row.slice(9, 11) + r[i - 6] + row.slice(14); }
      if (i === 9 && blush) row = "....kppwwwwwwppk....";   // pink cheeks, right under the eyes
      if (i === 10 && mouth !== "none") row = "....kwwwwkkwwwwk....";   // mouth: "flat" (two pixels), "open" or "none"
      if (i === 11 && mouth === "open") row = "....kwwwwkkwwwwk....";   // second row makes it an open square
      [...row].forEach((ch, c) => put(r, c, ch));
    }
    for (const name of [].concat(prop || [])) PROPS[name].forEach(([r, c, ch]) => put(r, c, ch));
    // his green hoodie: hood edges beside the face, dark neckline, two white drawstrings, pocket and hem
    for (let r = SCREEN; r < H; r++) g[r].fill(r === H - 1 ? "d" : "g");
    for (const c of [3, 16]) { put(11, c, "g"); put(12, c, "g"); }
    for (let c = 7; c <= 12; c++) put(SCREEN, c, "d");
    for (const c of [8, 11]) { put(14, c, "w"); put(15, c, "w"); }
    for (let c = 6; c <= 13; c++) put(16, c, "d");
    [0, 16].forEach((c0, n) => px([".kk.", "kwwk", "kwwk", ".kk."], 12 + hands[n], c0).forEach(([r, c, ch]) => put(r, c, ch))); // hands
    return g;
  }

  function draw(svg, grid) {
    let out = "";
    grid.forEach((row, y) => {
      for (let x = 0; x < W; ) {
        const ch = row[x]; let n = 1;
        while (x + n < W && row[x + n] === ch) n++;
        if (ch !== ".") out += `<rect x="${x}" y="${y}" width="${n}" height="1" fill="${PAL[ch]}"/>`;
        x += n;
      }
    });
    svg.innerHTML = out;
  }

  // [frame, milliseconds]. A state loops (from `loopFrom`, after any intro frames) or plays once and holds.
  const B = { blush: true };
  // n frames of alternating hands, 70ms each, with whatever his face is doing meanwhile
  const tap = (eyes, n, extra = {}) => Array.from({ length: n }, (_, i) =>
    [{ eyes, hands: i % 2 ? [-2, 0] : [0, -2], prop: i % 2 ? "tapL" : "tapR", ...extra }, 70]);
  const STATES = {
    idle: { loop: true, frames: [
      [{}, 1600], [{ eyes: "left" }, 800], [{}, 250], [{ eyes: "right" }, 800], [{}, 1400],
      [{ eyes: "blink" }, 120], [{}, 900], [{ eyes: "blink" }, 120], [{}, 700],
      [{ ...B, lift: 1, prop: "riseA" }, 130], [{ ...B }, 500] ] },          // a tiny hop
    sigh: { frames: [                                  // deep breath in, then he drops his head onto the desk
      [{ eyes: "up", lift: 1, prop: "riseA" }, 420], [{ eyes: "up", lift: 2, prop: "riseB" }, 300],
      [{ eyes: "blink", lift: -2, mouth: "none", hands: [-1, -1], prop: "slam" }, 110],
      [{ eyes: "blink", lift: -2, mouth: "none", prop: "puff1" }, 240], [{ eyes: "half", lift: -1, mouth: "none", prop: "puff2" }, 240],
      [{ eyes: "half", lift: -1, mouth: "none", prop: "puff3" }, 200], [{ eyes: "half", mouth: "none" }, 0] ] },
    listening: { loop: true, frames: [                 // hears you out, rolling his eyes while he does
      [{ eyes: "up", prop: "arcs1" }, 360], [{ eyes: "up", prop: "arcs2" }, 360], [{ eyes: "up" }, 360],
      [{ eyes: "half", prop: "arcs1" }, 360], [{ eyes: "boredL", prop: "arcs2" }, 360], [{ eyes: "boredL" }, 500],
      [{ eyes: "blink", prop: "arcs1" }, 160], [{ eyes: "half", prop: "arcs2" }, 360] ] },
    typing: { loop: true, frames: [
      ...tap("boredL", 10), ...tap("half", 6), ...tap("blink", 2), ...tap("boredR", 8),
      ...tap("up", 5), ...tap("blink", 4, { mouth: "open", lift: 1 }), ...tap("half", 4) ] },   // eye-roll, then a yawn
    done: { loop: true, loopFrom: 5, frames: [         // slides the page up, stamps it, then he is finished with you
      [{ eyes: "half", prop: "paperLow" }, 140], [{ eyes: "boredR", prop: "paper" }, 420],
      [{ eyes: "boredR", hands: [0, -1], prop: ["paperOK", "pop"] }, 160],
      [{ eyes: "boredR", prop: "paperOK" }, 500], [{ eyes: "half", prop: "paperOK" }, 700],
      [{ eyes: "boredL", prop: "paperOK" }, 2600], [{ eyes: "blink", prop: "paperOK" }, 160] ] },
    error: { loop: true, loopFrom: 1, frames: [        // the counter clerk: not his problem, next
      [{ eyes: "blink" }, 260],
      [{ eyes: "half" }, 1800], [{ eyes: "blink" }, 320], [{ eyes: "half" }, 1200],
      [{ eyes: "boredL" }, 900], [{ eyes: "half" }, 600] ] },
  };

  const timers = new WeakMap();
  const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  function set(svg, state) {
    clearTimeout(timers.get(svg));
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("shape-rendering", "crispEdges");
    svg.dataset.state = state;
    const { frames, loop, loopFrom = 0 } = STATES[state];
    if (still) return draw(svg, compose(frames[loop ? loopFrom : frames.length - 1][0]));
    let i = 0;
    (function tick() {
      const [frame, ms] = frames[i];
      draw(svg, compose(frame));
      i++;
      if (i >= frames.length) { if (!loop) return; i = loopFrom; }
      timers.set(svg, setTimeout(tick, ms));
    })();
  }

  return { set, compose, STATES, W, H, PAL };
})();
