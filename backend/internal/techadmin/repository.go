package techadmin

import (
	"context"
	"time"

	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
)

type Repository interface {
	CreateKey(ctx context.Context, key *APIKey) error
	GetKeysByPrefix(ctx context.Context, prefix string) ([]*APIKey, error)
	ListKeys(ctx context.Context) ([]APIKey, error)
	RevokeKey(ctx context.Context, id string) error
	UpdateLastUsed(ctx context.Context, id string) error
}

type PostgresRepository struct {
	db *database.DB
}

func NewRepository(db *database.DB) *PostgresRepository {
	return &PostgresRepository{db: db}
}

func (r *PostgresRepository) CreateKey(ctx context.Context, key *APIKey) error {
	key.ID = uuid.New().String()
	query := `INSERT INTO api_keys (id, name, key_hash, key_prefix, scopes, created_at) VALUES ($1, $2, $3, $4, $5, $6)`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query, key.ID, key.Name, key.KeyHash, key.KeyPrefix, key.Scopes, key.CreatedAt)
	return err
}

func (r *PostgresRepository) GetKeysByPrefix(ctx context.Context, prefix string) ([]*APIKey, error) {
	query := `SELECT id, name, key_hash, key_prefix, scopes, created_at, last_used_at, revoked_at FROM api_keys WHERE key_prefix = $1 AND revoked_at IS NULL`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, prefix)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var keys []*APIKey
	for rows.Next() {
		k := &APIKey{}
		err := rows.Scan(&k.ID, &k.Name, &k.KeyHash, &k.KeyPrefix, &k.Scopes, &k.CreatedAt, &k.LastUsedAt, &k.RevokedAt)
		if err != nil {
			return nil, err
		}
		keys = append(keys, k)
	}
	return keys, nil
}

func (r *PostgresRepository) ListKeys(ctx context.Context) ([]APIKey, error) {
	query := `SELECT id, name, key_prefix, scopes, created_at, last_used_at, revoked_at FROM api_keys ORDER BY created_at DESC`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var keys []APIKey
	for rows.Next() {
		k := APIKey{}
		// Skipping KeyHash scan as it's not selected
		if err := rows.Scan(&k.ID, &k.Name, &k.KeyPrefix, &k.Scopes, &k.CreatedAt, &k.LastUsedAt, &k.RevokedAt); err != nil {
			return nil, err
		}
		keys = append(keys, k)
	}
	return keys, nil
}

func (r *PostgresRepository) RevokeKey(ctx context.Context, id string) error {
	query := `UPDATE api_keys SET revoked_at = $1 WHERE id = $2`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query, time.Now(), id)
	return err
}

func (r *PostgresRepository) UpdateLastUsed(ctx context.Context, id string) error {
	query := `UPDATE api_keys SET last_used_at = $1 WHERE id = $2`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query, time.Now(), id)
	return err
}
