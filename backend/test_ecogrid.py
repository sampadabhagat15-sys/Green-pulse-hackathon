"""Tests for ECOGRID backend. Run from backend/: pytest -q"""
import json
import math

import pytest
from fastapi.testclient import TestClient

import simulator as sim
from main import app
from optimizer import dispatch, optimize

client = TestClient(app)
SCENARIOS = ["normal", "peak", "cloudy"]
SOC_VALUES = [0, 10, 60, 100]


def test_solar_zero_at_midnight():
    for scenario in SCENARIOS:
        for b in sim.simulate_buildings(0, scenario):
            assert b["solar_kw"] == 0.0


def test_solar_zero_at_night_and_peaks_near_noon():
    for h in [0, 1, 2, 3, 4, 5, 6, 18, 19, 20, 21, 22, 23]:
        assert sim.baseline_totals(sim.simulate_buildings(h, "normal"))["solar_kw"] == 0.0
    solar = [sim.baseline_totals(sim.simulate_buildings(h, "normal"))["solar_kw"] for h in range(24)]
    assert solar.index(max(solar)) == 12


def test_no_negative_soc_and_never_above_capacity():
    for hour in range(24):
        for scenario in SCENARIOS:
            for soc in SOC_VALUES:
                for shifting in (True, False):
                    d = dispatch(hour, scenario, 100, soc, shifting)
                    assert 0 <= d["soc_after_kwh"] <= 100


def test_power_conservation():
    # demand + battery charge + export == solar + battery discharge + shifted + import
    for hour in range(24):
        for scenario in SCENARIOS:
            for soc in SOC_VALUES:
                d = dispatch(hour, scenario, 100, soc, True)
                o = d["optimized"]
                lhs = o["demand_kw"] + d["charge_kw"] + o["grid_export_kw"]
                rhs = o["solar_kw"] + o["battery_discharge_kw"] + o["shifted_load_kw"] + o["grid_import_kw"]
                assert abs(lhs - rhs) < 0.05, (hour, scenario, soc)


def test_optimized_import_not_above_baseline():
    for hour in range(24):
        for scenario in SCENARIOS:
            for soc in SOC_VALUES:
                for shifting in (True, False):
                    r = optimize(hour, scenario, 100, soc, shifting)
                    assert r["optimized"]["grid_import_kw"] <= r["baseline"]["grid_import_kw"] + 1e-9


def test_battery_limits():
    for hour in range(24):
        d = dispatch(hour, "peak", 100, 100, True)
        assert d["optimized"]["battery_discharge_kw"] <= 25.0
        assert d["charge_kw"] <= 25.0
    # discharge efficiency: 10 kWh stored can deliver at most 9 kW for one hour
    d = dispatch(18, "peak", 100, 10, False)
    assert d["optimized"]["battery_discharge_kw"] == pytest.approx(9.0)
    assert d["soc_after_kwh"] == pytest.approx(0.0, abs=0.01)


def test_load_shifting_cap_and_hospital_excluded():
    d = dispatch(18, "peak", 100, 0, True)
    assert d["optimized"]["shifted_load_kw"] <= 0.15 * d["flexible_kw"] + 1e-9
    buildings = sim.simulate_buildings(18, "peak")
    non_hospital = sum(b["demand_kw"] for b in buildings if b["type"] != "hospital")
    assert d["flexible_kw"] < non_hospital  # school + hospital are not flexible
    off = dispatch(18, "peak", 100, 0, False)
    assert off["optimized"]["shifted_load_kw"] == 0.0


def test_scenario_effects():
    normal_18 = sim.baseline_totals(sim.simulate_buildings(18, "normal"))
    peak_18 = sim.baseline_totals(sim.simulate_buildings(18, "peak"))
    assert peak_18["demand_kw"] == pytest.approx(normal_18["demand_kw"] * 1.3, abs=0.1)

    normal_12 = sim.baseline_totals(sim.simulate_buildings(12, "normal"))
    cloudy_12 = sim.baseline_totals(sim.simulate_buildings(12, "cloudy"))
    assert cloudy_12["solar_kw"] == pytest.approx(normal_12["solar_kw"] * 0.4, abs=0.1)


def test_known_values_evening_peak():
    r = optimize(18, "peak", 100, 60, True)
    assert r["baseline"]["grid_import_kw"] == pytest.approx(289.9)
    assert r["optimized"]["battery_discharge_kw"] == pytest.approx(25.0)
    assert r["optimized"]["shifted_load_kw"] == pytest.approx(29.25)
    assert r["optimized"]["grid_import_kw"] == pytest.approx(235.65)
    assert r["savings"]["estimated_cost_saving_inr"] == pytest.approx(434.0)


# ---------- API tests ----------
PAYLOAD = {
    "hour": 18, "scenario": "peak", "battery_capacity_kwh": 100,
    "battery_soc_kwh": 60, "allow_load_shifting": True,
}


def test_api_health():
    assert client.get("/api/health").json() == {"status": "ok"}


def test_api_neighborhood():
    data = client.get("/api/neighborhood").json()
    assert [b["id"] for b in data["buildings"]] == ["b1", "b2", "b3", "b4", "b5"]
    assert all(len(b["demand_profile_kw"]) == 24 for b in data["buildings"])
    assert data["assumptions"] == {
        "interval_hours": 1, "tariff_inr_per_kwh": 8, "data_source": "synthetic demo data",
    }


def test_api_simulate_is_baseline():
    data = client.post("/api/simulate", json=PAYLOAD).json()
    assert data["totals"]["battery_discharge_kw"] == 0
    assert data["totals"]["shifted_load_kw"] == 0
    assert data["battery"]["soc_before_kwh"] == data["battery"]["soc_after_kwh"] == 60


def test_api_optimize_contract_and_no_nan():
    resp = client.post("/api/optimize", json=PAYLOAD)
    assert resp.status_code == 200
    data = resp.json()
    assert set(data) == {"baseline", "optimized", "savings", "recommendations"}
    assert set(data["savings"]) == {"grid_reduction_kw", "grid_reduction_pct", "estimated_cost_saving_inr"}
    assert len(data["recommendations"]) > 0

    def walk(x):
        if isinstance(x, dict):
            for v in x.values():
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)
        elif isinstance(x, float):
            assert math.isfinite(x)

    walk(data)
    json.dumps(data, allow_nan=False)


@pytest.mark.parametrize("override", [
    {"hour": 24}, {"hour": -1}, {"scenario": "stormy"}, {"battery_soc_kwh": 150}, {"battery_soc_kwh": -5},
])
def test_api_validation_rejects_bad_input(override):
    for path in ("/api/simulate", "/api/optimize"):
        assert client.post(path, json={**PAYLOAD, **override}).status_code == 422