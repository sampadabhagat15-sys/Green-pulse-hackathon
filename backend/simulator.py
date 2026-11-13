"""Synthetic neighborhood data + baseline (no dispatch) hourly simulation.

ALL VALUES ARE SIMULATED DEMO DATA. Nothing here is measured.

Battery assumptions (explicit):
  - interval = 1 hour, so energy_kwh = power_kw * 1
  - max charge power    = 25 kW, charge efficiency    = 1.0
  - max discharge power = 25 kW, discharge efficiency = 0.9
  - round-trip efficiency = 1.0 * 0.9 = 0.9
"""
import math
from typing import Dict, List

# ---------- Assumptions ----------
INTERVAL_HOURS = 1
TARIFF_INR_PER_KWH = 8
DATA_SOURCE = "synthetic demo data"

BATTERY_MAX_CHARGE_KW = 25.0
BATTERY_MAX_DISCHARGE_KW = 25.0
BATTERY_CHARGE_EFFICIENCY = 1.0
BATTERY_DISCHARGE_EFFICIENCY = 0.9

FLEXIBLE_TYPES = {"residential", "office", "shopping"}  # hospital & school are not deferred
MAX_SHIFT_FRACTION = 0.15

PEAK_DEMAND_MULTIPLIER = 1.3     # peak scenario: demand +30%
CLOUDY_SOLAR_MULTIPLIER = 0.4    # cloudy scenario: solar -60%

# ---------- Simulated buildings ----------
# "performance" = simulated shading/orientation factor, internal only (not exposed in the API)
BUILDINGS: List[Dict] = [
    {
        "id": "b1", "name": "Residential Apartments", "type": "residential",
        "solar_capacity_kw": 40.0, "performance": 0.85,
        "demand_profile_kw": [22, 20, 19, 18, 18, 20, 30, 38, 32, 26, 24, 23,
                              24, 24, 25, 28, 35, 48, 58, 64, 62, 52, 38, 28],
    },
    {
        "id": "b2", "name": "School", "type": "school",
        "solar_capacity_kw": 80.0, "performance": 0.95,
        "demand_profile_kw": [6, 6, 6, 6, 6, 8, 15, 35, 52, 58, 60, 60,
                              56, 58, 54, 40, 20, 10, 8, 7, 6, 6, 6, 6],
    },
    {
        "id": "b3", "name": "Office", "type": "office",
        "solar_capacity_kw": 90.0, "performance": 0.95,
        "demand_profile_kw": [8, 8, 8, 8, 8, 10, 18, 38, 58, 66, 70, 72,
                              66, 70, 70, 64, 50, 30, 16, 12, 10, 9, 8, 8],
    },
    {
        "id": "b4", "name": "Shopping Complex", "type": "shopping",
        "solar_capacity_kw": 70.0, "performance": 0.90,
        "demand_profile_kw": [10, 10, 10, 10, 10, 10, 12, 16, 24, 34, 44, 52,
                              58, 62, 66, 70, 74, 78, 76, 68, 52, 34, 18, 12],
    },
    {
        "id": "b5", "name": "Hospital", "type": "hospital",
        "solar_capacity_kw": 50.0, "performance": 0.90,
        "demand_profile_kw": [58, 57, 57, 57, 57, 58, 60, 63, 66, 68, 70, 70,
                              70, 70, 69, 68, 67, 66, 65, 64, 62, 61, 60, 59],
    },
]


def get_neighborhood() -> Dict:
    """Payload for GET /api/neighborhood."""
    return {
        "buildings": [
            {
                "id": b["id"],
                "name": b["name"],
                "type": b["type"],
                "solar_capacity_kw": b["solar_capacity_kw"],
                "demand_profile_kw": [float(x) for x in b["demand_profile_kw"]],
            }
            for b in BUILDINGS
        ],
        "assumptions": {
            "interval_hours": INTERVAL_HOURS,
            "tariff_inr_per_kwh": TARIFF_INR_PER_KWH,
            "data_source": DATA_SOURCE,
        },
    }


def solar_factor(hour: int) -> float:
    """0 at night, smooth sine curve peaking at noon (hour 12)."""
    if hour <= 6 or hour >= 18:
        return 0.0
    return max(0.0, math.sin(math.pi * (hour - 6) / 12))


def simulate_buildings(hour: int, scenario: str) -> List[Dict]:
    """Per-building demand/solar/net for one hour under a scenario."""
    demand_mult = PEAK_DEMAND_MULTIPLIER if scenario == "peak" else 1.0
    solar_mult = CLOUDY_SOLAR_MULTIPLIER if scenario == "cloudy" else 1.0

    result = []
    for b in BUILDINGS:
        demand = round(b["demand_profile_kw"][hour] * demand_mult, 2)
        solar = round(
            b["solar_capacity_kw"] * b["performance"] * solar_factor(hour) * solar_mult, 2
        )
        result.append({
            "id": b["id"],
            "name": b["name"],
            "type": b["type"],
            "demand_kw": demand,
            "solar_kw": solar,
            "net_kw": round(demand - solar, 2),
        })
    return result


def baseline_totals(buildings: List[Dict]) -> Dict:
    """Baseline: no battery dispatch, no load shifting."""
    demand = round(sum(b["demand_kw"] for b in buildings), 2)
    solar = round(sum(b["solar_kw"] for b in buildings), 2)
    return {
        "demand_kw": demand,
        "solar_kw": solar,
        "grid_import_kw": round(max(0.0, demand - solar), 2),
        "grid_export_kw": round(max(0.0, solar - demand), 2),
        "battery_discharge_kw": 0.0,
        "shifted_load_kw": 0.0,
    }