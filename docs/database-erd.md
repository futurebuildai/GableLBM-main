# GableLBM Database Schema Reference

> **Authoritative source:** `backend/migrations/` — 53+ numbered `.sql` files define the live schema. This document is a human-readable reference for contributors. When in doubt, read the migration files.

## Schema Conventions

- **All PKs:** `UUID` — `gen_random_uuid()` (most tables) or `uuid_generate_v4()` (older tables)
- **Quantities / Money:** `DECIMAL(19,4)` — never `FLOAT`, never `NUMERIC(12,2)`
- **Timestamps:** `TIMESTAMPTZ` — always with timezone
- **Text:** `TEXT` for variable-length strings (not `VARCHAR`)
- **Migrations:** Never modify an existing migration file after it has been applied

---

## 1. Products & UOM (`001`, `007`, `013`, `037`, `049`)

```
products
  id              UUID PK
  sku             TEXT UNIQUE NOT NULL
  description     TEXT NOT NULL
  uom_primary     uom_type NOT NULL      -- enum: PCS, EA, LF, SF, BF, MBF, SQ, BOX, CTN, RL, GAL, LBS, BAG, BUNDLE, PAIR, SET
  base_price      DECIMAL(19,4)
  vendor          TEXT                   -- vendor name (denormalized)
  upc             TEXT
  cost            DECIMAL(19,4)
  margin_pct      DECIMAL(6,4)
  commission_pct  DECIMAL(6,4)
  created_at      TIMESTAMPTZ
  updated_at      TIMESTAMPTZ
```

---

## 2. Locations (`002`)

Hierarchical structure: Zone → Aisle → Bin

```
locations
  id          UUID PK
  parent_id   UUID → locations(id)    -- NULL for top-level zones
  path        TEXT                   -- materialized path e.g. "LUMBER-YARD/A/1"
  type        TEXT NOT NULL          -- 'ZONE' | 'AISLE' | 'SHELF' | 'BIN' | 'YARD'
  code        TEXT NOT NULL          -- short code e.g. "A-1"
  description TEXT
  created_at  TIMESTAMPTZ
  updated_at  TIMESTAMPTZ
  UNIQUE(parent_id, code)
```

---

## 3. Inventory (`001`, `002`, `004`)

```
inventory
  id          UUID PK
  product_id  UUID → products(id) ON DELETE CASCADE
  location_id UUID → locations(id) ON DELETE RESTRICT
  location    TEXT                   -- legacy text location (deprecated)
  quantity    DECIMAL(12,4) NOT NULL DEFAULT 0
  allocated   DECIMAL(10,4) NOT NULL DEFAULT 0
  updated_at  TIMESTAMPTZ
```

---

## 4. Price Levels & Customers (`003`, `006`, `015`, `018`, `031`, `041`)

```
price_levels
  id          UUID PK
  name        TEXT NOT NULL
  multiplier  DECIMAL(12,4) NOT NULL DEFAULT 1.0000

customers
  id              UUID PK
  name            TEXT NOT NULL
  account_number  TEXT UNIQUE NOT NULL
  email           TEXT
  phone           TEXT
  address         TEXT
  price_level_id  UUID → price_levels(id) ON DELETE SET NULL
  credit_limit    DECIMAL(12,2) DEFAULT 0
  balance_due     DECIMAL(12,2) DEFAULT 0
  tier            customer_tier NOT NULL DEFAULT 'RETAIL'  -- enum: RETAIL, SILVER, GOLD, PLATINUM
  payment_terms   VARCHAR(20) DEFAULT 'NET30'
  salesperson_id  UUID → sales_team(id)
  is_active       BOOLEAN DEFAULT TRUE
  created_at      TIMESTAMPTZ
  updated_at      TIMESTAMPTZ

customer_jobs
  id          UUID PK
  customer_id UUID → customers(id) ON DELETE CASCADE
  name        TEXT NOT NULL          -- "Smith Deck", "Main Street Project"
  is_active   BOOLEAN DEFAULT TRUE
  created_at  TIMESTAMPTZ
  updated_at  TIMESTAMPTZ
```

---

