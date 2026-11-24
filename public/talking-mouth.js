/* L'Infini Studio talking mouth: the subtle speaking animation.
   The portrait never moves. Only a small feathered ellipse around the lips changes, between three states:
     rest = the resting portrait · intermediate = 50% open · open = the speech image over the resting portrait.
   Approved recipe, in a 512 × 512 coordinate system:
     speech = 75% tiny-opening picture + 25% larger-opening picture
     mask   = ellipse x 230–298, y 214–247, Gaussian feather 3 px (scaled with the picture)
   Word timing for the demonstration: 700 ms rest; per word 90 intermediate, 150/180/210 open (cycling), 90 intermediate,
   100 rest; words over seven characters add 100 intermediate, 140 open, 90 intermediate; 350 ms rest after a comma;
   1,000 ms rest at the end. Live speech drives the same states from speech activity and pauses, at the same amplitude.

   TalkingMouth.buildOpen({ rest, tiny, large, box, ref, feather, largeMix }, W, H) → canvas: the open state's changed
     region only (transparent elsewhere), to draw over the portrait with globalAlpha = state.
   TalkingMouth.boxFromPoints(points, W) → the mask ellipse box for any face, from its face points, in 512 coordinates.
   TalkingMouth.schedule(text, { speed, restOnPause }) → [{ a: 0 | 0.5 | 1, ms, word, pause? }]   (pause: before, between clauses, after)
   TalkingMouth.player(onState) → { play(text, opts) → Promise, stop() }
   TalkingMouth.live(onState, { speed, slow = 1.65, hold = 150, restOnPause }) → { voice(active), rest(), setRestOnPause(on), setSpeed(s), stop() } */
