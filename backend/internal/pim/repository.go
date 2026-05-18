package pim

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Repository defines the interface for PIM data access
type Repository interface {
	// Content
	GetContent(ctx context.Context, productID uuid.UUID) (*PIMContent, error)
	UpsertContent(ctx context.Context, c *PIMContent) error

	// Media
	ListMedia(ctx context.Context, productID uuid.UUID) ([]PIMMedia, error)
	CreateMedia(ctx context.Context, m *PIMMedia) error
	DeleteMedia(ctx context.Context, id uuid.UUID) error
	SetPrimaryMedia(ctx context.Context, productID, mediaID uuid.UUID) error

	// Collateral
	ListCollateral(ctx context.Context, productID uuid.UUID) ([]PIMCollateral, error)
	CreateCollateral(ctx context.Context, c *PIMCollateral) error
	DeleteCollateral(ctx context.Context, id uuid.UUID) error
}

// PostgresRepository implements Repository using pgx
type PostgresRepository struct {
	db *database.DB
}

// NewRepository creates a new PIM repository
func NewRepository(db *database.DB) *PostgresRepository {
	return &PostgresRepository{db: db}
}

// --- Content ---

func (r *PostgresRepository) GetContent(ctx context.Context, productID uuid.UUID) (*PIMContent, error) {
	query := `
		SELECT id, product_id, short_description, long_description, marketing_copy,
		       COALESCE(attributes, '{}'), seo_title, seo_description,
		       COALESCE(seo_keywords, '{}'), seo_slug,
		       last_gen_model, last_gen_prompt, last_gen_at,
		       created_at, updated_at
		FROM pim_content
		WHERE product_id = $1`

	var c PIMContent
	var attrsJSON []byte
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, productID).Scan(
		&c.ID, &c.ProductID, &c.ShortDescription, &c.LongDescription, &c.MarketingCopy,
		&attrsJSON, &c.SEOTitle, &c.SEODescription,
		&c.SEOKeywords, &c.SEOSlug,
		&c.LastGenModel, &c.LastGenPrompt, &c.LastGenAt,
		&c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil // No content yet
		}
		return nil, fmt.Errorf("get pim content: %w", err)
	}

	c.Attributes = make(map[string]string)
	_ = json.Unmarshal(attrsJSON, &c.Attributes)

	return &c, nil
}

func (r *PostgresRepository) UpsertContent(ctx context.Context, c *PIMContent) error {
	attrsJSON, err := json.Marshal(c.Attributes)
	if err != nil {
		attrsJSON = []byte("{}")
	}

	query := `
		INSERT INTO pim_content (product_id, short_description, long_description, marketing_copy,
		    attributes, seo_title, seo_description, seo_keywords, seo_slug,
		    last_gen_model, last_gen_prompt, last_gen_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
		ON CONFLICT (product_id) DO UPDATE SET
		    short_description = EXCLUDED.short_description,
		    long_description  = EXCLUDED.long_description,
		    marketing_copy    = EXCLUDED.marketing_copy,
		    attributes        = EXCLUDED.attributes,
		    seo_title         = EXCLUDED.seo_title,
		    seo_description   = EXCLUDED.seo_description,
		    seo_keywords      = EXCLUDED.seo_keywords,
		    seo_slug          = EXCLUDED.seo_slug,
		    last_gen_model    = EXCLUDED.last_gen_model,
		    last_gen_prompt   = EXCLUDED.last_gen_prompt,
		    last_gen_at       = EXCLUDED.last_gen_at,
		    updated_at        = NOW()
		RETURNING id, created_at, updated_at`

	err = r.db.GetExecutor(ctx).QueryRow(ctx, query,
		c.ProductID, c.ShortDescription, c.LongDescription, c.MarketingCopy,
		attrsJSON, c.SEOTitle, c.SEODescription, c.SEOKeywords, c.SEOSlug,
		c.LastGenModel, c.LastGenPrompt, c.LastGenAt,
	).Scan(&c.ID, &c.CreatedAt, &c.UpdatedAt)

	if err != nil {
		return fmt.Errorf("upsert pim content: %w", err)
	}

	return nil
}

// --- Media ---

