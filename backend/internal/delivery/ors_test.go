package delivery

import (
	"context"
	"encoding/json"
	"io"
	"math"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

// TestLatLngORSConversion guards the #1 porting bug: ORS/VROOM/Pelias use
// [lng, lat], the reverse of the application's lat,lng.
func TestLatLngORSConversion(t *testing.T) {
	ll := LatLng{Lat: 37.7749, Lng: -122.4194}
	c := ll.toORSCoord()
	if c[0] != ll.Lng || c[1] != ll.Lat {
		t.Fatalf("toORSCoord = %v; want [lng,lat] = [%v %v]", c, ll.Lng, ll.Lat)
	}
	back, ok := latLngFromORSCoord([]float64{-122.4194, 37.7749})
	if !ok || back.Lat != 37.7749 || back.Lng != -122.4194 {
		t.Fatalf("latLngFromORSCoord = %v ok=%v; want {37.7749,-122.4194}", back, ok)
	}
	if _, ok := latLngFromORSCoord([]float64{1.0}); ok {
		t.Fatalf("latLngFromORSCoord should reject a short coordinate slice")
	}
}

const vroomResponse = `{
  "code": 0,
  "summary": {"duration": 1800, "distance": 16093.4},
  "routes": [{
    "vehicle": 1,
    "steps": [
      {"type":"start","arrival":0,"duration":0,"distance":0},
      {"type":"job","id":1,"arrival":600,"duration":600,"distance":8046.7},
      {"type":"job","id":0,"arrival":1500,"duration":1500,"distance":16093.4},
      {"type":"end","arrival":1800,"duration":1800,"distance":16093.4}
    ]
  }],
  "unassigned": []
}`

func TestOptimizeRoute_RequestEncodingAndResponseMapping(t *testing.T) {
	const apiKey = "test-key-123"
	var gotBody orsOptimizationRequest
	var gotAuth string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/optimization" {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		gotAuth = r.Header.Get("Authorization")
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, vroomResponse)
	}))
	defer srv.Close()

	c := NewORSClient(apiKey, srv.URL, "driving-hgv", nil)
	origin := LatLng{Lat: 49.0, Lng: -119.0}
	stops := []LatLng{
		{Lat: 49.1, Lng: -119.1}, // stop 0
		{Lat: 49.2, Lng: -119.2}, // stop 1
	}

	res, err := c.OptimizeRoute(context.Background(), origin, stops)
	if err != nil {
		t.Fatalf("OptimizeRoute: %v", err)
	}

	// Auth: ORS POST takes the raw key (no "Bearer ").
	if gotAuth != apiKey {
		t.Errorf("Authorization = %q; want raw key %q", gotAuth, apiKey)
	}

	// Request encoding: coordinates must be [lng, lat].
	if len(gotBody.Vehicles) != 1 {
		t.Fatalf("want 1 vehicle, got %d", len(gotBody.Vehicles))
	}
	v := gotBody.Vehicles[0]
	if v.Profile != "driving-hgv" {
		t.Errorf("vehicle profile = %q; want driving-hgv", v.Profile)
	}
	if v.Start != [2]float64{-119.0, 49.0} || v.End != [2]float64{-119.0, 49.0} {
		t.Errorf("vehicle start/end = %v/%v; want [lng,lat] [-119,49]", v.Start, v.End)
	}
	if len(gotBody.Jobs) != 2 {
		t.Fatalf("want 2 jobs, got %d", len(gotBody.Jobs))
	}
	if gotBody.Jobs[0].Location != [2]float64{-119.1, 49.1} {
		t.Errorf("job 0 location = %v; want [lng,lat] [-119.1,49.1]", gotBody.Jobs[0].Location)
	}
	if gotBody.Options == nil || !gotBody.Options.G {
		t.Errorf("options.g must be true to get distances")
	}

	// Response mapping: optimized order, legs, totals.
	if len(res.OptimizedOrder) != 2 || res.OptimizedOrder[0] != 1 || res.OptimizedOrder[1] != 0 {
		t.Errorf("OptimizedOrder = %v; want [1 0]", res.OptimizedOrder)
	}
	if len(res.Legs) != 2 {
		t.Fatalf("want 2 legs, got %d", len(res.Legs))
	}
	if res.Legs[0].StopIndex != 1 || res.Legs[0].DurationMins != 10 {
		t.Errorf("leg0 = %+v; want StopIndex 1, DurationMins 10", res.Legs[0])
	}
	if !approx(res.Legs[0].DistanceMi, 5.0) {
		t.Errorf("leg0 distance = %v; want ~5.0", res.Legs[0].DistanceMi)
	}
	if res.Legs[1].StopIndex != 0 || res.Legs[1].DurationMins != 15 {
		t.Errorf("leg1 = %+v; want StopIndex 0, DurationMins 15", res.Legs[1])
	}
	if res.TotalDurationMins != 30 || !approx(res.TotalDistanceMi, 10.0) {
		t.Errorf("totals = %d min / %v mi; want 30 / ~10.0", res.TotalDurationMins, res.TotalDistanceMi)
	}
}

const peliasResponse = `{
  "features": [{
    "geometry": {"coordinates": [-122.4194, 37.7749]},
    "properties": {"confidence": 0.93, "match_type": "exact", "label": "123 Main St, Anytown"}
  }]
}`

func TestGeocode_ParsesLngLatAndQuery(t *testing.T) {
	const apiKey = "geo-key"
	var gotQuery string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/geocode/search" {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		gotQuery = r.URL.RawQuery
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, peliasResponse)
	}))
	defer srv.Close()

	c := NewORSClient(apiKey, srv.URL, "", nil)
	gc, err := c.Geocode(context.Background(), "123 Main St, Anytown")
	if err != nil {
		t.Fatalf("Geocode: %v", err)
	}
	// Pelias returns [lng, lat]; we must surface lat,lng correctly.
	if gc.LatLng.Lat != 37.7749 || gc.LatLng.Lng != -122.4194 {
		t.Errorf("geocoded = %+v; want {Lat:37.7749 Lng:-122.4194}", gc.LatLng)
	}
	if gc.Confidence != 0.93 || gc.MatchType != "exact" {
		t.Errorf("confidence/match = %v/%q; want 0.93/exact", gc.Confidence, gc.MatchType)
	}
	if gc.LowConfidence() {
		t.Errorf("0.93 should not be low confidence")
	}
	// GET geocoding takes the key as the api_key query param.
	q, err := url.ParseQuery(gotQuery)
	if err != nil {
		t.Fatalf("parse query: %v", err)
	}
	if q.Get("api_key") != apiKey {
		t.Errorf("api_key query = %q; want %q", q.Get("api_key"), apiKey)
	}
	if q.Get("text") != "123 Main St, Anytown" {
		t.Errorf("text query = %q", q.Get("text"))
	}
}

func approx(a, b float64) bool { return math.Abs(a-b) < 0.05 }
