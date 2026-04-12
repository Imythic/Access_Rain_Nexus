package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
)

// ─── MODELS ──────────────────────────────────────────────────────────────────

type Building struct {
	ID                   int     `json:"id"`
	Name                 string  `json:"name"`
	State                string  `json:"state"`
	City                 string  `json:"city"`
	Lat                  float64 `json:"lat"`
	Lon                  float64 `json:"lon"`
	RoofSizeSqft         int     `json:"roof_size_sqft"`
	CoolingTower         bool    `json:"cooling_tower"`
	DetectionConfidence  int     `json:"detection_confidence"`
	ViabilityScore       float64 `json:"viability_score"`
	EstimatedAnnualSavings float64 `json:"estimated_annual_savings"`
	WaterPotentialGallons int    `json:"water_potential_gallons"`
	EsgScore             int     `json:"esg_score"`
}

type Route struct {
	FromID        int     `json:"from_id"`
	ToID          int     `json:"to_id"`
	FromName      string  `json:"from_name"`
	ToName        string  `json:"to_name"`
	DistanceKm    float64 `json:"distance_km"`
	Priority      string  `json:"priority"`
}

type RegionCluster struct {
	Region    string    `json:"region"`
	States    []string  `json:"states"`
	Buildings []int     `json:"building_ids"`
	AvgScore  float64   `json:"avg_viability_score"`
	TotalSavings float64 `json:"total_savings"`
}

type LogisticsResponse struct {
	TotalBuildings  int             `json:"total_buildings"`
	Clusters        []RegionCluster `json:"clusters"`
	TopRoutes       []Route         `json:"top_routes"`
	DeploymentOrder []Building      `json:"deployment_order"`
}

// ─── HAVERSINE DISTANCE ───────────────────────────────────────────────────────

func haversine(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371.0
	dLat := (lat2 - lat1) * math.Pi / 180
	dLon := (lon2 - lon1) * math.Pi / 180
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return R * c
}

// ─── REGION DEFINITIONS ───────────────────────────────────────────────────────

var regions = map[string][]string{
	"Northeast": {"NY", "NJ", "MA", "CT", "RI", "NH", "VT", "ME", "PA", "MD", "DE", "VA", "WV"},
	"Southeast": {"GA", "FL", "NC", "SC", "TN", "AL", "MS", "LA", "AR", "KY"},
	"Midwest":   {"IL", "MI", "OH", "IN", "WI", "MN", "IA", "MO", "ND", "SD", "NE", "KS"},
	"Southwest": {"TX", "AZ", "NM", "OK"},
	"West":      {"CA", "WA", "OR", "NV", "UT", "CO", "ID", "MT", "WY"},
}

func getRegion(state string) string {
	for region, states := range regions {
		for _, s := range states {
			if s == state {
				return region
			}
		}
	}
	return "Other"
}

// ─── LOAD BUILDINGS ───────────────────────────────────────────────────────────