## 5. Quotes (`003`)

```
quotes
  id          UUID PK
  customer_id UUID → customers(id) ON DELETE RESTRICT
  job_id      UUID → customer_jobs(id) ON DELETE SET NULL
  state       quote_state NOT NULL  -- enum: DRAFT, SENT, ACCEPTED, REJECTED, EXPIRED
  total_amount DECIMAL(10,2)
  expires_at  TIMESTAMPTZ
  notes       TEXT
  created_at  TIMESTAMPTZ
  updated_at  TIMESTAMPTZ

quote_lines
  id          UUID PK
  quote_id    UUID → quotes(id) ON DELETE CASCADE
  product_id  UUID → products(id) ON DELETE RESTRICT
  description TEXT
  quantity    DECIMAL(10,4) NOT NULL
  uom         uom_type NOT NULL
  unit_price  DECIMAL(10,4) NOT NULL
  created_at  TIMESTAMPTZ
```

---

## 6. Orders (`004`, `041`)

```
orders
  id              UUID PK
  customer_id     UUID → customers(id) ON DELETE RESTRICT
  quote_id        UUID → quotes(id) ON DELETE SET NULL
  status          TEXT NOT NULL  -- CHECK: DRAFT, CONFIRMED, FULFILLED, CANCELLED
  total_amount    DECIMAL(10,2) NOT NULL DEFAULT 0
  salesperson_id  UUID → sales_team(id)
  created_at      TIMESTAMPTZ
  updated_at      TIMESTAMPTZ

order_lines
  id          UUID PK
  order_id    UUID → orders(id) ON DELETE CASCADE
  product_id  UUID → products(id) ON DELETE RESTRICT
  quantity    DECIMAL(10,4) NOT NULL
  price_each  DECIMAL(10,2) NOT NULL
  created_at  TIMESTAMPTZ
```

---

## 7. Invoices & Payments (`005`, `008`, `018`)

```
invoices
  id              UUID PK
  order_id        UUID → orders(id) ON DELETE RESTRICT
  customer_id     UUID → customers(id) ON DELETE RESTRICT
  status          TEXT NOT NULL  -- UNPAID, PARTIAL, PAID, VOID, OVERDUE
  subtotal        DECIMAL(10,2) DEFAULT 0
  tax_rate        DECIMAL(5,4) DEFAULT 0
  tax_amount      DECIMAL(10,2) DEFAULT 0
  total_amount    DECIMAL(10,2) NOT NULL DEFAULT 0
  due_date        TIMESTAMPTZ
  paid_at         TIMESTAMPTZ
  payment_terms   VARCHAR(20) DEFAULT 'NET30'
  created_at      TIMESTAMPTZ
  updated_at      TIMESTAMPTZ

invoice_lines
  id          UUID PK
  invoice_id  UUID → invoices(id) ON DELETE CASCADE
  product_id  UUID → products(id) ON DELETE RESTRICT
  quantity    DECIMAL(10,4) NOT NULL
  price_each  DECIMAL(10,2) NOT NULL
  created_at  TIMESTAMPTZ

payments
  id          UUID PK
  invoice_id  UUID → invoices(id) ON DELETE RESTRICT
  amount      DECIMAL(10,2) NOT NULL  -- CHECK: amount > 0
  method      TEXT NOT NULL           -- CASH, CARD, CHECK, ACCOUNT
  reference   TEXT                   -- check number, Stripe ID, etc.
  notes       TEXT
  created_at  TIMESTAMPTZ
```

---

## 8. Pricing Rules (`016`, `050`, `051`, `052`)

```
pricing_rules
  id              UUID PK
  name            TEXT NOT NULL
  rule_type       TEXT NOT NULL  -- QUANTITY_BREAK, JOB_OVERRIDE, PROMOTIONAL
  product_id      UUID → products(id)    -- NULL = all products
  customer_id     UUID → customers(id)   -- NULL = all customers
  job_id          UUID → customer_jobs(id)
  category        TEXT                   -- product category match
  fixed_price     DECIMAL(12,4)
  discount_pct    DECIMAL(6,4)
  markup_pct      DECIMAL(6,4)
  min_quantity    DECIMAL(12,4) DEFAULT 0
  max_quantity    DECIMAL(12,4)
  margin_floor_pct DECIMAL(6,4)
  starts_at       TIMESTAMPTZ
  expires_at      TIMESTAMPTZ
  is_active       BOOLEAN NOT NULL DEFAULT true
  priority        INTEGER NOT NULL DEFAULT 0
  created_at      TIMESTAMPTZ
  updated_at      TIMESTAMPTZ
```

