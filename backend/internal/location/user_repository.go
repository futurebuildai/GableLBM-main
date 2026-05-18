package location

import (
	"context"
	"errors"
	"fmt"

	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// UserRepository owns the user_locations join table.
type UserRepository interface {
	ListUserBranches(ctx context.Context, userSub string) ([]BranchSummary, error)
	ListBranchUsers(ctx context.Context, branchID uuid.UUID) ([]UserLocation, error)
	GrantUserBranch(ctx context.Context, ul UserLocation) error
	RevokeUserBranch(ctx context.Context, userSub string, branchID uuid.UUID) error
	SetHomeBranch(ctx context.Context, userSub string, branchID uuid.UUID) error
	UserHasBranch(ctx context.Context, userSub string, branchID uuid.UUID) (bool, error)
	CountUserBranches(ctx context.Context, userSub string) (int, error)
	ListKnownUsers(ctx context.Context) ([]string, error)
}

type PostgresUserRepository struct {
	db *database.DB
}

func NewUserRepository(db *database.DB) *PostgresUserRepository {
	return &PostgresUserRepository{db: db}
}

// ListUserBranches returns every active branch a user has been granted,
// with is_home flagged where applicable. Inactive branches are filtered out
// to keep the selector clean.
func (r *PostgresUserRepository) ListUserBranches(ctx context.Context, userSub string) ([]BranchSummary, error) {
	query := `
		SELECT l.id, l.code, l.name, l.active, ul.is_home, l.timezone
		  FROM user_locations ul
		  JOIN locations l ON l.id = ul.branch_id
		 WHERE ul.user_sub = $1
		   AND l.type = 'BRANCH'
		   AND l.active = TRUE
		 ORDER BY ul.is_home DESC, l.code ASC
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, userSub)
	if err != nil {
		return nil, fmt.Errorf("list user branches: %w", err)
	}
	defer rows.Close()

	var out []BranchSummary
	for rows.Next() {
		var b BranchSummary
		if err := rows.Scan(&b.ID, &b.Code, &b.Name, &b.Active, &b.IsHome, &b.Timezone); err != nil {
			return nil, fmt.Errorf("scan branch summary: %w", err)
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

func (r *PostgresUserRepository) ListBranchUsers(ctx context.Context, branchID uuid.UUID) ([]UserLocation, error) {
	query := `
		SELECT user_sub, branch_id, is_home, granted_at, COALESCE(granted_by, '')
		  FROM user_locations
		 WHERE branch_id = $1
		 ORDER BY is_home DESC, user_sub ASC
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, branchID)
	if err != nil {
		return nil, fmt.Errorf("list branch users: %w", err)
	}
	defer rows.Close()

	var out []UserLocation
	for rows.Next() {
		var ul UserLocation
		if err := rows.Scan(&ul.UserSub, &ul.BranchID, &ul.IsHome, &ul.GrantedAt, &ul.GrantedBy); err != nil {
			return nil, fmt.Errorf("scan user location: %w", err)
		}
		out = append(out, ul)
	}
	return out, rows.Err()
}

// GrantUserBranch upserts a (user, branch) grant. If is_home=true, the call
// also clears any existing home grant for the same user.
func (r *PostgresUserRepository) GrantUserBranch(ctx context.Context, ul UserLocation) error {
	return r.db.RunInTx(ctx, func(ctx context.Context) error {
		exec := r.db.GetExecutor(ctx)
		if ul.IsHome {
			if _, err := exec.Exec(ctx,
				`UPDATE user_locations SET is_home = FALSE WHERE user_sub = $1 AND is_home = TRUE`,
				ul.UserSub); err != nil {
				return fmt.Errorf("clear prior home branch: %w", err)
			}
		}
		_, err := exec.Exec(ctx, `
			INSERT INTO user_locations (user_sub, branch_id, is_home, granted_by)
			VALUES ($1, $2, $3, NULLIF($4,''))
			ON CONFLICT (user_sub, branch_id) DO UPDATE
			SET is_home = EXCLUDED.is_home,
			    granted_by = COALESCE(EXCLUDED.granted_by, user_locations.granted_by)
		`, ul.UserSub, ul.BranchID, ul.IsHome, ul.GrantedBy)
		if err != nil {
			return fmt.Errorf("grant user branch: %w", err)
		}
		return nil
	})
}

