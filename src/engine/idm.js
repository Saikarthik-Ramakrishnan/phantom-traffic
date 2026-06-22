/**
 * engine/idm.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Accurate Intelligent Driver Model (IDM) implementation.
 *
 * Reference:
 *   Treiber, Hennecke & Helbing (2000), "Congested traffic states in empirical
 *   observations and microscopic simulations", Phys. Rev. E 62, 1805.
 *
 * The IDM acceleration for a vehicle with speed v, gap s to the leader, and
 * approach rate Δv = v − v_lead is:
 *
 *     a = a_max · [ 1 − (v/v0)^δ − (sStar / s)² ]
 *     sStar = s0 + max(0,  v·T + v·Δv / (2·√(a_max·b)) )
 *
 * where v0 = desired speed, T = safe time headway, s0 = jam distance,
 * a_max = max acceleration, b = comfortable deceleration, δ = 4 (standard).
 *
 * We integrate with the *ballistic* (kinematic) update rather than naive Euler,
 * which Treiber recommends for stability and energy consistency:
 *     x ← x + v·dt + ½·a·dt²
 *     v ← max(0, v + a·dt)
 */

export const DELTA = 4; // free-acceleration exponent (standard IDM value)

/**
 * Compute IDM acceleration.
 * @param {number} v      current speed (m/s)
 * @param {number} s      bumper-to-bumper gap to leader (m)
 * @param {number} dv     approach rate v − v_lead (m/s)
 * @param {object} p      params {v0, T, s0, a, b}
 * @returns {number} acceleration (m/s²)
 */
export function idmAcceleration(v, s, dv, p) {
  const { v0, T, s0, a, b } = p;
  // desired dynamic gap
  const sStar = s0 + Math.max(0, v * T + (v * dv) / (2 * Math.sqrt(a * b)));
  const safeS = Math.max(s, 0.1); // avoid division blow-up at contact
  const freeTerm = 1 - Math.pow(v / v0, DELTA);
  const interactionTerm = Math.pow(sStar / safeS, 2);
  let acc = a * (freeTerm - interactionTerm);
  // physically bound deceleration (emergency brake limit ~ 1.5× comfortable b)
  return Math.max(-1.5 * b, acc);
}

/**
 * Ballistic position/speed update for one vehicle for time dt.
 * Returns {dx, vNew}. Handles the case where the vehicle would stop within dt
 * (prevents the classic Euler artefact of negative speed / overshoot).
 */
export function ballisticStep(v, a, dt) {
  let vNew = v + a * dt;
  let dx;
  if (vNew >= 0) {
    dx = v * dt + 0.5 * a * dt * dt;
  } else {
    // vehicle reaches v=0 before end of step; travel only until stop
    const tStop = v / Math.max(-a, 1e-6);
    dx = 0.5 * v * tStop;
    vNew = 0;
  }
  return { dx: Math.max(0, dx), vNew: Math.max(0, vNew) };
}
