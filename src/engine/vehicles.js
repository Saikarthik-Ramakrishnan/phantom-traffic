/**
 * engine/vehicles.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Vehicle-class definitions for the heterogeneous Indian traffic mix.
 *
 * IDM parameters are calibrated to plausible real-world values:
 *   v0  desired speed (m/s)        T  safe time headway (s)
 *   s0  jam (standstill) gap (m)   a  max acceleration (m/s²)
 *   b   comfortable decel (m/s²)   len physical length (m)
 *
 * Two-wheelers and autos run shorter headways and gaps (aggressive Indian
 * gap-acceptance); trucks/buses are long, slow, and sluggish. These values are
 * in the ranges reported for mixed Indian traffic (e.g. heterogeneous-flow IDM
 * calibrations) rather than Western single-class freeway values.
 */

export const VEHICLE_CLASSES = {
  bike: {
    label: "Bike",
    color: "#5BD6A8",
    len: 1.9,
    width: 0.85,
    share: 0.42,
    idm: { v0: 16.5, T: 0.8, s0: 1.0, a: 2.8, b: 4.5 },
  },
  auto: {
    label: "Auto",
    color: "#FFD23F",
    len: 3.2,
    width: 1.4,
    share: 0.22,
    idm: { v0: 12.5, T: 1.1, s0: 1.6, a: 1.9, b: 3.8 },
  },
  car: {
    label: "Car",
    color: "#E8E2D4",
    len: 4.3,
    width: 1.7,
    share: 0.28,
    idm: { v0: 18.0, T: 1.3, s0: 2.0, a: 1.6, b: 3.9 },
  },
  truck: {
    label: "Truck / Bus",
    color: "#FF8C66",
    len: 8.0,
    width: 2.1,
    share: 0.08,
    idm: { v0: 11.0, T: 1.7, s0: 3.0, a: 0.8, b: 3.0 },
  },
};

export const CLASS_KEYS = Object.keys(VEHICLE_CLASSES);

/** Deterministic class picker from a [0,1) random value, by share. */
export function pickClass(r) {
  let acc = 0;
  for (const k of CLASS_KEYS) {
    acc += VEHICLE_CLASSES[k].share;
    if (r <= acc) return k;
  }
  return "car";
}
