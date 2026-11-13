"""Hourly battery dispatch + load shifting optimizer for one 1-hour interval.

Order of actions (per the spec):
  1. Compute neighborhood deficit/surplus (demand - solar).
  2. Deficit: dispatch battery (limited by SOC * 0.9, 25 kW max delivered power).
  3. If allowed, defer up to 15% of flexible load (residential/office/shopping),
     only as much as is still needed after the battery. Hospital/school never deferred.
  4. Surplus: charge battery (limited by free capacity and 25 kW), export the rest.
  5. grid_import / grid_export follow from power conservation.

Shifted load is NOT eliminated: it moves to another hour.
All inputs are simulated demo data.
"""
from typing import Dict, List

import simulator as sim


def _r(x: float) -> float:
    return round(float(x), 2)


def dispatch(
    hour: int,
    scenario: str,
    battery_capacity_kwh: float,
    battery_soc_kwh: float,
    allow_load_shifting: bool,
) -> Dict:
    """Core calculation. Returns baseline + optimized totals and battery details."""
    buildings = sim.simulate_buildings(hour, scenario)
    baseline = sim.baseline_totals(buildings)

    demand = baseline["demand_kw"]
    solar = baseline["solar_kw"]
    net = demand - solar  # >0 deficit, <0 surplus

    capacity = float(battery_capacity_kwh)
    soc = min(max(float(battery_soc_kwh), 0.0), capacity)
    dt = sim.INTERVAL_HOURS

    flexible_kw = sum(b["demand_kw"] for b in buildings if b["type"] in sim.FLEXIBLE_TYPES)

    discharge_kw = 0.0
    charge_kw = 0.0
    shifted_kw = 0.0
    soc_after = soc

    if net > 0:
        # Energy delivered to the neighborhood = energy drawn from battery * 0.9
        deliverable_kw = soc * sim.BATTERY_DISCHARGE_EFFICIENCY / dt
        discharge_kw = _r(min(net, sim.BATTERY_MAX_DISCHARGE_KW, deliverable_kw))
        drawn_kwh = discharge_kw * dt / sim.BATTERY_DISCHARGE_EFFICIENCY
        soc_after = max(0.0, soc - drawn_kwh)

        remaining = net - discharge_kw
        if allow_load_shifting and remaining > 0:
            shifted_kw = _r(min(remaining, sim.MAX_SHIFT_FRACTION * flexible_kw))

    elif net < 0:
        surplus = -net
        room_kwh = capacity - soc
        max_charge_kw = room_kwh / (sim.BATTERY_CHARGE_EFFICIENCY * dt)
        charge_kw = _r(min(surplus, sim.BATTERY_MAX_CHARGE_KW, max_charge_kw))
        soc_after = min(capacity, soc + charge_kw * dt * sim.BATTERY_CHARGE_EFFICIENCY)

    grid_import = _r(max(0.0, net - discharge_kw - shifted_kw))
    grid_export = _r(max(0.0, -net - charge_kw))

    optimized = {
        "demand_kw": baseline["demand_kw"],
        "solar_kw": baseline["solar_kw"],
        "grid_import_kw": grid_import,
        "grid_export_kw": grid_export,
        "battery_discharge_kw": discharge_kw,
        "shifted_load_kw": shifted_kw,
    }

    return {
        "baseline": baseline,
        "optimized": optimized,
        "charge_kw": charge_kw,
        "soc_before_kwh": _r(soc),
        "soc_after_kwh": _r(soc_after),
        "flexible_kw": _r(flexible_kw),
    }


