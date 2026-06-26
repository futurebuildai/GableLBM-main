package staff

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ErrNotFound is returned when a staff member does not exist.
var ErrNotFound = errors.New("staff not found")

type Repository struct {
	db *database.DB
}

func NewRepository(db *database.DB) *Repository {
	return &Repository{db: db}
}

// List returns all staff with their granted module_ids attached.
func (r *Repository) List(ctx context.Context) ([]Staff, error) {
	const q = `
		SELECT s.id, s.email, s.full_name, s.staff_no, s.role, s.active, s.created_at, s.updated_at,
		       COALESCE(ARRAY_REMOVE(ARRAY_AGG(g.module_id), NULL), '{}') AS modules
		FROM staff s
		LEFT JOIN module_grants g ON g.staff_id = s.id
		GROUP BY s.id
		ORDER BY s.full_name`

	rows, err := r.db.GetExecutor(ctx).Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("failed to list staff: %w", err)
	}
	defer rows.Close()

	staff := []Staff{}
	for rows.Next() {
		var s Staff
		if err := rows.Scan(&s.ID, &s.Email, &s.FullName, &s.StaffNo, &s.Role, &s.Active, &s.CreatedAt, &s.UpdatedAt, &s.Modules); err != nil {
			return nil, fmt.Errorf("failed to scan staff: %w", err)
		}
		staff = append(staff, s)
	}
	return staff, rows.Err()
}

// Get returns a single staff member by id with granted modules attached.
func (r *Repository) Get(ctx context.Context, id uuid.UUID) (*Staff, error) {
	const q = `
		SELECT s.id, s.email, s.full_name, s.staff_no, s.role, s.active, s.created_at, s.updated_at,
		       COALESCE(ARRAY_REMOVE(ARRAY_AGG(g.module_id), NULL), '{}') AS modules
		FROM staff s
		LEFT JOIN module_grants g ON g.staff_id = s.id
		WHERE s.id = $1
		GROUP BY s.id`

	var s Staff
	err := r.db.GetExecutor(ctx).QueryRow(ctx, q, id).Scan(
		&s.ID, &s.Email, &s.FullName, &s.StaffNo, &s.Role, &s.Active, &s.CreatedAt, &s.UpdatedAt, &s.Modules,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to get staff: %w", err)
	}
	return &s, nil
}

// findByLookup loads a staff member by email or staff_no (used by validate-staff).
// Returns (nil, nil) when no row matches, so the caller can return the
// not-found entitlement response rather than an error.
func (r *Repository) findByLookup(ctx context.Context, email, staffNo string) (*Staff, error) {
	var (
		q   string
		arg string
	)
	switch {
	case email != "":
		q = `SELECT id, email, full_name, staff_no, role, active, created_at, updated_at FROM staff WHERE LOWER(email) = LOWER($1)`
		arg = email
	case staffNo != "":
		q = `SELECT id, email, full_name, staff_no, role, active, created_at, updated_at FROM staff WHERE staff_no = $1`
		arg = staffNo
	default:
		return nil, nil
	}

	var s Staff
	err := r.db.GetExecutor(ctx).QueryRow(ctx, q, arg).Scan(
		&s.ID, &s.Email, &s.FullName, &s.StaffNo, &s.Role, &s.Active, &s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to look up staff: %w", err)
	}
	return &s, nil
}

// Create inserts a new staff member.
func (r *Repository) Create(ctx context.Context, in CreateStaffInput) (*Staff, error) {
	role := in.Role
	if role == "" {
		role = "staff"
	}
	active := true
	if in.Active != nil {
		active = *in.Active
	}

	const q = `
		INSERT INTO staff (email, full_name, staff_no, role, active)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, email, full_name, staff_no, role, active, created_at, updated_at`

	var s Staff
	err := r.db.GetExecutor(ctx).QueryRow(ctx, q, in.Email, in.FullName, in.StaffNo, role, active).Scan(
		&s.ID, &s.Email, &s.FullName, &s.StaffNo, &s.Role, &s.Active, &s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create staff: %w", err)
	}
	s.Modules = []string{}
	return &s, nil
}

