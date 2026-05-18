package dashboard

import (
	"context"
	"sync"
	"time"

	"github.com/gablelbm/gable/pkg/branchctx"
	"github.com/google/uuid"
)

// cache is a type-safe, TTL-based in-memory cache.
type cache[T any] struct {
	data      T
	timestamp time.Time
	valid     bool
}

// branchCache is a per-branch keyed cache. The zero uuid.UUID key is used for
// the admin "all branches" variant.
type branchCache[T any] struct {
	mu      sync.RWMutex
	entries map[uuid.UUID]*cache[T]
}

func newBranchCache[T any]() *branchCache[T] {
	return &branchCache[T]{entries: make(map[uuid.UUID]*cache[T])}
}

func (b *branchCache[T]) get(key uuid.UUID, ttl time.Duration) (T, bool) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	if e, ok := b.entries[key]; ok && e.valid && time.Since(e.timestamp) < ttl {
		return e.data, true
	}
	var zero T
	return zero, false
}

func (b *branchCache[T]) set(key uuid.UUID, data T) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.entries[key] = &cache[T]{data: data, timestamp: time.Now(), valid: true}
}

// cacheStore holds all dashboard caches, keyed by branch.
type cacheStore struct {
	ttl             time.Duration
	summary         *branchCache[*DashboardSummary]
	inventoryAlerts *branchCache[[]InventoryAlert]
	topCustomers    *branchCache[[]TopCustomer]
	orderActivity   *branchCache[*OrderActivity]
	revenueTrend    *branchCache[[]RevenueTrendPoint]
}

func newCacheStore(ttl time.Duration) *cacheStore {
	return &cacheStore{
		ttl:             ttl,
		summary:         newBranchCache[*DashboardSummary](),
		inventoryAlerts: newBranchCache[[]InventoryAlert](),
		topCustomers:    newBranchCache[[]TopCustomer](),
		orderActivity:   newBranchCache[*OrderActivity](),
		revenueTrend:    newBranchCache[[]RevenueTrendPoint](),
	}
}

// Service provides dashboard business logic with type-safe per-branch caching.
type Service struct {
	repo  Repository
	store *cacheStore
}

// NewService creates a new dashboard service.
func NewService(repo Repository) *Service {
	return &Service{
		repo:  repo,
		store: newCacheStore(60 * time.Second),
	}
}

// branchKey returns the cache key for the request's branch context. A nil
// branch (admin "all branches") is keyed as uuid.Nil.
func branchKey(ctx context.Context) (uuid.UUID, *uuid.UUID) {
	id := branchctx.IDForQuery(ctx)
	if id == nil {
		return uuid.Nil, nil
	}
	return *id, id
}

// GetSummary returns the dashboard summary with caching.
func (s *Service) GetSummary(ctx context.Context) (*DashboardSummary, error) {
	key, branchID := branchKey(ctx)
	if cached, ok := s.store.summary.get(key, s.store.ttl); ok {
		return cached, nil
	}

	data, err := s.repo.GetDashboardSummary(ctx, branchID)
	if err != nil {
		return nil, err
	}

	s.store.summary.set(key, data)
	return data, nil
}

// GetInventoryAlerts returns inventory alerts with caching.
func (s *Service) GetInventoryAlerts(ctx context.Context) ([]InventoryAlert, error) {
	key, branchID := branchKey(ctx)
	if cached, ok := s.store.inventoryAlerts.get(key, s.store.ttl); ok {
		return cached, nil
	}

	data, err := s.repo.GetInventoryAlerts(ctx, branchID, 10)
	if err != nil {
		return nil, err
	}

	s.store.inventoryAlerts.set(key, data)
	return data, nil
}

// GetTopCustomers returns top customers with caching.
func (s *Service) GetTopCustomers(ctx context.Context) ([]TopCustomer, error) {
	key, branchID := branchKey(ctx)
	if cached, ok := s.store.topCustomers.get(key, s.store.ttl); ok {
		return cached, nil
	}

	data, err := s.repo.GetTopCustomers(ctx, branchID, 5, 30)
	if err != nil {
		return nil, err
	}

	s.store.topCustomers.set(key, data)
	return data, nil
}

// GetOrderActivity returns order activity with caching.
func (s *Service) GetOrderActivity(ctx context.Context) (*OrderActivity, error) {
	key, branchID := branchKey(ctx)
	if cached, ok := s.store.orderActivity.get(key, s.store.ttl); ok {
		return cached, nil
	}

	data, err := s.repo.GetOrderActivity(ctx, branchID, 10)
	if err != nil {
		return nil, err
	}

	s.store.orderActivity.set(key, data)
	return data, nil
}

// GetRevenueTrend returns revenue trend for chart.
func (s *Service) GetRevenueTrend(ctx context.Context) ([]RevenueTrendPoint, error) {
	key, branchID := branchKey(ctx)
	if cached, ok := s.store.revenueTrend.get(key, s.store.ttl); ok {
		return cached, nil
	}

	data, err := s.repo.GetRevenueTrend(ctx, branchID, 7)
	if err != nil {
		return nil, err
	}

	s.store.revenueTrend.set(key, data)
	return data, nil
}
