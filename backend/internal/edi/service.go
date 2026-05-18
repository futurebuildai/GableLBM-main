package edi

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"log/slog"

	"github.com/gablelbm/gable/internal/domain"
	integration "github.com/gablelbm/gable/internal/integrations/edi/x12"
	// purchase_order import removed
)

type Service struct {
	outputDir string
	logger    *slog.Logger
}

func NewService(outputDir string, logger *slog.Logger) *Service {
	// Ensure output directory exists
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		logger.Error("Failed to create EDI output dir", "error", err)
	}
	return &Service{outputDir: outputDir, logger: logger}
}

func (s *Service) SendExamplePO(ctx context.Context, po domain.POData) error {
	// 1. Create Profile (Hardcoded for now)
	profile := domain.EDIProfile{
		ISASenderID:   "GABLELBM",
		ISAReceiverID: "VENDORXYZ",
		GSSenderID:    "GABLELBM",
		GSReceiverID:  "VENDORXYZ",
	}

	// 2. Generate EDI
	content, err := integration.Generate850(po, profile)
	if err != nil {
		return fmt.Errorf("failed to generate 850: %w", err)
	}

	// 3. Write to File (Stub for FTP)
	filename := fmt.Sprintf("PO_%s_%d.edi", po.ID.String(), time.Now().Unix())
	path := filepath.Join(s.outputDir, filename)

	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		return fmt.Errorf("failed to write EDI file: %w", err)
	}

	s.logger.Info("EDI 850 Generated", "path", path)
	return nil
}
