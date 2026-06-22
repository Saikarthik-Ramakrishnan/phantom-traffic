import React, { useState, useRef, useEffect, useMemo } from "react";
import { T } from "./theme.js";
import { Simulation } from "./engine/simulation.js";
import { VEHICLE_CLASSES } from "./engine/vehicles.js";
import { RingCanvas, SpaceTimeCanvas, FundamentalDiagram } from "./components/canvas.jsx";
import {
  Panel, PanelHeader, Slider, Pill, Stat, Badge, Analogy, Section,
  proseStyle as PS, codeStyle as CS,
} from "./components/ui.jsx";

// ── shared hook: drive a Simulation with a rAF loop and expose a tick counter ─
function useSimLoop(sim, running) {
  const [, force] = useState(0);
  const last = useRef(performance.now());
  useEffect(() => {
    if (!sim) return;
    let raf;
    const loop = (now) => {
      const dt = Math.min((now - last.current) / 1000, 0.05);
      last.current = now;
      if (running) sim.advance(dt * 2.0); // 2× speed for livelier demo
      force((f) => (f + 1) & 0xffff);
      raf = requestAnimationFrame(loop);
    };
    last.current = performance.now();
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sim, running]);
}

// ═══════════════════════════════════════════════════════════════════════════
//  SIMULATOR TAB
// ═══════════════════════════════════════════════════════════════════════════
function SimulatorTab() {
  const simRef = useRef(null);
  if (!simRef.current) simRef.current = new Simulation({ length: 600, count: 70, seed: 7 });
  const sim = simRef.current;

  const [running, setRunning] = useState(true);
  const [count, setCount] = useState(70);
  const [headway, setHeadway] = useState(1.0);
  const [perturb, setPerturb] = useState(1.0);
  const [reaction, setReaction] = useState(0.6);
  const [avPct, setAvPct] = useState(0);
  const [showAV, setShowAV] = useState(true);
  const [seed, setSeed] = useState(7);
  const trailRef = useRef([]);

  useSimLoop(sim, running);

  // push parameters into the live sim
  useEffect(() => { sim.headwayScale = headway; }, [headway]);
  useEffect(() => { sim.perturbation = perturb; }, [perturb]);
  useEffect(() => { sim.reactionTime = reaction; }, [reaction]);
  useEffect(() => { sim.setAvFraction(avPct); }, [avPct]);
  useEffect(() => { sim.reset(count, seed); trailRef.current = []; }, [count, seed]);

  // accumulate fundamental-diagram trail
  useEffect(() => {
    const id = setInterval(() => {
      const c = sim.classify();
      trailRef.current.push({ rho: sim.density(), q: sim.flow(), jam: c.key === "jam" || c.key === "gridlock" });
      if (trailRef.current.length > 220) trailRef.current.shift();
    }, 250);
    return () => clearInterval(id);
  }, []);

  const c = sim.classify();
  const cColor = { flow: T.flow, slow: T.slow, jam: T.jam, gridlock: T.gridlock }[c.key];
  const wave = sim.measureWaveSpeed();

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 22, alignItems: "start" }} className="grid">
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <Panel>
          <RingCanvas sim={sim} showAV={showAV} />
          <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
            {Object.entries(VEHICLE_CLASSES).map(([k, v]) => (
              <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: T.textDim }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: v.color }} />{v.label}
              </span>
            ))}
            {avPct > 0 && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: T.signal }}><span style={{ width: 9, height: 9, borderRadius: 2, background: T.signal }} />Autonomous</span>}
            <span style={{ color: T.textFaint, fontSize: 11 }}>· road colour = speed</span>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Space–time diagram" sub="Position around the ring (x) versus time (y, newest at bottom). Dark diagonal bands are jam waves — their slope is the wave speed." />
          <SpaceTimeCanvas sim={sim} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10.5, color: T.textFaint }}>
            <span>← position around ring →</span>
            <span>diagonal slope = backward wave</span>
          </div>
        </Panel>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Panel style={{ border: `1px solid ${cColor}44` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: T.textFaint, textTransform: "uppercase", letterSpacing: 1.2 }}>Flow state</div>
              <div style={{ fontSize: 19, fontWeight: 700, color: cColor, marginTop: 3 }}>{c.state}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "ui-monospace, monospace", color: T.text }}>{(sim.spaceMeanSpeed() * 3.6).toFixed(0)}</div>
              <div style={{ fontSize: 10.5, color: T.textFaint }}>km/h avg</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Stat label="Density" value={sim.density().toFixed(0)} sub="veh/km" />
            <Stat label="Flow" value={(sim.flow() / 1000).toFixed(1) + "k"} sub="veh/h" accent={T.flow} />
            <Stat label="Wave" value={wave == null ? "—" : Math.abs(wave).toFixed(0)} sub={wave == null ? "no jam" : "km/h back"} accent={wave == null ? T.textDim : T.jam} />
          </div>
        </Panel>

        <Panel>
          <div style={{ fontSize: 11, color: T.textFaint, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 16 }}>Road conditions</div>
          <Slider label="Vehicle count" value={count} min={20} max={140} step={1} onChange={setCount} suffix="" hint={`density ${sim.density().toFixed(0)} veh/km`} />
          <Slider label="Following distance" value={headway.toFixed(2)} min={0.5} max={1.5} step={0.05} onChange={setHeadway} suffix="×" accent={T.flow} hint="lower = tighter tailgating" />
          <Slider label="Reaction time" value={reaction.toFixed(1)} min={0} max={1.5} step={0.1} onChange={setReaction} suffix="s" accent={T.violet} hint="the physical cause of instability" />
          <Slider label="Brake-tap frequency" value={perturb.toFixed(1)} min={0} max={3} step={0.1} onChange={setPerturb} suffix="×" accent={T.jam} />
          <Slider label="Autonomous vehicles" value={Math.round(avPct * 100)} min={0} max={50} step={5} onChange={(v) => setAvPct(v / 100)} suffix="%" accent={T.signal} hint="FollowerStopper wave dampers" />
        </Panel>

        <Panel>
          <div style={{ fontSize: 11, color: T.textFaint, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 14 }}>Controls</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Pill color={T.sodium} active={running} onClick={() => setRunning((r) => !r)}>{running ? "Pause" : "Resume"}</Pill>
            <Pill color={T.textDim} active={false} onClick={() => setSeed((s) => s + 1)}>Reshuffle</Pill>
            <Pill color={T.violet} active={showAV} onClick={() => setShowAV((s) => !s)}>Highlight AVs</Pill>
          </div>
          <div style={{ marginTop: 14, fontSize: 11.5, color: T.textDim, lineHeight: 1.6 }}>
            Raise <strong style={{ color: T.text }}>vehicle count</strong> past ~55 and the road tips into stop-and-go — watch the space-time bands appear. Then add <strong style={{ color: T.signal }}>autonomous vehicles</strong> and the bands fade.
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  FUNDAMENTAL DIAGRAM TAB  (the key traffic-engineering plot)
// ═══════════════════════════════════════════════════════════════════════════
function DiagramTab() {
  const simRef = useRef(null);
  if (!simRef.current) simRef.current = new Simulation({ length: 600, count: 40, seed: 5 });
  const sim = simRef.current;
  const [count, setCount] = useState(40);
  const trailRef = useRef([]);
  useSimLoop(sim, true);
  useEffect(() => { sim.reset(count, 5); }, [count]);
  useEffect(() => {
    const id = setInterval(() => {
      const c = sim.classify();
      trailRef.current.push({ rho: sim.density(), q: sim.flow(), jam: c.key === "jam" || c.key === "gridlock" });
      if (trailRef.current.length > 400) trailRef.current.shift();
    }, 200);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 22, alignItems: "start", maxWidth: 960 }} className="grid">
      <Panel>
        <PanelHeader title="The fundamental diagram of traffic" sub="Flow (vehicles per hour) versus density (vehicles per km). Every traffic engineer's core plot." />
        <FundamentalDiagram sim={sim} trail={trailRef.current} />
        <div style={{ marginTop: 12, fontSize: 12, color: T.textDim, lineHeight: 1.65 }}>
          Drag the density slider and watch the live point trace the curve. Flow <em>rises</em> with density at first — more cars, more throughput. But past a critical density the curve bends over and flow <em>collapses</em>: the road is jammed, and adding cars makes things worse. That peak is the road's maximum capacity, and the right-hand branch is where phantom jams live.
        </div>
      </Panel>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Panel>
          <Slider label="Vehicle count" value={count} min={20} max={140} step={2} onChange={setCount} suffix="" hint={`density ${sim.density().toFixed(0)} veh/km`} />
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <Stat label="Density" value={sim.density().toFixed(0)} sub="veh/km" />
            <Stat label="Flow" value={(sim.flow() / 1000).toFixed(1) + "k"} sub="veh/h" accent={T.flow} />
          </div>
        </Panel>
        <Panel>
          <div style={{ fontSize: 12.5, color: T.textDim, lineHeight: 1.7 }}>
            <strong style={{ color: T.flow }}>Free-flow branch</strong> (left): cars move near their desired speed; flow grows with density.<br /><br />
            <strong style={{ color: T.sodium }}>Capacity</strong> (peak): the most vehicles per hour the road can carry.<br /><br />
            <strong style={{ color: T.jam }}>Congested branch</strong> (right): jams form, speed crashes, flow falls even as density climbs.
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  PHYSICS TAB
// ═══════════════════════════════════════════════════════════════════════════
function Eq({ children }) {
  return <div style={{ background: T.bg, border: `1px solid ${T.line}`, borderRadius: 10, padding: "14px 18px", margin: "12px 0", fontFamily: "ui-monospace, monospace", fontSize: 13.5, color: T.text, textAlign: "center", overflowX: "auto" }}>{children}</div>;
}

function PhysicsTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 760 }}>
      <Section title="1 · The jam is a wave, not a place">
        <p style={PS}>The cluster of stopped cars you sit in is not a fixed location — it is a <strong style={{ color: T.sodium }}>travelling wave</strong>. Cars enter the jam at its front, crawl through, and exit at its back, while the cluster itself drifts upstream. In real highway data this backward wave moves at about <strong style={{ color: T.text }}>15–20 km/h</strong>. The simulator measures this live — open the space-time diagram and read the "Wave" figure.</p>
        <Analogy><strong>Ocean wave analogy.</strong> A wave crosses the sea while the water itself barely moves — each molecule bobs in place as the disturbance travels on. The cars are the water; the jam is the wave.</Analogy>
      </Section>
      <Section title="2 · Why one brake-tap becomes a wall of brake lights">
        <p style={PS}>Every driver reacts to the car ahead with a small <strong style={{ color: T.text }}>delay</strong>. If the leader eases off, the follower notices a moment too late and brakes harder; the next driver brakes harder still. The disturbance <strong style={{ color: T.jam }}>amplifies</strong> down the line — engineers call this <strong style={{ color: T.text }}>string instability</strong>. In the simulator, the "reaction time" slider is this exact mechanism: set it to zero and jams struggle to form; raise it and they erupt.</p>
        <Analogy color={T.flow}><strong>Microphone-feedback analogy.</strong> A faint sound enters a mic, the speaker amplifies it, the mic picks up the louder version — within a second, a screech from almost nothing. Each driver is an amplifier in that loop.</Analogy>
      </Section>
      <Section title="3 · The model behind every vehicle">
        <p style={PS}>Each vehicle follows the <strong style={{ color: T.text }}>Intelligent Driver Model</strong> (Treiber et al., 2000) — the standard car-following equation in traffic research:</p>
        <Eq>a = a_max · [ 1 − (v / v₀)⁴ − (s* / s)² ]</Eq>
        <p style={PS}>The first term accelerates toward the free-road speed <code style={CS}>v₀</code>; the second brakes based on the gap <code style={CS}>s</code> versus the desired gap <code style={CS}>s*</code>, which grows with speed and closing rate:</p>
        <Eq>s* = s₀ + v·T + (v·Δv) / (2·√(a_max·b))</Eq>
        <p style={PS}>The simulation integrates this with the <strong style={{ color: T.text }}>ballistic update</strong> Treiber recommends — more stable than naive Euler — at a fixed timestep, so results are deterministic and frame-rate independent. Each of the four vehicle classes carries its own literature-calibrated parameters.</p>
      </Section>
      <Section title="4 · It's a phase transition">
        <p style={PS}>Below a <strong style={{ color: T.text }}>critical density</strong> a perturbation dies out; above it, the same brake-tap grows without bound. There is no gentle middle — cross the threshold and the road flips from free-flowing to jam-prone. The fundamental-diagram tab shows this directly: the curve bends over at capacity and collapses.</p>
        <Analogy color={T.violet}><strong>Water-to-steam analogy.</strong> Heating water does little until 100 °C, where it abruptly changes phase. Traffic has the same tipping point — the free-flow → jam transition is the same class of event as laminar flow turning turbulent, and the jam wave is mathematically homologous to a <strong style={{ color: T.sodium }}>detonation wave</strong> (the "jamiton" model).</Analogy>
      </Section>
      <Section title="5 · The Indian extension">
        <p style={PS}>Classical theory assumes single-file lanes. Phantom relaxes that with <strong style={{ color: T.text }}>heterogeneous agents</strong> (bikes, autos, cars, trucks — each a different length, speed and acceleration) and <strong style={{ color: T.text }}>lateral gap-seeking</strong> (blocked vehicles drift into openings instead of waiting). The result: jams branch and re-form rather than staying clean, and at high density the whole road can seize into gridlock.</p>
      </Section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  SOLUTION TAB — live A/B