---

## 9. Vendors (`020`)

```
vendors
  id                      UUID PK
  name                    VARCHAR(255) NOT NULL UNIQUE
  contact_email           VARCHAR(255)
  phone                   VARCHAR(50)
  address_line1           VARCHAR(255)
  city                    VARCHAR(100)
  state                   VARCHAR(50)
  zip                     VARCHAR(20)
  payment_terms           VARCHAR(50) DEFAULT 'Net 30'
  average_lead_time_days  DECIMAL(10,2) DEFAULT 0
  fill_rate               DECIMAL(5,2) DEFAULT 0
  total_spend_ytd         DECIMAL(12,2) DEFAULT 0
  created_at              TIMESTAMPTZ
  updated_at              TIMESTAMPTZ
```

---

## 10. Purchase Orders (`011`, `017`, `042b`)

```
purchase_orders
  id              UUID PK
  vendor_id       UUID → vendors(id)
  status          TEXT NOT NULL  -- DRAFT, SUBMITTED, ACKNOWLEDGED, RECEIVED, PARTIAL, CANCELLED
  total_amount    DECIMAL(10,2) DEFAULT 0
  expected_date   DATE
  notes           TEXT
  freight_cost    DECIMAL(10,2)
  freight_vendor  TEXT
  created_at      TIMESTAMPTZ
  updated_at      TIMESTAMPTZ

purchase_order_lines
  id              UUID PK
  po_id           UUID → purchase_orders(id) ON DELETE CASCADE
  product_id      UUID → products(id) ON DELETE RESTRICT
  quantity        DECIMAL(10,4) NOT NULL
  unit_cost       DECIMAL(10,4) NOT NULL
  quantity_received DECIMAL(10,4) DEFAULT 0
  created_at      TIMESTAMPTZ
```

---

## 11. Delivery & Fleet (`009`, `019`, `021`, `040`, `042`, `043`, `046`)

```
vehicles
  id                  UUID PK
  name                VARCHAR(255) NOT NULL
  vehicle_type        VARCHAR(50) NOT NULL  -- Flatbed, Box Truck, Boom, Pickup
  license_plate       VARCHAR(20) NOT NULL
  capacity_weight_lbs INTEGER
  deleted_at          TIMESTAMPTZ           -- soft delete

drivers
  id              UUID PK
  name            VARCHAR(255) NOT NULL
  license_number  VARCHAR(50)
  status          VARCHAR(50) DEFAULT 'ACTIVE'  -- ACTIVE, INACTIVE, ON_LEAVE
  phone_number    VARCHAR(20)
  deleted_at      TIMESTAMPTZ

delivery_routes
  id              UUID PK
  vehicle_id      UUID → vehicles(id)
  driver_id       UUID → drivers(id)
  scheduled_date  DATE NOT NULL
  status          VARCHAR(50) DEFAULT 'DRAFT'  -- DRAFT, SCHEDULED, IN_TRANSIT, COMPLETED, CANCELLED
  notes           TEXT

deliveries
  id                  UUID PK
  route_id            UUID → delivery_routes(id)
  order_id            UUID → orders(id)
  stop_sequence       INTEGER NOT NULL DEFAULT 0
  status              VARCHAR(50) DEFAULT 'PENDING'  -- PENDING, OUT_FOR_DELIVERY, DELIVERED, FAILED, PARTIAL
  pod_proof_url       TEXT
  pod_signed_by       VARCHAR(255)
  pod_timestamp       TIMESTAMPTZ
  delivery_instructions TEXT
  lat                 DECIMAL(10,7)          -- GPS coordinates
  lng                 DECIMAL(10,7)
```

