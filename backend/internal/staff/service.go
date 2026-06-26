package staff

import (
	"context"

	"github.com/gablelbm/gable/pkg/audit"
	"github.com/google/uuid"
)

// Service holds staff-management business logic. Module grant/revoke operations
// are audit-logged via pkg/audit.Logger.
type Service struct {
	repo     *Repository
	auditLog *audit.Logger
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// WithAuditLog attaches an audit logger so grant/revoke operations are recorded.
func (s *Service) WithAuditLog(l *audit.Logger) *Service {
	s.auditLog = l
	return s
}

func (s *Service) ListStaff(ctx context.Context) ([]Staff, error) {
	return s.repo.List(ctx)
}

func (s *Service) GetStaff(ctx context.Context, id uuid.UUID) (*Staff, error) {
	return s.repo.Get(ctx, id)
}

func (s *Service) CreateStaff(ctx context.Context, in CreateStaffInput) (*Staff, error) {
	return s.repo.Create(ctx, in)
}

func (s *Service) UpdateStaff(ctx context.Context, id uuid.UUID, in UpdateStaffInput) (*Staff, error) {
	return s.repo.Update(ctx, id, in)
}

// GrantModule grants a module to a staff member and audit-logs the action.
func (s *Service) GrantModule(ctx context.Context, staffID uuid.UUID, moduleID, grantedBy string) error {
	if err := s.repo.GrantModule(ctx, staffID, moduleID, grantedBy); err != nil {
		return err
	}
	if s.auditLog != nil {
		s.auditLog.Log(ctx, audit.Entry{
			Action:     "module.grant",
			EntityType: "staff",
			EntityID:   staffID,
			Changes:    map[string]interface{}{"module_id": moduleID, "granted_by": grantedBy},
		})
	}
	return nil
}

// RevokeModule revokes a module from a staff member and audit-logs the action.
func (s *Service) RevokeModule(ctx context.Context, staffID uuid.UUID, moduleID string) error {
	if err := s.repo.RevokeModule(ctx, staffID, moduleID); err != nil {
		return err
	}
	if s.auditLog != nil {
		s.auditLog.Log(ctx, audit.Entry{
			Action:     "module.revoke",
			EntityType: "staff",
			EntityID:   staffID,
			Changes:    map[string]interface{}{"module_id": moduleID},
		})
	}
	return nil
}

// ListModules returns the known integration modules with their global
// enabled state.
func (s *Service) ListModules(ctx context.Context) ([]Module, error) {
	enabled, err := s.repo.EnabledModules(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]Module, 0, len(knownModules))
	for _, m := range knownModules {
		m.Enabled = enabled[m.ID]
		out = append(out, m)
	}
	return out, nil
}

// SetModuleEnabled flips the global modules.<id>.enabled flag.
func (s *Service) SetModuleEnabled(ctx context.Context, moduleID string, enabled bool) error {
	return s.repo.SetModuleEnabled(ctx, moduleID, enabled)
}

// ValidateStaff resolves a staff member by email or staff_no and computes their
// AI_LM entitlement. Backs the `validate-staff` integration call.
//
// entitled = staff.active AND modules.ai_lm.enabled == 'true' AND a
// module_grants (staff_id, 'ai_lm') row exists. `modules` is the set of granted
// module_ids that are also globally enabled. A missing staff member yields
// Found=false with empty roles/modules.
func (s *Service) ValidateStaff(ctx context.Context, email, staffNo string) (*Validation, error) {
	st, err := s.repo.findByLookup(ctx, email, staffNo)
	if err != nil {
		return nil, err
	}
	if st == nil {
		return &Validation{Found: false, Modules: []string{}}, nil
	}

	granted, err := s.repo.GrantedModules(ctx, st.ID)
	if err != nil {
		return nil, err
	}
	enabled, err := s.repo.EnabledModules(ctx)
	if err != nil {
		return nil, err
	}

	// modules = granted ∩ globally-enabled.
	effective := []string{}
	hasAILM := false
	for _, m := range granted {
		if enabled[m] {
			effective = append(effective, m)
			if m == "ai_lm" {
				hasAILM = true
			}
		}
	}

	return &Validation{
		Found:    true,
		StaffID:  st.ID,
		Email:    st.Email,
		Name:     st.FullName,
		Role:     st.Role,
		Entitled: st.Active && hasAILM,
		Modules:  effective,
	}, nil
}
