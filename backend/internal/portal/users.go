package portal

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// InviteUserRequest is the payload for inviting a new portal user.
type InviteUserRequest struct {
	Email string `json:"email"`
	Role  string `json:"role"`
}

// UpdateUserRoleRequest is the payload for updating an existing portal user's role.
type UpdateUserRoleRequest struct {
	Role string `json:"role"`
}

// UpdateUserStatusRequest is the payload for deactivating or activating a portal user.
type UpdateUserStatusRequest struct {
	Status string `json:"status"` // Active, Inactive
}

// InviteUser generates an invite token, saves it, and simulates sending an email.
func (s *Service) InviteUser(ctx context.Context, customerID uuid.UUID, req InviteUserRequest) (*PortalInvite, error) {
	if req.Role != "Admin" && req.Role != "Buyer" && req.Role != "View-Only" {
		return nil, fmt.Errorf("invalid role")
	}

	invite := PortalInvite{
		ID:         uuid.New(),
		CustomerID: customerID,
		Email:      req.Email,
		Role:       req.Role,
		Token:      uuid.New().String(),
		ExpiresAt:  time.Now().Add(7 * 24 * time.Hour),
	}

	if err := s.repo.CreatePortalInvite(ctx, invite); err != nil {
		return nil, err
	}

	// In a real app we'd send an email here with the link like:
	// https://portal.gablelbm.com/invite?token=invite.Token
	s.logger.Info("Simulated sending portal invite email", "email", req.Email, "token", invite.Token, "role", req.Role)

	return &invite, nil
}

// ListCustomerUsers enumerates all registered customer users.
func (s *Service) ListCustomerUsers(ctx context.Context, customerID uuid.UUID) ([]CustomerUser, error) {
	return s.repo.ListCustomerUsers(ctx, customerID)
}

// ListPortalInvites enumerates all active invites.
func (s *Service) ListPortalInvites(ctx context.Context, customerID uuid.UUID) ([]PortalInvite, error) {
	return s.repo.ListPortalInvites(ctx, customerID)
}

// UpdateUserRole changes a user's role if the actor has permission.
func (s *Service) UpdateUserRole(ctx context.Context, customerID, targetUserID uuid.UUID, role string) error {
	if role != "Admin" && role != "Buyer" && role != "View-Only" {
		return fmt.Errorf("invalid role")
	}
	return s.repo.UpdateUserRole(ctx, targetUserID, customerID, role)
}

// UpdateUserStatus activates or deactivates a user.
func (s *Service) UpdateUserStatus(ctx context.Context, customerID, targetUserID uuid.UUID, status string) error {
	if status != "Active" && status != "Inactive" {
		return fmt.Errorf("invalid status")
	}
	return s.repo.UpdateUserStatus(ctx, targetUserID, customerID, status)
}