func (r *PostgresRepository) ListMedia(ctx context.Context, productID uuid.UUID) ([]PIMMedia, error) {
	query := `
		SELECT id, product_id, media_type, url, alt_text, sort_order, is_primary,
		       gen_model, gen_prompt, gen_style, generated_at, created_at, updated_at
		FROM pim_media
		WHERE product_id = $1
		ORDER BY sort_order ASC, created_at ASC`

	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, productID)
	if err != nil {
		return nil, fmt.Errorf("list pim media: %w", err)
	}
	defer rows.Close()

	var media []PIMMedia
	for rows.Next() {
		var m PIMMedia
		if err := rows.Scan(
			&m.ID, &m.ProductID, &m.MediaType, &m.URL, &m.AltText, &m.SortOrder, &m.IsPrimary,
			&m.GenModel, &m.GenPrompt, &m.GenStyle, &m.GeneratedAt, &m.CreatedAt, &m.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan pim media: %w", err)
		}
		media = append(media, m)
	}

	return media, rows.Err()
}

func (r *PostgresRepository) CreateMedia(ctx context.Context, m *PIMMedia) error {
	query := `
		INSERT INTO pim_media (product_id, media_type, url, alt_text, sort_order, is_primary,
		    gen_model, gen_prompt, gen_style, generated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING id, created_at, updated_at`

	return r.db.GetExecutor(ctx).QueryRow(ctx, query,
		m.ProductID, m.MediaType, m.URL, m.AltText, m.SortOrder, m.IsPrimary,
		m.GenModel, m.GenPrompt, m.GenStyle, m.GeneratedAt,
	).Scan(&m.ID, &m.CreatedAt, &m.UpdatedAt)
}

func (r *PostgresRepository) DeleteMedia(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.GetExecutor(ctx).Exec(ctx, `DELETE FROM pim_media WHERE id = $1`, id)
	return err
}

func (r *PostgresRepository) SetPrimaryMedia(ctx context.Context, productID, mediaID uuid.UUID) error {
	return r.db.RunInTx(ctx, func(txCtx context.Context) error {
		exec := r.db.GetExecutor(txCtx)

		// Clear existing primary
		_, err := exec.Exec(txCtx, `UPDATE pim_media SET is_primary = FALSE WHERE product_id = $1`, productID)
		if err != nil {
			return fmt.Errorf("clear primary: %w", err)
		}

		// Set new primary
		_, err = exec.Exec(txCtx, `UPDATE pim_media SET is_primary = TRUE WHERE id = $1 AND product_id = $2`, mediaID, productID)
		if err != nil {
			return fmt.Errorf("set primary: %w", err)
		}

		return nil
	})
}

// --- Collateral ---

func (r *PostgresRepository) ListCollateral(ctx context.Context, productID uuid.UUID) ([]PIMCollateral, error) {
	query := `
		SELECT id, product_id, collateral_type, title, content, tone, audience,
		       gen_model, gen_prompt, generated_at, created_at, updated_at
		FROM pim_collateral
		WHERE product_id = $1
		ORDER BY created_at DESC`

	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, productID)
	if err != nil {
		return nil, fmt.Errorf("list pim collateral: %w", err)
	}
	defer rows.Close()

	var items []PIMCollateral
	for rows.Next() {
		var c PIMCollateral
		if err := rows.Scan(
			&c.ID, &c.ProductID, &c.CollateralType, &c.Title, &c.Content, &c.Tone, &c.Audience,
			&c.GenModel, &c.GenPrompt, &c.GeneratedAt, &c.CreatedAt, &c.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan pim collateral: %w", err)
		}
		items = append(items, c)
	}

	return items, rows.Err()
}

func (r *PostgresRepository) CreateCollateral(ctx context.Context, c *PIMCollateral) error {
	query := `
		INSERT INTO pim_collateral (product_id, collateral_type, title, content, tone, audience,
		    gen_model, gen_prompt, generated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id, created_at, updated_at`

	return r.db.GetExecutor(ctx).QueryRow(ctx, query,
		c.ProductID, c.CollateralType, c.Title, c.Content, c.Tone, c.Audience,
		c.GenModel, c.GenPrompt, c.GeneratedAt,
	).Scan(&c.ID, &c.CreatedAt, &c.UpdatedAt)
}

func (r *PostgresRepository) DeleteCollateral(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.GetExecutor(ctx).Exec(ctx, `DELETE FROM pim_collateral WHERE id = $1`, id)
	return err
}
