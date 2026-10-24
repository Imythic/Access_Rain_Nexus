"""
AccessRain Nexus - Python FastAPI Backend
Automated Rainwater Harvesting Prospecting Engine
"""

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import json
import os
import math
from typing import Optional
from dotenv import load_dotenv

# import serpapi
# import requests

# load_dotenv()

# places_key = os.getenv("PLACES_API_KEY")
# serp_key = os.getenv("SERP_API_KEY")

# url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"

# # params = {
# #     "location": "32.7767,-96.7970",  # Dallas, TX (lat,lng)
# #     "radius": 1500,                  # meters
# #     "type": "cooling towers",        # optional
# #     "key": places_key
# # }

# response = requests.get(
#     url, 
#     params={
#         "location": "32.7767,-96.7970",  # Dallas, TX (lat,lng)
#         "radius": 1500,                  # meters
#         "type": "cooling towers",        # optional
#         "key": places_key
#     }
# )

# data = response.json()

# for place in data.get("results", []):
#     print(place)

# # client = serpapi.Client(api_key=serp_key)
# # results = client.nearbySearch({
# #   "": ""
# # })
# # local_results = results["local_results"]
# # print(local_results)

app = FastAPI(title="AccessRain Nexus API", version="1.0.0")

# Allow all origins for hackathon demo
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── ENVIRONMENTAL DATA ───────────────────────────────────────────────────────
RAINFALL_BY_STATE = {
    "TX": 28.9, "WA": 37.5, "MI": 32.4, "CA": 22.2, "OR": 43.5,
    "KY": 46.7, "GA": 49.7, "IL": 36.9, "WI": 31.5, "MN": 27.0,
    "MO": 40.4, "NY": 46.2, "NJ": 47.1, "TN": 52.1, "OH": 38.1,
    "KS": 27.3, "AR": 49.3, "VA": 43.6, "MA": 47.7, "NC": 47.8,
    "AZ": 13.6, "NV": 9.5,  "UT": 12.8, "ID": 18.9, "MT": 15.3,
    "NE": 23.6, "IA": 34.7, "NM": 14.6, "CO": 17.1, "FL": 53.7,
    "SC": 48.3, "LA": 57.4, "MS": 55.3, "AL": 53.7, "IN": 40.9,
    "PA": 41.6, "MD": 41.9, "CT": 50.3, "RI": 47.9, "NH": 43.4,
    "VT": 42.8, "ME": 41.7, "ND": 17.8, "SD": 19.6, "WY": 13.3,
    "OK": 35.8, "WV": 44.9, "DE": 45.7,
}

WATER_COST_BY_STATE = {
    "TX": 0.0065, "WA": 0.0048, "MI": 0.0072, "CA": 0.0093, "OR": 0.0051,
    "KY": 0.0060, "GA": 0.0058, "IL": 0.0076, "WI": 0.0064, "MN": 0.0069,
    "MO": 0.0055, "NY": 0.0099, "NJ": 0.0085, "TN": 0.0057, "OH": 0.0067,
    "KS": 0.0059, "AR": 0.0052, "VA": 0.0071, "MA": 0.0101, "NC": 0.0063,
    "AZ": 0.0074, "NV": 0.0082, "UT": 0.0048, "ID": 0.0044, "MT": 0.0043,
    "NE": 0.0053, "IA": 0.0056, "NM": 0.0070, "CO": 0.0068, "FL": 0.0062,
}

SEWAGE_RATE = 0.85  # sewage typically 85% of water cost
TAX_INCENTIVE_STATES = {"TX", "CA", "WA", "OR", "MA", "NY", "CO", "MN", "IL", "GA", "NC"}

ESG_BY_STATE = {
    "CA": 82, "WA": 79, "OR": 77, "MA": 76, "NY": 74, "CO": 73,
    "MN": 70, "IL": 68, "GA": 65, "NC": 64, "TX": 61, "VA": 63,
    "MI": 62, "OH": 59, "TN": 57, "WI": 66, "NJ": 71, "IA": 60,
    "MO": 56, "KY": 54, "AR": 52, "KS": 55, "NE": 53, "UT": 58,
    "ID": 56, "NV": 50, "AZ": 51, "NM": 60, "MT": 57,
}

