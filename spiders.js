/* Pixel-art spider avatars, generated as crisp SVG.
   Each spider is drawn on a 28x22 pixel grid: legs (as pixel lines), abdomen, head, markings, eyes.
   Two leg frames give the walk/fidget; CSS swaps them. */
const SPIDERS = (() => {
  const W = 28, H = 22, CX = 14;
  const SPECIES = {
    redback: {
      name: "Redback", blurb: "Small, black, deadly",
      leg: ["#555555", "#555555"], legLen: 1, legStyle: "thin",
      abd: { cy: 13, rx: 5.2, ry: 5.2, c: "#1c1c1c", shine: "#5a5a5a" },
      ceph: { cy: 6.2, rx: 2.6, ry: 2.2, c: "#262626" },
      eyes: "#ffffff",
      mark(px) { // red hourglass down the back
        const rows = { 10: 1, 11: 2, 12: 1, 13: 1, 14: 1, 15: 2, 16: 1 };
        for (const y in rows) for (let x = CX - rows[y]; x < CX + rows[y]; x++) px(x, +y, "#e3262b");
      },
    },
    huntsman: {
      name: "Huntsman", blurb: "Big, hairy, everywhere",
      leg: ["#7a5634", "#c9a46e"], legLen: 1.25, legStyle: "banded",
      abd: { cy: 13.4, rx: 3.6, ry: 4.6, c: "#8a6640", shine: "#b08a5c" },
      ceph: { cy: 6.4, rx: 3.4, ry: 2.8, c: "#9c7850" },
      eyes: "#1a1206",
      mark(px) { // dark chevrons on the abdomen, stripe on the head
        [[11, 0], [13, 1], [15, 2]].forEach(([y, w]) => { px(CX - 1 - w, y, "#5c4126"); px(CX + w, y, "#5c4126"); });
        px(CX - 1, 5, "#6b4c2c"); px(CX, 5, "#6b4c2c"); px(CX - 1, 7, "#6b4c2c"); px(CX, 7, "#6b4c2c");
      },
    },
    peacock: {
      name: "Peacock", blurb: "Tiny, flashy, dances",
      leg: ["#4a4a4a", "#4a4a4a"], legLen: .8, legStyle: "tipped",
      abd: { cy: 13.2, rx: 6.4, ry: 4.4, c: "#2f7bf0", shine: null, fan: true },
      ceph: { cy: 6.6, rx: 2.4, ry: 2.2, c: "#1f1f1f" },
      eyes: "#ffffff",
      mark(px) { // fan bands: blue / red / orange / teal
        const bands = ["#e8453c", "#ff9d2e", "#33c3b0", "#e8453c"];
        for (let y = 10; y <= 17; y++) for (let x = CX - 7; x <= CX + 6; x++) {
          const dx = (x + .5 - CX) / 6.4, dy = (y + .5 - 13.2) / 4.4; const r = dx * dx + dy * dy;
          if (r <= 1) { const b = r > .75 ? 0 : r > .45 ? 1 : r > .2 ? 2 : 3; if (b !== 3 || Math.abs(x + .5 - CX) < 1.5) px(x, y, bands[b]); }
        }
      },
    },
  };
  // leg geometry (right side, relative to hip): knee, foot. Front to back.
  const LEGS = [[[4, -3], [6, -7]], [[5, -1], [10, -3]], [[5, 1], [10, 4]], [[4, 3], [6, 8]]];
  function line(x0, y0, x1, y1, f) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1; let err = dx + dy, i = 0;
    for (;;) { f(x0, y0, i++); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  }
  function frame(sp, f, opts = {}) {
    const g = {};
    const px = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) g[y * W + x] = c; };
    // legs
    for (const s of [-1, 1]) LEGS.forEach(([k, ft], i) => {
      const hip = [CX + (s > 0 ? 1 : -2) + s * 1, 5 + i * 1.2];
      const up = ((i + (s > 0 ? 0 : 1)) % 2 === f) ? -1 : 1;           // alternating gait
      const wig = opts.wave && s > 0 && i === 2 && f ? -4 : 0;          // peacock leg wave
      const L = sp.legLen;
      const kn = [hip[0] + s * k[0] * L, hip[1] + k[1] * L + (up < 0 ? -.6 : .4) + wig * .5];
      const fo = [hip[0] + s * ft[0] * L, hip[1] + ft[1] * L + up + wig];
      const col = (n) => sp.legStyle === "banded" ? sp.leg[Math.floor(n / 2) % 2] : sp.leg[0];
      let n = 0;
      line(hip[0], hip[1], kn[0], kn[1], (x, y) => px(x, y, col(n++)));
      line(kn[0], kn[1], fo[0], fo[1], (x, y, j) => px(x, y, col(n++)));
      if (sp.legStyle === "tipped") px(Math.round(fo[0]), Math.round(fo[1]), "#f3f1e7");
    });
    // abdomen
    const a = sp.abd;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = (x + .5 - CX) / a.rx, dy = (y + .5 - a.cy) / a.ry;
      if (dx * dx + dy * dy <= 1) px(x, y, a.c);
    }
    if (a.shine) { px(CX - 3, Math.round(a.cy) - 3, a.shine); px(CX - 2, Math.round(a.cy) - 3, a.shine); px(CX - 3, Math.round(a.cy) - 2, a.shine); }
    sp.mark(px);
    // head
    const c = sp.ceph;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = (x + .5 - CX) / c.rx, dy = (y + .5 - c.cy) / c.ry;
      if (dx * dx + dy * dy <= 1) px(x, y, c.c);
    }
    // eyes (closed / hurt variants)
    const ey = Math.round(c.cy - c.ry + 1);
    if (opts.hurt) { px(CX - 2, ey, "#ff5247"); px(CX + 1, ey, "#ff5247"); }
    else if (!(opts.blink && f)) { px(CX - 2, ey, sp.eyes); px(CX + 1, ey, sp.eyes); if (sp === SPECIES.peacock) { px(CX - 1, ey, sp.eyes); px(CX, ey, sp.eyes); } }
    return g;
  }
  function toRects(g, cls) {
    // merge horizontal runs of the same colour
    let out = "";
    for (let y = 0; y < H; y++) { let x = 0; while (x < W) { const c = g[y * W + x]; if (!c) { x++; continue; } let e = x; while (e + 1 < W && g[y * W + e + 1] === c) e++; out += `<rect x="${x}" y="${y}" width="${e - x + 1}" height="1" fill="${c}"/>`; x = e + 1; } }
    return `<g class="${cls}">${out}</g>`;
  }
  const cache = {};
  function svg(key, mood = "idle") {
    const sp = SPECIES[key] || SPECIES.redback, k = key + mood;
    if (cache[k]) return cache[k];
    const opts = { hurt: mood === "hurt", wave: key === "peacock" && mood === "win" };
    return cache[k] = `<svg class="spr spr-${mood}" viewBox="0 -1 ${W} ${H + 1}" shape-rendering="crispEdges" aria-label="${sp.name}">${toRects(frame(sp, 0, opts), "f0")}${toRects(frame(sp, 1, opts), "f1")}</svg>`;
  }
  const CSS = `
.spr{display:block;width:100%;height:auto;overflow:visible}
.spr .f1{visibility:hidden}
.spr .f0,.spr .f1{animation:sprf .9s steps(1) infinite}
.spr .f1{animation-name:sprf1}
@keyframes sprf{0%{visibility:visible}50%{visibility:hidden}}
@keyframes sprf1{0%{visibility:hidden}50%{visibility:visible}}
.spr-nervous .f0,.spr-nervous .f1{animation-duration:.22s}
.spr-nervous{animation:sprshake .12s steps(2) infinite}
@keyframes sprshake{0%{transform:translate(-1px,0)}100%{transform:translate(1px,0)}}
.spr-hurt{animation:sprhurt .6s ease-out both}
.spr-hurt .f0,.spr-hurt .f1{animation:none}.spr-hurt .f1{visibility:hidden}
@keyframes sprhurt{0%{transform:translateY(0) rotate(0)}30%{transform:translateY(-6px) rotate(-12deg)}100%{transform:translateY(0) rotate(180deg);opacity:.55}}
.spr-win{animation:sprwin .6s ease-in-out infinite alternate}
.spr-win .f0,.spr-win .f1{animation-duration:.3s}
@keyframes sprwin{from{transform:translateY(0)}to{transform:translateY(-8px)}}
`;
  return { SPECIES, svg, CSS, keys: Object.keys(SPECIES) };
})();