// ═══════════════════════════════════════════════════════════════════════════
function SolutionTab() {
  const aRef = useRef(null), bRef = useRef(null);
  if (!aRef.current) aRef.current = new Simulation({ length: 600, count: 85, seed: 11 });
  if (!bRef.current) bRef.current = new Simulation({ length: 600, count: 85, seed: 11 });
  const A = aRef.current, B = bRef.current;
  const [avPct, setAvPct] = useState(0.2);
  const [running, setRunning] = useState(true);

  useSimLoop(A, running);
  useSimLoop(B, running);
  useEffect(() => { A.setAvFraction(0); }, []);
  useEffect(() => { B.setAvFraction(avPct); }, [avPct]);

  const reshuffle = () => { const s = (Math.random() * 9999) | 0; A.reset(85, s); B.reset(85, s); B.setAvFraction(avPct); };

  const cA = A.classify(), cB = B.classify();
  const col = (k) => ({ flow: T.flow, slow: T.slow, jam: T.jam, gridlock: T.gridlock }[k]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 900 }}>
      <Section title="The fix: break the feedback loop">
        <p style={PS}>You can't remove human reaction delays, but you don't need to. You only need to <strong style={{ color: T.text }}>damp the wave faster than it amplifies</strong>. A vehicle that holds a steady gap and accelerates smoothly acts as a <strong style={{ color: T.signal }}>shock absorber</strong> — it receives the brake-shock and does not pass on an amplified version. The autonomous vehicles here run a <strong style={{ color: T.text }}>FollowerStopper</strong> controller, the same algorithm Stern et al. used in their 2017 field experiment.</p>
        <Analogy color={T.signal}><strong>The one calm driver.</strong> A single driver who refuses to tailgate and rolls at constant speed leaves a buffer that swallows the stop-and-go ahead. Everyone behind flows smoothly. An autonomous vehicle is that calm driver — by design, every time.</Analogy>
        <p style={PS}>In their real experiment, one automated car in a ring of 20+ humans erased the waves and cut fuel use substantially. The authors concluded flow control is possible with <strong style={{ color: T.text }}>fewer than 5%</strong> automated vehicles — long before full autonomy. That low threshold is what makes this deployable now.</p>
      </Section>

      <Panel>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Live A/B test — identical roads, identical brake-taps</div>
            <div style={{ fontSize: 12, color: T.textDim, marginTop: 3 }}>Same seed and density. Only the autonomous fraction differs.</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Pill color={T.sodium} active={running} onClick={() => setRunning((r) => !r)}>{running ? "Pause" : "Resume"}</Pill>
            <Pill color={T.textDim} active={false} onClick={reshuffle}>Reshuffle</Pill>
          </div>
        </div>
        <div style={{ maxWidth: 360, margin: "6px auto 16px" }}>
          <Slider label="Autonomous vehicles (right road)" value={Math.round(avPct * 100)} min={0} max={40} step={5} onChange={(v) => setAvPct(v / 100)} suffix="%" accent={T.signal} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }} className="grid">
          <div>
            <div style={{ textAlign: "center", marginBottom: 8, fontSize: 12, color: col(cA.key), fontWeight: 600 }}>{cA.state} · {(A.spaceMeanSpeed() * 3.6).toFixed(0)} km/h</div>
            <RingCanvas sim={A} showAV={true} size={300} />
            <div style={{ textAlign: "center", fontSize: 11.5, color: T.textDim, marginTop: 6 }}>100% human</div>
          </div>
          <div>
            <div style={{ textAlign: "center", marginBottom: 8, fontSize: 12, color: col(cB.key), fontWeight: 600 }}>{cB.state} · {(B.spaceMeanSpeed() * 3.6).toFixed(0)} km/h</div>
            <RingCanvas sim={B} showAV={true} size={300} />
            <div style={{ textAlign: "center", fontSize: 11.5, color: T.signal, marginTop: 6 }}>{Math.round(avPct * 100)}% autonomous</div>
          </div>
        </div>
        <div style={{ marginTop: 16, padding: "13px 16px", background: T.panelHi, borderRadius: 10, fontSize: 12.5, color: T.textDim, lineHeight: 1.6, borderLeft: `3px solid ${T.signal}` }}>
          Both roads start identical and get the same random brake-taps. The left builds a phantom jam; the right — with a few smooth-driving vehicles spaced through it — keeps flowing. Slide the autonomous share to zero and the roads become twins again.
        </div>
      </Panel>

      <Section title="What this means off the road">
        <p style={PS}>The same instability appears far beyond traffic: supply chains that whipsaw from a small demand blip (the bullwhip effect), crowd crushes that ripple backward through a packed corridor, and process bottlenecks in organisations. In any chain of delayed reactions, a few steady, buffer-keeping actors can stabilise the whole system.</p>
      </Section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  FOOTAGE TAB
