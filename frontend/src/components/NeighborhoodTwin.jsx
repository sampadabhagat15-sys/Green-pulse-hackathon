import { useMemo } from "react";
import { Sun, Moon, Loader2, MousePointerClick } from "lucide-react";
import { fmt, formatHour, isDaylight } from "../utils";

// ---------- layout (SVG viewBox 900 x 570, isometric-inspired) ----------
const HUB = { x: 450, y: 300 };
const HUB_R = 20;
const GRID = { x: 450, y: 162 };
const BATTERY = { x: 370, y: 455, w: 66, h: 52 };

const LAYOUT = {
  residential: { x: 140, y: 350, w: 92, h: 80, floors: 6, label: "below", anchor: "right" },
  school: { x: 250, y: 215, w: 90, h: 46, floors: 3, label: "above", anchor: "bottom" },
  office: { x: 650, y: 215, w: 74, h: 104, floors: 8, label: "above", anchor: "bottom" },
  shopping: { x: 760, y: 350, w: 100, h: 42, floors: 2, label: "below", anchor: "left" },
  hospital: { x: 550, y: 455, w: 84, h: 74, floors: 5, label: "below", anchor: "top" },
};
const ORDER = ["residential", "school", "office", "shopping", "hospital"];

const PALETTE = {
  residential: { top: "#c7d2fe", left: "#a5b4fc", right: "#818cf8" },
  school: { top: "#a7f3d0", left: "#6ee7b7", right: "#34d399" },
  office: { top: "#bae6fd", left: "#7dd3fc", right: "#38bdf8" },
  shopping: { top: "#fde68a", left: "#fcd34d", right: "#fbbf24" },
  hospital: { top: "#fecdd3", left: "#fda4af", right: "#fb7185" },
};

const COLORS = { teal: "#0d9488", amber: "#d97706", navy: "#1e3a6e", emerald: "#059669" };

function resolveKind(b, idx) {
  const s = `${b.type ?? ""} ${b.name ?? ""}`.toLowerCase();
  if (/resid|apart/.test(s)) return "residential";
  if (/school|educ/.test(s)) return "school";
  if (/office/.test(s)) return "office";
  if (/shop|retail|mall|commerc/.test(s)) return "shopping";
  if (/hosp|health|medic/.test(s)) return "hospital";
  return ORDER[idx % ORDER.length];
}

function anchorPoint(l) {
  const { x, y, w, h } = l;
  switch (l.anchor) {
    case "right": return { x: x + w / 2, y };
    case "left": return { x: x - w / 2, y };
    case "top": return { x, y: y - h - w / 4 };
    default: return { x, y: y + w / 4 };
  }
}

// point near the hub edge on the side facing `a`
function hubPoint(a) {
  const dx = HUB.x - a.x, dy = HUB.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const k = (HUB_R + 6) / len;
  return { x: HUB.x - dx * k, y: HUB.y - dy * k };
}

const strokeFor = (v) => Math.min(9, Math.max(2.5, 2 + v / 10));

function Flow({ from, to, color, width }) {
  const d = `M${from.x} ${from.y} L${to.x} ${to.y}`;
  return (
    <g>
      <path d={d} stroke={COLORS[color]} strokeOpacity="0.18" strokeWidth={width} fill="none" strokeLinecap="round" />
      <path d={d} stroke={COLORS[color]} strokeWidth={width} fill="none" className="flow-line" markerEnd={`url(#arrow-${color})`} />
    </g>
  );
}

function Box({ x, y, w, h, floors = 0, palette, children }) {
  const top = `${x},${y - h - w / 4} ${x + w / 2},${y - h} ${x},${y - h + w / 4} ${x - w / 2},${y - h}`;
  const left = `${x - w / 2},${y - h} ${x},${y - h + w / 4} ${x},${y + w / 4} ${x - w / 2},${y}`;
  const right = `${x},${y - h + w / 4} ${x + w / 2},${y - h} ${x + w / 2},${y} ${x},${y + w / 4}`;
  return (
    <g className="bld-body">
      <polygon points={left} fill={palette.left} />
      <polygon points={right} fill={palette.right} />
      <polygon points={top} fill={palette.top} />
      {Array.from({ length: Math.max(0, floors - 1) }, (_, i) => {
        const yy = y - (h * (i + 1)) / floors;
        return (
          <g key={i} stroke="#ffffff" strokeOpacity="0.6" strokeWidth="1.2">
            <line x1={x - w / 2} y1={yy} x2={x} y2={yy + w / 4} />
            <line x1={x} y1={yy + w / 4} x2={x + w / 2} y2={yy} />
          </g>
        );
      })}
      {children}
    </g>
  );
}

