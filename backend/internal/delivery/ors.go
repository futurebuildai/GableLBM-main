package delivery

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
)

// LatLng represents a geographic coordinate in the conventional lat,lng order
// used throughout the application and the frontend.
//
// IMPORTANT: OpenRouteService / VROOM / Pelias expect coordinates as [lng, lat]
// everywhere — the reverse of Google Maps' lat,lng. To avoid the #1 porting bug,
// every conversion to/from that ordering is centralized in toORSCoord and
// latLngFromORSCoord; call-sites never hand-build a [lng, lat] pair.
type LatLng struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

// toORSCoord converts a LatLng to the [lng, lat] pair ORS/VROOM/Pelias expect.
func (l LatLng) toORSCoord() [2]float64 {
	return [2]float64{l.Lng, l.Lat}
}

// latLngFromORSCoord converts an ORS/Pelias [lng, lat] coordinate pair back into
// a LatLng. Tolerates trailing elements (e.g. elevation) and reports ok=false on
// a short slice so callers can treat a malformed coordinate as a miss.
func latLngFromORSCoord(c []float64) (LatLng, bool) {
	if len(c) < 2 {
		return LatLng{}, false
	}
	return LatLng{Lat: c[1], Lng: c[0]}, true
}

// RouteLeg represents one leg of an optimized route.
type RouteLeg struct {
	StopIndex    int     `json:"stop_index"`
	DurationMins int     `json:"duration_mins"`
	DistanceMi   float64 `json:"distance_miles"`
	ETA          string  `json:"eta"` // ISO 8601 timestamp
}

// RouteOptimizationResult holds the optimized stop ordering and per-leg ETAs.
// The JSON shape is mirrored by app/src/types/notification.ts and must stay
// stable across the Google→OpenRouteService migration.
type RouteOptimizationResult struct {
	OptimizedOrder    []int      `json:"optimized_order"` // Reordered waypoint indices (into the input stops slice)
	Legs              []RouteLeg `json:"legs"`
	TotalDurationMins int        `json:"total_duration_mins"`
	TotalDistanceMi   float64    `json:"total_distance_miles"`
}

const (
	defaultORSBaseURL = "https://api.openrouteservice.org"
	// driving-hgv routes for heavy-goods vehicles (lumber trucks) rather than cars.
	defaultORSProfile = "driving-hgv"
	// metersPerMile converts ORS distances (meters) to the miles the UI shows.
	metersPerMile = 1609.34
	// lowConfidenceThreshold flags geocodes a dispatcher should sanity-check
	// before relying on the routed location (Pelias confidence is 0..1).
	lowConfidenceThreshold = 0.4
)

// demoAnchor is the map/geocode anchor used by the keyless dev/demo fallbacks
// (mockGeocode) and as the last-resort routing origin. It sits in Kelowna, BC —
// matching the seeded demo branches — so the keyless map stays coherent (stops
// scatter around the yard, not a different city). When an ORS key is present,
// real geocoding replaces this entirely.
var demoAnchor = LatLng{Lat: 49.888, Lng: -119.496}

// ORSClient wraps the OpenRouteService hosted API: VROOM-backed route
// optimization (POST /optimization) and Pelias geocoding (GET /geocode/search).
//
// Auth quirk: ORS POST endpoints take the API key directly in the Authorization
// header (NOT as a Bearer token); GET endpoints take it as the api_key query
// param. Both are handled internally here.
type ORSClient struct {
	apiKey  string
	baseURL string
	profile string
	client  *http.Client
	logger  *slog.Logger
}

// NewORSClient creates an OpenRouteService client. baseURL and profile fall back
// to sensible defaults when empty.
func NewORSClient(apiKey, baseURL, profile string, logger *slog.Logger) *ORSClient {
	if baseURL == "" {
		baseURL = defaultORSBaseURL
	}
	baseURL = strings.TrimRight(baseURL, "/")
	if profile == "" {
		profile = defaultORSProfile
	}
	if logger == nil {
		logger = slog.Default()
	}
	return &ORSClient{
		apiKey:  apiKey,
		baseURL: baseURL,
		profile: profile,
		client:  &http.Client{Timeout: 20 * time.Second},
		logger:  logger,
	}
}

// --- VROOM /optimization request/response types ---

type orsOptimizationRequest struct {
	Jobs     []orsJob     `json:"jobs"`
	Vehicles []orsVehicle `json:"vehicles"`
	Options  *orsOptions  `json:"options,omitempty"`
}

// orsOptions.G requests geometry, which also makes VROOM return per-step and
// summary distances (otherwise distance fields are absent).
type orsOptions struct {
	G bool `json:"g"`
}

