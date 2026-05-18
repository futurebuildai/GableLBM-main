-- Inventory rows already carry location_id; the branch is derived via the
-- locations.branch_id denormalized column. This helper view exposes the
-- branch on every inventory row so list queries can filter without joining.

CREATE OR REPLACE VIEW v_inventory_with_branch AS
SELECT i.*, l.branch_id AS branch_id
  FROM inventory i
  JOIN locations l ON l.id = i.location_id;
