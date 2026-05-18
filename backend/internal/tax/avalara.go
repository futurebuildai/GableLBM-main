package tax

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"
)

// AvalaraConfig holds the credentials and environment for Avalara AvaTax.
type AvalaraConfig struct {
	AccountID   string
	LicenseKey  string
	Environment string // "sandbox" or "production"
	CompanyCode string
}

func (c AvalaraConfig) BaseURL() string {
	if c.Environment == "production" {
		return "https://rest.avatax.com"
	}
	return "https://sandbox-rest.avatax.com"
}

// AvalaraClient implements the Avalara AvaTax REST API.
type AvalaraClient struct {
	config AvalaraConfig
	client *http.Client
	logger *slog.Logger
}

// NewAvalaraClient creates a new Avalara AvaTax API client.
func NewAvalaraClient(cfg AvalaraConfig, logger *slog.Logger) *AvalaraClient {
	return &AvalaraClient{
		config: cfg,
		client: &http.Client{Timeout: 10 * time.Second},
		logger: logger,
	}
}

// --- Avalara API request/response types ---

type avalaraAddress struct {
	Line1      string `json:"line1"`
	Line2      string `json:"line2,omitempty"`
	City       string `json:"city"`
	Region     string `json:"region"` // State/province code
	PostalCode string `json:"postalCode"`
	Country    string `json:"country"`
}

type avalaraLineItem struct {
	Number      string  `json:"number"`
	Quantity    float64 `json:"quantity"`
	Amount      float64 `json:"amount"` // Dollars (Avalara uses dollars)
	TaxCode     string  `json:"taxCode"`
	ItemCode    string  `json:"itemCode,omitempty"`
	Description string  `json:"description,omitempty"`
}

type avalaraCreateTransactionRequest struct {
	Type         string                    `json:"type"` // "SalesInvoice", "ReturnInvoice"
	CompanyCode  string                    `json:"companyCode"`
	Date         string                    `json:"date"` // YYYY-MM-DD
	CustomerCode string                    `json:"customerCode"`
	Commit       bool                      `json:"commit"`
	Addresses    map[string]avalaraAddress `json:"addresses"`
	Lines        []avalaraLineItem         `json:"lines"`
}

type avalaraTaxLine struct {
	LineNumber       string  `json:"lineNumber"`
	Tax              float64 `json:"tax"`
	TaxableAmount    float64 `json:"taxableAmount"`
	Rate             float64 `json:"rate"`
	IsItemTaxable    bool    `json:"isItemTaxable"`
	JurisdictionType string  `json:"jurisdictionType,omitempty"`
}

type avalaraTransactionResponse struct {
	Code        string           `json:"code"`
	TotalTax    float64          `json:"totalTax"`
	TotalAmount float64          `json:"totalAmount"`
	Lines       []avalaraTaxLine `json:"lines"`
	Status      string           `json:"status"`
}

