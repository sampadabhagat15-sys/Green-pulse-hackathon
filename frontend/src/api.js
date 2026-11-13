// =====================================================================
//  API LAYER: the ONLY file that knows about the backend or mock data.
//  Toggle MOCK_MODE to switch. Components never change.
// =====================================================================
export const MOCK_MODE = false; // <-- set to true to use built-in DEMONSTRATION data
export const API_BASE_URL = "http://localhost:8000";

// ---------------------------- real backend ----------------------------
async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      signal: controller.signal,
    });
    if (!res.ok) {
      let detail = "";
      try {
        const body = await res.json();
        detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail ?? body);
      } catch {
        /* ignore */
      }
      throw new Error(`Backend error ${res.status}${detail ? `: ${detail}` : ""}`);
    }
    return await res.json();
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Backend timed out. Is it running at ${API_BASE_URL}?`);
    }
    if (err instanceof TypeError) {
      throw new Error(`Cannot reach backend at ${API_BASE_URL}. Check the server is running and CORS allows this origin.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

const realApi = {
  getHealth: () => request("/api/health"),
  getNeighborhood: () => request("/api/neighborhood"),
  simulate: (body) => request("/api/simulate", { method: "POST", body: JSON.stringify(body) }),
  optimize: (body) => request("/api/optimize", { method: "POST", body: JSON.stringify(body) }),
};

// ------------------- mock (DEMONSTRATION DATA ONLY) -------------------
// Same schema as the real API. Numbers here are illustrative, NOT backend output.
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const gauss = (h, mu, s) => Math.exp(-((h - mu) ** 2) / (2 * s * s));
const series = (fn) => Array.from({ length: 24 }, (_, h) => Math.round(fn(h) * 10) / 10);
const r1 = (n) => Math.round(n * 10) / 10;

const MOCK_BUILDINGS = [
  { id: "b1", name: "Residential Apartments", type: "residential", solar_capacity_kw: 30,
    demand_profile_kw: series((h) => 18 + 14 * gauss(h, 8, 1.5) + 34 * gauss(h, 20, 2.2)) },
  { id: "b2", name: "School", type: "school", solar_capacity_kw: 40,
    demand_profile_kw: series((h) => 5 + 30 * gauss(h, 11, 3)) },
  { id: "b3", name: "Office", type: "office", solar_capacity_kw: 50,
    demand_profile_kw: series((h) => 8 + 40 * gauss(h, 13, 3.5)) },
  { id: "b4", name: "Shopping Complex", type: "shopping", solar_capacity_kw: 45,
    demand_profile_kw: series((h) => 10 + 38 * gauss(h, 17, 3.5)) },
  { id: "b5", name: "Hospital", type: "hospital", solar_capacity_kw: 20,
    demand_profile_kw: series((h) => 30 + 12 * gauss(h, 14, 4)) },
];
const SCEN = { normal: { d: 1, s: 1 }, peak: { d: 1.3, s: 1 }, cloudy: { d: 1, s: 0.3 } };
const sunShape = (h) => (h >= 6 && h <= 18 ? Math.sin((Math.PI * (h - 6)) / 12) : 0);

function mockSimulateSync(req) {
  const sc = SCEN[req.scenario] || SCEN.normal;
  const hour = Math.min(23, Math.max(0, Math.round(req.hour)));
  const buildings = MOCK_BUILDINGS.map((b) => {
    const demand = r1(b.demand_profile_kw[hour] * sc.d);
    const solar = r1(b.solar_capacity_kw * sunShape(hour) * sc.s);
    return { id: b.id, name: b.name, type: b.type, demand_kw: demand, solar_kw: solar, net_kw: r1(demand - solar) };
  });
  const demand = r1(buildings.reduce((a, b) => a + b.demand_kw, 0));
  const solar = r1(buildings.reduce((a, b) => a + b.solar_kw, 0));
  const net = demand - solar;
  const soc = Math.min(req.battery_soc_kwh, req.battery_capacity_kwh);
  return {
    hour,
    scenario: req.scenario,
    buildings,
    totals: {
      demand_kw: demand,
      solar_kw: solar,
      grid_import_kw: r1(Math.max(0, net)),
      grid_export_kw: r1(Math.max(0, -net)),
      battery_discharge_kw: 0,
      shifted_load_kw: 0,
    },
    battery: { capacity_kwh: req.battery_capacity_kwh, soc_before_kwh: soc, soc_after_kwh: soc },
  };
}

const mockApi = {
  getHealth: async () => { await delay(150); return { status: "ok" }; },
  getNeighborhood: async () => {
    await delay(250);
    return {
      buildings: MOCK_BUILDINGS,
      assumptions: { interval_hours: 1, tariff_inr_per_kwh: 8, data_source: "MOCK DEMONSTRATION DATA (generated in browser)" },
    };
  },
  simulate: async (req) => { await delay(250); return mockSimulateSync(req); },
  optimize: async (req) => {
    await delay(700);
    const sim = mockSimulateSync(req);
    const base = sim.totals;
    const cap = req.battery_capacity_kwh;
    const soc = Math.min(req.battery_soc_kwh, cap);
    const discharge = r1(Math.max(0, Math.min(base.grid_import_kw, cap * 0.25, soc)));
    const shifted = req.allow_load_shifting
      ? r1(Math.max(0, Math.min(base.grid_import_kw - discharge, base.demand_kw * 0.1)))
      : 0;
    const gridOpt = r1(base.grid_import_kw - discharge - shifted);
    const reduction = r1(base.grid_import_kw - gridOpt);
    const pct = base.grid_import_kw > 0 ? r1((reduction / base.grid_import_kw) * 100) : 0;
    const recs = ["Demonstration output (mock mode): not produced by the backend optimizer."];
    if (discharge > 0) recs.push(`Discharge the community battery by about ${discharge} kW during this hour.`);
    if (shifted > 0) recs.push(`Shift roughly ${shifted} kW of flexible load to a sunnier hour.`);
    if (discharge === 0 && shifted === 0) recs.push("Little grid import to offset at this hour. Try Peak Demand or evening hours.");
    return {
      baseline: base,
      optimized: { ...base, grid_import_kw: gridOpt, battery_discharge_kw: discharge, shifted_load_kw: shifted },
      savings: { grid_reduction_kw: reduction, grid_reduction_pct: pct, estimated_cost_saving_inr: r1(reduction * 8) },
      recommendations: recs,
    };
  },
};

const api = MOCK_MODE ? mockApi : realApi;
export const getHealth = api.getHealth;
export const getNeighborhood = api.getNeighborhood;
export const simulate = api.simulate;
export const optimize = api.optimize;