---

## 12. General Ledger (`025`)

```
gl_accounts
  id              UUID PK
  code            VARCHAR(20) NOT NULL UNIQUE
  name            VARCHAR(100) NOT NULL
  type            VARCHAR(20) NOT NULL  -- ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
  subtype         VARCHAR(50) DEFAULT ''
  parent_id       UUID → gl_accounts(id)
  normal_balance  VARCHAR(10) NOT NULL  -- DEBIT, CREDIT
  is_active       BOOLEAN NOT NULL DEFAULT TRUE
  description     TEXT DEFAULT ''

gl_fiscal_periods
  id          UUID PK
  name        VARCHAR(50) NOT NULL
  start_date  DATE NOT NULL
  end_date    DATE NOT NULL
  status      VARCHAR(10) NOT NULL DEFAULT 'OPEN'  -- OPEN, CLOSED
  closed_at   TIMESTAMPTZ
  closed_by   VARCHAR(100)

gl_journal_entries
  id            UUID PK
  entry_number  SERIAL
  entry_date    DATE NOT NULL DEFAULT CURRENT_DATE
  memo          TEXT NOT NULL DEFAULT ''
  source        VARCHAR(20) NOT NULL DEFAULT 'MANUAL'  -- MANUAL, INVOICE, PAYMENT, ADJUSTMENT, CLOSING
  source_ref_id UUID
  status        VARCHAR(10) NOT NULL DEFAULT 'DRAFT'  -- DRAFT, POSTED, VOID
  posted_by     VARCHAR(100)

gl_journal_lines
  id                UUID PK
  journal_entry_id  UUID → gl_journal_entries(id) ON DELETE CASCADE
  account_id        UUID → gl_accounts(id)
  description       TEXT DEFAULT ''
  debit             DECIMAL(12,2) NOT NULL DEFAULT 0
  credit            DECIMAL(12,2) NOT NULL DEFAULT 0
  -- CONSTRAINT: (debit > 0 AND credit = 0) OR (debit = 0 AND credit > 0)
```

Standard LBM chart of accounts is seeded in migration `025_general_ledger.sql`.

---

## 13. Sales Team (`041`)

```
sales_team
  id          UUID PK
  name        TEXT NOT NULL
  email       TEXT
  phone       TEXT
  role        TEXT NOT NULL DEFAULT 'Sales Rep'
  is_active   BOOLEAN NOT NULL DEFAULT true
  created_at  TIMESTAMPTZ
  updated_at  TIMESTAMPTZ
```

6 salespeople seeded in migration `041_sales_team.sql` with fixed UUIDs (`a1b2c3d4-000N-4000-8000-000000000001..6`).

---

## 14. Audit Log (`053`)

```
audit_log
  id          UUID PK
  table_name  TEXT NOT NULL
  record_id   UUID NOT NULL
  action      TEXT NOT NULL  -- INSERT, UPDATE, DELETE
  changed_by  TEXT
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  old_data    JSONB
  new_data    JSONB
```

---

## Key Relationships (Summary ERD)

```
products ──< inventory >── locations
    │
    └──< quote_lines >── quotes ──> customers ──< customer_jobs
    │                                    │
    └──< order_lines >── orders ──────────┘
    │                       │
    └──< invoice_lines >── invoices ──< payments
                               │
                               └──> gl_journal_entries ──< gl_journal_lines >── gl_accounts

purchase_orders ──< purchase_order_lines >── products
      │
      └── vendors

delivery_routes ──< deliveries >── orders
      ├── vehicles
      └── drivers
```

---

## Adding New Schema

When contributing a new feature that requires schema changes:

1. Create `backend/migrations/NNN_feature_slug.sql` (next sequential number)
2. Use `gen_random_uuid()` for UUID PKs
3. Use `DECIMAL(19,4)` for all quantities and money
4. Use `TIMESTAMPTZ` for all timestamps
5. Add indexes for every FK and every column used in a `WHERE` clause
6. Never `ALTER` or `DROP` from an existing migration file — always create a new one
7. Test: `make migrate` must succeed from a clean database
