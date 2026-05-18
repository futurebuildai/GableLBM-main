package reporting

type DailyTillReport struct {
	Date             string             `json:"date"`
	TotalCollected   float64            `json:"total_collected"`
	ByMethod         map[string]float64 `json:"by_method"`
	TransactionCount int                `json:"transaction_count"`
}

type SalesSummaryReport struct {
	StartDate      string  `json:"start_date"`
	EndDate        string  `json:"end_date"`
	TotalInvoiced  float64 `json:"total_invoiced"`
	TotalCollected float64 `json:"total_collected"`
	OutstandingAR  float64 `json:"outstanding_ar"`
	InvoiceCount   int     `json:"invoice_count"`
}

// AR Aging Report
type ARAgingBucket struct {
	CustomerID   string  `json:"customer_id"`
	CustomerName string  `json:"customer_name"`
	Current      float64 `json:"current"`   // 0-30 days
	Days31to60   float64 `json:"days_31_60"`
	Days61to90   float64 `json:"days_61_90"`
	Over90       float64 `json:"over_90"`
	Total        float64 `json:"total"`
}

type ARAgingReport struct {
	AsOfDate      string          `json:"as_of_date"`
	Buckets       []ARAgingBucket `json:"buckets"`
	TotalCurrent  float64         `json:"total_current"`
	Total31to60   float64         `json:"total_31_60"`
	Total61to90   float64         `json:"total_61_90"`
	TotalOver90   float64         `json:"total_over_90"`
	GrandTotal    float64         `json:"grand_total"`
}

// Customer Statement
type StatementLine struct {
	Date        string  `json:"date"`
	Type        string  `json:"type"`
	Description string  `json:"description"`
	Debit       float64 `json:"debit"`
	Credit      float64 `json:"credit"`
	Balance     float64 `json:"balance"`
}

type CustomerStatement struct {
	CustomerID   string          `json:"customer_id"`
	CustomerName string          `json:"customer_name"`
	StartDate    string          `json:"start_date"`
	EndDate      string          `json:"end_date"`
	OpenBalance  float64         `json:"open_balance"`
	CloseBalance float64         `json:"close_balance"`
	Lines        []StatementLine `json:"lines"`
}

// Ad-Hoc Report Builder Models
type SavedReport struct {
ID             string                 `json:"id"`
Name           string                 `json:"name"`
Description    string                 `json:"description"`
EntityType     string                 `json:"entity_type"`
DefinitionJSON map[string]interface{} `json:"definition_json"`
CreatedBy      string                 `json:"created_by"`
CreatedAt      string                 `json:"created_at"`
UpdatedAt      string                 `json:"updated_at"`
}

type ReportSchedule struct {
ID             string                 `json:"id"`
ReportID       string                 `json:"report_id"`
CronExpression string                 `json:"cron_expression"`
Recipients     []string               `json:"recipients"`
Status         string                 `json:"status"`
LastRunAt      *string                `json:"last_run_at,omitempty"`
NextRunAt      *string                `json:"next_run_at,omitempty"`
CreatedAt      string                 `json:"created_at"`
UpdatedAt      string                 `json:"updated_at"`
}

type ReportDefinition struct {
Columns   []ReportColumn   `json:"columns"`
Filters   []ReportFilter   `json:"filters"`
Groupings []ReportGrouping `json:"groupings"`
}

type ReportColumn struct {
Field       string `json:"field"`
Label       string `json:"label"`
Aggregation string `json:"aggregation,omitempty"` // SUM, COUNT, AVG, etc.
}

type ReportFilter struct {
Field    string      `json:"field"`
Operator string      `json:"operator"` // =, !=, >, <, IN, LIKE, etc.
Value    interface{} `json:"value"`
}

type ReportGrouping struct {
Field string `json:"field"`
}