# ─── LOAD + ENRICH BUILDINGS ──────────────────────────────────────────────────
def load_buildings():
    data_path = os.path.join(os.path.dirname(__file__), "buildings_data.json")
    with open(data_path) as f:
        raw = json.load(f)

    buildings = []
    for b in raw:
        b = dict(b)
        state = b["state"]

        # Environmental layer
        rainfall_in = RAINFALL_BY_STATE.get(state, 30.0)
        # Gallons = roof_sqft * rainfall_in * 0.623 (conversion factor)
        water_potential = round(b["roof_size_sqft"] * rainfall_in * 0.623)
        b["rainfall_inches"] = rainfall_in
        b["water_potential_gallons"] = water_potential

        # Financial layer
        water_cost = WATER_COST_BY_STATE.get(state, 0.0065)
        sewage_cost = water_cost * SEWAGE_RATE
        total_cost_per_gal = water_cost + sewage_cost
        gross_savings = water_potential * total_cost_per_gal
        # Apply 70% capture efficiency and 80% usability
        net_savings = gross_savings * 0.70 * 0.80
        b["water_cost_per_gal"] = round(water_cost, 4)
        b["sewage_cost_per_gal"] = round(sewage_cost, 4)
        b["tax_incentive"] = state in TAX_INCENTIVE_STATES
        tax_multiplier = 1.15 if b["tax_incentive"] else 1.0
        b["estimated_annual_savings"] = round(net_savings * tax_multiplier, 2)

        # Estimate install cost based on roof size
        install_cost = b["roof_size_sqft"] * 1.25
        if b["cooling_tower"]:
            install_cost *= 1.2  # extra complexity
        b["install_cost_estimate"] = round(install_cost, 2)
        payback = install_cost / b["estimated_annual_savings"] if b["estimated_annual_savings"] > 0 else 99
        b["payback_years"] = round(min(payback, 99), 1)

        # ESG layer
        base_esg = ESG_BY_STATE.get(state, 60)
        esg_noise = (b["id"] * 7 + b["roof_size_sqft"] // 10000) % 21 - 10
        b["esg_score"] = max(30, min(100, base_esg + esg_noise))
        b["sustainability_priority"] = b["esg_score"] >= 70

        # Roof flag
        b["large_roof"] = b["roof_size_sqft"] >= 100000

        # ── VIABILITY SCORE ENGINE ──────────────────────────────────────────
        # Normalize water_potential: max assumed ~5M gallons
        wp_norm = min(water_potential / 5_000_000, 1.0) * 100

        # Normalize financial ROI: savings / install_cost, cap at 30% annual ROI
        roi_ratio = b["estimated_annual_savings"] / install_cost if install_cost > 0 else 0
        roi_norm = min(roi_ratio / 0.30, 1.0) * 100

        esg_norm = b["esg_score"]
        conf_norm = b["detection_confidence"]

        viability = (
            0.30 * wp_norm +
            0.30 * roi_norm +
            0.20 * esg_norm +
            0.20 * conf_norm
        )
        b["viability_score"] = round(viability, 1)
        b["roi_percent"] = round(roi_ratio * 100, 1)

        # Tags / insights
        tags = []
        if b["esg_score"] >= 70 and b["viability_score"] >= 70:
            tags.append("High ROI + High ESG")
        if b["large_roof"] and rainfall_in >= 40:
            tags.append("Large Roof + High Rainfall")
        if b["cooling_tower"]:
            tags.append("Cooling Tower Detected")
        if b["tax_incentive"]:
            tags.append("Tax Incentive Available")
        if b["viability_score"] >= 80:
            tags.append("Hot Lead")
        if b["roof_size_sqft"] >= 500000:
            tags.append("Mega Roof")
        b["tags"] = tags

        buildings.append(b)

    return buildings

BUILDINGS = load_buildings()

# ─── ENDPOINTS ────────────────────────────────────────────────────────────────

@app.get("/buildings")
def get_buildings(
    state: Optional[str] = None,
    min_viability_score: float = 0,
    min_roof_size: int = 0,
    cooling_tower: Optional[bool] = None,
    high_esg: Optional[bool] = None,
):
    result = BUILDINGS
    if state:
        result = [b for b in result if b["state"] == state.upper()]
    if min_viability_score > 0:
        result = [b for b in result if b["viability_score"] >= min_viability_score]
    if min_roof_size > 0:
        result = [b for b in result if b["roof_size_sqft"] >= min_roof_size]
    if cooling_tower is not None:
        result = [b for b in result if b["cooling_tower"] == cooling_tower]
    if high_esg:
        result = [b for b in result if b["esg_score"] >= 70]
    return {"count": len(result), "buildings": result}


@app.get("/buildings/{building_id}")
def get_building(building_id: int):
    for b in BUILDINGS:
        if b["id"] == building_id:
            return b
    return {"error": "Building not found"}, 404


@app.get("/top-buildings")
def get_top_buildings(state: Optional[str] = None, limit: int = 10):
    pool = BUILDINGS
    if state:
        pool = [b for b in pool if b["state"] == state.upper()]
    sorted_buildings = sorted(pool, key=lambda x: x["viability_score"], reverse=True)
    return {"buildings": sorted_buildings[:limit]}


@app.get("/metrics")
def get_metrics():
    total_savings = sum(b["estimated_annual_savings"] for b in BUILDINGS)
    total_water = sum(b["water_potential_gallons"] for b in BUILDINGS)
    avg_viability = sum(b["viability_score"] for b in BUILDINGS) / len(BUILDINGS)
    high_value = [b for b in BUILDINGS if b["viability_score"] >= 70]
    hot_leads = [b for b in BUILDINGS if b["viability_score"] >= 80 and b["esg_score"] >= 70]
    
    # State rankings
    states = {}
    for b in BUILDINGS:
        s = b["state"]
        if s not in states:
            states[s] = {"state": s, "count": 0, "total_viability": 0, "total_savings": 0}
        states[s]["count"] += 1
        states[s]["total_viability"] += b["viability_score"]
        states[s]["total_savings"] += b["estimated_annual_savings"]
    
    state_rankings = []
    for s, v in states.items():
        state_rankings.append({
            "state": s,
            "building_count": v["count"],
            "avg_viability": round(v["total_viability"] / v["count"], 1),
            "total_savings": round(v["total_savings"], 2),
        })
    state_rankings.sort(key=lambda x: x["avg_viability"], reverse=True)

    return {
        "total_buildings": len(BUILDINGS),
        "total_annual_savings": round(total_savings, 2),
        "total_water_potential_gallons": total_water,
        "avg_viability_score": round(avg_viability, 1),
        "high_value_count": len(high_value),
        "hot_leads_count": len(hot_leads),
        "top_states": state_rankings[:5],
    }


@app.get("/states")
def get_states():
    states = sorted(set(b["state"] for b in BUILDINGS))
    return {"states": states}


# Serve frontend
frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.exists(frontend_path):
    app.mount("/static", StaticFiles(directory=os.path.join(frontend_path, "css")), name="css_static")

@app.get("/")
def serve_frontend():
    index_path = os.path.join(frontend_path, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "AccessRain Nexus API running. Open frontend/index.html in browser."}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