function Label({ x, y, w, title, sub, selected }) {
  return (
    <g>
      <rect x={x - w / 2} y={y} width={w} height={44} rx={10} fill="#fff"
        stroke={selected ? "#059669" : "#d6e0ea"} strokeWidth={selected ? 2.5 : 1.5} />
      <text x={x} y={y + 19} textAnchor="middle" fontSize="15" fontWeight="700" fill="#0b1f3a">{title}</text>
      <text x={x} y={y + 36} textAnchor="middle" fontSize="13" fill="#475569">{sub}</text>
    </g>
  );
}

function Building({ b, selected, onSelect }) {
  const { layout: l, palette, sim, solar_capacity_kw: cap } = b;
  const hasSolar = cap > 0;
  const topY = l.y - l.h - l.w / 4;
  const lw = Math.max(160, b.name.length * 8.8);
  const ly = l.label === "above" ? topY - 8 - 44 : l.y + l.w / 4 + 8;
  const hw = l.w * 0.32, hh = l.w * 0.16, cy = l.y - l.h;
  const sub = sim ? `${fmt(sim.demand_kw)} kW load · ${fmt(sim.solar_kw)} kW solar` : "—";

  return (
    <g
      className="bld" role="button" tabIndex={0}
      aria-label={`${b.name}: ${sim ? `demand ${fmt(sim.demand_kw)} kilowatts, solar ${fmt(sim.solar_kw)} kilowatts` : "no data"}`}
      aria-pressed={selected}
      onClick={() => onSelect(b.id)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(b.id); } }}
    >
      {selected && (
        <polygon
          points={`${l.x},${l.y - l.w * 0.4} ${l.x + l.w * 0.8},${l.y} ${l.x},${l.y + l.w * 0.4} ${l.x - l.w * 0.8},${l.y}`}
          fill="#10b981" fillOpacity="0.15" stroke="#059669" strokeWidth="2.5" strokeDasharray="6 5"
        />
      )}
      <Box x={l.x} y={l.y} w={l.w} h={l.h} floors={l.floors} palette={palette}>
        {b.kind === "hospital" && (
          <text x={l.x - l.w / 4} y={l.y - l.h / 2 + l.w / 8 + 10} textAnchor="middle" fontSize="30" fontWeight="800" fill="#0d9488">+</text>
        )}
        {hasSolar && (
          <g>
            <polygon points={`${l.x},${cy - hh} ${l.x + hw},${cy} ${l.x},${cy + hh} ${l.x - hw},${cy}`} fill="#f59e0b" stroke="#92400e" strokeWidth="1.5" />
            <line x1={l.x - hw / 2} y1={cy - hh / 2} x2={l.x + hw / 2} y2={cy + hh / 2} stroke="#92400e" strokeWidth="1" />
            <line x1={l.x + hw / 2} y1={cy - hh / 2} x2={l.x - hw / 2} y2={cy + hh / 2} stroke="#92400e" strokeWidth="1" />
            <circle cx={l.x + l.w / 2 + 4} cy={topY - 2} r="13" fill="#fde68a" stroke="#fff" strokeWidth="2" />
            <Sun x={l.x + l.w / 2 - 4} y={topY - 10} size={16} color="#7c2d12" strokeWidth={2.2} />
          </g>
        )}
      </Box>
      <Label x={l.x} y={ly} w={lw} title={b.name} sub={sub} selected={selected} />
    </g>
  );
}

