"""Pydantic models that define the exact ECOGRID API contract."""
from typing import List, Literal

from pydantic import BaseModel, Field, model_validator

Scenario = Literal["normal", "peak", "cloudy"]


# ---------- Request (used by both POST endpoints) ----------
class SimRequest(BaseModel):
    hour: int = Field(..., ge=0, le=23)
    scenario: Scenario
    battery_capacity_kwh: float = Field(..., gt=0)
    battery_soc_kwh: float = Field(..., ge=0)
    allow_load_shifting: bool

    @model_validator(mode="after")
    def soc_within_capacity(self):
        if self.battery_soc_kwh > self.battery_capacity_kwh:
            raise ValueError("battery_soc_kwh must not exceed battery_capacity_kwh")
        return self


# ---------- GET /api/neighborhood ----------
class BuildingInfo(BaseModel):
    id: str
    name: str
    type: str
    solar_capacity_kw: float
    demand_profile_kw: List[float]


class Assumptions(BaseModel):
    interval_hours: int
    tariff_inr_per_kwh: float
    data_source: str


class NeighborhoodResponse(BaseModel):
    buildings: List[BuildingInfo]
    assumptions: Assumptions


# ---------- POST /api/simulate ----------
class BuildingState(BaseModel):
    id: str
    name: str
    type: str
    demand_kw: float
    solar_kw: float
    net_kw: float


class Totals(BaseModel):
    demand_kw: float
    solar_kw: float
    grid_import_kw: float
    grid_export_kw: float
    battery_discharge_kw: float
    shifted_load_kw: float


class BatteryState(BaseModel):
    capacity_kwh: float
    soc_before_kwh: float
    soc_after_kwh: float


class SimulateResponse(BaseModel):
    hour: int
    scenario: Scenario
    buildings: List[BuildingState]
    totals: Totals
    battery: BatteryState


# ---------- POST /api/optimize ----------
class Savings(BaseModel):
    grid_reduction_kw: float
    grid_reduction_pct: float
    estimated_cost_saving_inr: float


class OptimizeResponse(BaseModel):
    baseline: Totals
    optimized: Totals
    savings: Savings
    recommendations: List[str]