type orsJob struct {
	ID       int        `json:"id"`
	Location [2]float64 `json:"location"` // [lng, lat]
}

type orsVehicle struct {
	ID      int        `json:"id"`
	Profile string     `json:"profile"`
	Start   [2]float64 `json:"start"` // [lng, lat]
	End     [2]float64 `json:"end"`   // [lng, lat]
}

type orsOptimizationResponse struct {
	Code    int    `json:"code"` // 0 == success
	Error   string `json:"error"`
	Summary struct {
		Duration float64 `json:"duration"` // seconds (travel time)
		Distance float64 `json:"distance"` // meters (present when options.g)
	} `json:"summary"`
	Routes []struct {
		Vehicle int       `json:"vehicle"`
		Steps   []orsStep `json:"steps"`
	} `json:"routes"`
	Unassigned []struct {
		ID int `json:"id"`
	} `json:"unassigned"`
}

type orsStep struct {
	Type     string  `json:"type"`     // start | job | end | break | pickup | delivery
	ID       int     `json:"id"`       // job id (== input stop index) for type==job
	Arrival  float64 `json:"arrival"`  // cumulative seconds from departure
	Duration float64 `json:"duration"` // cumulative travel seconds at this step
	Distance float64 `json:"distance"` // cumulative meters at this step (options.g)
}

