package gl

import (
	"context"
	"fmt"

	"github.com/gablelbm/gable/internal/domain"
)

type QuickBooksOnlineAdapter struct {
	RealmID string
	// Token storage would go here
}

func NewQBOAdapter(realmID string) *QuickBooksOnlineAdapter {
	return &QuickBooksOnlineAdapter{
		RealmID: realmID,
	}
}

func (q *QuickBooksOnlineAdapter) Name() string {
	return "QuickBooksOnline"
}

func (q *QuickBooksOnlineAdapter) PostJournalEntry(ctx context.Context, entry domain.JournalEntry) (string, error) {
	// TODO: Implement actual QBO API call
	// Example payload construction would happen here
	return "", fmt.Errorf("QBO Sync not yet implemented")
}

func (q *QuickBooksOnlineAdapter) SyncCheck(ctx context.Context) error {
	// TODO: Ping QBO API
	return nil
}

// Ensure interface compliance
var _ GLAdapter = (*QuickBooksOnlineAdapter)(nil)
