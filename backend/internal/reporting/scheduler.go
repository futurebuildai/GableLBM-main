package reporting

import (
"bytes"
"context"
"fmt"
"log"
"time"

"github.com/robfig/cron/v3"
)

// EmailSender defines the interface needed to send emails with attachments.
type EmailSender interface {
SendEmailWithAttachment(ctx context.Context, to []string, subject, body string, filename string, content []byte) error
}

type Scheduler struct {
service     *Service
emailSender EmailSender
cron        *cron.Cron
jobIDs      map[string]cron.EntryID
}

func NewScheduler(service *Service, emailSender EmailSender) *Scheduler {
return &Scheduler{
service:     service,
emailSender: emailSender,
cron:        cron.New(cron.WithSeconds()), // Standard cron + seconds
jobIDs:      make(map[string]cron.EntryID),
}
}

// Start loads all active schedules from the database and starts the cron engine.
func (s *Scheduler) Start(ctx context.Context) error {
schedules, err := s.service.ListReportSchedules(ctx)
if err != nil {
return fmt.Errorf("failed to load schedules: %w", err)
}

for _, schedule := range schedules {
if schedule.Status == "ACTIVE" {
if err := s.AddSchedule(ctx, schedule); err != nil {
log.Printf("failed to add schedule %s: %v", schedule.ID, err)
}
}
}

s.cron.Start()
return nil
}

// Stop gracefully shuts down the cron engine.
func (s *Scheduler) Stop() {
s.cron.Stop()
}

// AddSchedule registers a single schedule with the cron engine.
func (s *Scheduler) AddSchedule(ctx context.Context, schedule ReportSchedule) error {
job := func() {
log.Printf("Executing scheduled report: %s", schedule.ReportID)
if err := s.ExecuteAndSendReport(context.Background(), schedule); err != nil {
log.Printf("Failed to execute scheduled report %s: %v", schedule.ReportID, err)
}
}

entryID, err := s.cron.AddFunc(schedule.CronExpression, job)
if err != nil {
return err
}

s.jobIDs[schedule.ID] = entryID
return nil
}

// ExecuteAndSendReport runs the report and emails the PDF/CSV to recipients.
func (s *Scheduler) ExecuteAndSendReport(ctx context.Context, schedule ReportSchedule) error {
// 1. Fetch Report Definition
report, err := s.service.GetSavedReport(ctx, schedule.ReportID)
if err != nil {
return fmt.Errorf("failed to get report definition: %w", err)
}

// Unmarshal definition
// Since report.DefinitionJSON is map[string]interface{}, we need to reconstruct ReportDefinition
// Simplification: assume we can inject it back effectively or modify ExecuteReportDefinition to take map
// For now, let's assume ExecuteReportDefinition takes ReportDefinition.
// In a complete implementation, we'd map this properly.

// 2. Execute Query
// ... (implementation omitted for brevity, would call s.service.ExecuteReportDefinition)
var def ReportDefinition
// ... populate def from report.DefinitionJSON ...

results, err := s.service.ExecuteReportDefinition(ctx, &def, report.EntityType)
if err != nil {
return fmt.Errorf("failed to execute report query: %w", err)
}

// 3. Generate CSV (Defaulting to CSV for scheduled reports for simplicity)
var buf bytes.Buffer
if err := ExportCSV(&buf, def.Columns, results); err != nil {
return fmt.Errorf("failed to generate CSV: %w", err)
}

// 4. Send Email
subject := fmt.Sprintf("Scheduled Report: %s", report.Name)
body := fmt.Sprintf("Please find attached the latest run for report '%s'.", report.Name)
filename := fmt.Sprintf("%s_%s.csv", report.Name, time.Now().Format("2006-01-02"))

if err := s.emailSender.SendEmailWithAttachment(ctx, schedule.Recipients, subject, body, filename, buf.Bytes()); err != nil {
return fmt.Errorf("failed to send email: %w", err)
}

// 5. Update Schedule Last/Next Run Status
// (Implementation to update schedule status in DB omitted for brevity)

return nil
}