def _recommendations(d: Dict, allow_load_shifting: bool, capacity: float) -> List[str]:
    base, opt = d["baseline"], d["optimized"]
    net = base["demand_kw"] - base["solar_kw"]
    recs: List[str] = []

    if net > 0:
        if opt["battery_discharge_kw"] > 0:
            drawn = opt["battery_discharge_kw"] / sim.BATTERY_DISCHARGE_EFFICIENCY
            recs.append(
                f"Discharge the community battery at {opt['battery_discharge_kw']} kW this hour "
                f"(drawing {_r(drawn)} kWh from storage at {int(sim.BATTERY_DISCHARGE_EFFICIENCY * 100)}% "
                f"discharge efficiency). Battery SOC goes from {d['soc_before_kwh']} to "
                f"{d['soc_after_kwh']} kWh."
            )
            if opt["battery_discharge_kw"] >= sim.BATTERY_MAX_DISCHARGE_KW:
                recs.append(
                    f"Battery output is capped at the {int(sim.BATTERY_MAX_DISCHARGE_KW)} kW power limit; "
                    "a higher-power inverter would cut grid import further."
                )
            elif d["soc_after_kwh"] <= 0.01:
                recs.append("The battery is fully drained by this dispatch; a larger capacity would help.")
        else:
            recs.append(
                "The battery cannot help this hour because its state of charge is empty. "
                "Charge it during midday solar surplus."
            )

        if allow_load_shifting:
            if opt["shifted_load_kw"] > 0:
                recs.append(
                    f"Defer {opt['shifted_load_kw']} kW of flexible load (residential, office, shopping; "
                    f"max {int(sim.MAX_SHIFT_FRACTION * 100)}% of {d['flexible_kw']} kW). "
                    "This load is moved to another hour, not eliminated. Hospital load is never deferred."
                )
            else:
                recs.append("No load shifting was needed because the battery covered the deficit.")
        else:
            recs.append("Load shifting is off. Enable it to defer up to 15% of flexible load this hour.")

        if opt["grid_import_kw"] > 0:
            recs.append(f"The remaining {opt['grid_import_kw']} kW deficit is still imported from the grid.")

    elif net < 0:
        if d["charge_kw"] > 0:
            recs.append(
                f"Charge the battery with {d['charge_kw']} kW of surplus solar. "
                f"SOC goes from {d['soc_before_kwh']} to {d['soc_after_kwh']} kWh, "
                "stored for a later deficit hour."
            )
        else:
            recs.append(
                "Solar surplus is available but the battery cannot charge "
                f"(it is full at {d['soc_before_kwh']} of {_r(capacity)} kWh)."
            )
        if opt["grid_export_kw"] > 0:
            recs.append(f"The remaining {opt['grid_export_kw']} kW of surplus is exported to the grid.")
        recs.append("There is no grid import to reduce this hour, so the one-hour grid saving is 0.")
    else:
        recs.append("Local solar exactly matches demand this hour. No optimization action is needed.")

    recs.append(
        f"Cost saving is the avoided grid purchase for this one hour at an assumed INR "
        f"{sim.TARIFF_INR_PER_KWH}/kWh (simulated). It is not a guaranteed net daily saving."
    )
    return recs


def optimize(
    hour: int,
    scenario: str,
    battery_capacity_kwh: float,
    battery_soc_kwh: float,
    allow_load_shifting: bool,
) -> Dict:
    """Payload for POST /api/optimize (exact contract keys)."""
    d = dispatch(hour, scenario, battery_capacity_kwh, battery_soc_kwh, allow_load_shifting)
    base, opt = d["baseline"], d["optimized"]

    reduction = _r(max(0.0, base["grid_import_kw"] - opt["grid_import_kw"]))
    pct = _r(reduction / base["grid_import_kw"] * 100) if base["grid_import_kw"] > 0 else 0.0
    cost = _r(reduction * sim.INTERVAL_HOURS * sim.TARIFF_INR_PER_KWH)

    return {
        "baseline": base,
        "optimized": opt,
        "savings": {
            "grid_reduction_kw": reduction,
            "grid_reduction_pct": pct,
            "estimated_cost_saving_inr": cost,
        },
        "recommendations": _recommendations(d, allow_load_shifting, battery_capacity_kwh),
    }