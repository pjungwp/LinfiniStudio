/* L'Infini Studio character animation: blinking, breathing and mild expressions from a single portrait.
   Runs entirely on the device.

   Face Mesh (MediaPipe, Apache-2.0, self-hosted in vendor/facemesh) finds 478 face points. Expressions bend a fine mesh
   around a few points (mouth corners, brows, cheeks). A blink bends the upper lid down (reaching past the outer corner), carrying its real lashes, in two
   stages (half-closed, closed). If a real expression image exists for an emotion, it is cross-faded in instead.

   const a = AvatarAnim.create(canvas, img, { expressions: { concerned: "url" } });
   await a.ready;                      // true when a face was found
   a.update({ emotion: "concerned", intensity: 0.6, speaking: true });   // the plan's renderer message
   a.update({ mouth: 0.7 });           // how open the mouth is right now, 0–1 (e.g. from voice loudness); eased on the device
   a.setLips("off" | "still" | "animated");   // talking mouth (talking-mouth.js, the approved subtle recipe): disabled; held open while
                                              // she talks; rest → intermediate → open cycling with her speech. Needs expressions.talk_small
                                              // (tiny opening) and/or expressions.talk (larger); without them a small drawn opening is used.
   opts.talkMix (0–1): how much of the larger opening her open state uses (default 0.25, the approved recipe); for a tiny opening that barely shows.
   a.setTalk({ strength, speed, restOnPause });   a.say(text) → Promise (word-timed, silent; onWord(word) in opts)   a.stopSay()
   expressions.calm (optional): her neutral face without the smile, shown while she talks in a neutral mood.
   a.stop();

   Lips: no extra art. The lower lip and jaw are bent down below the inner line of the upper lip, and the gap is
   painted as a dark mouth with a hint of upper teeth. It suits small talking movements, not wide shapes.
*/
(() => {
  "use strict";
  const EMOTIONS = ["neutral", "concerned", "guarded", "distressed", "relieved"];
  const ALIAS = { worried: "concerned", anxious: "concerned", tearful: "distressed", sad: "distressed", warm: "relieved", happy: "relieved" };
  const norm = (e) => (EMOTIONS.includes(e) ? e : ALIAS[e] || "neutral");
  // [point, out, up, spread] in face heights; "out" is away from the face's midline, "up" toward the forehead.
  const EXPR = {
    neutral: [],
    relieved: [[61, .008, .016, .05], [291, .008, .016, .05], [0, 0, .003, .04], [50, 0, .007, .07], [280, 0, .007, .07], [145, 0, .004, .025], [374, 0, .004, .025]],
    concerned: [[107, -.006, .018, .045], [336, -.006, .018, .045], [66, 0, .008, .04], [296, 0, .008, .04], [61, -.003, -.006, .05], [291, -.003, -.006, .05]],
    guarded: [[107, -.006, -.010, .045], [336, -.006, -.010, .045], [61, -.004, -.002, .045], [291, -.004, -.002, .045], [0, 0, -.002, .035], [17, 0, .003, .035]],
    distressed: [[107, -.005, .022, .045], [336, -.005, .022, .045], [70, 0, -.004, .04], [300, 0, -.004, .04], [61, 0, -.012, .05], [291, 0, -.012, .05], [17, 0, .002, .035]],
  };
  const GAIN = 3.0;   // at intensity 1 and strength 1 the change is clearly visible, still natural
  const UP_L = [33, 246, 161, 160, 159, 158, 157, 173, 133], LO_L = [33, 7, 163, 144, 145, 153, 154, 155, 133];
  const LIP_UI = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308], LIP_LI = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308];
  const UP_R = [263, 466, 388, 387, 386, 385, 384, 398, 362], LO_R = [263, 249, 390, 373, 374, 380, 381, 382, 362];
  const base = (() => { const s = document.currentScript?.src; return s ? s.slice(0, s.lastIndexOf("/") + 1) : ""; })();

  /* ---------- face finder: loaded once, one image at a time ---------- */
  let fm = null, fmReady = null, queue = Promise.resolve();
  const cache = new Map();
  function loadFM() {
    if (fmReady) return fmReady;
    fmReady = new Promise((ok, no) => {
      const s = document.createElement("script"); s.src = base + "vendor/facemesh/face_mesh.js";
      s.onload = () => { try {
        fm = new FaceMesh({ locateFile: (f) => base + "vendor/facemesh/" + f });
        fm.setOptions({ maxNumFaces: 1, refineLandmarks: true, staticImageMode: true, minDetectionConfidence: 0.4 });
        fm.initialize().then(() => ok(fm), no);
      } catch (e) { no(e); } };
      s.onerror = () => no(new Error("The face finder could not load."));
      document.head.append(s);
    });
    fmReady.catch(() => { fmReady = null; });
    return fmReady;
  }
  function findFace(img) {
    const key = img.currentSrc || img.src;
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    const run = async () => {
      if (cache.has(key)) return cache.get(key);
      const f = await loadFM(), W = img.naturalWidth, H = img.naturalHeight;
      const once = (src) => new Promise((ok, no) => { f.onResults(ok); f.send({ image: src }).catch(no); }).then((res) => res.multiFaceLandmarks && res.multiFaceLandmarks[0]);
      let L = await once(img);
      for (const side of [640, 384]) {          // some phones find nothing in a large picture: try smaller copies
        if (L) break; const k = Math.min(1, side / Math.max(W, H)), cv = document.createElement("canvas");
        cv.width = Math.round(W * k); cv.height = Math.round(H * k); cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height); L = await once(cv);
      }
      const pts = L ? L.map((q) => [q.x * W, q.y * H]) : null;
      if (pts) cache.set(key, pts); return pts;
    };
    const p = queue.catch(() => {}).then(run); queue = p; return p;
  }
  // Face points found ahead of time and shipped next to a portrait (cast/F01/points.json), so a phone need not find the face itself.
  async function storedPoints(img, url) {
    const re = /neutral\.(jpe?g|png|webp)(\?.*)?$/i, src = url || (re.test(img.src) ? img.src.replace(re, "points.json") : "");
    if (!src) return null;
    try { const r = await fetch(src, { cache: "force-cache" }); if (!r.ok) return null; const j = await r.json();
      return Array.isArray(j.points) && j.points.length >= 468 ? j.points.map(([x, y]) => [x * img.naturalWidth, y * img.naturalHeight]) : null; } catch { return null; }
  }
  const loadImg = (url) => new Promise((ok, no) => { const i = new Image(); i.decoding = "async"; i.onload = () => ok(i); i.onerror = () => no(new Error("Image did not load: " + url)); i.src = url; });

  /* ---------- geometry ---------- */
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], len = (v) => Math.hypot(v[0], v[1]), nrm = (v) => { const l = len(v) || 1; return [v[0] / l, v[1] / l]; };
  function tri(x, s0, s1, s2, d0, d1, d2, img, ox = 0, oy = 0) {   // affine-map a source triangle onto a destination triangle
    const den = (s1[0] - s0[0]) * (s2[1] - s0[1]) - (s2[0] - s0[0]) * (s1[1] - s0[1]); if (Math.abs(den) < 1e-6) return;
    const a = ((d1[0] - d0[0]) * (s2[1] - s0[1]) - (d2[0] - d0[0]) * (s1[1] - s0[1])) / den, b = ((d1[1] - d0[1]) * (s2[1] - s0[1]) - (d2[1] - d0[1]) * (s1[1] - s0[1])) / den;
    const c = ((d2[0] - d0[0]) * (s1[0] - s0[0]) - (d1[0] - d0[0]) * (s2[0] - s0[0])) / den, d = ((d2[1] - d0[1]) * (s1[0] - s0[0]) - (d1[1] - d0[1]) * (s2[0] - s0[0])) / den;
    const e = d0[0] - a * s0[0] - c * s0[1], f = d0[1] - b * s0[0] - d * s0[1];
    const cx = (d0[0] + d1[0] + d2[0]) / 3, cy = (d0[1] + d1[1] + d2[1]) / 3, g = (p) => [p[0] + (p[0] - cx) * .04 + Math.sign(p[0] - cx) * .4, p[1] + (p[1] - cy) * .04 + Math.sign(p[1] - cy) * .4];
    const [e0, e1, e2] = [g(d0), g(d1), g(d2)];
    x.save(); x.setTransform(1, 0, 0, 1, -ox, -oy); x.beginPath(); x.moveTo(e0[0], e0[1]); x.lineTo(e1[0], e1[1]); x.lineTo(e2[0], e2[1]); x.closePath(); x.clip();
    x.setTransform(a, b, c, d, e - ox, f - oy); x.drawImage(img, 0, 0); x.restore();
  }

  // A "face" is one source image prepared for animation: scaled canvas, points, axes and lid colours.
  function prepFace(img, rawPts, maxSide) {
    const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight)), W = Math.round(img.naturalWidth * k), H = Math.round(img.naturalHeight * k);
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H; cv.getContext("2d").drawImage(img, 0, 0, W, H);
    const F = { canvas: cv, W, H, pts: rawPts ? rawPts.map(([x, y]) => [x * k, y * k]) : null };
    if (!F.pts) return F;
    const P = F.pts; F.fh = len(sub(P[10], P[152])); F.upv = nrm(sub(P[10], P[152])); F.right = nrm(sub(P[454], P[234])); F.mid = P[168];
    const x = cv.getContext("2d", { willReadFrequently: true });
    const avg = (pt, r) => { const d = x.getImageData(Math.round(pt[0] - r), Math.round(pt[1] - r), 2 * r + 1, 2 * r + 1).data; const s = [0, 0, 0]; let n = 0; for (let i = 0; i < d.length; i += 4) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; n++; } return s.map((v) => v / n); };
    F.eyes = [[UP_L, LO_L, 52], [UP_R, LO_R, 282]].map(([up, lo, brow]) => {
      const top = P[up[4]], eh = Math.max(len(sub(top, P[lo[4]])), F.fh * .02), bk = len(sub(P[brow], top)) / eh;
      let dark = [255, 255, 255]; for (const i of up.slice(2, 7)) { const c = avg(P[i], 1); if (c[0] + c[1] + c[2] < dark[0] + dark[1] + dark[2]) dark = c; }
      const sam = [];   // lid skin colour: the lighter pixels between lashes and brow (lashes, liner and shadow are the darker ones)
      for (const i of up.slice(2, 7)) for (let f = .35; f <= .8; f += .05) sam.push(avg([P[i][0] + F.upv[0] * eh * bk * f, P[i][1] + F.upv[1] * eh * bk * f], 1));
      sam.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
      const keep = sam.slice(Math.floor(sam.length * .7), Math.floor(sam.length * .97)), lid = [0, 1, 2].map((c) => keep.reduce((s, v) => s + v[c], 0) / keep.length);
      return { up, lo, eh, bk, dark, lid };
    });
    return F;
  }

  // Talking defaults: 100% movement and 1× speed mean these values (approved on the cast preview, Nov 2026).
  const TALK_BASE = { strength: 1.05, speed: 1.55 };
  const clampT = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(+v) ? +v : 1));
  function create(canvas, img, opts = {}) {
    const S = { on: true, raf: 0, emotion: "neutral", intensity: 0, cur: {}, strength: 1, blink: opts.blink !== false, breathe: opts.breathe !== false, sway: !!opts.sway, swayAmt: 0,
      blinkT0: -1, nextBlink: performance.now() + 900, dbl: 0, lastKey: "", status: "Finding the face…", faces: {}, face: null, prev: null, fadeT0: 0, warp: document.createElement("canvas"), lidC: null, lidT: null,
      mouth: 0, mouthCur: 0, env: 0, lastVoice: 0, lips: lipMode(opts.lips),
      mstate: 0, strength: 1, tstr: clampT(opts.strength ?? 1, 0, 1.5) * TALK_BASE.strength, speed: clampT(opts.speed ?? 1, .5, 2) * TALK_BASE.speed, restOnPause: opts.restOnPause !== false, saying: false };
    const maxSide = opts.maxSide || 1400, ctx = canvas.getContext("2d");
    const ready = (async () => {
      let pts = opts.points === false ? null : await storedPoints(img, opts.points);
      if (!pts) try { pts = await findFace(img); } catch (e) { S.status = "The face finder did not start in this browser."; }
      if (!S.on) return false;
      S.faces.neutral = S.face = prepFace(img, pts, maxSide);
      canvas.width = S.face.W; canvas.height = S.face.H; S.warp.width = S.face.W; S.warp.height = S.face.H;
      if (!pts) { if (!/did not start/.test(S.status)) S.status = "No face found. Use a front-facing portrait with the whole face visible."; ctx.drawImage(S.face.canvas, 0, 0); return false; }
      S.status = "Face found."; S.raf = requestAnimationFrame(frame);
      S.talkImgs = {};                           // talking recipe pictures: talk_small / talk (calm face, tiny and larger opening), and talk_small_<mood> / talk_<mood> for a mood's own pair
      for (const k of Object.keys(opts.expressions || {}).filter((k) => /^talk(_small)?(_[a-z]+)?$/.test(k))) loadImg(opts.expressions[k]).then((im) => { S.talkImgs[k] = im; S.openPatch = null; }).catch(() => {});
      (async () => { for (const k of ["calm", "concerned", "guarded", "distressed", "relieved"]) if (opts.expressions?.[k] && S.on) await loadFace(k); })();   // all her pictures ready before they are needed, one at a time
      return true;
    })();

    const disp = (v, C) => { let dx = 0, dy = 0; for (const c of C) { const ex = v[0] - c.p[0], ey = v[1] - c.p[1], w = Math.exp(-(ex * ex + ey * ey) / (2 * c.s * c.s)); dx += c.d[0] * w; dy += c.d[1] * w; } return [dx, dy]; };
    function ctrl(F) {                         // the current blend of expressions as point displacements (warped faces only)
      if (F !== S.faces.neutral || !F.pts) return [];
      const out = [];
      for (const [name, w] of Object.entries(S.cur)) if (w > 0.001) for (const [i, o, u, s] of EXPR[name]) {
        const p = F.pts[i], side = Math.sign((p[0] - F.mid[0]) * F.right[0] + (p[1] - F.mid[1]) * F.right[1]) || 1, f = F.fh * w * GAIN * S.strength;
        out.push({ p, s: s * F.fh, d: [F.right[0] * o * side * f + F.upv[0] * u * f, F.right[1] * o * side * f + F.upv[1] * u * f] });
      }
      return out;
    }
    function renderWarp(F, C, into) {
      const x = into.getContext("2d"), W = F.W, H = F.H; x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H); x.drawImage(F.canvas, 0, 0);
      if (!C.length) return;
      let x0 = W, y0 = H, x1 = 0, y1 = 0; for (const [a, b] of F.pts) { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, a); y1 = Math.max(y1, b); }
      const px = (x1 - x0) * .12, py = (y1 - y0) * .12; x0 = Math.max(0, x0 - px); y0 = Math.max(0, y0 - py); x1 = Math.min(W, x1 + px); y1 = Math.min(H, y1 + py);
      const N = 34, gx = (x1 - x0) / N, gy = (y1 - y0) / N, src = [], dst = [];
      for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
        const v = [x0 + i * gx, y0 + j * gy], edge = Math.min(i, j, N - i, N - j) / 3, d = edge >= 1 ? disp(v, C) : edge > 0 ? disp(v, C).map((q) => q * edge) : [0, 0];
        src.push(v); dst.push([v[0] + d[0], v[1] + d[1]]);
      }
      const at = (i, j) => j * (N + 1) + i;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const q = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
        if (!q.some((k) => Math.abs(dst[k][0] - src[k][0]) + Math.abs(dst[k][1] - src[k][1]) > 0.08)) continue;
        tri(x, src[q[0]], src[q[1]], src[q[2]], dst[q[0]], dst[q[1]], dst[q[2]], F.canvas);
        tri(x, src[q[0]], src[q[2]], src[q[3]], dst[q[0]], dst[q[2]], dst[q[3]], F.canvas);
      }
    }
    function drawLids(x, t, F, C, srcCanvas) {   // t: 0 open, .5 half, 1 closed
      if (t <= 0.01 || !F.pts) return;
      const shut = t >= .99;
      for (const E of F.eyes) {
        const mv = (i) => { const p = F.pts[i], d = C.length ? disp(p, C) : [0, 0]; return [p[0] + d[0], p[1] + d[1]]; };
        const U = E.up.map(mv), L = E.lo.map(mv), uv = F.upv, eh = E.eh;
        const at = (p, k) => [p[0] + uv[0] * eh * k, p[1] + uv[1] * eh * k], add = (p, v, k) => [p[0] + v[0] * k, p[1] + v[1] * k];
        {                                            // reach past the outer corner (index 0), so flared outer lashes fold with the lid instead of staying open
          const ow = len(sub(U[0], U[U.length - 1])), ext = at(add(U[0], nrm(sub(U[0], U[U.length - 1])), ow * .16), .3);
          U.unshift(ext); L.unshift(ext);
        }
        const n = U.length - 1, m = Math.round(n / 2);
        const drop = U.map((u, i) => { const r = i === 0 || i === n ? u : at(L[i], -.04); return [r[0] - u[0], r[1] - u[1]]; });
        const k1 = Math.min(.95, E.bk * .8), k2 = Math.min(.62, k1 - .22), k0 = Math.max(k1 + .25, Math.min(1.35, E.bk * 1.1));
        const S0 = U.map((u) => at(u, k0)), S1 = U.map((u) => at(u, k1)), S2 = U.map((u) => at(u, k2)), S3 = U;   // S2–S3 holds the lashes, S1–S2 bare lid skin
        const D3 = U.map((u, i) => add(u, drop[i], t)), D1 = S1;                                                  // the crease and brow stay put
        const D2 = shut ? D3.map((p) => at(p, -.3)) : S2.map((p, i) => add(p, drop[i], t)), skinBot = shut ? D3 : D2;
        const all = [...S0, ...D3, ...D2, ...L], pad = 6;
        const bx = Math.floor(Math.min(...all.map((q) => q[0]))) - pad, by = Math.floor(Math.min(...all.map((q) => q[1]))) - pad;
        const bw = Math.ceil(Math.max(...all.map((q) => q[0]))) + pad - bx, bh = Math.ceil(Math.max(...all.map((q) => q[1]))) + pad - by;
        const o = S.lidC || (S.lidC = document.createElement("canvas")); o.width = bw; o.height = bh; const y = o.getContext("2d");
        const band = (sa, sb, da, db) => { for (let i = 0; i < n; i++) { tri(y, sa[i], sa[i + 1], sb[i + 1], da[i], da[i + 1], db[i + 1], srcCanvas, bx, by); tri(y, sa[i], sb[i + 1], sb[i], da[i], db[i + 1], db[i], srcCanvas, bx, by); } };
        const [r, g, b] = E.lid;                     // lid skin: its own colour, rounded over the eyeball, a trace of real texture
        const lg = y.createLinearGradient(...D1[m], ...skinBot[m]); lg.addColorStop(0, `rgba(${r | 0},${g | 0},${b | 0},0)`); lg.addColorStop(.22, `rgba(${r | 0},${g | 0},${b | 0},1)`); lg.addColorStop(.7, `rgb(${r * .98 | 0},${g * .96 | 0},${b * .95 | 0})`); lg.addColorStop(1, `rgb(${r * .82 | 0},${g * .74 | 0},${b * .72 | 0})`);
        band(S1, S2, D1, skinBot);                   // her own lid skin, stretched: real colour, crease shading and texture
        y.save(); y.translate(-bx, -by); y.beginPath(); D1.forEach((q, i) => (i ? y.lineTo(q[0], q[1]) : y.moveTo(q[0], q[1]))); for (let i = n; i >= 0; i--) y.lineTo(skinBot[i][0], skinBot[i][1]); y.closePath();
        y.globalAlpha = .15; y.fillStyle = lg; y.fill(); y.globalAlpha = 1;   // a light wash of her lid colour evens out the stretch
        const c = [(U[m][0] + skinBot[m][0]) / 2, (U[m][1] + skinBot[m][1]) / 2], w = len(sub(U[0], U[n])) * .5;
        const rg = y.createRadialGradient(c[0], c[1] - eh * .2, 0, c[0], c[1], w); rg.addColorStop(0, "rgba(255,240,230,.08)"); rg.addColorStop(.75, "rgba(255,240,230,0)"); rg.addColorStop(1, "rgba(70,35,25,.06)");
        y.clip(); y.fillStyle = rg; y.fillRect(bx, by, bw, bh); y.restore();
        if (shut) {                                  // a soft fold of shadow along the closed lid
          y.save(); y.translate(-bx, -by); y.beginPath(); D1.forEach((q, i) => (i ? y.lineTo(q[0], q[1]) : y.moveTo(q[0], q[1]))); for (let i = n; i >= 0; i--) y.lineTo(D3[i][0], D3[i][1]); y.closePath(); y.clip();
          const sg = y.createLinearGradient(...D1[m], ...D3[m]); sg.addColorStop(0, "rgba(60,30,20,0)"); sg.addColorStop(.75, "rgba(60,30,20,.05)"); sg.addColorStop(1, "rgba(60,30,20,.2)");
          y.fillStyle = sg; y.fillRect(bx, by, bw, bh); y.restore();
        }
        if (t > .3) {                                // soften the stretched skin so it shows no streaks; lashes stay sharp
          const tmp = S.lidT || (S.lidT = document.createElement("canvas")); tmp.width = bw; tmp.height = bh; const z = tmp.getContext("2d");
          z.filter = `blur(${Math.max(.8, eh * .05).toFixed(1)}px)`; z.drawImage(o, 0, 0); y.clearRect(0, 0, bw, bh);
          const R = F.right, sm = eh * .3 * Math.min(1, (t - .3) / .5), N = 7;   // and smear across the eye, so the stretch leaves no streaks
          for (let k = 0; k < N; k++) { const f = (k / (N - 1) - .5) * 2 * sm; y.globalAlpha = 1 / (k + 1); y.drawImage(tmp, R[0] * f, R[1] * f); }
          y.globalAlpha = 1;
        }
        band(S0, S1, S0, D1);                        // skin up to the brow, sharp
        band(S2, S3, D2, D3);                        // the real lashes, moved (and flipped when shut)
        const fe = Math.max(4, eh * .35);            // feather the outer edge into the face
        y.globalCompositeOperation = "destination-in"; y.save(); y.translate(-bx, -by); y.filter = `blur(${(fe / 2.5).toFixed(1)}px)`;
        y.beginPath(); S0.forEach((q, i) => (i ? y.lineTo(q[0], q[1]) : y.moveTo(q[0], q[1])));
        for (let i = n; i >= 0; i--) { const q = shut ? D2[i] : D3[i]; y.lineTo(q[0], q[1] + (shut ? 2 : 0)); }
        y.closePath(); y.fillStyle = "#000"; y.fill(); y.restore(); y.globalCompositeOperation = "source-over";
        x.drawImage(o, bx, by);
      }
    }
    // The open state from the approved recipe, built once per size; drawn over the portrait with alpha = state × strength.
    function openPatch(F, W, H) {
      const TM = window.TalkingMouth, T = S.talkImgs || {}; if (!TM || !F.pts) return null;
      // her mood's own pair when she has one (drawn over that mood's face); otherwise the calm pair
      const E = shown(), own = E !== "neutral" && F !== S.faces.neutral && (T["talk_small_" + E] || T["talk_" + E]);
      const tk = own ? "talk_small_" + E : "talk_small", lk = own ? "talk_" + E : "talk";
      if (!T[tk] && !T[lk]) return null;
      const box = opts.mouthBox || TM.boxFromPoints(F.pts, W), mix = Math.min(1, (Number.isFinite(+opts.talkMix) && opts.talkMix !== null ? +opts.talkMix : 0.25) + Math.max(0, S.tstr - 1) * 0.5);   // her own share of the larger opening (talkMix), more when stronger than 1
      const key = [W, H, box.join(), mix, tk, !!T[tk], !!T[lk], F.W].join("|");
      if (!S.openPatch || S.openPatch.key !== key || S.openPatch.face !== F) { S.openPatch = TM.buildOpen({ rest: F.img || F.canvas || img, tiny: T[tk], large: T[lk] || T[tk], box, largeMix: mix }, W, H); S.openPatch.key = key; S.openPatch.face = F; }
      return S.openPatch;
    }
    function liveDriver() { return (S.live ||= window.TalkingMouth ? window.TalkingMouth.live((a) => (S.mstate = a), { speed: S.speed, restOnPause: S.restOnPause }) : { voice: (on) => (S.mstate = on ? 1 : 0), stop() {}, setSpeed() {}, setRestOnPause() {} }); }
    function lipMode(v) { return v === "still" || v === "steady" || v === "picture" ? "still" : v === "animated" || v === "soft" ? "animated" : !v || v === "off" || v === "0" || +v === 0 ? "off" : "animated"; }   // older settings carry over
    function mouthGeo(F) {                      // the lip lines in face coordinates (u across, h down), measured once per face
      if (F.mg !== undefined) return F.mg;
      const P = F.pts, c = P[13], dn = [-F.upv[0], -F.upv[1]], R = F.right;
      const U = (v) => (v[0] - c[0]) * R[0] + (v[1] - c[1]) * R[1], Hh = (v) => (v[0] - c[0]) * dn[0] + (v[1] - c[1]) * dn[1];
      const up = LIP_UI.map((i) => [U(P[i]), Hh(P[i])]).sort((a, b) => a[0] - b[0]);
      const uL = up[0][0], uR = up[up.length - 1][0], hw = (uR - uL) / 2;
      if (!(hw > F.fh * .03)) return (F.mg = null);
      return (F.mg = { c, dn, R, up, uL, uR, uc: (uL + uR) / 2, hw, hLow: Hh(P[17]), hEnd: Hh(P[152]) + F.fh * .12, top: Math.min(...up.map((q) => q[1])) - F.fh * .07 });
    }
    function drawMouth(x, F, src, m, teeth = true) {          // m: 0 closed … 1 open as far as the lips setting allows
      const G = F.pts && mouthGeo(F); if (!G) return;
      const d = F.fh * .055 * m; if (d < .4) return;
      const { c, dn, R, up, uc, hw } = G, at = (u, h) => [c[0] + R[0] * u + dn[0] * h, c[1] + R[1] * u + dn[1] * h];
      const hU = (u) => { if (u <= up[0][0]) return up[0][1]; for (let i = 1; i < up.length; i++) if (u <= up[i][0]) { const a = up[i - 1], b = up[i], t = (u - a[0]) / ((b[0] - a[0]) || 1); return a[1] + (b[1] - a[1]) * t; } return up[up.length - 1][1]; };
      const g = (u) => { const q = 1 - ((u - uc) / (hw * 1.15)) ** 2; return q > 0 ? q ** 1.2 : 0; };   // how far each part opens: most in the middle, none past the corners
      const fall = (h) => (h <= G.hLow ? 1 : h >= G.hEnd ? 0 : 1 - (h - G.hLow) / (G.hEnd - G.hLow));
      const NU = 18, u0 = uc - hw * 1.7, u1 = uc + hw * 1.7, eps = F.fh * .004;
      const cols = Array.from({ length: NU + 1 }, (_, i) => u0 + (u1 - u0) * i / NU);
      const rows = [G.top, null, null, 0, eps]; for (let k = 1; k <= 9; k++) rows.push(eps + (G.hEnd - eps) * k / 9);   // rows follow the upper lip's curve
      const src2 = [], dst2 = [];
      for (const u of cols) {
        const base = hU(u), cs = [], cd = [];
        rows.forEach((r, k) => {
          let h; if (k === 0) h = r; else if (k === 1) h = base - F.fh * .035; else if (k === 2) h = base - F.fh * .012; else if (k === 3) h = base; else if (k === 4) h = base + eps; else h = Math.max(base + eps * 2, r);
          const below = k >= 4, sh = below ? d * g(u) * fall(h) : 0, p = at(u, h);
          cs.push(p); cd.push([p[0] + dn[0] * sh, p[1] + dn[1] * sh]);
        });
        src2.push(cs); dst2.push(cd);
      }
      for (let i = 0; i < NU; i++) for (let k = 0; k < rows.length - 1; k++) {
        if (k < 3) continue;                     // above the lip line nothing moves
        const a = src2[i][k], b = src2[i + 1][k], cc = src2[i + 1][k + 1], e = src2[i][k + 1], A = dst2[i][k], B = dst2[i + 1][k], C = dst2[i + 1][k + 1], E = dst2[i][k + 1];
        tri(x, a, b, cc, A, B, C, src); tri(x, a, cc, e, A, C, E, src);
      }
      // the opening: from the upper inner lip down to the moved lower inner lip
      const P = F.pts, top = LIP_UI.map((i) => P[i]), low = LIP_LI.map((i) => { const p = P[i], u = (p[0] - c[0]) * R[0] + (p[1] - c[1]) * R[1], sh = d * g(u); return [p[0] + dn[0] * sh, p[1] + dn[1] * sh]; });
      x.save(); x.beginPath(); top.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); for (let i = low.length - 1; i >= 0; i--) x.lineTo(low[i][0], low[i][1]); x.closePath(); x.clip();
      const mc = at(uc, 0), gr = x.createLinearGradient(mc[0], mc[1], mc[0] + dn[0] * (d + 2), mc[1] + dn[1] * (d + 2));
      gr.addColorStop(0, "#1c0a0c"); gr.addColorStop(1, "#4a1c22"); x.fillStyle = gr; x.fillRect(mc[0] - hw * 3, mc[1] - hw * 3, hw * 6, hw * 6);
      const th = teeth && d > F.fh * .012 ? Math.min(d * .26, F.fh * .009) : 0;   // a hint of upper teeth just under the upper lip
      if (th > .6) {
        x.beginPath(); top.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])));
        for (let i = top.length - 1; i >= 0; i--) { const p = top[i], u = (p[0] - c[0]) * R[0] + (p[1] - c[1]) * R[1], t = th * Math.min(1, g(u) * 1.3); x.lineTo(p[0] + dn[0] * t, p[1] + dn[1] * t); }
        x.closePath(); const tg = x.createLinearGradient(mc[0], mc[1], mc[0] + dn[0] * th, mc[1] + dn[1] * th); tg.addColorStop(0, "rgba(214,204,190,.72)"); tg.addColorStop(1, "rgba(170,156,142,.55)"); x.fillStyle = tg; x.fill();
      }
      x.lineWidth = Math.max(1, F.fh * .006); x.strokeStyle = "rgba(20,6,8,.18)"; x.beginPath(); top.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.stroke();
      x.restore();
    }
    function blinkAmount(now) {                  // two stages, like a drawn blink: half-closed, closed, half-closed, open
      if (S.blinkT0 < 0) return 0; const e = now - S.blinkT0;
      if (e < 45) return .55; if (e < 135) return 1; if (e < 185) return .55;   // closed held long enough that a slow frame can't skip it
      S.blinkT0 = -1; return 0;
    }
    function frame(now) {
      if (!S.on) return;
      const SE = shown(); for (const k of Object.keys(EXPR)) { const goal = k === SE ? S.intensity : 0, v = S.cur[k] || 0; S.cur[k] = Math.abs(goal - v) < 0.004 ? goal : v + (goal - v) * 0.09; }
      const F = S.face, C = ctrl(F), key = (F === S.faces.neutral ? Object.values(S.cur).map((v) => v.toFixed(3)).join() : SE) + "|" + S.strength;
      if (key !== S.lastKey) { renderWarp(F, C, S.warp); S.lastKey = key; }
      if (S.blink && S.blinkT0 < 0 && now > S.nextBlink) { S.blinkT0 = now; S.nextBlink = now + 2600 + Math.random() * 3600; if (Math.random() < .15) S.dbl = now + 260; }
      if (S.dbl && now > S.dbl && S.blinkT0 < 0) { S.blinkT0 = now; S.dbl = 0; }
      const W = canvas.width, H = canvas.height, br = S.breathe ? Math.sin(now / 1000 * 2 * Math.PI / 4.2) : 0, s = 1 + br * .004, dy = -br * H * .0025;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
      // Dressing-room sway (opts.sway): a slow, slight drift of the head and shoulders, pivoting at the bottom of the frame,
      // eased in and out; slightly enlarged so the edges never show.
      S.swayAmt += ((S.sway ? 1 : 0) - S.swayAmt) * 0.02;
      if (S.swayAmt > 0.001) {
        const t = now / 1000, k = S.swayAmt, TAU = 2 * Math.PI;
        const rot = k * (Math.sin(t * TAU / 11) * .55 + Math.sin(t * TAU / 6.7 + 1.3) * .2) * Math.PI / 180;
        const dx = k * (Math.sin(t * TAU / 13 + 2) * .45 + Math.sin(t * TAU / 7.9) * .15) * W / 100, sc = s * (1 + .02 * k);
        ctx.translate(W / 2 + dx, H + dy); ctx.rotate(rot); ctx.scale(sc, sc); ctx.translate(-W / 2, -H);
      } else ctx.setTransform(s, 0, 0, s, W * (1 - s) / 2, H * (1 - s) + dy);
      if (S.prev && now - S.fadeT0 < 350) { ctx.globalAlpha = 1; ctx.drawImage(S.prev, 0, 0, W, H); ctx.globalAlpha = (now - S.fadeT0) / 350; }
      ctx.drawImage(S.warp, 0, 0, W, H); ctx.globalAlpha = 1;
      // Talking mouth: discrete rest / intermediate / open states (talking-mouth.js). A scripted line (say) sets them by word;
      // otherwise her speech activity does: Still holds the open state while she talks, Animated cycles the per-word pattern.
      const nowT = performance.now(), on = S.lips !== "off" && S.speaking !== false;
      if (on && S.mouth > .08) S.lastVoice = nowT;
      const active = S.lips === "animated" ? on && S.mouth > .08 : on && nowT - S.lastVoice < 150;   // Animated: the raw voice signal; the driver bridges gaps between words itself
      if (!S.saying) {
        if (S.lips === "animated") { liveDriver().voice(active); }
        else S.mstate = S.lips === "still" && on ? (active ? 1 : S.restOnPause ? 0 : 1) : 0;
      }
      const st = S.lips === "off" ? 0 : S.saying && S.lips === "still" ? (S.inPause ? (S.restOnPause ? 0 : 1) : 1) : S.mstate;   // Still holds open through a clause
      if (st > 0) {
        const patch = openPatch(F, W, H);
        if (patch) { ctx.globalAlpha = Math.min(1, st * Math.min(1, S.tstr)); ctx.drawImage(patch, 0, 0, W, H); ctx.globalAlpha = 1; }
        else {                                   // no talking pictures: a small drawn opening with the same states
          const mc = S.mouthC || (S.mouthC = document.createElement("canvas")); if (mc.width !== W || mc.height !== H) { mc.width = W; mc.height = H; }
          const mx = mc.getContext("2d"); mx.setTransform(1, 0, 0, 1, 0, 0); mx.clearRect(0, 0, W, H); drawMouth(mx, F, S.warp, .3 * st * S.tstr, false); ctx.drawImage(mc, 0, 0, W, H);
        }
      }
      drawLids(ctx, blinkAmount(now), F, C, S.warp);
      S.raf = requestAnimationFrame(frame);
    }
    function loadFace(key) {                     // a real expression image, prepared once (the promise is kept so two calls share it)
      if (S.loads?.[key]) return S.loads[key];
      S.loads = S.loads || {};
      return (S.loads[key] = (async () => {
        try { const im = await loadImg(opts.expressions[key]); const p = await findFace(im).catch(() => null); let F = prepFace(im, p || null, maxSide); if (!F.pts) F = { ...F, ...pick(S.faces.neutral) }; return (S.faces[key] = F); }
        catch { return (S.faces[key] = S.faces.neutral); }                                    // missing frame: fall back to neutral
      })());
    }
    async function useFace(emotion) {            // a real expression image if there is one, otherwise the warped neutral portrait
      if (emotion === "neutral" && S.talk && opts.expressions?.calm) emotion = "calm";   // talking in a neutral mood: the no-smile face, if she has one
      const tok = (S.tok = (S.tok || 0) + 1), url = opts.expressions?.[emotion];
      const F = url ? (S.faces[emotion] || await loadFace(emotion)) : S.faces.neutral;
      if (tok !== S.tok) return;                 // a newer change arrived while this picture was loading
      if (F !== S.face) { const snap = document.createElement("canvas"); snap.width = canvas.width; snap.height = canvas.height; snap.getContext("2d").drawImage(S.warp, 0, 0); S.prev = snap; S.fadeT0 = performance.now(); S.face = F; S.lastKey = ""; }
    }
    // While she talks, most moods keep their face and move the mouth (their own talking pair, or the calm pair).
    // A smiling mood (relieved) needs its own pair: without one she talks with her calm face, and the smile returns after she stops.
    const SMILING = ["relieved"];
    function hasTalkPair(e) { const x = opts.expressions || {}; return !!(x["talk_small_" + e] || x["talk_" + e]); }
    function shown() { return S.talk && SMILING.includes(S.emotion) && !hasTalkPair(S.emotion) ? "neutral" : S.emotion; }
    const pick = (F) => ({ pts: F.pts, fh: F.fh, upv: F.upv, right: F.right, mid: F.mid, eyes: F.eyes });   // same framing: borrow the neutral portrait's points

    return {
      ready, emotions: EMOTIONS,
      get status() { return S.status; }, get emotion() { return S.emotion; }, get shownEmotion() { return shown(); },
      update(msg = {}) {                         // { emotion, intensity, speaking }
        if (msg.emotion !== undefined) { S.emotion = norm(msg.emotion); if (S.faces.neutral) useFace(shown()); }
        if (msg.intensity !== undefined) S.intensity = Math.max(0, Math.min(1, +msg.intensity || 0));
        else if (msg.emotion !== undefined) S.intensity = S.emotion === "neutral" ? 0 : 0.6;
        if (msg.speaking !== undefined) {
          S.speaking = !!msg.speaking; clearTimeout(S.talkT);
          if (S.speaking && !S.talk) { S.talk = true; if (S.faces.neutral) useFace(shown()); }
          if (!S.speaking) { S.live?.rest(); if (!S.saying) S.mstate = 0; }   // her voice has ended: the mouth closes now, in step with it
          if (!S.speaking && S.talk) S.talkT = setTimeout(() => { S.talk = false; if (S.faces.neutral) useFace(shown()); }, SMILING.includes(S.emotion) && !hasTalkPair(S.emotion) ? 600 : 1500);   // back to her resting smile after a pause
        }
        if (msg.mouth !== undefined) S.mouth = Math.max(0, Math.min(1, +msg.mouth || 0));
      },
      setTalkMix(v) { opts.talkMix = v === null || v === undefined ? undefined : Math.max(0, Math.min(1, +v || 0)); S.openPatch = null; },
      setLips(v) { S.lips = lipMode(v); if (S.lips !== "animated") S.live?.stop(); },
      setTalk(o = {}) { if (o.strength !== undefined) S.tstr = clampT(o.strength, 0, 1.5) * TALK_BASE.strength; if (o.speed !== undefined) { S.speed = clampT(o.speed, .5, 2) * TALK_BASE.speed; S.live?.setSpeed(S.speed); }
        if (o.restOnPause !== undefined) { S.restOnPause = !!o.restOnPause; S.live?.setRestOnPause(S.restOnPause); } },
      get mouthState() { return S.lips === "off" ? 0 : S.saying && S.lips === "still" ? (S.inPause ? (S.restOnPause ? 0 : 1) : 1) : S.mstate; },
      get talk() { return { strength: +(S.tstr / TALK_BASE.strength).toFixed(3), speed: +(S.speed / TALK_BASE.speed).toFixed(3), actual: { strength: S.tstr, speed: S.speed }, restOnPause: S.restOnPause, pictures: Object.keys(S.talkImgs || {}) }; },
      say(text, o = {}) {                         // a silent, word-timed line with the approved timing
        if (!window.TalkingMouth) return Promise.resolve(false);
        S.player ||= window.TalkingMouth.player((a, w, pause) => { S.mstate = a; S.inPause = pause; S.onWord?.(w); });
        S.onWord = o.onWord; S.saying = true; S.live?.stop(); const id = (S.sayId = (S.sayId || 0) + 1);
        return S.player.play(text, { speed: S.speed, restOnPause: S.restOnPause }).then((done) => { if (S.sayId === id) { S.saying = false; S.mstate = 0; } return done; });   // a stopped line never ends a newer one
      },
      stopSay() { S.player?.stop(); S.saying = false; S.mstate = 0; }, get blinking() { return S.blink; },
      setStrength(v) { S.strength = Math.max(0.2, Math.min(1.6, +v || 1)); },
      setBlink(on) { S.blink = !!on; if (S.blink) S.nextBlink = performance.now() + 400 + Math.random() * 1600; }, setBreathe(on) { S.breathe = !!on; }, setSway(on) { S.sway = !!on; }, get swaying() { return S.sway; },
      blinkNow() { if (S.blinkT0 < 0) S.blinkT0 = performance.now(); },
      snapshot(eyes = 0) {                       // a PNG of the current expression, eyes open (0), half-closed (.5) or closed (1)
        if (!S.face) return null; const c = document.createElement("canvas"); c.width = S.warp.width; c.height = S.warp.height;
        const x = c.getContext("2d"); x.drawImage(S.warp, 0, 0); if (eyes) drawLids(x, eyes, S.face, ctrl(S.face), S.warp); return c.toDataURL("image/png");
      },
      still(emotion, intensity = 0.8, type = "image/jpeg") {   // the automatic expression as a still picture; the live animation is untouched
        const F = S.faces.neutral; if (!F?.pts) return null;
        const keep = S.cur; S.cur = { [norm(emotion)]: Math.max(0, Math.min(1, +intensity || 0)) };
        const c = document.createElement("canvas"); c.width = F.W; c.height = F.H; renderWarp(F, ctrl(F), c);
        S.cur = keep; S.lastKey = ""; return c.toDataURL(type, 0.86);
      },
      stop() { S.on = false; cancelAnimationFrame(S.raf); S.live?.stop(); S.player?.stop(); },
    };
  }
  window.AvatarAnim = { create, findFace, loadFaceFinder: loadFM, EMOTIONS, normalize: norm };
})();