// CalculateTax calls Avalara's CreateTransaction endpoint.
func (c *AvalaraClient) CalculateTax(ctx context.Context, req *TaxPreviewRequest, customerCode string, commit bool) (*TaxResult, error) {
	// Build Avalara request
	avReq := avalaraCreateTransactionRequest{
		Type:         req.DocumentType,
		CompanyCode:  c.config.CompanyCode,
		Date:         time.Now().Format("2006-01-02"),
		CustomerCode: customerCode,
		Commit:       commit,
		Addresses: map[string]avalaraAddress{
			"shipFrom": {
				Line1:      req.ShipFrom.Line1,
				Line2:      req.ShipFrom.Line2,
				City:       req.ShipFrom.City,
				Region:     req.ShipFrom.State,
				PostalCode: req.ShipFrom.PostalCode,
				Country:    req.ShipFrom.Country,
			},
			"shipTo": {
				Line1:      req.ShipTo.Line1,
				Line2:      req.ShipTo.Line2,
				City:       req.ShipTo.City,
				Region:     req.ShipTo.State,
				PostalCode: req.ShipTo.PostalCode,
				Country:    req.ShipTo.Country,
			},
		},
	}

	for _, line := range req.Lines {
		taxCode := line.TaxCode
		if taxCode == "" {
			taxCode = "P0000000" // Default: tangible personal property
		}
		avReq.Lines = append(avReq.Lines, avalaraLineItem{
			Number:      fmt.Sprintf("%d", line.LineNumber),
			Quantity:    line.Quantity,
			Amount:      float64(line.Amount) / 100.0, // Cents to dollars
			TaxCode:     taxCode,
			ItemCode:    line.ItemCode,
			Description: line.Description,
		})
	}

	// Marshal and send
	body, err := json.Marshal(avReq)
	if err != nil {
		return nil, fmt.Errorf("marshal avalara request: %w", err)
	}

	url := c.config.BaseURL() + "/api/v2/transactions/create"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create http request: %w", err)
	}
	httpReq.SetBasicAuth(c.config.AccountID, c.config.LicenseKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("avalara API call failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 10<<20)) // 10MB limit

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		c.logger.Error("Avalara API error", "status", resp.StatusCode, "body", string(respBody))
		return nil, fmt.Errorf("avalara API returned status %d: %s", resp.StatusCode, string(respBody))
	}

	var avResp avalaraTransactionResponse
	if err := json.Unmarshal(respBody, &avResp); err != nil {
		return nil, fmt.Errorf("unmarshal avalara response: %w", err)
	}

	// Convert to our domain model
	result := &TaxResult{
		DocumentCode: avResp.Code,
		TotalAmount:  int64(avResp.TotalAmount * 100),
		TotalTax:     int64(avResp.TotalTax * 100),
		GrandTotal:   int64((avResp.TotalAmount + avResp.TotalTax) * 100),
		IsEstimate:   false,
	}

	for i, avLine := range avResp.Lines {
		taxLine := TaxLine{
			LineNumber: i + 1,
			TaxAmount:  int64(avLine.Tax * 100),
			TaxRate:    avLine.Rate,
			Exempt:     !avLine.IsItemTaxable,
		}
		// Carry forward original line info
		if i < len(req.Lines) {
			taxLine.ItemCode = req.Lines[i].ItemCode
			taxLine.Description = req.Lines[i].Description
			taxLine.Quantity = req.Lines[i].Quantity
			taxLine.Amount = req.Lines[i].Amount
		}
		result.Lines = append(result.Lines, taxLine)
	}

	c.logger.Info("Avalara tax calculated",
		"document_code", avResp.Code,
		"total_tax", avResp.TotalTax,
		"commit", commit,
	)

	return result, nil
}

// CommitTransaction commits a previously created document for filing.
func (c *AvalaraClient) CommitTransaction(ctx context.Context, companyCode, documentCode string) error {
	url := fmt.Sprintf("%s/api/v2/companies/%s/transactions/%s/commit",
		c.config.BaseURL(), companyCode, documentCode)

	body, _ := json.Marshal(map[string]bool{"commit": true})
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create commit request: %w", err)
	}
	httpReq.SetBasicAuth(c.config.AccountID, c.config.LicenseKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.client.Do(httpReq)
	if err != nil {
		return fmt.Errorf("commit API call failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 10<<20)) // 10MB limit
		return fmt.Errorf("commit failed with status %d: %s", resp.StatusCode, string(respBody))
	}

	c.logger.Info("Avalara transaction committed", "document_code", documentCode)
	return nil
}

// VoidTransaction voids a previously committed document (for returns/cancellations).
func (c *AvalaraClient) VoidTransaction(ctx context.Context, companyCode, documentCode string) error {
	url := fmt.Sprintf("%s/api/v2/companies/%s/transactions/%s/void",
		c.config.BaseURL(), companyCode, documentCode)

	body, _ := json.Marshal(map[string]string{"code": "DocVoided"})
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create void request: %w", err)
	}
	httpReq.SetBasicAuth(c.config.AccountID, c.config.LicenseKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.client.Do(httpReq)
	if err != nil {
		return fmt.Errorf("void API call failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 10<<20)) // 10MB limit
		return fmt.Errorf("void failed with status %d: %s", resp.StatusCode, string(respBody))
	}

	c.logger.Info("Avalara transaction voided", "document_code", documentCode)
	return nil
}
