import { Activity, Sun, PlugZap, BatteryCharging } from "lucide-react";
import { fmt } from "../utils";

const TONES = {
  navy: { icon: "bg-slate-100 text-navy", value: "text-navy" },
  amber: { icon: "bg-amber-100 text-amber-700", value: "text-amber-700" },
  teal: { icon: "bg-teal-100 text-teal-700", value: "text-teal-700" },
  emerald: { icon: "bg-emerald-100 text-emerald-700", value: "text-emerald-700" },
};

export default function KPICards({ sim, loading }) {
  const t = sim?.totals;
  const b = sim?.battery;
  const cards = [
    { label: "Total Demand", value: t?.demand_kw, unit: "kW", icon: Activity, tone: "navy" },
    { label: "Solar Generated", value: t?.solar_kw, unit: "kW", icon: Sun, tone: "amber" },
    { label: "Grid Import", value: t?.grid_import_kw, unit: "kW", icon: PlugZap, tone: "teal" },
    {
      label: "Battery SOC", value: b?.soc_after_kwh, unit: "kWh", icon: BatteryCharging, tone: "emerald",
      sub: b ? `of ${fmt(b.capacity_kwh, 0)} kWh capacity` : null,
    },
  ];

  return (
    <section aria-label="Key metrics" className={`mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4 transition-opacity ${loading ? "opacity-60" : ""}`}>
      {cards.map(({ label, value, unit, icon: Icon, tone, sub }) => (
        <div key={label} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-slate-600">{label}</p>
            <span className={`grid h-9 w-9 place-items-center rounded-xl ${TONES[tone].icon}`}>
              <Icon size={18} />
            </span>
          </div>
          <p className={`mt-2 text-3xl font-extrabold ${TONES[tone].value}`}>
            {fmt(value)} <span className="text-base font-semibold text-slate-500">{unit}</span>
          </p>
          {sub && <p className="text-sm text-slate-500">{sub}</p>}
        </div>
      ))}
    </section>
  );
}