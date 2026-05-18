# Gable LBM Business Intelligence - Entity Relationship Document

This document outlines the schema exposed via the `/api/v1/reporting/export/{entity}` API for connection to BI tools like Power BI or Tableau.

## invoices
> Customer invoices representing completed sales or shipped materials.

### Fields
| Name | Type | Description |
|---|---|---|
| `id` | UUID | Primary Key |
| `invoice_number` | String | Human readable invoice identifier |
| `status` | String | UNPAID, PAID, VOID, PARTIAL |
| `total_amount` | Decimal | Total invoice value including tax in cents |
| `created_at` | DateTime | Timestamp of creation |
| `customer_id` | UUID | Foreign Key to customers |
| `customer_name` | String | Denormalized customer name |

### Relationships
- **customers** (N:1) on `customer_id = id`

---

## orders
> Customer orders representing committed sales not yet invoiced.

### Fields
| Name | Type | Description |
|---|---|---|
| `id` | UUID | Primary Key |
| `order_number` | String | Human readable order identifier |
| `status` | String | OPEN, STAGED, COMPLETED |
| `total_amount` | Decimal | Total order value in cents |
| `created_at` | DateTime | Timestamp of creation |
| `customer_id` | UUID | Foreign Key to customers |
| `customer_name` | String | Denormalized customer name |

### Relationships
- **customers** (N:1) on `customer_id = id`

---

## inventory
> Real-time product inventory levels by location.

### Fields
| Name | Type | Description |
|---|---|---|
| `id` | UUID | Primary Key |
| `product_id` | UUID | Foreign Key to products |
| `product_name` | String | Denormalized product name |
| `quantity` | Decimal | Current stock level |
| `location_id` | UUID | Foreign Key to locations |

### Relationships
- **products** (N:1) on `product_id = id`

---

