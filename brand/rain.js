// ASCII rain: faint falling punctuation behind a container. ~1 KB, pauses when off-screen or when
// the visitor prefers reduced motion. Usage: asciiRain(canvasElement, { color: "#4d6a75" })
function asciiRain(canvas, { color = "#4d6a75", glyphs = "'\"|.,:;", size = 13, density = 0.5 } = {}) {
  const ctx = canvas.getContext("2d");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let drops = [], w = 0, h = 0, raf = 0, visible = true;

  function resize() {
    const r = canvas.getBoundingClientRect(), d = devicePixelRatio || 1;
    w = r.width; h = r.height;
    canvas.width = w * d; canvas.height = h * d;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.font = `${size}px "DM Mono", ui-monospace, monospace`;
    const cols = Math.floor(w / (size * 1.4));
    drops = Array.from({ length: Math.round(cols * density) }, () => ({
      x: Math.floor(Math.random() * cols) * size * 1.4 + 4,
      y: Math.random() * h,
      v: 18 + Math.random() * 26,          // px per second: slow drizzle, not a matrix screensaver
      a: 0.1 + Math.random() * 0.22,
      g: glyphs[Math.floor(Math.random() * glyphs.length)],
    }));
  }

  let last = 0;
  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = color;
    for (const d of drops) {
      d.y += d.v * dt;
      if (d.y > h + size) { d.y = -size; d.g = glyphs[Math.floor(Math.random() * glyphs.length)]; }
      ctx.globalAlpha = d.a;
      ctx.fillText(d.g, d.x, d.y);
    }
    if (visible && !still) raf = requestAnimationFrame(frame);
  }

  resize();
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    cancelAnimationFrame(raf);
    if (visible && !still) raf = requestAnimationFrame(frame);
  }).observe(canvas);
  frame(0);
}
