package gl

import (
	"context"

	"github.com/gablelbm/gable/internal/domain"
)

// GLAdapter defines the interface for interacting with external accounting systems
type GLAdapter interface {
	// Name returns the name of the adapter (e.g., "QBO", "NetSuite", "Mock")
	Name() string

	// PostJournalEntry sends a journal entry to the external system
	PostJournalEntry(ctx context.Context, entry domain.JournalEntry) (string, error)

	// SyncCheck validates connectivity
	SyncCheck(ctx context.Context) error
}