// Update applies the non-nil fields of in to the staff member.
func (r *Repository) Update(ctx context.Context, id uuid.UUID, in UpdateStaffInput) (*Staff, error) {
	sets := []string{}
	args := []interface{}{}
	idx := 1

	if in.Email != nil {
		sets = append(sets, fmt.Sprintf("email = $%d", idx))
		args = append(args, *in.Email)
		idx++
	}
	if in.FullName != nil {
		sets = append(sets, fmt.Sprintf("full_name = $%d", idx))
		args = append(args, *in.FullName)
		idx++
	}
	if in.StaffNo != nil {
		sets = append(sets, fmt.Sprintf("staff_no = $%d", idx))
		args = append(args, *in.StaffNo)
		idx++
	}
	if in.Role != nil {
		sets = append(sets, fmt.Sprintf("role = $%d", idx))
		args = append(args, *in.Role)
		idx++
	}
	if in.Active != nil {
		sets = append(sets, fmt.Sprintf("active = $%d", idx))
		args = append(args, *in.Active)
		idx++
	}

	if len(sets) == 0 {
		return r.Get(ctx, id)
	}

	sets = append(sets, "updated_at = NOW()")
	args = append(args, id)
	q := fmt.Sprintf("UPDATE staff SET %s WHERE id = $%d", strings.Join(sets, ", "), idx)

	tag, err := r.db.GetExecutor(ctx).Exec(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to update staff: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return nil, ErrNotFound
	}
	return r.Get(ctx, id)
}

// GrantModule grants a module to a staff member (idempotent).
func (r *Repository) GrantModule(ctx context.Context, staffID uuid.UUID, moduleID, grantedBy string) error {
	const q = `
		INSERT INTO module_grants (staff_id, module_id, granted_by)
		VALUES ($1, $2, NULLIF($3, ''))
		ON CONFLICT (staff_id, module_id) DO NOTHING`
	if _, err := r.db.GetExecutor(ctx).Exec(ctx, q, staffID, moduleID, grantedBy); err != nil {
		return fmt.Errorf("failed to grant module: %w", err)
	}
	return nil
}

// RevokeModule removes a module grant from a staff member (idempotent).
func (r *Repository) RevokeModule(ctx context.Context, staffID uuid.UUID, moduleID string) error {
	const q = `DELETE FROM module_grants WHERE staff_id = $1 AND module_id = $2`
	if _, err := r.db.GetExecutor(ctx).Exec(ctx, q, staffID, moduleID); err != nil {
		return fmt.Errorf("failed to revoke module: %w", err)
	}
	return nil
}

// GrantedModules returns the module_ids granted to a staff member.
func (r *Repository) GrantedModules(ctx context.Context, staffID uuid.UUID) ([]string, error) {
	const q = `SELECT module_id FROM module_grants WHERE staff_id = $1 ORDER BY module_id`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, q, staffID)
	if err != nil {
		return nil, fmt.Errorf("failed to list granted modules: %w", err)
	}
	defer rows.Close()

	mods := []string{}
	for rows.Next() {
		var m string
		if err := rows.Scan(&m); err != nil {
			return nil, fmt.Errorf("failed to scan granted module: %w", err)
		}
		mods = append(mods, m)
	}
	return mods, rows.Err()
}

// EnabledModules returns the set of module_ids whose modules.<id>.enabled flag
// is 'true' in system_settings.
func (r *Repository) EnabledModules(ctx context.Context) (map[string]bool, error) {
	const q = `SELECT key FROM system_settings WHERE key LIKE 'modules.%.enabled' AND value = 'true'`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("failed to list enabled modules: %w", err)
	}
	defer rows.Close()

	enabled := map[string]bool{}
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return nil, fmt.Errorf("failed to scan module setting: %w", err)
		}
		// key is modules.<id>.enabled
		id := strings.TrimSuffix(strings.TrimPrefix(key, "modules."), ".enabled")
		if id != "" {
			enabled[id] = true
		}
	}
	return enabled, rows.Err()
}

// IsModuleEnabled reports whether modules.<id>.enabled == 'true'.
func (r *Repository) IsModuleEnabled(ctx context.Context, moduleID string) (bool, error) {
	const q = `SELECT value FROM system_settings WHERE key = $1`
	var value string
	err := r.db.GetExecutor(ctx).QueryRow(ctx, q, moduleSettingKey(moduleID)).Scan(&value)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, fmt.Errorf("failed to read module flag: %w", err)
	}
	return value == "true", nil
}

// SetModuleEnabled upserts the modules.<id>.enabled flag.
func (r *Repository) SetModuleEnabled(ctx context.Context, moduleID string, enabled bool) error {
	value := "false"
	if enabled {
		value = "true"
	}
	const q = `
		INSERT INTO system_settings (key, value, updated_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`
	if _, err := r.db.GetExecutor(ctx).Exec(ctx, q, moduleSettingKey(moduleID), value); err != nil {
		return fmt.Errorf("failed to set module flag: %w", err)
	}
	return nil
}

func moduleSettingKey(moduleID string) string {
	return "modules." + moduleID + ".enabled"
}
