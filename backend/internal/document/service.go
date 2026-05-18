package document

import (
	"context"
	"fmt"

	"github.com/gablelbm/gable/internal/customer"
	"github.com/gablelbm/gable/internal/invoice"
	"github.com/gablelbm/gable/internal/order"
	"github.com/gablelbm/gable/internal/product"

	"github.com/johnfercher/maroto/v2"
	"github.com/johnfercher/maroto/v2/pkg/components/text"
	"github.com/johnfercher/maroto/v2/pkg/config"
	"github.com/johnfercher/maroto/v2/pkg/consts/align"
	"github.com/johnfercher/maroto/v2/pkg/consts/fontstyle"
	"github.com/johnfercher/maroto/v2/pkg/props"
)

type Service struct {
	productRepo product.Repository
}

func NewService(productRepo product.Repository) *Service {
	return &Service{productRepo: productRepo}
}

func (s *Service) GenerateInvoicePDF(ctx context.Context, inv *invoice.Invoice, cust *customer.Customer) ([]byte, error) {
	m := maroto.New(config.NewBuilder().
		WithPageNumber().
		Build())

	m.AddRow(20,
		text.NewCol(12, "GABLE LBM - INVOICE", props.Text{
			Size:  18,
			Style: fontstyle.Bold,
			Align: align.Center,
		}),
	)

	m.AddRow(20,
		text.NewCol(6, fmt.Sprintf("Bill To: %s\nAccount: %s", cust.Name, cust.AccountNumber), props.Text{Size: 10}),
		text.NewCol(6, fmt.Sprintf("Invoice #: %s\nDate: %s", inv.ID, inv.CreatedAt.Format("2006-01-02")), props.Text{Size: 10, Align: align.Right}),
	)

	m.AddRow(10,
		text.NewCol(4, "SKU / Description", props.Text{Style: fontstyle.Bold}),
		text.NewCol(2, "Qty", props.Text{Style: fontstyle.Bold, Align: align.Center}),
		text.NewCol(3, "Price", props.Text{Style: fontstyle.Bold, Align: align.Right}),
		text.NewCol(3, "Total", props.Text{Style: fontstyle.Bold, Align: align.Right}),
	)

	for _, line := range inv.Lines {
		prod, err := s.productRepo.GetProduct(ctx, line.ProductID)
		desc := "Unknown Product"
		if err == nil {
			desc = fmt.Sprintf("%s - %s", prod.SKU, prod.Description)
		}

		m.AddRow(10,
			text.NewCol(4, desc, props.Text{Size: 9}),
			text.NewCol(2, fmt.Sprintf("%.2f", line.Quantity), props.Text{Size: 9, Align: align.Center}),
			text.NewCol(3, fmt.Sprintf("$%.2f", float64(line.PriceEach)/100.0), props.Text{Size: 9, Align: align.Right}),
			text.NewCol(3, fmt.Sprintf("$%.2f", (line.Quantity*float64(line.PriceEach))/100.0), props.Text{Size: 9, Align: align.Right}),
		)
	}

	m.AddRow(15,
		text.NewCol(12, fmt.Sprintf("TOTAL DUE: $%.2f", float64(inv.TotalAmount)/100.0), props.Text{
			Top:   5,
			Style: fontstyle.Bold,
			Align: align.Right,
			Size:  12,
		}),
	)

	// Mock "Pay Now" Link
	m.AddRow(10,
		text.NewCol(12, fmt.Sprintf("PAY ONLINE: https://app.gable.com/pay/%s", inv.ID), props.Text{
			Top:   2,
			Style: fontstyle.Italic,
			Align: align.Center,
			Size:  10,
			Color: &props.Color{Red: 0, Green: 0, Blue: 255},
		}),
	)

	doc, err := m.Generate()
	if err != nil {
		return nil, err
	}
	return doc.GetBytes(), nil
}

func (s *Service) GeneratePickTicketPDF(ctx context.Context, o *order.Order, cust *customer.Customer) ([]byte, error) {
	m := maroto.New(config.NewBuilder().
		WithPageNumber().
		Build())

	m.AddRow(20,
		text.NewCol(12, "PICK TICKET", props.Text{
			Size:  24,
			Style: fontstyle.Bold,
			Align: align.Center,
		}),
	)

	m.AddRow(20,
		text.NewCol(6, fmt.Sprintf("Customer: %s\nJob: %s", cust.Name, "N/A"), props.Text{Size: 10}),
		text.NewCol(6, fmt.Sprintf("Order #: %s\nDate: %s", o.ID, o.CreatedAt.Format("2006-01-02")), props.Text{Size: 10, Align: align.Right}),
	)

	m.AddRow(10,
		text.NewCol(8, "SKU / Description", props.Text{Style: fontstyle.Bold}),
		text.NewCol(4, "Qty to Pick", props.Text{Style: fontstyle.Bold, Align: align.Center}),
	)

	for _, line := range o.Lines {
		prod, err := s.productRepo.GetProduct(ctx, line.ProductID)
		desc := "Unknown Product"
		uom := "EA"
		if err == nil && prod != nil {
			desc = fmt.Sprintf("%s - %s", prod.SKU, prod.Description)
			uom = string(prod.UOMPrimary)
		}

		m.AddRow(18,
			text.NewCol(8, desc, props.Text{Size: 12}),
			text.NewCol(4, fmt.Sprintf("%.2f [%s]", line.Quantity, uom), props.Text{Size: 14, Style: fontstyle.Bold, Align: align.Center}),
		)
	}

	doc, err := m.Generate()
	if err != nil {
		return nil, err
	}
	return doc.GetBytes(), nil
}
