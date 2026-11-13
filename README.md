# ECOGRID Backend

FastAPI backend for **ECOGRID, a Neighborhood Energy Digital Twin** (Green Pulse 2026).

> **All data is simulated.** Demand profiles, solar capacity and weather scenarios are deterministic synthetic values for demonstration. Nothing here is measured data.

## Setup (macOS / Linux)

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Interactive API docs: http://localhost:8000/docs

## Run tests

```bash
pytest -q
```

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Returns `{"status":"ok"}` |
| GET | `/api/neighborhood` | 5 buildings, 24-hour demand profiles, assumptions |
| POST | `/api/simulate` | Baseline for one hour (no battery dispatch, no load shifting) |
| POST | `/api/optimize` | Baseline vs optimized comparison for one hour |

Request body for both POST endpoints:

```json
{"hour":18,"scenario":"peak","battery_capacity_kwh":100,"battery_soc_kwh":60,"allow_load_shifting":true}
```

Validation: `hour` 0-23, `scenario` is `normal`, `peak` or `cloudy`, and `0 <= battery_soc_kwh <= battery_capacity_kwh`. Invalid input returns HTTP 422.

### Example calls

```bash
curl http://localhost:8000/api/health
curl http://localhost:8000/api/neighborhood
curl -X POST http://localhost:8000/api/optimize \
  -H "Content-Type: application/json" \
  -d '{"hour":18,"scenario":"peak","battery_capacity_kwh":100,"battery_soc_kwh":60,"allow_load_shifting":true}'
```

## Model assumptions

- Buildings: b1 Residential, b2 School, b3 Office, b4 Shopping Complex, b5 Hospital.
- Interval is 1 hour, so `energy_kwh = power_kw x 1 h`.
- Solar is zero from 18:00 to 06:00 and follows a sine curve peaking at 12:00.
- Scenarios: **peak** = demand +30%, **cloudy** = solar -60%.
- Shared battery: max charge 25 kW, max discharge 25 kW, charge efficiency 1.0, discharge efficiency 0.9 (round-trip 0.9). SOC is always kept within 0 to capacity.
- Tariff: INR 8/kWh (assumed).

## Optimization logic

1. Compute neighborhood deficit or surplus (demand - solar).
2. Deficit: discharge the battery, limited by SOC x 0.9 and 25 kW.
3. If `allow_load_shifting` is true, defer up to 15% of flexible load (residential, office, shopping) for whatever deficit remains. Hospital and school load is never deferred.
4. Surplus: charge the battery (25 kW and free capacity limits); the rest is exported.
5. Grid import and export follow from power conservation.

## Important caveats

- **Shifted load is not eliminated.** It moves to another hour.
- Cost savings are **one-hour avoided grid purchases** at the assumed tariff. They are not guaranteed net daily savings.