func loadBuildings(apiURL string) ([]Building, error) {
	// Try to fetch from Python API if running
	resp, err := http.Get(apiURL + "/buildings")
	if err != nil {
		// Fallback: read from local file
		return loadFromFile()
	}
	defer resp.Body.Close()

	var result struct {
		Buildings []Building `json:"buildings"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return loadFromFile()
	}
	return result.Buildings, nil
}

func loadFromFile() ([]Building, error) {
	data, err := os.ReadFile("buildings_data.json")
	if err != nil {
		return nil, fmt.Errorf("cannot read buildings_data.json: %v", err)
	}
	var buildings []Building
	if err := json.Unmarshal(data, &buildings); err != nil {
		return nil, err
	}
	return buildings, nil
}

// ─── CORS MIDDLEWARE ──────────────────────────────────────────────────────────

func corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next(w, r)
	}
}

// ─── HANDLERS ─────────────────────────────────────────────────────────────────

func logisticsHandler(apiURL string) http.HandlerFunc {
	return corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		buildings, err := loadBuildings(apiURL)
		if err != nil {
			http.Error(w, `{"error":"failed to load buildings"}`, 500)
			return
		}

		// Filter: only viability >= 50
		var viable []Building
		for _, b := range buildings {
			if b.ViabilityScore >= 50 {
				viable = append(viable, b)
			}
		}

		// Build clusters by region
		clusterMap := make(map[string]*RegionCluster)
		for region := range regions {
			clusterMap[region] = &RegionCluster{
				Region: region,
				States: regions[region],
			}
		}

		for _, b := range viable {
			region := getRegion(b.State)
			if c, ok := clusterMap[region]; ok {
				c.Buildings = append(c.Buildings, b.ID)
				c.AvgScore += b.ViabilityScore
				c.TotalSavings += b.EstimatedAnnualSavings
			}
		}

		var clusters []RegionCluster
		for _, c := range clusterMap {
			if len(c.Buildings) > 0 {
				c.AvgScore = math.Round(c.AvgScore/float64(len(c.Buildings))*10) / 10
				c.TotalSavings = math.Round(c.TotalSavings*100) / 100
				clusters = append(clusters, *c)
			}
		}
		sort.Slice(clusters, func(i, j int) bool {
			return clusters[i].AvgScore > clusters[j].AvgScore
		})

		// Compute top routes (nearest high-viability neighbors)
		sort.Slice(viable, func(i, j int) bool {
			return viable[i].ViabilityScore > viable[j].ViabilityScore
		})

		var routes []Route
		top := viable
		if len(top) > 20 {
			top = top[:20]
		}
		for i := 0; i < len(top) && len(routes) < 10; i++ {
			minDist := math.MaxFloat64
			bestJ := -1
			for j := 0; j < len(top); j++ {
				if i == j {
					continue
				}
				d := haversine(top[i].Lat, top[i].Lon, top[j].Lat, top[j].Lon)
				if d < minDist {
					minDist = d
					bestJ = j
				}
			}
			if bestJ >= 0 {
				priority := "Standard"
				if top[i].ViabilityScore >= 80 {
					priority = "High Priority"
				}
				routes = append(routes, Route{
					FromID:     top[i].ID,
					ToID:       top[bestJ].ID,
					FromName:   top[i].Name,
					ToName:     top[bestJ].Name,
					DistanceKm: math.Round(minDist*10) / 10,
					Priority:   priority,
				})
			}
		}

		// Deployment order: sort by viability desc
		deployOrder := make([]Building, len(viable))
		copy(deployOrder, viable)
		sort.Slice(deployOrder, func(i, j int) bool {
			return deployOrder[i].ViabilityScore > deployOrder[j].ViabilityScore
		})
		if len(deployOrder) > 15 {
			deployOrder = deployOrder[:15]
		}

		resp := LogisticsResponse{
			TotalBuildings:  len(viable),
			Clusters:        clusters,
			TopRoutes:       routes,
			DeploymentOrder: deployOrder,
		}
		json.NewEncoder(w).Encode(resp)
	})
}

func clusterHandler(apiURL string) http.HandlerFunc {
	return corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		buildings, err := loadBuildings(apiURL)
		if err != nil {
			http.Error(w, `{"error":"failed to load buildings"}`, 500)
			return
		}

		stateQuery := strings.ToUpper(r.URL.Query().Get("state"))
		minScore := 0.0
		if ms := r.URL.Query().Get("min_score"); ms != "" {
			minScore, _ = strconv.ParseFloat(ms, 64)
		}

		var filtered []Building
		for _, b := range buildings {
			if stateQuery != "" && b.State != stateQuery {
				continue
			}
			if b.ViabilityScore < minScore {
				continue
			}
			filtered = append(filtered, b)
		}

		sort.Slice(filtered, func(i, j int) bool {
			return filtered[i].ViabilityScore > filtered[j].ViabilityScore
		})

		json.NewEncoder(w).Encode(map[string]interface{}{
			"count":     len(filtered),
			"buildings": filtered,
		})
	})
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"service": "RainUSE Nexus Logistics Engine",
		"version": "1.0.0",
	})
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

func main() {
	port := os.Getenv("LOGISTICS_PORT")
	if port == "" {
		port = "8001"
	}
	apiURL := os.Getenv("API_URL")
	if apiURL == "" {
		apiURL = "http://localhost:8000"
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", healthHandler)
	mux.HandleFunc("/logistics", logisticsHandler(apiURL))
	mux.HandleFunc("/clusters", clusterHandler(apiURL))

	log.Printf("🚀 RainUSE Nexus Logistics Engine running on :%s", port)
	log.Printf("   API URL: %s", apiURL)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}
