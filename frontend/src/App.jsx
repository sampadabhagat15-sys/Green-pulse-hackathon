import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, RefreshCw, Wifi, WifiOff, FlaskConical, Leaf } from "lucide-react";
import { MOCK_MODE, getHealth, getNeighborhood, simulate, optimize } from "./api";
import NeighborhoodTwin from "./components/NeighborhoodTwin";
import ControlPanel from "./components/ControlPanel";
import KPICards from "./components/KPICards";
import OptimizationResults from "./components/OptimizationResults";

const DEFAULT_PARAMS = {
  hour: 12,
  scenario: "normal",
  battery_capacity_kwh: 100,
  battery_soc_kwh: 60,
  allow_load_shifting: true,
};

export default function App() {
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [neighborhood, setNeighborhood] = useState(null);
  const [sim, setSim] = useState(null);
  const [simLoading, setSimLoading] = useState(false);
  const [opt, setOpt] = useState(null);
  const [optimizing, setOptimizing] = useState(false);
  const [optError, setOptError] = useState(null);
  const [error, setError] = useState(null);
  const [backend, setBackend] = useState("checking"); // checking | online | offline
  const [selectedId, setSelectedId] = useState(null);
  const [retryTick, setRetryTick] = useState(0);

  const simReq = useRef(0);
  const optReq = useRef(0);

  // On mount: health + neighborhood
  const loadNeighborhood = useCallback(() => {
    getHealth()
      .then(() => setBackend("online"))
      .catch(() => setBackend("offline"));
    getNeighborhood()
      .then((d) => {
        if (!d || !Array.isArray(d.buildings) || d.buildings.length === 0) {
          throw new Error("Backend returned no buildings for the neighborhood.");
        }
        setNeighborhood(d);
        setSelectedId((cur) => cur ?? d.buildings[0].id);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    loadNeighborhood();
  }, [loadNeighborhood]);

  // Simulate on mount + whenever controls change (debounced)
  useEffect(() => {
    const id = ++simReq.current;
    setSimLoading(true);
    const t = setTimeout(async () => {
      try {
        const data = await simulate(params);
        if (id !== simReq.current) return;
        if (!data || !data.totals || !Array.isArray(data.buildings)) {
          throw new Error("Backend returned an empty simulation result.");
        }
        setSim(data);
        setError(null);
      } catch (e) {
        if (id === simReq.current) setError(e.message);
      } finally {
        if (id === simReq.current) setSimLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [params, retryTick]);

  // Any input change invalidates old optimization results
  const updateParams = useCallback((partial) => {
    setParams((prev) => {
      const next = { ...prev, ...partial };
      next.battery_soc_kwh = Math.min(next.battery_soc_kwh, next.battery_capacity_kwh);
      return next;
    });
    optReq.current++;
    setOpt(null);
    setOptError(null);
    setOptimizing(false);
  }, []);

  const handleReset = useCallback(() => {
    setParams(DEFAULT_PARAMS);
    optReq.current++;
    setOpt(null);
    setOptError(null);
    setOptimizing(false);
  }, []);

  const handleOptimize = useCallback(async () => {
    const id = ++optReq.current;
    setOptimizing(true);
    setOptError(null);
    try {
      const data = await optimize(params);
      if (id !== optReq.current) return;
      if (!data || !data.baseline || !data.optimized || !data.savings) {
        throw new Error("Backend returned an empty optimization result.");
      }
      setOpt(data);
    } catch (e) {
      if (id === optReq.current) setOptError(e.message);
    } finally {
      if (id === optReq.current) setOptimizing(false);
    }
  }, [params]);

  const handleRetry = () => {
    setError(null);
    if (!neighborhood) loadNeighborhood();
    setRetryTick((n) => n + 1);
  };

  const assumptions = neighborhood?.assumptions;
  const canOptimize = !!sim && !simLoading && !optimizing;

  return (
    <div className="min-h-screen text-navy">
      {MOCK_MODE && (
        <div className="bg-amber-100 text-amber-900 text-sm font-semibold text-center py-2 px-4 flex items-center justify-center gap-2">
          <FlaskConical size={16} /> DEMO MODE: all numbers are mock demonstration data, not from the backend.
        </div>
      )}

      {/* Header */}
      <header className="border-b border-slate-200 bg-white/70 backdrop-blur">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="grid place-items-center h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-sky-500 text-white">
              <Leaf size={20} />
            </span>
            <span className="text-xl font-extrabold tracking-tight">ECOGRID</span>
          </div>
          <span className="hidden sm:block text-slate-300">|</span>
          <span className="text-base font-semibold text-slate-700">Neighborhood Energy Digital Twin</span>
          <span className="hidden sm:block text-slate-300">|</span>
          <span className="text-base font-semibold text-emerald-700">Green Pulse 2026</span>
          <div className="ml-auto flex items-center gap-2 text-sm font-semibold">
            {MOCK_MODE ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 text-amber-900 px-3 py-1">
                <FlaskConical size={14} /> Mock mode
              </span>
            ) : backend === "online" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 text-emerald-800 px-3 py-1">
                <Wifi size={14} /> Backend online
              </span>
            ) : backend === "offline" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 text-red-800 px-3 py-1">
                <WifiOff size={14} /> Backend offline
              </span>
            ) : (
              <span className="rounded-full bg-slate-100 text-slate-600 px-3 py-1">Checking backend…</span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 sm:px-6 pb-10">
        {/* Hero */}
        <section className="pt-6 pb-5 max-w-4xl">
          <h1 className="text-3xl lg:text-4xl font-extrabold leading-tight tracking-tight">
            What if the energy your neighborhood needs is{" "}
            <span className="bg-gradient-to-r from-emerald-600 via-sky-600 to-violet-600 bg-clip-text text-transparent">already being generated next door?</span>
          </h1>
          <p className="mt-2 text-lg text-slate-600">
            Simulate local solar, demand and battery storage to discover smarter neighborhood energy strategies.
          </p>
        </section>

        {error && (
          <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-900">
            <AlertTriangle size={20} className="shrink-0" />
            <p className="font-medium flex-1 min-w-[200px]">{error}</p>
            <button
              onClick={handleRetry}
              className="inline-flex items-center gap-2 rounded-xl bg-white border border-red-200 px-3 py-1.5 text-sm font-semibold hover:bg-red-100"
            >
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        )}

        {/* Twin + controls */}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
          <NeighborhoodTwin
            neighborhood={neighborhood}
            sim={sim}
            loading={simLoading}
            hour={params.hour}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          <ControlPanel
            params={params}
            onChange={updateParams}
            onOptimize={handleOptimize}
            onReset={handleReset}
            optimizing={optimizing}
            canOptimize={canOptimize}
          />
        </div>

        <KPICards sim={sim} loading={simLoading} />

        <OptimizationResults
          opt={opt}
          loading={optimizing}
          error={optError}
          tariff={assumptions?.tariff_inr_per_kwh}
        />
      </main>

      <footer className="border-t border-slate-200 bg-white/60">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-4 text-sm text-slate-600">
          <strong className="text-navy">Data:</strong>{" "}
          {assumptions?.data_source ?? "synthetic demo data"} · Results are modeled estimates, not measured values
          {assumptions?.tariff_inr_per_kwh != null && <> · Tariff ₹{assumptions.tariff_inr_per_kwh}/kWh</>}
          {assumptions?.interval_hours != null && <> · {assumptions.interval_hours}-hour interval</>}
        </div>
      </footer>
    </div>
  );
}