(() => {
  "use strict";
  const DEFAULTS = { box: [230, 214, 298, 247], ref: 512, feather: 3, largeMix: 0.25 };
  const REST = 0, MID = 0.5, OPEN = 1;

  // erf for the Gaussian edge: a binary ellipse blurred with a Gaussian of sigma s has edge alpha Φ(distance / s)
  const erf = (x) => { const t = 1 / (1 + 0.3275911 * Math.abs(x)), y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
  function maskCanvas(W, H, box, ref, feather) {           // the feathered ellipse, computed per pixel (no canvas filters, so it works in every browser)
    const k = W / ref, x0 = box[0] * k, y0 = box[1] * k, x1 = (box[2] + 1) * k, y1 = (box[3] + 1) * k;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2, ry = (y1 - y0) / 2, s = Math.max(0.5, feather * k);
    const m = document.createElement("canvas"); m.width = W; m.height = H; const g = m.getContext("2d");
    const pad = Math.ceil(s * 4), bx0 = Math.max(0, Math.floor(x0 - pad)), by0 = Math.max(0, Math.floor(y0 - pad)), bx1 = Math.min(W, Math.ceil(x1 + pad)), by1 = Math.min(H, Math.ceil(y1 + pad));
    const id = g.createImageData(bx1 - bx0, by1 - by0), d = id.data;
    for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) {
      const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry, q = Math.hypot(u, v) || 1e-6;
      const grad = Math.hypot(u / rx, v / ry) / q, dist = (1 - q) / grad;          // signed distance to the ellipse edge, in pixels
      const a = 0.5 * (1 + erf(dist / (s * Math.SQRT2)));
      d[((y - by0) * (bx1 - bx0) + (x - bx0)) * 4 + 3] = Math.round(a * 255);
    }
    g.putImageData(id, bx0, by0); return m;
  }
  function buildOpen(o, W, H) {
    const box = o.box || DEFAULTS.box, ref = o.ref || DEFAULTS.ref, feather = o.feather ?? DEFAULTS.feather, mix = o.largeMix ?? DEFAULTS.largeMix;
    const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
    if (o.tiny) { g.drawImage(o.tiny, 0, 0, W, H); g.globalAlpha = mix; g.drawImage(o.large, 0, 0, W, H); g.globalAlpha = 1; }
    else { g.drawImage(o.rest, 0, 0, W, H); g.globalAlpha = 0.5; g.drawImage(o.large, 0, 0, W, H); g.globalAlpha = 1; }   // no tiny picture: half the larger opening
    g.globalCompositeOperation = "destination-in"; g.drawImage(maskCanvas(W, H, box, ref, feather), 0, 0); g.globalCompositeOperation = "source-over";
    return c;
  }
  // Calibrated on the approved portrait: ellipse ≈ 0.593 × mouth width by 0.891 × lip height, centred on the lips.
  function boxFromPoints(P, W) {
    const k = 512 / W, L = P[61], R = P[291], U = P[0], D = P[17];
    const mw = Math.hypot(R[0] - L[0], R[1] - L[1]), lh = Math.hypot(D[0] - U[0], D[1] - U[1]);
    const cx = (L[0] + R[0]) / 2 - 0.037 * mw, cy = (U[1] + D[1]) / 2 - 0.05 * lh, rx = 0.593 * mw, ry = 0.891 * lh;
    return [(cx - rx) * k, (cy - ry) * k, (cx + rx) * k - 1, (cy + ry) * k - 1].map((v) => Math.round(v));
  }

  function schedule(text, opts = {}) {
    const sp = Math.max(0.25, +opts.speed || 1), rp = opts.restOnPause !== false, t = (ms) => Math.round(ms / sp), out = [];
    const opens = [150, 180, 210]; let n = 0;
    out.push({ a: REST, ms: t(700), word: "", pause: true });
    for (const raw of String(text).trim().split(/\s+/).filter(Boolean)) {
      const word = raw, bare = raw.replace(/[^\p{L}\p{N}'’-]/gu, "");
      out.push({ a: MID, ms: t(90), word }, { a: OPEN, ms: t(opens[n++ % 3]), word }, { a: MID, ms: t(90), word }, { a: REST, ms: t(100), word });
      if (bare.length > 7) out.push({ a: MID, ms: t(100), word }, { a: OPEN, ms: t(140), word }, { a: MID, ms: t(90), word });
      if (/,$/.test(raw)) out.push({ a: rp ? REST : MID, ms: t(350), word, pause: true });          // the approved recipe pauses only after commas
    }
    out.push({ a: REST, ms: t(1000), word: "", pause: true });
    return out;
  }
  function player(onState) {
    let token = null;
    return {
      play(text, opts) {
        const me = (token = {}), steps = schedule(text, opts);
        return new Promise((resolve) => {
          let i = 0; const next = () => { if (token !== me) return resolve(false); if (i >= steps.length) { token = null; onState(REST, ""); return resolve(true); }
            const s = steps[i++]; onState(s.a, s.word, !!s.pause); setTimeout(next, s.ms); };
          next();
        });
      },
      stop() { token = null; onState(REST, ""); },
      get playing() { return !!token; },
    };
  }
  // Live speech: while her voice is active, the per-word cycle repeats; when she pauses, the mouth returns to rest
  // (or holds the intermediate state, if return-to-rest is off). Same states and amplitude as the demonstration.
  // Live speech: while her voice is active the per-word cycle repeats, a little slower than the demonstration by default (slow: 1.65),
  // because real speech carries the eye less than captions. When her voice pauses, the mouth goes back to rest at once
  // (through a short intermediate step if it is open), so it never keeps moving after she stops; rest() closes it immediately.
  function live(onState, opts = {}) {
    let active = false, restOnPause = opts.restOnPause !== false, speed = +opts.speed || 1, slow = opts.slow ?? 1.65, timer = 0, step = 0, n = 0, lastOn = 0, cur = REST;
    const opens = [150, 180, 210], hold = opts.hold ?? 150, set = (a) => { cur = a; onState(a); };
    const cycle = () => {
      timer = 0;
      if (!active && performance.now() - lastOn > hold) {                    // she has paused: close now, not at the end of the cycle
        const goal = restOnPause ? REST : MID;
        if (cur === OPEN && goal === REST) { set(MID); timer = setTimeout(cycle, 70); step = 0; return; }
        set(goal); step = 0; return;
      }
      if ((step === 0 || step === 1) && !active) { set(restOnPause ? REST : MID); step = 0; return; }   // never start or open on silence: only while she is sounding
      const seq = [[MID, 90], [OPEN, opens[n % 3]], [MID, 90], [REST, 100]], [a, ms] = seq[step];
      set(a); step = (step + 1) % 4; if (step === 0) n++; timer = setTimeout(cycle, (ms * slow) / speed);
    };
    return {
      voice(on) { active = !!on; if (on) lastOn = performance.now(); if (on && !timer && (cur === REST || cur === MID) && step === 0) cycle(); else if (!on && !timer && cur !== (restOnPause ? REST : MID)) cycle(); },
      rest() { clearTimeout(timer); timer = 0; active = false; step = 0; set(REST); },
      setRestOnPause(on) { restOnPause = !!on; }, setSpeed(s) { speed = Math.max(0.25, +s || 1); }, setSlow(x) { slow = Math.max(0.5, +x || 1.65); },
      stop() { clearTimeout(timer); timer = 0; active = false; step = 0; set(REST); },
    };
  }
  window.TalkingMouth = { DEFAULTS, REST, MID, OPEN, buildOpen, boxFromPoints, schedule, player, live };
})();
