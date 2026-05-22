package reporting

import (
"encoding/csv"
"fmt"
"io"
"strconv"
"time"

"github.com/johnfercher/maroto/v2"
"github.com/johnfercher/maroto/v2/pkg/components/text"
"github.com/johnfercher/maroto/v2/pkg/config"
"github.com/johnfercher/maroto/v2/pkg/consts/align"
"github.com/johnfercher/maroto/v2/pkg/consts/fontstyle"
"github.com/johnfercher/maroto/v2/pkg/core"
"github.com/johnfercher/maroto/v2/pkg/props"
"github.com/xuri/excelize/v2"
)

// ExportCSV streams the report definition results directly to an io.Writer.
func ExportCSV(w io.Writer, columns []ReportColumn, results []map[string]interface{}) error {
writer := csv.NewWriter(w)
defer writer.Flush()

// Write Headers
headers := make([]string, len(columns))
for i, col := range columns {
if col.Label != "" {
headers[i] = col.Label
} else {
headers[i] = col.Field
}
}
if err := writer.Write(headers); err != nil {
return fmt.Errorf("failed to write CSV headers: %w", err)
}

// Write Data Rows
for _, row := range results {
record := make([]string, len(columns))
for i, col := range columns {
val := row[col.Field]
record[i] = formatValue(val)
}
if err := writer.Write(record); err != nil {
return fmt.Errorf("failed to write CSV row: %w", err)
}
}

return nil
}

// ExportXLSX writes the report definition results to an io.Writer as an Excel file.
func ExportXLSX(w io.Writer, columns []ReportColumn, results []map[string]interface{}) error {
f := excelize.NewFile()
defer func() {
if err := f.Close(); err != nil {
fmt.Println("failed to close excel file:", err)
}
}()

sheetName := "Report"
f.SetSheetName("Sheet1", sheetName)

// Write Headers
for i, col := range columns {
cell, err := excelize.CoordinatesToCellName(i+1, 1)
if err != nil {
return err
}
label := col.Label
if label == "" {
label = col.Field
}
f.SetCellValue(sheetName, cell, label)
}

// Make headers bold
style, err := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true}})
if err == nil {
f.SetRowStyle(sheetName, 1, 1, style)
}

// Write Data Rows
for rowIdx, row := range results {
currentExcelRow := rowIdx + 2
for colIdx, col := range columns {
cell, err := excelize.CoordinatesToCellName(colIdx+1, currentExcelRow)
if err != nil {
return err
}
f.SetCellValue(sheetName, cell, row[col.Field])
}
}

// Output
if err := f.Write(w); err != nil {
return fmt.Errorf("failed to write XLSX: %w", err)
}

return nil
}

// GeneratePDFReport renders the report as a PDF document using maroto v2.
func GeneratePDFReport(w io.Writer, columns []ReportColumn, results []map[string]interface{}) error {
	m := maroto.New(config.NewBuilder().
		WithPageNumber().
		Build())

	// Title row
	m.AddRow(20,
		text.NewCol(12, "GableLBM Report", props.Text{
			Size:  18,
			Style: fontstyle.Bold,
			Align: align.Center,
		}),
	)

	// Generation date row
	m.AddRow(10,
		text.NewCol(12, fmt.Sprintf("Generated: %s", time.Now().Format("2006-01-02 15:04:05")), props.Text{
			Size:  9,
			Align: align.Right,
			Color: &props.Color{Red: 120, Green: 120, Blue: 120},
		}),
	)

	// Column headers
	colSize := 12 / len(columns)
	if colSize < 1 {
		colSize = 1
	}
	var headerCols []core.Col
	for _, col := range columns {
		label := col.Label
		if label == "" {
			label = col.Field
		}
		if col.Aggregation != "" {
			label = fmt.Sprintf("%s (%s)", label, col.Aggregation)
		}
		headerCols = append(headerCols, text.NewCol(colSize, label, props.Text{
			Size:  9,
			Style: fontstyle.Bold,
		}))
	}
	m.AddRow(10, headerCols...)

	// Data rows
	for _, row := range results {
		var dataCols []core.Col
		for _, col := range columns {
			val := formatValue(row[col.Field])
			dataCols = append(dataCols, text.NewCol(colSize, val, props.Text{
				Size: 8,
			}))
		}
		m.AddRow(8, dataCols...)
	}

	doc, err := m.Generate()
	if err != nil {
		return fmt.Errorf("failed to generate PDF: %w", err)
	}

	_, err = w.Write(doc.GetBytes())
	return err
}

func formatValue(val interface{}) string {
if val == nil {
return ""
}
switch v := val.(type) {
case string:
return v
case []byte:
return string(v)
case int, int8, int16, int32, int64:
return fmt.Sprintf("%d", v)
case float32, float64:
return fmt.Sprintf("%f", v)
case bool:
return strconv.FormatBool(v)
default:
return fmt.Sprintf("%v", v)
}
}

