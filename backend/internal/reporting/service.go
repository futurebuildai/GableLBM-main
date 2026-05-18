package reporting

import (
	"context"
	"fmt"
	"sync"
	"time"
)

const maxCacheEntries = 1000

type cachedReport struct {
	data      interface{}
	timestamp time.Time
}

type Service struct {
	repo       Repository
	cache      map[string]cachedReport
	cacheMutex sync.RWMutex
}

func NewService(repo Repository) *Service {
	return &Service{
		repo:  repo,
		cache: make(map[string]cachedReport),
	}
}

func (s *Service) GetDailyTill(ctx context.Context, dateStr string) (*DailyTillReport, error) {
	// Cache Key
	key := "daily_till:" + dateStr
	if dateStr == "" {
		key += time.Now().Format("2006-01-02")
	}

	// Read Cache
	s.cacheMutex.RLock()
	if item, ok := s.cache[key]; ok {
		if time.Since(item.timestamp) < 60*time.Second {
			s.cacheMutex.RUnlock()
			return item.data.(*DailyTillReport), nil
		}
	}
	s.cacheMutex.RUnlock()

	// Parse date, default to today if empty
	var date time.Time
	var err error
	if dateStr == "" {
		date = time.Now()
	} else {
		date, err = time.Parse("2006-01-02", dateStr)
		if err != nil {
			return nil, err
		}
	}
	data, err := s.repo.GetDailyTill(ctx, date)
	if err != nil {
		return nil, err
	}

	// Write Cache
	s.cacheMutex.Lock()
	if len(s.cache) < maxCacheEntries {
		s.cache[key] = cachedReport{data: data, timestamp: time.Now()}
	}
	s.cacheMutex.Unlock()

	return data, nil
}

func (s *Service) GetSalesSummary(ctx context.Context, startStr, endStr string) (*SalesSummaryReport, error) {
	// Cache Key
	key := "sales_summary:" + startStr + ":" + endStr

	// Read Cache
	s.cacheMutex.RLock()
	if item, ok := s.cache[key]; ok {
		if time.Since(item.timestamp) < 60*time.Second {
			s.cacheMutex.RUnlock()
			return item.data.(*SalesSummaryReport), nil
		}
	}
	s.cacheMutex.RUnlock()

	now := time.Now()
	start := now.AddDate(0, 0, -30) // Default last 30 days
	end := now

	var err error
	if startStr != "" {
		start, err = time.Parse("2006-01-02", startStr)
		if err != nil {
			return nil, err
		}
	}
	if endStr != "" {
		end, err = time.Parse("2006-01-02", endStr)
		if err != nil {
			return nil, err
		}
		// Move end to end of day
		end = end.Add(24*time.Hour - time.Nanosecond)
	}

	data, err := s.repo.GetSalesSummary(ctx, start, end)
	if err != nil {
		return nil, err
	}

	// Write Cache
	s.cacheMutex.Lock()
	if len(s.cache) < maxCacheEntries {
		s.cache[key] = cachedReport{data: data, timestamp: time.Now()}
	}
	s.cacheMutex.Unlock()

	return data, nil
}

func (s *Service) GetARAgingReport(ctx context.Context) (*ARAgingReport, error) {
	key := "ar_aging"

	s.cacheMutex.RLock()
	if item, ok := s.cache[key]; ok {
		if time.Since(item.timestamp) < 60*time.Second {
			s.cacheMutex.RUnlock()
			return item.data.(*ARAgingReport), nil
		}
	}
	s.cacheMutex.RUnlock()

	data, err := s.repo.GetARAgingReport(ctx)
	if err != nil {
		return nil, err
	}

	s.cacheMutex.Lock()
	if len(s.cache) < maxCacheEntries {
		s.cache[key] = cachedReport{data: data, timestamp: time.Now()}
	}
	s.cacheMutex.Unlock()

	return data, nil
}

func (s *Service) GetCustomerStatement(ctx context.Context, customerID, startStr, endStr string) (*CustomerStatement, error) {
	now := time.Now()
	start := now.AddDate(0, -1, 0) // Default last month
	end := now

	var err error
	if startStr != "" {
		start, err = time.Parse("2006-01-02", startStr)
		if err != nil {
			return nil, err
		}
	}
	if endStr != "" {
		end, err = time.Parse("2006-01-02", endStr)
		if err != nil {
			return nil, err
		}
		end = end.Add(24*time.Hour - time.Nanosecond)
	}

	return s.repo.GetCustomerStatement(ctx, customerID, start, end)
}

func (s *Service) CreateSavedReport(ctx context.Context, report *SavedReport) error {
return s.repo.CreateSavedReport(ctx, report)
}

func (s *Service) GetSavedReport(ctx context.Context, id string) (*SavedReport, error) {
return s.repo.GetSavedReport(ctx, id)
}

func (s *Service) ListSavedReports(ctx context.Context) ([]SavedReport, error) {
return s.repo.ListSavedReports(ctx)
}

func (s *Service) UpdateSavedReport(ctx context.Context, report *SavedReport) error {
return s.repo.UpdateSavedReport(ctx, report)
}

func (s *Service) DeleteSavedReport(ctx context.Context, id string) error {
return s.repo.DeleteSavedReport(ctx, id)
}

func (s *Service) CreateReportSchedule(ctx context.Context, schedule *ReportSchedule) error {
return s.repo.CreateReportSchedule(ctx, schedule)
}

func (s *Service) ListReportSchedules(ctx context.Context) ([]ReportSchedule, error) {
return s.repo.ListReportSchedules(ctx)
}

func (s *Service) UpdateReportScheduleNextRun(ctx context.Context, scheduleID string, nextRun time.Time) error {
return s.repo.UpdateReportScheduleNextRun(ctx, scheduleID, nextRun)
}

func (s *Service) ExecuteReportDefinition(ctx context.Context, def *ReportDefinition, entityType string) ([]map[string]interface{}, error) {
	pgRepo, ok := s.repo.(*PostgresRepository)
	if !ok {
		return nil, fmt.Errorf("report builder requires PostgresRepository")
	}
	return BuildAndExecuteQuery(ctx, pgRepo.db.Pool, def, entityType)
}
