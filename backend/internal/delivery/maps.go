package delivery

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// LatLng represents a geographic coordinate.
type LatLng struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

// RouteLeg represents one leg of an optimized route.
type RouteLeg struct {
	StopIndex    int     `json:"stop_index"`
	DurationMins int     `json:"duration_mins"`
	DistanceMi   float64 `json:"distance_miles"`
	ETA          string  `json:"eta"` // ISO 8601 timestamp
}

// RouteOptimizationResult holds the result from the Google Maps Directions API.
type RouteOptimizationResult struct {
	OptimizedOrder    []int      `json:"optimized_order"` // Reordered waypoint indices
	Legs              []RouteLeg `json:"legs"`
	TotalDurationMins int        `json:"total_duration_mins"`
	TotalDistanceMi   float64    `json:"total_distance_miles"`
}

// MapsClient wraps the Google Maps Directions API.
type MapsClient struct {
	apiKey string
	client *http.Client
	logger *slog.Logger
}

// NewMapsClient creates a new Google Maps API client.
func NewMapsClient(apiKey string, logger *slog.Logger) *MapsClient {
	return &MapsClient{
		apiKey: apiKey,
		client: &http.Client{Timeout: 15 * time.Second},
		logger: logger,
	}
}

// --- Google Maps API response types ---

type gmapsDirectionsResponse struct {
	Status string       `json:"status"`
	Routes []gmapsRoute `json:"routes"`
}

type gmapsRoute struct {
	Legs             []gmapsLeg `json:"legs"`
	WaypointOrder    []int      `json:"waypoint_order"`
	OverviewPolyline struct {
		Points string `json:"points"`
	} `json:"overview_polyline"`
}

type gmapsLeg struct {
	Duration struct {
		Value int    `json:"value"` // seconds
		Text  string `json:"text"`
	} `json:"duration"`
	Distance struct {
		Value int    `json:"value"` // meters
		Text  string `json:"text"`
	} `json:"distance"`
	StartAddress string `json:"start_address"`
	EndAddress   string `json:"end_address"`
}

// OptimizeRoute calls the Google Maps Directions API with waypoint optimization.
// origin is the starting point (e.g., lumberyard location).
// stops are the delivery stop coordinates.
// Returns the optimized order and per-leg ETAs.
func (m *MapsClient) OptimizeRoute(ctx context.Context, origin LatLng, stops []LatLng) (*RouteOptimizationResult, error) {
	if len(stops) == 0 {
		return &RouteOptimizationResult{}, nil
	}

	// Build waypoints string
	var waypointStrs []string
	for _, s := range stops {
		waypointStrs = append(waypointStrs, fmt.Sprintf("%f,%f", s.Lat, s.Lng))
	}

	// Use the last stop as destination, rest as waypoints with optimize:true
	originStr := fmt.Sprintf("%f,%f", origin.Lat, origin.Lng)
	destinationStr := waypointStrs[len(waypointStrs)-1]

	var waypointsParam string
	if len(waypointStrs) > 1 {
		waypointsParam = "optimize:true|" + strings.Join(waypointStrs[:len(waypointStrs)-1], "|")
	}

	url := fmt.Sprintf(
		"https://maps.googleapis.com/maps/api/directions/json?origin=%s&destination=%s&waypoints=%s&key=%s&departure_time=now",
		originStr, destinationStr, waypointsParam, m.apiKey,
	)

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("create maps request: %w", err)
	}

	resp, err := m.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("maps API call failed: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 10<<20))

	var gmapsResp gmapsDirectionsResponse
	if err := json.Unmarshal(body, &gmapsResp); err != nil {
		return nil, fmt.Errorf("parse maps response: %w", err)
	}

	if gmapsResp.Status != "OK" {
		m.logger.Error("Google Maps API error", "status", gmapsResp.Status)
		return nil, fmt.Errorf("maps API returned status: %s", gmapsResp.Status)
	}

	if len(gmapsResp.Routes) == 0 {
		return nil, fmt.Errorf("no routes returned from Maps API")
	}

	route := gmapsResp.Routes[0]
	result := &RouteOptimizationResult{
		OptimizedOrder: route.WaypointOrder,
	}

	// Calculate cumulative ETAs
	now := time.Now()
	cumulativeSecs := 0
	for i, leg := range route.Legs {
		cumulativeSecs += leg.Duration.Value
		eta := now.Add(time.Duration(cumulativeSecs) * time.Second)
		distanceMi := float64(leg.Distance.Value) / 1609.34 // meters to miles

		result.Legs = append(result.Legs, RouteLeg{
			StopIndex:    i,
			DurationMins: leg.Duration.Value / 60,
			DistanceMi:   distanceMi,
			ETA:          eta.Format(time.RFC3339),
		})

		result.TotalDurationMins += leg.Duration.Value / 60
		result.TotalDistanceMi += distanceMi
	}

	m.logger.Info("Route optimized via Google Maps",
		"stops", len(stops),
		"total_duration_mins", result.TotalDurationMins,
		"total_distance_miles", fmt.Sprintf("%.1f", result.TotalDistanceMi),
	)

	return result, nil
}

// MockOptimizeRoute returns a mock optimization result for dev/demo when no API key is set.
func MockOptimizeRoute(stops []LatLng) *RouteOptimizationResult {
	result := &RouteOptimizationResult{}
	now := time.Now()

	for i := range stops {
		result.OptimizedOrder = append(result.OptimizedOrder, i)
		eta := now.Add(time.Duration(15*(i+1)) * time.Minute) // 15 min between stops
		result.Legs = append(result.Legs, RouteLeg{
			StopIndex:    i,
			DurationMins: 15,
			DistanceMi:   5.0,
			ETA:          eta.Format(time.RFC3339),
		})
		result.TotalDurationMins += 15
		result.TotalDistanceMi += 5.0
	}

	return result
}