export default function NeighborhoodTwin({ neighborhood, sim, loading, hour, selectedId, onSelect }) {
  const items = useMemo(() => {
    const simById = Object.fromEntries((sim?.buildings ?? []).map((s) => [s.id, s]));
    return (neighborhood?.buildings ?? []).map((b, i) => {
      const kind = resolveKind(b, i);
      return { ...b, kind, layout: LAYOUT[kind], palette: PALETTE[kind], sim: simById[b.id] };
    });
  }, [neighborhood, sim]);

  if (!items.length) {
    return (
      <section className="grid min-h-[420px] place-items-center rounded-3xl border border-slate-200 bg-white p-6 text-slate-500 shadow-sm">
        <p className="flex items-center gap-2 font-medium"><Loader2 className="animate-spin" size={18} /> Loading neighborhood…</p>
      </section>
    );
  }

  const t = sim?.totals;
  const bat = sim?.battery;
  const batFrac = bat && bat.capacity_kwh > 0 ? Math.min(1, Math.max(0, bat.soc_after_kwh / bat.capacity_kwh)) : 0;
  const charging = bat && bat.soc_after_kwh > bat.soc_before_kwh + 0.01;
  const selected = items.find((i) => i.id === selectedId) ?? null;

  // ---- build flows from backend values ----
  const flows = [];
  items.forEach((b) => {
    const net = b.sim?.net_kw;
    if (net == null || Math.abs(net) < 0.05) return;
    const a = anchorPoint(b.layout);
    const h = hubPoint(a);
    if (net > 0) flows.push({ key: b.id, from: h, to: a, color: "teal", width: strokeFor(net) });
    else flows.push({ key: b.id, from: a, to: h, color: "amber", width: strokeFor(-net) });
  });
  const gridH = hubPoint(GRID);
  if (t?.grid_import_kw > 0.05) flows.push({ key: "grid-in", from: GRID, to: gridH, color: "navy", width: strokeFor(t.grid_import_kw) });
  else if (t?.grid_export_kw > 0.05) flows.push({ key: "grid-out", from: gridH, to: GRID, color: "amber", width: strokeFor(t.grid_export_kw) });
  const batA = { x: BATTERY.x, y: BATTERY.y - BATTERY.h - BATTERY.w / 4 };
  const batH = hubPoint(batA);
  if (t?.battery_discharge_kw > 0.05) flows.push({ key: "bat-out", from: batA, to: batH, color: "emerald", width: strokeFor(t.battery_discharge_kw) });
  else if (charging) flows.push({ key: "bat-in", from: batH, to: batA, color: "emerald", width: 3 });

  const { x: bx, y: by, w: bw, h: bh } = BATTERY;
  const fillPts = `${bx},${by + bw / 4 - batFrac * bh} ${bx + bw / 2},${by - batFrac * bh} ${bx + bw / 2},${by} ${bx},${by + bw / 4}`;

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h2 className="text-lg font-bold">Neighborhood Twin</h2>
          <p className="text-sm text-slate-500 flex items-center gap-1.5">
            <MousePointerClick size={14} /> Click a building to inspect it
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-sm font-semibold">
          {loading && <span className="inline-flex items-center gap-1.5 text-slate-600"><Loader2 size={14} className="animate-spin" /> Simulating…</span>}
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 ${isDaylight(hour) ? "bg-amber-100 text-amber-900" : "bg-slate-200 text-slate-800"}`}>
            {isDaylight(hour) ? <Sun size={14} /> : <Moon size={14} />} {formatHour(hour)}
          </span>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800">Synthetic demo data</span>
        </div>
      </div>

      <div className={`mt-2 overflow-x-auto transition-opacity ${loading ? "opacity-70" : ""}`}>
        <svg viewBox="0 0 900 570" className="w-full min-w-[640px] h-auto" role="group" aria-label="Isometric neighborhood energy twin">
          <defs>
            {Object.entries(COLORS).map(([name, c]) => (
              <marker key={name} id={`arrow-${name}`} viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="16" markerHeight="16" orient="auto">
                <path d="M0 0 L10 5 L0 10 z" fill={c} />
              </marker>
            ))}
          </defs>

          {/* ground plate */}
          <polygon points="30,310 30,326 450,536 870,326 870,310 450,520" fill="#cfe5d9" />
          <polygon points="450,100 870,310 450,520 30,310" fill="#ecf7f1" stroke="#cfe8dc" strokeWidth="2" />
          {[0.25, 0.5, 0.75].map((f) => (
            <g key={f} stroke="#d5ebdf" strokeWidth="1.5">
              <line x1={450 - 420 * f + 420 * (1 - f) * 0} y1={100 + 210 * f} x2={450 + 420 * (1 - f) - 420 * (1 - f) + 420 * (1 - f)} y2={310 + 210 * (1 - f) - 210 * (1 - f) + 0} opacity="0" />
              <line x1={450 - 420 * f} y1={100 + 210 * f} x2={450 + 420 * (1 - f)} y2={100 + 210 * f + 210 * (1 - f) * 0 + 210 * (1 - f)} />
              <line x1={450 + 420 * f} y1={100 + 210 * f} x2={450 - 420 * (1 - f)} y2={100 + 210 * f + 210 * (1 - f)} />
            </g>
          ))}

          {/* energy flows (under buildings) */}
          {flows.map(({ key, ...f }) => <Flow key={key} {...f} />)}

          {/* utility grid pylon */}
          <g>
            <g stroke="#1e3a6e" strokeWidth="3" fill="none" strokeLinecap="round">
              <line x1="450" y1="82" x2="428" y2="162" />
              <line x1="450" y1="82" x2="472" y2="162" />
              <line x1="436" y1="122" x2="464" y2="122" />
              <line x1="441" y1="102" x2="459" y2="102" />
              <line x1="430" y1="150" x2="470" y2="150" />
              <line x1="436" y1="122" x2="470" y2="150" />
              <line x1="464" y1="122" x2="430" y2="150" />
              <line x1="420" y1="102" x2="480" y2="102" />
            </g>
            <Label x={450} y={26} w={170}
              title="Utility Grid"
              sub={t ? (t.grid_import_kw > 0.05 ? `↓ ${fmt(t.grid_import_kw)} kW import` : t.grid_export_kw > 0.05 ? `↑ ${fmt(t.grid_export_kw)} kW export` : "balanced") : "—"} />
          </g>

          {/* hub */}
          <circle cx={HUB.x} cy={HUB.y} r={HUB_R} fill="#fff" stroke="#059669" strokeWidth="3" />
          <path d={`M${HUB.x + 3} ${HUB.y - 11} L${HUB.x - 7} ${HUB.y + 2} H${HUB.x} L${HUB.x - 3} ${HUB.y + 11} L${HUB.x + 7} ${HUB.y - 2} H${HUB.x} Z`} fill="#f59e0b" stroke="#b45309" strokeWidth="1" />
          <text x={HUB.x} y={HUB.y + 40} textAnchor="middle" fontSize="13" fontWeight="600" fill="#475569">Local microgrid</text>

          {/* community battery */}
          <g>
            <Box x={bx} y={by} w={bw} h={bh} palette={{ top: "#d1fae5", left: "#a7f3d0", right: "#d1d5db" }}>
              <polygon points={fillPts} fill="#059669" />
            </Box>
            <Label x={bx} y={by + bw / 4 + 8} w={160} title="Community Battery"
              sub={bat ? `${fmt(bat.soc_after_kwh, 0)} / ${fmt(bat.capacity_kwh, 0)} kWh` : "—"} />
          </g>

          {/* buildings */}
          {items.map((b) => (
            <Building key={b.id} b={b} selected={b.id === selectedId} onSelect={onSelect} />
          ))}
        </svg>
      </div>

      {/* legend */}
      <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
        {[["amber", "Solar surplus / export"], ["teal", "Supplying a building"], ["navy", "Grid import"], ["emerald", "Battery"]].map(([c, label]) => (
          <span key={c} className="inline-flex items-center gap-2">
            <span className="h-1.5 w-6 rounded-full" style={{ background: COLORS[c] }} /> {label}
          </span>
        ))}
      </div>

      {/* building chips (also handy on mobile) */}
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((b) => (
          <button
            key={b.id} type="button" onClick={() => onSelect(b.id)} aria-pressed={b.id === selectedId}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
              b.id === selectedId ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {b.name}
          </button>
        ))}
      </div>

      {/* detail panel */}
      <div className="mt-3 rounded-2xl bg-slate-50 p-4">
        {selected ? (
          <>
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h3 className="text-lg font-bold">{selected.name}</h3>
              <span className="text-sm capitalize text-slate-500">{selected.type}</span>
              {selected.solar_capacity_kw > 0 && (
                <span className="text-sm text-amber-700 font-semibold">☀ {fmt(selected.solar_capacity_kw, 0)} kW solar capacity</span>
              )}
            </div>
            {selected.sim ? (
              <div className="mt-2 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-white p-3">
                  <p className="text-sm text-slate-500">Current demand</p>
                  <p className="text-2xl font-extrabold">{fmt(selected.sim.demand_kw)} <span className="text-sm font-semibold text-slate-500">kW</span></p>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <p className="text-sm text-slate-500">Solar generation</p>
                  <p className="text-2xl font-extrabold text-amber-700">{fmt(selected.sim.solar_kw)} <span className="text-sm font-semibold text-slate-500">kW</span></p>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <p className="text-sm text-slate-500">Net {selected.sim.net_kw > 0 ? "draw" : "surplus"}</p>
                  <p className={`text-2xl font-extrabold ${selected.sim.net_kw > 0 ? "text-teal-700" : "text-emerald-700"}`}>
                    {fmt(Math.abs(selected.sim.net_kw))} <span className="text-sm font-semibold text-slate-500">kW</span>
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-slate-500">Waiting for simulation data…</p>
            )}
          </>
        ) : (
          <p className="text-slate-500">Select a building to see its demand and solar generation.</p>
        )}
      </div>
    </section>
  );
}