func (r *PostgresUserRepository) RevokeUserBranch(ctx context.Context, userSub string, branchID uuid.UUID) error {
	tag, err := r.db.GetExecutor(ctx).Exec(ctx,
		`DELETE FROM user_locations WHERE user_sub = $1 AND branch_id = $2`,
		userSub, branchID)
	if err != nil {
		return fmt.Errorf("revoke user branch: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// SetHomeBranch sets the home flag for exactly one of the user's branches.
// The user must already have a grant for the target branch; otherwise this
// returns ErrNotFound.
func (r *PostgresUserRepository) SetHomeBranch(ctx context.Context, userSub string, branchID uuid.UUID) error {
	return r.db.RunInTx(ctx, func(ctx context.Context) error {
		exec := r.db.GetExecutor(ctx)
		ok, err := r.userHasBranchTx(ctx, userSub, branchID)
		if err != nil {
			return err
		}
		if !ok {
			return ErrNotFound
		}
		if _, err := exec.Exec(ctx,
			`UPDATE user_locations SET is_home = FALSE WHERE user_sub = $1 AND is_home = TRUE`,
			userSub); err != nil {
			return fmt.Errorf("clear prior home: %w", err)
		}
		if _, err := exec.Exec(ctx,
			`UPDATE user_locations SET is_home = TRUE WHERE user_sub = $1 AND branch_id = $2`,
			userSub, branchID); err != nil {
			return fmt.Errorf("set home branch: %w", err)
		}
		return nil
	})
}

func (r *PostgresUserRepository) UserHasBranch(ctx context.Context, userSub string, branchID uuid.UUID) (bool, error) {
	return r.userHasBranchTx(ctx, userSub, branchID)
}

func (r *PostgresUserRepository) userHasBranchTx(ctx context.Context, userSub string, branchID uuid.UUID) (bool, error) {
	var exists bool
	err := r.db.GetExecutor(ctx).QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM user_locations WHERE user_sub = $1 AND branch_id = $2)`,
		userSub, branchID).Scan(&exists)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, fmt.Errorf("check user branch: %w", err)
	}
	return exists, nil
}

func (r *PostgresUserRepository) CountUserBranches(ctx context.Context, userSub string) (int, error) {
	var n int
	err := r.db.GetExecutor(ctx).QueryRow(ctx,
		`SELECT COUNT(*) FROM user_locations WHERE user_sub = $1`, userSub).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("count user branches: %w", err)
	}
	return n, nil
}

// ListKnownUsers returns the union of distinct user_subs from user_locations
// and audit_log.user_id. There is no canonical users table today; this is a
// best-effort picker source for the branch-assignment admin UI. Track follow-up
// to build a real users cache table.
func (r *PostgresUserRepository) ListKnownUsers(ctx context.Context) ([]string, error) {
	rows, err := r.db.GetExecutor(ctx).Query(ctx, `
		SELECT user_sub FROM (
			SELECT user_sub FROM user_locations
			UNION
			SELECT user_id AS user_sub FROM audit_log WHERE user_id IS NOT NULL AND user_id <> ''
		) u
		ORDER BY user_sub ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("list known users: %w", err)
	}
	defer rows.Close()
	out := make([]string, 0)
	for rows.Next() {
		var sub string
		if err := rows.Scan(&sub); err != nil {
			return nil, fmt.Errorf("scan user sub: %w", err)
		}
		out = append(out, sub)
	}
	return out, rows.Err()
}
