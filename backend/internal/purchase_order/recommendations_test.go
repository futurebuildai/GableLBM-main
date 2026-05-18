package purchase_order

import (
	"math"
	"testing"
)

func TestCalculateReorderPoint(t *testing.T) {
	tests := []struct {
		name        string
		avgDaily    float64
		leadTime    float64
		safetyStock float64
		expected    float64
	}{
		{
			name:        "standard lumber product",
			avgDaily:    10,
			leadTime:    7,
			safetyStock: 15,
			expected:    85, // (10 * 7) + 15
		},
		{
			name:        "high velocity item",
			avgDaily:    50,
			leadTime:    3,
			safetyStock: 30,
			expected:    180, // (50 * 3) + 30
		},
		{
			name:        "zero sales velocity",
			avgDaily:    0,
			leadTime:    7,
			safetyStock: 0,
			expected:    0,
		},
		{
			name:        "long lead time vendor",
			avgDaily:    5,
			leadTime:    21,
			safetyStock: 25,
			expected:    130, // (5 * 21) + 25
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := CalculateReorderPoint(tt.avgDaily, tt.leadTime, tt.safetyStock)
			if result != tt.expected {
				t.Errorf("CalculateReorderPoint(%v, %v, %v) = %v, want %v",
					tt.avgDaily, tt.leadTime, tt.safetyStock, result, tt.expected)
			}
		})
	}
}

func TestCalculateSafetyStock(t *testing.T) {
	tests := []struct {
		name     string
		zScore   float64
		stdDev   float64
		leadTime float64
		expected float64
	}{
		{
			name:     "95% service level standard",
			zScore:   1.65,
			stdDev:   3.0,
			leadTime: 7.0,
			expected: 1.65 * 3.0 * math.Sqrt(7.0),
		},
		{
			name:     "99% service level",
			zScore:   2.33,
			stdDev:   5.0,
			leadTime: 14.0,
			expected: 2.33 * 5.0 * math.Sqrt(14.0),
		},
		{
			name:     "zero lead time",
			zScore:   1.65,
			stdDev:   3.0,
			leadTime: 0,
			expected: 0,
		},
		{
			name:     "negative lead time returns zero",
			zScore:   1.65,
			stdDev:   3.0,
			leadTime: -1,
			expected: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := CalculateSafetyStock(tt.zScore, tt.stdDev, tt.leadTime)
			if math.Abs(result-tt.expected) > 0.001 {
				t.Errorf("CalculateSafetyStock(%v, %v, %v) = %v, want %v",
					tt.zScore, tt.stdDev, tt.leadTime, result, tt.expected)
			}
		})
	}
}

func TestCalculateEOQ(t *testing.T) {
	tests := []struct {
		name         string
		annualDemand float64
		unitCost     float64
		wantGt       float64 // result should be greater than this
	}{
		{
			name:         "standard product",
			annualDemand: 3650, // 10/day
			unitCost:     5.0,
			wantGt:       0,
		},
		{
			name:         "expensive slow mover",
			annualDemand: 365, // 1/day
			unitCost:     100.0,
			wantGt:       0,
		},
		{
			name:         "zero demand returns zero",
			annualDemand: 0,
			unitCost:     10.0,
			wantGt:       -1, // expect 0
		},
		{
			name:         "zero cost returns zero",
			annualDemand: 100,
			unitCost:     0,
			wantGt:       -1, // expect 0
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := CalculateEOQ(tt.annualDemand, tt.unitCost)
			if tt.wantGt == -1 {
				if result != 0 {
					t.Errorf("CalculateEOQ(%v, %v) = %v, want 0", tt.annualDemand, tt.unitCost, result)
				}
			} else if result <= tt.wantGt {
				t.Errorf("CalculateEOQ(%v, %v) = %v, want > %v", tt.annualDemand, tt.unitCost, result, tt.wantGt)
			}
		})
	}
}

func TestClassifyUrgency(t *testing.T) {
	tests := []struct {
		name         string
		currentStock float64
		reorderPoint float64
		avgDaily     float64
		leadTime     float64
		expected     UrgencyLevel
	}{
		{
			name:         "zero stock is critical",
			currentStock: 0,
			reorderPoint: 50,
			avgDaily:     10,
			leadTime:     7,
			expected:     UrgencyCritical,
		},
		{
			name:         "stock below half lead time is critical",
			currentStock: 20,
			reorderPoint: 100,
			avgDaily:     10,
			leadTime:     7,
			expected:     UrgencyCritical,
		},
		{
			name:         "at reorder point is high",
			currentStock: 50,
			reorderPoint: 50,
			avgDaily:     5,
			leadTime:     7,
			expected:     UrgencyHigh,
		},
		{
			name:         "near reorder point is medium",
			currentStock: 60,
			reorderPoint: 50,
			avgDaily:     5,
			leadTime:     7,
			expected:     UrgencyMedium,
		},
		{
			name:         "well stocked is low",
			currentStock: 200,
			reorderPoint: 50,
			avgDaily:     5,
			leadTime:     7,
			expected:     UrgencyLow,
		},
		{
			name:         "zero sales velocity is low",
			currentStock: 10,
			reorderPoint: 50,
			avgDaily:     0,
			leadTime:     7,
			expected:     UrgencyLow,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ClassifyUrgency(tt.currentStock, tt.reorderPoint, tt.avgDaily, tt.leadTime)
			if result != tt.expected {
				t.Errorf("ClassifyUrgency(%v, %v, %v, %v) = %v, want %v",
					tt.currentStock, tt.reorderPoint, tt.avgDaily, tt.leadTime, result, tt.expected)
			}
		})
	}
}

func TestDaysUntilStockout(t *testing.T) {
	tests := []struct {
		name     string
		stock    float64
		daily    float64
		expected float64
	}{
		{"normal", 100, 10, 10.0},
		{"fractional", 75, 10, 7.5},
		{"zero sales", 100, 0, 999},
		{"zero stock", 0, 10, 0},
		{"negative stock", -5, 10, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := DaysUntilStockout(tt.stock, tt.daily)
			if math.Abs(result-tt.expected) > 0.1 {
				t.Errorf("DaysUntilStockout(%v, %v) = %v, want %v", tt.stock, tt.daily, result, tt.expected)
			}
		})
	}
}
