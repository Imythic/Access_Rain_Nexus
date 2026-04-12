# 💧 Access Rain Nexus — Rainwater Harvesting Prospecting Engine

A hackathon-ready automated prospecting dashboard for identifying high-value commercial buildings for rainwater harvesting systems across the continental US.

---

## 🏗️ Stack

| Layer       | Technology        | Port  |
|-------------|-------------------|-------|
| Frontend    | HTML + CSS + JS   | 3000  |
| Backend API | Python + FastAPI  | 8000  |
| Logistics   | Go                | 8001  |

---

## 🚀 Quick Start

### macOS/Linux

```bash
chmod +x start.sh
./start.sh
```

### Windows

If using Git Bash, WSL, or similar:

```bash
chmod +x start.sh
./start.sh
```

Alternatively, run the services manually as described in Manual Setup below.

Then open: **http://localhost:3000**

---

## 🔧 Manual Setup

### 1. Python Backend

#### macOS/Linux

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

#### Windows

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

API docs available at: http://localhost:8000/docs

### 2. Go Logistics Service

```bash
cd logistics
go run main.go
```

Requires Go 1.21+. Download from https://go.dev/dl/

### 3. Frontend

#### macOS/Linux

```bash
cd frontend
python3 -m http.server 3000
```

#### Windows

```bash
cd frontend
python -m http.server 3000
```

Open: http://localhost:3000

---

## 📡 API Endpoints

| Method | Endpoint                    | Description                    |
|--------|-----------------------------|--------------------------------|
| GET    | `/buildings`                | All buildings (filterable)     |
| GET    | `/buildings/:id`            | Single building detail         |
| GET    | `/top-buildings`            | Top 10 by viability            |
| GET    | `/metrics`                  | Dashboard metrics + state rank |
| GET    | `/states`                   | Available state codes          |

### Filter params for `/buildings`:
- `state=TX`
- `min_viability_score=70`
- `min_roof_size=100000`
- `cooling_tower=true`
- `high_esg=true`

---

## 🧮 Viability Score Formula

```
Viability Score =
  (0.30 × Water Potential normalized 0–100) +
  (0.30 × Financial ROI normalized 0–100)  +
  (0.20 × ESG Score 0–100)                 +
  (0.20 × CV Detection Confidence 0–100)
```

---

## 🗃️ Project Structure

```
Access Rain-nexus/
├── backend/
│   ├── main.py                 # FastAPI server
│   ├── buildings_data.json     # 100 mock buildings
│   └── requirements.txt
├── frontend/
│   ├── index.html              # Single-page dashboard
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── app.js
├── logistics/
│   ├── main.go                 # Go logistics microservice
│   └── go.mod
├── start.sh                    # One-command launcher
└── README.md
```

---

## ✅ Requirements Checklist

- [x] 100 buildings across continental US states
- [x] Roof size flagging (≥100,000 sqft)
- [x] Cooling tower detection (simulated CV)
- [x] Detection confidence score (0–100)
- [x] Rainfall data by state
- [x] Water potential calculation (gal/year)
- [x] Financial layer (water/sewage cost, savings, ROI)
- [x] Tax incentive flags by state
- [x] ESG scores
- [x] Viability Score Engine (4-component formula)
- [x] Payback period calculation
- [x] Interactive map with color-coded markers
- [x] Popup cards on marker click
- [x] Filtering by state, roof, viability, cooling, ESG
- [x] Top 10 opportunities panel
- [x] Metrics display
- [x] Insights/tags
- [x] Hot leads panel
- [x] Score distribution chart
- [x] State rankings
- [x] Full detail drawer per building
- [x] Go logistics microservice (deployment clustering)


## Creating a .env file for API keys - Ethan Rama

- Navigate to ```/backend``` and add the file via ```touch .env``` or by creating the file in VSCode or whatever IDE you are using. Note that you can create an ```.env``` file in any directory where your source code needs to use an API key
- In the ```.env``` file, put the following: 
```
SERP_API_KEY="your-api-key"
GOOGLE_MAP_API_KEY="your-api-key"
```
You can name the constants whatever you like, but the key will follow after.
- To actually use the API key, the following code is required:
```
import os                             # For loading your key from .env
import serpapi                        # For using SerpAPI

load_dotenv()                         # Loads the .env file in directory
serp_key = os.getenv("SERP_API_KEY")  # Gets the key without exposing it 

# (Must reference the constant name from the .env file)
```
- The reason for using ```.env``` is so others can't access your key. This is important later when you decide to deploy your app to the cloud (Google Cloud, AWS, Azure, Vercel, etc.)
- I've commented out the code in the ```main.py``` file for using the SerpAPI and Google Maps Places API. SerpAPI is trivial, but Google Maps Places API, you will need to create a billing account in the Google Developer Program and enable the API as it won't allow you to anyway else. Just don't leak your API key and don't run too many requests otherwise Google will likely apply charges for each API call.
- I've provided all the dependencies needed in the ```requirements.txt``` file including ```os, dotenv, request```. Just follow the instructions above for the setup and you should be fine. You will need to install the ``golang``` language for the logistics part.