import { Zap, RotateCcw, Loader2, SlidersHorizontal } from "lucide-react";
import { formatHour } from "../utils";

const SCENARIOS = [
  { value: "normal", label: "Normal" },
  { value: "peak", label: "Peak Demand" },
  { value: "cloudy", label: "Cloudy Day" },
];

export default function ControlPanel({ params, onChange, onOptimize, onReset, optimizing, canOptimize }) {
  const { hour, scenario, battery_capacity_kwh: cap, battery_soc_kwh: soc, allow_load_shifting: shifting } = params;
  const socPct = cap > 0 ? Math.round((soc / cap) * 100) : 0;

  return (
    <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <SlidersHorizontal size={20} className="text-emerald-600" /> Control Panel
      </h2>

      {/* Hour */}
      <div className="mt-5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="hour" className="font-semibold">Hour of day</label>
          <span className="text-emerald-700 font-bold">{formatHour(hour)}</span>
        </div>
        <input
          id="hour" type="range" min={0} max={23} step={1} value={hour}
          onChange={(e) => onChange({ hour: Number(e.target.value) })}
          className="mt-2 w-full h-2 cursor-pointer accent-emerald-600"
        />
        <div className="flex justify-between text-xs text-slate-500 mt-1">
          <span>0</span><span>6</span><span>12</span><span>18</span><span>23</span>
        </div>
      </div>

      {/* Scenario */}
      <div className="mt-5">
        <span id="scenario-label" className="font-semibold">Scenario</span>
        <div role="radiogroup" aria-labelledby="scenario-label" className="mt-2 grid grid-cols-3 gap-1 rounded-2xl bg-slate-100 p-1">
          {SCENARIOS.map((s) => {
            const active = scenario === s.value;
            return (
              <button
                key={s.value} type="button" role="radio" aria-checked={active}
                onClick={() => onChange({ scenario: s.value })}
                className={`rounded-xl px-2 py-2 text-sm font-semibold transition ${
                  active ? "bg-white text-navy shadow ring-1 ring-emerald-500" : "text-slate-600 hover:text-navy"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Battery capacity */}
      <div className="mt-5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="cap" className="font-semibold">Battery capacity</label>
          <span className="text-emerald-700 font-bold">{cap} kWh</span>
        </div>
        <input
          id="cap" type="range" min={20} max={200} step={10} value={cap}
          onChange={(e) => onChange({ battery_capacity_kwh: Number(e.target.value) })}
          className="mt-2 w-full h-2 cursor-pointer accent-emerald-600"
        />
        <div className="flex justify-between text-xs text-slate-500 mt-1"><span>20</span><span>200</span></div>
      </div>

      {/* Battery SOC */}
      <div className="mt-5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="soc" className="font-semibold">Battery state of charge</label>
          <span className="text-emerald-700 font-bold">{soc} kWh ({socPct}%)</span>
        </div>
        <input
          id="soc" type="range" min={0} max={cap} step={5} value={Math.min(soc, cap)}
          onChange={(e) => onChange({ battery_soc_kwh: Number(e.target.value) })}
          className="mt-2 w-full h-2 cursor-pointer accent-emerald-600"
        />
        <div className="flex justify-between text-xs text-slate-500 mt-1"><span>0</span><span>{cap}</span></div>
      </div>

      {/* Load shifting */}
      <div className="mt-5 flex items-center justify-between gap-3">
        <div>
          <p id="shift-label" className="font-semibold">Load shifting</p>
          <p className="text-sm text-slate-500">Move flexible demand off-peak</p>
        </div>
        <button
          type="button" role="switch" aria-checked={shifting} aria-labelledby="shift-label"
          onClick={() => onChange({ allow_load_shifting: !shifting })}
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${shifting ? "bg-emerald-600" : "bg-slate-300"}`}
        >
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${shifting ? "left-6" : "left-1"}`} />
        </button>
      </div>

      {/* Buttons */}
      <div className="mt-6 grid gap-2">
        <button
          type="button" onClick={onOptimize} disabled={!canOptimize}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-base font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {optimizing ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} />}
          {optimizing ? "Optimizing…" : "Optimize Energy"}
        </button>
        <button
          type="button" onClick={onReset}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-700 hover:bg-slate-50"
        >
          <RotateCcw size={16} /> Reset
        </button>
      </div>
    </aside>
  );
}