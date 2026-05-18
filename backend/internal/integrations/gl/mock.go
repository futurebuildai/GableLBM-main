package gl

import (
	"context"
	"log"

	"github.com/gablelbm/gable/internal/domain"
)

type MockGLAdapter struct{}

func NewMockGLAdapter() *MockGLAdapter {
	return &MockGLAdapter{}
}

func (m *MockGLAdapter) Name() string {
	return "Mock"
}

func (m *MockGLAdapter) PostJournalEntry(ctx context.Context, entry domain.JournalEntry) (string, error) {
	log.Printf("[MockGL] Posting Journal Entry for Ref: %s", entry.ReferenceID)
	for _, line := range entry.Lines {
		log.Printf("  - %s: Dr %d / Cr %d", line.AccountName, line.Debit, line.Credit)
	}
	return "mock-je-id-" + entry.ReferenceID, nil
}

func (m *MockGLAdapter) SyncCheck(ctx context.Context) error {
	return nil
}

// Ensure interface compliance
var _ GLAdapter = (*MockGLAdapter)(nil)
