import React from "react";
import { T } from "../theme.js";

export function Panel({ children, style }) {
  return <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 18, padding: 22, ...style }}>{children}</div>;
}

export function PanelHeader({ title, sub, right }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14, gap: 10 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{title}</div>
        {sub && <div style={{ fontSize: 11.5, color: T.textDim, marginTop: 3 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

export function Slider({ label, value, min, max, step, onChange, suffix, accent, hint }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: T.textDim }}>{label}</span>
        <span style={{ fontSize: 12, color: accent || T.sodium, fontFamily: "ui-monospace, monospace", fontWeight: 600 }}>{value}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: accent || T.sodium, cursor: "pointer" }} />
      {hint && <div style={{ fontSize: 10.5, color: T.textFaint, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export function Pill({ children, color, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: "8px 14px", borderRadius: 9, border: `1px solid ${active ? color : T.line}`,
      background: active ? `${color}1C` : T.panel, color: active ? color : T.textDim,
      fontSize: 12.5, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
    }}>{children}</button>
  );
}

export function Stat({ label, value, sub, accent }) {
  return (
    <div style={{ background: T.panelHi, border: `1px solid ${T.line}`, borderRadius: 14, padding: "14px 16px", flex: 1, minWidth: 110 }}>
      <div style={{ fontSize: 10, color: T.textFaint, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 7 }}>{label}</div>
      <div style={{ fontSize: 23, fontWeight: 700, color: accent || T.text, fontFamily: "ui-monospace, monospace", letterSpacing: -0.5, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: T.textDim, marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

export function Badge({ children, c }) {
  return <span style={{ fontSize: 11, color: c, background: `${c}14`, border: `1px solid ${c}40`, borderRadius: 16, padding: "5px 11px", fontWeight: 500 }}>{children}</span>;
}

export function Analogy({ children, color = T.sodium }) {
  return (
    <div style={{ background: `${color}0E`, border: `1px solid ${color}33`, borderLeft: `3px solid ${color}`, borderRadius: 10, padding: "13px 16px", margin: "12px 0", fontSize: 13, color: T.text, lineHeight: 1.65 }}>
      {children}
    </div>
  );
}

export function Section({ title, children }) {
  return (
    <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 16, padding: "22px 24px" }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700, color: T.text }}>{title}</h3>
      {children}
    </div>
  );
}

export const proseStyle = { fontSize: 13.5, color: T.textDim, lineHeight: 1.75, margin: "0 0 12px" };
export const codeStyle = { fontFamily: "ui-monospace, monospace", fontSize: 12.5, color: T.sodium, background: T.bg, padding: "1px 5px", borderRadius: 4 };