// ═══════════════════════════════════════════════════════════════════════════
function FootageTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 760 }}>
      <Section title="The experiment that proves it">
        <p style={PS}>In 2008, Yuki Sugiyama's team at Nagoya University put <strong style={{ color: T.text }}>22 cars on a single-lane circular track</strong> and asked every driver to hold a steady 30 km/h with equal spacing — no obstacles, no signals. Within minutes a stop-and-go jam appeared from nothing and travelled backward at ~20 km/h. This simulator is a direct digital recreation of that exact setup.</p>
        <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: 12, overflow: "hidden", border: `1px solid ${T.line}` }}>
          <iframe src="https://www.youtube.com/embed/Suugn-p5C1M" title="Nagoya shockwave traffic jam experiment" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} frameBorder="0" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
        </div>
        <div style={{ fontSize: 11.5, color: T.textFaint, marginTop: 8 }}>Source: New Scientist / Sugiyama et al., Nagoya University (2008).</div>
      </Section>
      <Section title="The mechanism, explained">
        <p style={PS}>How a single hard brake cascades into a standstill — the everyday version of the lab experiment, the kind you sit through on any dense Indian arterial where mixed vehicles and tight spacing amplify the effect.</p>
        <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: 12, overflow: "hidden", border: `1px solid ${T.line}` }}>
          <iframe src="https://www.youtube.com/embed/ZNLIoolCeKI" title="How the phantom traffic jam occurs" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} frameBorder="0" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
        </div>
      </Section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  ROOT
