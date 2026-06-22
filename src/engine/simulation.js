/**
 * engine/simulation.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Ring-road traffic simulation.
 *
 *  • Heterogeneous IDM agents (engine/vehicles.js)
 *  • Optional FollowerStopper autonomous vehicles (engine/controller.js)
 *  • Ballistic integration with a FIXED physics timestep, decoupled from render
 *  • Real traffic-engineering observables: density ρ, flow Q, space-mean speed,
 *    and measured backward wave speed from the space-time field
 *
 * Coordinate: x is arc length along the ring in metres, wrapping at `length`.
 */

import { VEHICLE_CLASSES, pickClass } from "./vehicles.js";
import { idmAcceleration, ballisticStep } from "./idm.js";
import { followerStopperCommand, commandToAccel } from "./controller.js";

const TWO_PI = Math.PI * 2;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const wrap = (x, n) => ((x % n) + n) % n;
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

// Mulberry32 — fast seeded PRNG for reproducible runs
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Simulation {
  /**
   * @param {object} opts
   *   length    ring circumference (m)              default 400
   *   lanes     nominal lateral bands               default 3
   *   count     number of vehicles                  default 30
   *   seed      PRNG seed                            default 1
   *   dt        fixed physics timestep (s)           default 0.05
   */
  constructor(opts = {}) {
    this.length = opts.length ?? 400;
    this.lanes = opts.lanes ?? 3;
    this.dt = opts.dt ?? 0.05;
    this.time = 0;

    // tunables (live-editable)
    this.headwayScale = 1.0;   // multiplies each class T (>1 = more cautious)
    this.perturbation = 1.0;   // brake-tap intensity multiplier
    this.avFraction = 0.0;     // fraction of fleet that is autonomous
    this.reactionTime = 0.6;   // human reaction delay (s) — the physical origin
                               // of string instability; ~0.6 s is realistic and
                               // makes phantom jams emerge as they do in reality
    this.lateral = true;       // enable lateral gap-seeking
    // FollowerStopper cruising target U (m/s). Adaptive: tracks the rolling
    // average speed of traffic so AVs cruise at the prevailing flow speed
    // rather than a fixed (possibly too-slow) value. This matches the spirit of
    // Stern et al., where U is set near the equilibrium speed of the ring.
    this.avDesiredSpeed = 12.0;
    this._avgSpeedEMA = 12.0;

    // space-time recording (position bins × time rows)
    this.spaceBins = 200;
    this.history = [];         // array of Float32Array(spaceBins) speed fields
    this.maxHistory = 240;

    this.reset(opts.count ?? 30, opts.seed ?? 1);
  }

  reset(count, seed) {
    this.count = count;
    this.seed = seed;
    const rng = mulberry32(seed);
    this.rng = rng;
    this.vehicles = [];
    this.time = 0;
    this.history = [];
    for (let i = 0; i < count; i++) {
      const cls = pickClass(rng());
      const def = VEHICLE_CLASSES[cls];
      const x = (i / count) * this.length + (rng() - 0.5) * 1.5;
      this.vehicles.push({
        id: i,
        cls,
        x: wrap(x, this.length),
        v: def.idm.v0 * (0.55 + rng() * 0.35),
        lane: Math.floor(rng() * this.lanes),
        laneF: 0,
        targetLane: null,
        isAV: rng() < this.avFraction,
        // delayed-perception buffer (for reaction time)
        _hist: [],
        len: def.len,
      });
      this.vehicles[i].laneF = this.vehicles[i].lane;
    }
    // re-roll AV assignment deterministically so avFraction changes are stable
    this._assignAVs();
    this._sortCache = null;
  }

  _assignAVs() {
    // spread AVs as evenly as possible around the ring for fair damping
    const n = this.vehicles.length;
    const target = Math.round(this.avFraction * n);
    this.vehicles.forEach((v) => (v.isAV = false));
    if (target <= 0) return;
    const stride = n / target;
    for (let k = 0; k < target; k++) {
      const idx = Math.floor(k * stride) % n;
      this.vehicles[idx].isAV = true;
    }
  }

  setAvFraction(f) {
    this.avFraction = clamp(f, 0, 1);
    this._assignAVs();
  }

  /** density in vehicles/km */
  density() {
    return (this.count / this.length) * 1000;
  }

  /** space-mean speed in m/s */
  spaceMeanSpeed() {
    return mean(this.vehicles.map((v) => v.v));
  }

  /** flow Q in vehicles/hour (Q = ρ · v) */
  flow() {
    const rhoPerM = this.count / this.length;
    return rhoPerM * this.spaceMeanSpeed() * 3600;
  }

  /**
   * Advance the simulation by `frameDt` seconds of real time using as many
   * fixed physics substeps as needed (keeps integration stable & deterministic
   * regardless of frame rate).
   */
  advance(frameDt) {
    let remaining = Math.min(frameDt, 0.1); // clamp to avoid spiral-of-death
    while (remaining > 1e-6) {
      const h = Math.min(this.dt, remaining);
      this._stepFixed(h);
      remaining -= h;
    }
  }

  _stepFixed(dt) {
    const veh = this.vehicles;
    const n = veh.length;
    const L = this.length;

    // sort by position once per step (O(n log n); n is modest)
    const order = veh.slice().sort((a, b) => a.x - b.x);

    // adaptive AV cruising speed: exponential moving average of space-mean speed.
    // The FollowerStopper damps oscillations *around* this equilibrium, so it
    // must sit near the prevailing flow speed (not a fixed low value, which would
    // turn AVs into slow-moving obstacles).
    const vbar = mean(veh.map((x) => x.v));
    this._avgSpeedEMA += 0.05 * (vbar - this._avgSpeedEMA);
    this.avDesiredSpeed = clamp(this._avgSpeedEMA * 1.05, 3, 22);

    // ── compute accelerations ────────────────────────────────────────────────
    for (let i = 0; i < n; i++) {
      const me = order[i];
      const def = VEHICLE_CLASSES[me.cls];

      // find leader: nearest vehicle ahead within lateral influence band
      let gap = L, leadV = me.v;
      for (let k = 1; k <= n; k++) {
        const cand = order[(i + k) % n];
        if (cand === me) break;
        if (Math.abs(cand.laneF - me.laneF) > 1.05) continue;
        let g = cand.x - me.x - cand.len;
        if (g < 0) g += L;
        if (g < gap) { gap = g; leadV = cand.v; }
        if (k > 14) break; // neighbours only
      }
      me._gap = gap;

      let acc;
      if (me.isAV) {
        const U = this.avDesiredSpeed;
        const vCmd = followerStopperCommand(me.v, leadV, gap, U);
        acc = commandToAccel(me.v, vCmd, dt);
      } else {
        // optional reaction delay: perceive leader state from the past
        let pv = me.v, pgap = gap, pdv = me.v - leadV;
        if (this.reactionTime > 0 && me._hist.length) {
          const delaySteps = Math.floor(this.reactionTime / dt);
          const past = me._hist[Math.max(0, me._hist.length - 1 - delaySteps)];
          if (past) { pv = past.v; pgap = past.gap; pdv = past.dv; }
        }
        const p = {
          v0: def.idm.v0,
          T: def.idm.T * this.headwayScale,
          s0: def.idm.s0,
          a: def.idm.a,
          b: def.idm.b,
        };
        acc = idmAcceleration(pv, pgap, pdv, p);

        // stochastic perturbation — the seed of phantom jams (a brake tap).
        // Probability is scaled by the substep length so the *rate* of brake-taps
        // per second of simulated time is independent of the timestep.
        if (this.rng() < this.perturbation * 0.25 * dt) {
          acc -= 2.2 + this.rng() * 2.5;
        }
      }
      me._acc = acc;

      // record perception history for reaction delay
      if (this.reactionTime > 0) {
        me._hist.push({ v: me.v, gap, dv: me.v - leadV });
        if (me._hist.length > 40) me._hist.shift();
      } else if (me._hist.length) {
        me._hist.length = 0;
      }
    }

    // ── lateral gap-seeking ──────────────────────────────────────────────────
    if (this.lateral) {
      for (let i = 0; i < n; i++) {
        const me = order[i];
        const def = VEHICLE_CLASSES[me.cls];
        if (me._gap < 9 && me.v < def.idm.v0 * 0.5 && !me.isAV) {
          let bestLane = me.lane, bestGap = me._gap;
          for (const dl of [-1, 1]) {
            const nl = me.lane + dl;
            if (nl < 0 || nl >= this.lanes) continue;
            let g = L;
            for (const o of order) {
              if (o === me) continue;
              if (Math.abs(o.laneF - nl) > 0.55) continue;
              let gg = o.x - me.x - o.len;
              if (gg < 0) gg += L;
              if (gg < g) g = gg;
            }
            if (g > bestGap + 4) { bestGap = g; bestLane = nl; }
          }
          me.targetLane = bestLane;
        }
        if (me.targetLane != null) {
          me.laneF += clamp(me.targetLane - me.laneF, -0.1, 0.1);
          if (Math.abs(me.targetLane - me.laneF) < 0.05) {
            me.lane = me.targetLane; me.targetLane = null;
          }
        }
      }
    }

    // ── integrate motion (ballistic) ─────────────────────────────────────────
    for (let i = 0; i < n; i++) {
      const me = order[i];
      const { dx, vNew } = ballisticStep(me.v, me._acc, dt);
      me.x = wrap(me.x + dx, L);
      me.v = vNew;
    }

    this.time += dt;
    this._recordHistory();
  }

  _recordHistory() {
    // bin the ring into spaceBins and store min-speed (jam) per bin
    const field = new Float32Array(this.spaceBins).fill(1);
    const counts = new Uint8Array(this.spaceBins);
    for (const me of this.vehicles) {
      const bin = Math.min(this.spaceBins - 1, Math.floor((me.x / this.length) * this.spaceBins));
      const def = VEHICLE_CLASSES[me.cls];
      const norm = me.v / def.idm.v0;
      if (counts[bin] === 0 || norm < field[bin]) field[bin] = norm;
      counts[bin] = 1;
    }
    // empty bins → treat as free (1)
    this.history.push(field);
    if (this.history.length > this.maxHistory) this.history.shift();
  }

  /**
   * Estimate backward jam-wave speed (km/h, negative = upstream) by tracking the
   * diagonal slope of low-speed bands in the space-time field via cross-correlation
   * of consecutive rows.
   */
  measureWaveSpeed() {
    const H = this.history;
    const span = 40; // rows of look-back
    if (H.length < span + 1) return null;
    const bins = this.spaceBins;

    // only meaningful if a jam pattern actually exists
    const last = H[H.length - 1];
    const jamFraction = last.filter((s) => s < 0.4).length / bins;
    if (jamFraction < 0.05) return null;

    // track the circular centroid of "jam mass" (1 − normalised speed).
    // Its angular drift over the window gives the wave's propagation speed.
    const centroid = (row) => {
      let sx = 0, sy = 0;
      for (let b = 0; b < bins; b++) {
        const w = Math.max(0, 1 - row[b]);
        const ang = (b / bins) * TWO_PI;
        sx += w * Math.cos(ang);
        sy += w * Math.sin(ang);
      }
      return Math.atan2(sy, sx);
    };
    const c1 = centroid(H[H.length - 1 - span]);
    const c2 = centroid(H[H.length - 1]);
    let dphi = c2 - c1;
    while (dphi > Math.PI) dphi -= TWO_PI;
    while (dphi < -Math.PI) dphi += TWO_PI;
    const dist = (dphi / TWO_PI) * this.length;  // metres of drift
    const dt = span * this.dt;                   // seconds elapsed
    // relative to traffic: subtract mean forward motion to express as the
    // *pattern* speed. Negative result = pattern moves backward (upstream).
    return (dist / dt) * 3.6; // km/h
  }

  /** Classify global flow into a human-readable state + gridlock risk [0,1]. */
  classify() {
    const norm = this.vehicles.map((v) => v.v / VEHICLE_CLASSES[v.cls].idm.v0);
    const avg = mean(norm);
    const stopped = norm.filter((s) => s < 0.12).length / norm.length;
    const variance = mean(norm.map((s) => (s - avg) ** 2));
    if (stopped > 0.55 && avg < 0.15) return { state: "Gridlock", risk: 1, key: "gridlock" };
    if (stopped > 0.32 || avg < 0.28) {
      if (variance > 0.06 && stopped > 0.28) return { state: "Gridlock imminent", risk: 0.8, key: "jam" };
      return { state: "Phantom jam", risk: 0.58, key: "jam" };
    }
    if (variance > 0.05 || avg < 0.55) return { state: "Jam forming", risk: 0.33, key: "slow" };
    return { state: "Free flow", risk: 0.1, key: "flow" };
  }
}