// OptimizeRoute solves a single-vehicle TSP for one route: the vehicle starts
// and ends at the branch origin and visits every stop. It returns the optimized
// visit order (indices into stops), per-leg ETAs, and totals.
//
// We submit exactly one vehicle per call, so the ORS free-tier optimization cap
// of 3 vehicles is never hit. Multi-truck fleet VRP (>1 vehicle in a single
// optimization) is intentionally out of scope here — see
// docs/production-external-services-roadmap.md.
func (c *ORSClient) OptimizeRoute(ctx context.Context, origin LatLng, stops []LatLng) (*RouteOptimizationResult, error) {
	if len(stops) == 0 {
		return &RouteOptimizationResult{}, nil
	}

	reqBody := orsOptimizationRequest{
		Vehicles: []orsVehicle{{
			ID:      1,
			Profile: c.profile,
			Start:   origin.toORSCoord(),
			End:     origin.toORSCoord(),
		}},
		Options: &orsOptions{G: true},
	}
	for i, s := range stops {
		reqBody.Jobs = append(reqBody.Jobs, orsJob{ID: i, Location: s.toORSCoord()})
	}

	payload, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal optimization request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/optimization", bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("create optimization request: %w", err)
	}
	// ORS POST endpoints take the raw API key in Authorization (no "Bearer").
	httpReq.Header.Set("Authorization", c.apiKey)
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "application/json")

	resp, err := c.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("optimization API call failed: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 10<<20))

	if resp.StatusCode != http.StatusOK {
		// 413 == "too many vehicles" (free-tier 3-vehicle cap). We only ever send
		// one vehicle, so a 413 here would indicate a quota/config problem, not a
		// fleet-size problem.
		return nil, fmt.Errorf("optimization API status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var orsResp orsOptimizationResponse
	if err := json.Unmarshal(body, &orsResp); err != nil {
		return nil, fmt.Errorf("parse optimization response: %w", err)
	}
	if orsResp.Code != 0 {
		return nil, fmt.Errorf("optimization error (code %d): %s", orsResp.Code, orsResp.Error)
	}

	// Unassigned stops are surfaced via WARN only: the RouteOptimizationResult
	// JSON contract is frozen (mirrored verbatim by the TS type), so we can't add
	// an `unassigned` field without a coordinated frontend change. With a single
	// unconstrained vehicle the only way a stop goes unassigned is unreachability.
	// The service still keeps every unassigned stop on the route (appended last
	// with no ETA). Carrying the set out-of-band to the UI is a deferred follow-up.
	if len(orsResp.Unassigned) > 0 {
		ids := make([]int, 0, len(orsResp.Unassigned))
		for _, u := range orsResp.Unassigned {
			ids = append(ids, u.ID)
		}
		c.logger.Warn("ORS optimization left stops unassigned (likely unreachable)",
			"unassigned_stop_indices", ids, "count", len(ids))
	}

	if len(orsResp.Routes) == 0 {
		c.logger.Warn("ORS optimization returned no route", "stops", len(stops))
		return &RouteOptimizationResult{}, nil
	}

	result := &RouteOptimizationResult{}
	now := time.Now()
	var prevDur, prevDist float64
	for _, step := range orsResp.Routes[0].Steps {
		if step.Type != "job" {
			// start/end/break steps: carry cumulative trackers forward so the
			// first job's leg is measured from the depot departure.
			prevDur = step.Duration
			prevDist = step.Distance
			continue
		}
		result.OptimizedOrder = append(result.OptimizedOrder, step.ID)
		result.Legs = append(result.Legs, RouteLeg{
			StopIndex:    step.ID,
			DurationMins: int((step.Duration - prevDur) / 60.0),
			DistanceMi:   (step.Distance - prevDist) / metersPerMile,
			ETA:          now.Add(time.Duration(step.Arrival) * time.Second).Format(time.RFC3339),
		})
		prevDur = step.Duration
		prevDist = step.Distance
	}
	result.TotalDurationMins = int(orsResp.Summary.Duration / 60.0)
	result.TotalDistanceMi = orsResp.Summary.Distance / metersPerMile

	c.logger.Info("Route optimized via OpenRouteService",
		"stops", len(stops),
		"profile", c.profile,
		"total_duration_mins", result.TotalDurationMins,
		"total_distance_miles", fmt.Sprintf("%.1f", result.TotalDistanceMi),
	)
	return result, nil
}

// --- Pelias /geocode/search ---

// GeocodeResult is a geocoded address with a confidence score so callers can
// gate low-confidence matches for manual review instead of routing to a wrong
// point.
type GeocodeResult struct {
	LatLng     LatLng
	Confidence float64 // Pelias properties.confidence, 0..1
	MatchType  string  // Pelias properties.match_type (exact, interpolated, ...)
	Label      string  // human-readable matched label
}

// LowConfidence reports whether the match is weak enough to warrant review.
func (g GeocodeResult) LowConfidence() bool { return g.Confidence < lowConfidenceThreshold }

type orsGeocodeResponse struct {
	Features []struct {
		Geometry struct {
			Coordinates []float64 `json:"coordinates"` // [lng, lat]
		} `json:"geometry"`
		Properties struct {
			Confidence float64 `json:"confidence"`
			MatchType  string  `json:"match_type"`
			Label      string  `json:"label"`
		} `json:"properties"`
	} `json:"features"`
}

// Geocode resolves a free-text address to coordinates via ORS/Pelias
// (GET /geocode/search). It is deliberately country-agnostic (the reference
// dataset spans the US and Canada). Pelias returns coordinates in [lng, lat].
func (c *ORSClient) Geocode(ctx context.Context, address string) (*GeocodeResult, error) {
	addr := strings.TrimSpace(address)
	if addr == "" {
		return nil, fmt.Errorf("empty address")
	}

	q := url.Values{}
	q.Set("api_key", c.apiKey)
	q.Set("text", addr)
	q.Set("size", "1")
	endpoint := c.baseURL + "/geocode/search?" + q.Encode()

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("create geocode request: %w", err)
	}
	httpReq.Header.Set("Accept", "application/json")

	resp, err := c.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("geocode API call failed: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 5<<20))

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("geocode API status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var gr orsGeocodeResponse
	if err := json.Unmarshal(body, &gr); err != nil {
		return nil, fmt.Errorf("parse geocode response: %w", err)
	}
	if len(gr.Features) == 0 {
		return nil, fmt.Errorf("no geocode match for address %q", addr)
	}
	f := gr.Features[0]
	ll, ok := latLngFromORSCoord(f.Geometry.Coordinates)
	if !ok {
		return nil, fmt.Errorf("geocode response missing coordinates for %q", addr)
	}
	return &GeocodeResult{
		LatLng:     ll,
		Confidence: f.Properties.Confidence,
		MatchType:  f.Properties.MatchType,
		Label:      f.Properties.Label,
	}, nil
}

// --- Keyless dev/demo fallbacks (no ORS key configured) ---

// MockOptimizeRoute returns a deterministic optimization result for dev/demo
// when no ORS key is set. Visit order is the input order; ETAs are spaced 15
// minutes apart.
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

// mockGeocode produces deterministic coordinates scattered around the demo
// anchor (Kelowna, BC) from an order's UUID. It is the keyless analogue of
// Geocode: with no ORS key configured (e.g. the public demo) delivery stops
// still scatter onto the map instead of vanishing. Real geocoding via Geocode is
// used whenever a key is present.
func mockGeocode(orderID uuid.UUID) LatLng {
	b := orderID[:]
	// Bytes 0 and 1 give a deterministic +/-0.128 deg offset from the anchor.
	latOffset := (float64(int(b[0])) - 128.0) / 1000.0
	lngOffset := (float64(int(b[1])) - 128.0) / 1000.0
	return LatLng{Lat: demoAnchor.Lat + latOffset, Lng: demoAnchor.Lng + lngOffset}
}
