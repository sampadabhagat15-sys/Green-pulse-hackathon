"""ECOGRID API. All data is simulated demo data."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import optimizer
import simulator
from models import (
    NeighborhoodResponse,
    OptimizeResponse,
    SimRequest,
    SimulateResponse,
)

app = FastAPI(title="ECOGRID API", description="Simulated neighborhood energy digital twin")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/neighborhood", response_model=NeighborhoodResponse)
def neighborhood():
    return simulator.get_neighborhood()


@app.post("/api/simulate", response_model=SimulateResponse)
def simulate(req: SimRequest):
    # Baseline: no battery dispatch, no load shifting, so SOC is unchanged.
    buildings = simulator.simulate_buildings(req.hour, req.scenario)
    totals = simulator.baseline_totals(buildings)
    return {
        "hour": req.hour,
        "scenario": req.scenario,
        "buildings": buildings,
        "totals": totals,
        "battery": {
            "capacity_kwh": req.battery_capacity_kwh,
            "soc_before_kwh": req.battery_soc_kwh,
            "soc_after_kwh": req.battery_soc_kwh,
        },
    }


@app.post("/api/optimize", response_model=OptimizeResponse)
def optimize(req: SimRequest):
    return optimizer.optimize(
        req.hour,
        req.scenario,
        req.battery_capacity_kwh,
        req.battery_soc_kwh,
        req.allow_load_shifting,
    )