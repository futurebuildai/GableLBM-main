package pricing

import (
	"context"
	"testing"

	"github.com/gablelbm/gable/internal/customer"
	"github.com/google/uuid"
)

type MockRepository struct {
	contracts map[string]CustomerContract
}

func (m *MockRepository) GetContract(ctx context.Context, customerID, productID uuid.UUID) (*CustomerContract, error) {
	key := customerID.String() + ":" + productID.String()
	if c, ok := m.contracts[key]; ok {
		return &c, nil
	}
	return nil, nil // Not found
}

func (m *MockRepository) CreateContract(ctx context.Context, c *CustomerContract) error {
	return nil
}

func (m *MockRepository) GetMatchingRules(ctx context.Context, productID uuid.UUID, customerID *uuid.UUID, jobID *uuid.UUID, quantity float64) ([]PricingRule, error) {
	return nil, nil
}

func (m *MockRepository) CreateRule(ctx context.Context, r *PricingRule) error {
	return nil
}

func (m *MockRepository) ListRules(ctx context.Context) ([]PricingRule, error) {
	return nil, nil
}

func TestCalculatePrice(t *testing.T) {
	repo := &MockRepository{
		contracts: make(map[string]CustomerContract),
	}
	svc := NewService(repo)

	custID := uuid.New()
	prodID := uuid.New()
	basePrice := 10.00

	// Case 1: Retail (No contract, no tier)
	t.Run("Retail Price", func(t *testing.T) {
		cust := &customer.Customer{ID: custID}
		res, err := svc.CalculatePrice(context.Background(), cust, prodID, basePrice)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.FinalPrice != basePrice {
			t.Errorf("expected %.2f, got %.2f", basePrice, res.FinalPrice)
		}
		if res.Source != "RETAIL" {
			t.Errorf("expected RETAIL source, got %s", res.Source)
		}
	})

	// Case 2: Silver Tier (10% off)
	t.Run("Silver Tier", func(t *testing.T) {
		tier := customer.TierSilver
		cust := &customer.Customer{ID: custID, Tier: tier}

		// Expected: 10 * 0.9 = 9.00
		expected := 9.00

		res, err := svc.CalculatePrice(context.Background(), cust, prodID, basePrice)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.FinalPrice != expected {
			t.Errorf("expected %.2f, got %.2f", expected, res.FinalPrice)
		}
		if res.Source != "TIER" {
			t.Errorf("expected TIER source, got %s", res.Source)
		}
	})

	// Case 3: Contract Price
	t.Run("Contract Price", func(t *testing.T) {
		contractPrice := 5.00
		repo.contracts[custID.String()+":"+prodID.String()] = CustomerContract{
			CustomerID:    custID,
			ProductID:     prodID,
			ContractPrice: contractPrice,
		}

		cust := &customer.Customer{ID: custID} // Even if tier exists, contract wins

		res, err := svc.CalculatePrice(context.Background(), cust, prodID, basePrice)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.FinalPrice != contractPrice {
			t.Errorf("expected %.2f, got %.2f", contractPrice, res.FinalPrice)
		}
		if res.Source != "CONTRACT" {
			t.Errorf("expected CONTRACT source, got %s", res.Source)
		}
	})
}