// ═══════════════════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab] = useState("Simulator");
  const tabs = ["Simulator", "Fundamental Diagram", "The Physics", "The Solution", "Real Footage"];
  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "system-ui, -apple-system, sans-serif", padding: "0 0 50px" }}>
      <div style={{ position: "fixed", top: -120, left: "50%", transform: "translateX(-50%)", width: 600, height: 300, background: `radial-gradient(ellipse, ${T.sodium}10, transparent 70%)`, pointerEvents: "none" }} />
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 22px", position: "relative" }}>
        <header style={{ padding: "30px 0 18px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
            <h1 style={{ margin: 0, fontSize: 27, fontWeight: 800, letterSpacing: -0.5 }}>Phantom<span style={{ color: T.sodium }}>.</span></h1>
            <span style={{ fontSize: 13, color: T.textDim }}>How a traffic jam appears from nothing — Indian roads edition</span>
          </div>
          <p style={{ margin: "12px 0 0", fontSize: 13.5, color: T.textDim, lineHeight: 1.65, maxWidth: 780 }}>
            No accident, no signal, no bottleneck — just a dense road and a driver's reaction delay. Watch a jam wave travel <em style={{ color: T.text }}>backward</em> through traffic while every vehicle moves forward, see it on the fundamental diagram, learn the physics, then watch a few self-driving cars dissolve it. Every vehicle is a real Intelligent-Driver-Model agent; the wave speed and flow are measured live.
          </p>
        </header>

        <div style={{ display: "flex", gap: 4, background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 4, marginBottom: 24, flexWrap: "wrap" }}>
          {tabs.map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, minWidth: 110, padding: "10px 10px", borderRadius: 8, border: "none", cursor: "pointer",
              background: tab === t ? T.panelHi : "transparent", color: tab === t ? T.sodium : T.textDim,
              fontSize: 12.5, fontWeight: tab === t ? 700 : 500, boxShadow: tab === t ? `inset 0 0 0 1px ${T.lineHi}` : "none", transition: "all 0.15s",
            }}>{t}</button>
          ))}
        </div>

        {tab === "Simulator" && <SimulatorTab />}
        {tab === "Fundamental Diagram" && <DiagramTab />}
        {tab === "The Physics" && <PhysicsTab />}
        {tab === "The Solution" && <SolutionTab />}
        {tab === "Real Footage" && <FootageTab />}

        <div style={{ marginTop: 26, fontSize: 11, color: T.textFaint, textAlign: "center", lineHeight: 1.6 }}>
          Intelligent Driver Model (Treiber et al. 2000) · ballistic integration · FollowerStopper control (Stern et al. 2017) · phantom-jam physics (Sugiyama et al. 2008) · jamiton model (Seibold et al. 2009)
        </div>
      </div>

      <style>{`
        @media (max-width: 880px) { .grid { grid-template-columns: 1fr !important; } }
        input[type=range] { height: 4px; border-radius: 2px; }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}
