-- 071: allow the ON_HOLD order status.
--
-- The credit-limit gate in order.Service places an order ON_HOLD when the
-- customer's (live) outstanding balance plus the order would exceed their
-- credit limit. The original orders_status_check (migration 004) only permitted
-- DRAFT / CONFIRMED / FULFILLED / CANCELLED, so persisting ON_HOLD failed with a
-- check-constraint violation (SQLSTATE 23514) and the confirm returned a 500.
-- This was previously masked because the credit check read the unmaintained
-- customers.balance_due column (usually zero), so the ON_HOLD branch almost
-- never fired; computing the balance live makes the gate reachable.
--
-- Re-create the constraint with ON_HOLD included.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
    CHECK (status IN ('DRAFT', 'CONFIRMED', 'FULFILLED', 'CANCELLED', 'ON_HOLD'));
