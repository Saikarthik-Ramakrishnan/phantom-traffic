/**
 * engine/controller.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Autonomous-vehicle controller — a faithful simplification of the
 * "FollowerStopper" used in:
 *   Stern et al. (2018), "Dissipation of stop-and-go waves via control of
 *   autonomous vehicles: Field experiments", Transp. Res. Part C 89, 205.
 *
 * Idea: instead of reacting like a human (which amplifies waves), the AV
 * commands a target speed that never exceeds a safe value derived from the gap
 * to the leader, and tracks a smooth desired velocity U. The effect is that the
 * AV absorbs incoming shocks and emits a steady speed downstream — acting as a
 * wave damper rather than a wave amplifier.
 *
 * The original uses three deceleration regions bounded by parabolas in the
 * (Δv, gap) plane. We implement that region logic directly.
 */

/**
 * @param {number} v        AV current speed (m/s)
 * @param {number} vLead    leader speed (m/s)
 * @param {number} gap      bumper-to-bumper gap (m)
 * @param {number} U        desired/target cruising speed (m/s)
 * @returns {number} commanded speed (m/s)
 */
export function followerStopperCommand(v, vLead, gap, U) {
  const dv = Math.min(vLead - v, 0); // only negative (closing) relative speed matters
  const dv2 = dv * dv;

  // deceleration-rate constants for the three region boundaries (m/s²)
  const d1 = 1.5, d2 = 1.0, d3 = 0.5;
  // standstill spacing offsets (m)
  const dx1_0 = 4.5, dx2_0 = 5.25, dx3_0 = 6.0;

  // region boundary spacings (parabolic in closing speed)
  const dx1 = dx1_0 + (1 / (2 * d1)) * dv2;
  const dx2 = dx2_0 + (1 / (2 * d2)) * dv2;
  const dx3 = dx3_0 + (1 / (2 * d3)) * dv2;

  const vTarget = Math.min(Math.max(vLead, 0), U);

  let vCmd;
  if (gap <= dx1) {
    vCmd = 0; // stop region
  } else if (gap <= dx2) {
    vCmd = vTarget * (gap - dx1) / (dx2 - dx1);
  } else if (gap <= dx3) {
    vCmd = vTarget + (U - vTarget) * (gap - dx2) / (dx3 - dx2);
  } else {
    vCmd = U; // free region — cruise at desired speed
  }
  return Math.max(0, vCmd);
}

/**
 * Convert a commanded speed into an acceleration for the integrator.
 *
 * Uses a fixed relaxation time τ (not the raw substep dt) so the AV approaches
 * its commanded speed smoothly and frame-rate-independently. A comfortable slew
 * limit keeps the AV's own ride gentle — which is precisely what lets it absorb
 * rather than transmit shocks.
 */
export function commandToAccel(v, vCmd, dt, aMax = 1.4, bMax = 2.2, tau = 0.8) {
  const desiredAcc = (vCmd - v) / tau;
  return Math.max(-bMax, Math.min(aMax, desiredAcc));
}
