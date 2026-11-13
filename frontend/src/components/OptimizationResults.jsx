import { Lightbulb, TrendingDown, IndianRupee, Loader2, AlertTriangle, BarChart3 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from "recharts";
import { fmt } from "../utils";

export default function OptimizationResults({ opt, loading, error, tariff }) {
  const data = opt
    ? [
        { name: "Grid import", Baseline: opt.baseline.grid_import_kw, Optimized: opt.optimized.grid_import_kw },
        { name: "Battery discharge", Baseline: opt.baseline.battery_discharge_kw, Optimized: opt.optimized.battery_discharge_kw },
        { name: "Shifted load", Baseline: opt.baseline.shifted_load_kw, Optimized: opt.optimized.shifted_load_kw },
      ]
    : [];

  return (
    <section aria-label="Optimization results" className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      {/* Chart */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <BarChart3 size={20} className="text-emerald-600" /> Baseline vs Optimized (kW)
        </h2>
        <div className="mt-3 h-72">
          {opt ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 20, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 13, fill: "#0b1f3a" }} />
                <YAxis tick={{ fontSize: 13, fill: "#475569" }} />
                <Tooltip formatter={(v) => `${fmt(v)} kW`} />
                <Legend wrapperStyle={{ fontSize: 14 }} />
                <Bar dataKey="Baseline" fill="#64748b" radius={[6, 6, 0, 0]}>
                  <LabelList dataKey="Baseline" position="top" formatter={(v) => fmt(v)} style={{ fontSize: 13, fill: "#0b1f3a" }} />
                </Bar>
                <Bar dataKey="Optimized" fill="#059669" radius={[6, 6, 0, 0]}>
                  <LabelList dataKey="Optimized" position="top" formatter={(v) => fmt(v)} style={{ fontSize: 13, fill: "#0b1f3a" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="grid h-full place-items-center rounded-2xl border-2 border-dashed border-slate-200 text-center text-slate-500 px-6">
              {loading ? (
                <p className="flex items-center gap-2 font-medium"><Loader2 className="animate-spin" size={18} /> Running optimizer…</p>
              ) : (
                <p className="font-medium">Press <strong className="text-emerald-700">Optimize Energy</strong> to compare baseline grid import with the optimized strategy.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">Results</h2>

        {error && (
          <div role="alert" className="mt-3 flex items-start gap-2 rounded-2xl bg-red-50 p-3 text-red-900">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <p className="font-medium">{error}</p>
          </div>
        )}

        {!opt && !error && !loading && (
          <p className="mt-3 text-slate-500">No optimization yet. Results appear here and reset when you change any control.</p>
        )}
        {loading && <p className="mt-3 flex items-center gap-2 text-slate-600"><Loader2 className="animate-spin" size={18} /> Calculating…</p>}

        {opt && (
          <>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-emerald-50 p-4">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800"><TrendingDown size={16} /> Grid reduction</p>
                <p className="mt-1 text-3xl font-extrabold text-emerald-700">{fmt(opt.savings.grid_reduction_pct)}%</p>
                <p className="text-sm text-emerald-800">{fmt(opt.savings.grid_reduction_kw)} kW less import</p>
              </div>
              <div className="rounded-2xl bg-amber-50 p-4">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-800"><IndianRupee size={16} /> One-hour saving</p>
                <p className="mt-1 text-3xl font-extrabold text-amber-700">₹{fmt(opt.savings.estimated_cost_saving_inr)}</p>
                <p className="text-sm text-amber-800">{tariff != null ? `at ₹${tariff}/kWh` : "modeled estimate"}</p>
              </div>
            </div>

            <h3 className="mt-4 flex items-center gap-2 font-bold"><Lightbulb size={18} className="text-amber-500" /> Recommendations</h3>
            {Array.isArray(opt.recommendations) && opt.recommendations.length > 0 ? (
              <ul className="mt-2 space-y-2">
                {opt.recommendations.map((r, i) => (
                  <li key={i} className="rounded-xl bg-slate-50 px-3 py-2 text-slate-700">{r}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-slate-500">No recommendations returned.</p>
            )}
            <p className="mt-3 text-xs text-slate-500">Modeled estimates based on synthetic demo data.</p>
          </>
        )}
      </div>
    </section>
  );
}