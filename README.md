# Phantom — How a Traffic Jam Appears From Nothing

An accurate, browser-based agent simulation of **phantom traffic jams**: the stop-and-go waves that form on busy roads with *no* accident, signal, or bottleneck — purely from the collective behaviour of drivers. Indian-roads edition, with a heterogeneous mix of bikes, autos, cars and trucks.

Every vehicle is a real **Intelligent Driver Model** agent. The jam wave, traffic flow, and density are all *measured live* from the simulation.

![IDM](https://img.shields.io/badge/model-Intelligent_Driver_Model-5BD6A8) ![React](https://img.shields.io/badge/React-18-7FB3FF) ![Vite](https://img.shields.io/badge/Vite-5-B79CFF)

---

## Run it

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`. Build for production with `npm run build`.

---

## What you can do

| Tab | What it shows |
|---|---|
| **Simulator** | The live ring road. Raise vehicle count past ~55 and a phantom jam forms on its own; watch the space-time diagram fill with backward-travelling jam bands. The wave speed is measured and displayed live. |
| **Fundamental Diagram** | The core plot of traffic engineering — flow vs density. Drag the density and watch the live point trace the free-flow branch, hit capacity, then collapse into the congested branch. |
| **The Physics** | Five plain-language sections, each pairing the real physics with an everyday analogy (ocean waves, microphone feedback, water-to-steam). The IDM equations, explained. |
| **The Solution** | A live A/B test: two identical roads, same brake-taps, differing only in their fraction of autonomous vehicles. The human road jams; the AV road flows. |
| **Real Footage** | The original 2008 Nagoya ring-road experiment that this simulator recreates. |

---

## Why the physics is accurate

 The engine implements published traffic-flow models:

- **Intelligent Driver Model** (Treiber, Hennecke & Helbing 2000) — the standard car-following equation, with the free-acceleration exponent δ = 4 and the full dynamic-gap term.
- **Ballistic integration** at a fixed timestep — the numerically stable update Treiber recommends, decoupled from frame rate, so runs are deterministic and reproducible from a seed.
- **Reaction-time delay** — the genuine physical origin of *string instability*. Vehicles perceive their leader's state from the recent past, which is what makes a small brake-tap amplify into a self-sustaining wave.
- **FollowerStopper control** (Stern et al. 2017) — the autonomous vehicles use the actual wave-damping controller from the landmark field experiment, not a hand-waved "smoother driver."
- **Real observables** — density ρ (veh/km), flow Q (veh/h), space-mean speed, and the backward wave speed (measured from the drift of the jam centroid in the space-time field) all come straight out of the simulation. The measured wave speed lands around 15–20 km/h backward, matching real highway data.

### Validation

The engine ships with a clear phase transition (free flow → stop-and-go above a critical density), a measured backward wave speed in the empirically-correct range, deterministic replay from a seed, numerical stability under stress (no NaN or negative speeds even at extreme density), and real-time performance (~0.2 ms/step for 200 vehicles).

---

## Architecture

```
src/
├── engine/
│   ├── idm.js          # IDM acceleration + ballistic integration step
│   ├── vehicles.js     # 4 vehicle classes, literature-calibrated parameters
│   ├── controller.js   # FollowerStopper autonomous-vehicle controller
│   └── simulation.js   # ring-road sim: stepping, observables, classification
├── components/
│   ├── canvas.jsx      # ring renderer, space-time diagram, fundamental diagram
│   └── ui.jsx          # shared UI primitives
├── theme.js            # design tokens
├── App.jsx             # tabs + wiring
└── main.jsx            # entry point
```

The engine in `src/engine/` is **pure JavaScript with no React dependency** — it can be imported and run headless (e.g. for the test scripts or batch experiments).

### Pipeline (per fixed timestep)

1. Sort vehicles by ring position
2. For each: find the leader within its lateral band, compute IDM (or FollowerStopper) acceleration, optionally with reaction-time delay, plus a stochastic brake-tap
3. Lateral gap-seeking for blocked vehicles
4. Ballistic position/speed integration with ring wrap-around
5. Record the space-time field; classify the global flow state

---

## The significance

Phantom jams waste an enormous amount of fuel and time worldwide for no reason at all — there is nothing to clear, because there was never an obstacle. Understanding them matters because the fix is unexpectedly cheap: you do not need every car to be autonomous. Stern et al. showed that **fewer than 5%** of vehicles running a wave-damping controller can smooth the flow for everyone. This simulator lets anyone see *why* that works, by watching a handful of steady drivers absorb the shocks that humans amplify.

---

## References

1. Sugiyama, Y. et al. (2008). Traffic jams without bottlenecks. *New Journal of Physics* 10, 033001.
2. Treiber, M., Hennecke, A., & Helbing, D. (2000). Congested traffic states in empirical observations and microscopic simulations. *Phys. Rev. E* 62, 1805. [Intelligent Driver Model]
3. Stern, R. E. et al. (2018). Dissipation of stop-and-go waves via control of autonomous vehicles: Field experiments. *Transp. Res. Part C* 89, 205. arXiv:1705.01693
4. Flynn, M. R. et al. (2009). Self-sustained nonlinear waves in traffic flow. *Phys. Rev. E* 79, 056113. [the "jamiton" model]
5. Tadaki, S. et al. (2013). Phase transition in traffic jam experiment on a circuit. *New Journal of Physics* 15, 103034.

---

## Author

**Saikarthik Ramakrishnan** — Electronics & Communication Engineering, Shiv Nadar University.
An independent project exploring the hardware–software–AI intersection through emergent complex systems.
