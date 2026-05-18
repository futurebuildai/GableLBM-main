package reporting

import (
"encoding/csv"
"fmt"
"io"
"strconv"

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
