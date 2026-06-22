import React, { useRef, useEffect } from "react";
import { T } from "../theme.js";
import { VEHICLE_CLASSES } from "../engine/vehicles.js";

const TWO_PI = Math.PI * 2;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** Top-down ring road renderer. Reads live from a Simulation instance. */
export function RingCanvas({ sim, showAV = true, size = 460 }) {
  const ref = useRef(null);
  useEffect(() => {
    let raf;
    const draw = () => {
      const cv = ref.current;
      if (!cv || !sim) { raf = requestAnimationFrame(draw); return; }
      const ctx = cv.getContext("2d");
      const W = cv.width, H = cv.height, cx = W / 2, cy = H / 2;
      const Rout = Math.min(W, H) / 2 - 14;
      const Rin = Rout - 58;
      const laneW = (Rout - Rin) / sim.lanes;
      ctx.clearRect(0, 0, W, H);

      // asphalt band
      ctx.beginPath();
      ctx.arc(cx, cy, Rout, 0, TWO_PI);
      ctx.arc(cx, cy, Rin, 0, TWO_PI, true);
      ctx.fillStyle = "#1A1D23"; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = "#2A2E37";
      ctx.beginPath(); ctx.arc(cx, cy, Rout, 0, TWO_PI); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, Rin, 0, TWO_PI); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.setLineDash([4, 10]);
      for (let l = 1; l < sim.lanes; l++) { ctx.beginPath(); ctx.arc(cx, cy, Rin + l * laneW, 0, TWO_PI); ctx.stroke(); }
      ctx.setLineDash([]);

      // vehicles
      for (const veh of sim.vehicles) {
        const def = VEHICLE_CLASSES[veh.cls];
        const ang = (veh.x / sim.length) * TWO_PI - Math.PI / 2;
        const r = Rin + (veh.laneF + 0.5) * laneW;
        const vx = cx + Math.cos(ang) * r, vy = cy + Math.sin(ang) * r;
        const sp = veh.v / def.idm.v0;
        let col = sp > 0.6 ? T.flow : sp > 0.3 ? T.slow : T.jam;
        const lenPx = clamp((def.len / sim.length) * (TWO_PI * r), 4, 24);
        const widPx = clamp(laneW * (def.width / 2.2), 3, 13);
        ctx.save();
        ctx.translate(vx, vy);
        ctx.rotate(ang + Math.PI / 2);
        if (showAV && veh.isAV) {
          ctx.fillStyle = T.signal; ctx.shadowColor = T.signal; ctx.shadowBlur = 9;
        } else {
          ctx.fillStyle = col;
        }
        roundRect(ctx, -widPx / 2, -lenPx / 2, widPx, lenPx, 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        if (veh.cls === "truck") { ctx.strokeStyle = "rgba(0,0,0,0.45)"; ctx.lineWidth = 1; ctx.stroke(); }
        ctx.restore();
      }

      // centre readout
      const c = sim.classify();
      ctx.fillStyle = { flow: T.flow, slow: T.slow, jam: T.jam, gridlock: T.gridlock }[c.key];
      ctx.font = "600 15px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(c.state, cx, cy - 4);
      ctx.fillStyle = T.textFaint; ctx.font = "10px system-ui";
      ctx.fillText(`${sim.count} vehicles · ${sim.density().toFixed(0)} veh/km`, cx, cy + 14);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [sim, showAV]);

  return <canvas ref={ref} width={size} height={size} style={{ width: "100%", maxWidth: size, display: "block", margin: "0 auto" }} />;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** Space-time diagram: position (x) vs time (y), colour = speed. */
export function SpaceTimeCanvas({ sim, height = 200 }) {
  const ref = useRef(null);
  useEffect(() => {
    let raf;
    const draw = () => {
      const cv = ref.current;
      if (!cv || !sim) { raf = requestAnimationFrame(draw); return; }
      const ctx = cv.getContext("2d");
      const W = cv.width, H = cv.height;
      ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
      const hist = sim.history;
      if (hist.length) {
        const rows = hist.length, bins = sim.spaceBins;
        const cw = W / bins, ch = H / sim.maxHistory;
        const yOff = H - rows * ch;
        for (let t = 0; t < rows; t++) {
          const row = hist[t];
          for (let b = 0; b < bins; b++) {
            const v = row[b];
            let col = v > 0.6 ? "#5BD6A8" : v > 0.3 ? "#FFD23F" : "#FF6B5B";
            ctx.fillStyle = col;
            ctx.globalAlpha = v > 0.85 ? 0.18 : 0.9; // de-emphasise free flow
            ctx.fillRect(b * cw, yOff + t * ch, Math.max(cw, 1), Math.max(ch, 1));
          }
        }
        ctx.globalAlpha = 1;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [sim]);
  return <canvas ref={ref} width={560} height={height} style={{ width: "100%", display: "block", borderRadius: 8 }} />;
}

/** Live fundamental diagram: flow Q vs density ρ, with current point marked. */
export function FundamentalDiagram({ sim, trail }) {
  const ref = useRef(null);
  useEffect(() => {
    let raf;
    const draw = () => {
      const cv = ref.current;
      if (!cv || !sim) { raf = requestAnimationFrame(draw); return; }
      const ctx = cv.getContext("2d");
      const W = cv.width, H = cv.height, pad = 40;
      ctx.clearRect(0, 0, W, H);
      const rhoMax = 200, qMax = 5000;
      const sx = (rho) => pad + (rho / rhoMax) * (W - 2 * pad);
      const sy = (q) => H - pad - (q / qMax) * (H - 2 * pad);
      // grid
      ctx.strokeStyle = T.line; ctx.lineWidth = 0.6;
      for (let g = 0; g <= 4; g++) {
        ctx.beginPath(); ctx.moveTo(pad, pad + g / 4 * (H - 2 * pad)); ctx.lineTo(W - pad, pad + g / 4 * (H - 2 * pad)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(pad + g / 4 * (W - 2 * pad), pad); ctx.lineTo(pad + g / 4 * (W - 2 * pad), H - pad); ctx.stroke();
      }
      // trail of measured points
      if (trail && trail.length) {
        for (const pt of trail) {
          ctx.fillStyle = pt.jam ? "rgba(255,107,91,0.5)" : "rgba(91,214,168,0.5)";
          ctx.beginPath(); ctx.arc(sx(pt.rho), sy(pt.q), 2.5, 0, TWO_PI); ctx.fill();
        }
      }
      // current point
      const rho = sim.density(), q = sim.flow();
      const c = sim.classify();
      ctx.fillStyle = { flow: T.flow, slow: T.slow, jam: T.jam, gridlock: T.gridlock }[c.key];
      ctx.beginPath(); ctx.arc(sx(rho), sy(q), 6, 0, TWO_PI); ctx.fill();
      ctx.strokeStyle = T.bg; ctx.lineWidth = 1.5; ctx.stroke();
      // axes labels
      ctx.fillStyle = T.textFaint; ctx.font = "10px system-ui"; ctx.textAlign = "center";
      ctx.fillText("density ρ (veh/km) →", W / 2, H - 8);
      ctx.save(); ctx.translate(12, H / 2); ctx.rotate(-Math.PI / 2);
      ctx.fillText("flow Q (veh/h) →", 0, 0); ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [sim, trail]);
  return <canvas ref={ref} width={520} height={320} style={{ width: "100%", display: "block" }} />;
}
