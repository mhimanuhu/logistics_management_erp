# Logistics ERP — API Documentation (v2)

**Base URL:** `http://localhost:5000/api`  
**Auth:** All routes (except login) require `Authorization: Bearer <token>` header.

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Users](#2-users)
3. [Roles](#3-roles)
4. [Customers](#4-customers)
5. [Jobs — CRUD](#5-jobs--crud)
6. [Jobs — Export Phases](#6-jobs--export-phases)
7. [Jobs — Import Phases](#7-jobs--import-phases)
8. [Jobs — Charges](#8-jobs--charges)
9. [Invoices](#9-invoices)
10. [Logs](#10-logs)
11. [Important Rules](#11-important-rules)

---

## 1. Authentication

### `POST /api/auth/login`

Login and get JWT token.

**Body (JSON):**
```json
{
  "email": "admin@example.com",
  "password": "yourpassword"
}
```

**Success Response (200):**
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOi...",
  "user": {
    "id": 1,
    "name": "Super Admin",
    "email": "admin@example.com",
    "role": "SUPER_ADMIN",
    "role_id": 1
  }
}
```

**Errors:** `400` missing fields | `401` invalid credentials | `403` user inactive

---

## 2. Users

> All user routes require `SUPER_ADMIN` or `DEV_ADMIN` role.

### `GET /api/users`

List all users with role and creator info.

**Response (200):** Array of user objects:
```json
[
  {
    "id": 1,
    "name": "Super Admin",
    "email": "admin@example.com",
    "role": "SUPER_ADMIN",
    "role_id": 1,
    "created_by": null,
    "is_active": 1,
    "created_at": "2026-05-17T...",
    "updated_at": "2026-05-17T..."
  }
]
```

### `POST /api/users`

Create a new user.

**Body (JSON):**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepassword",
  "role": "USER"
}
```

> You can pass either `role` (name string) or `role_id` (number). Role name takes precedence.

**Permission rules:**
- `DEV_ADMIN` → can create `SUPER_ADMIN`, `DEV_ADMIN`, `USER`
- `SUPER_ADMIN` → can create `DEV_ADMIN`, `USER`
- `USER` → cannot create anyone

**Success (200):**
```json
{
  "message": "User created successfully",
  "user_id": 5
}
```

### `DELETE /api/users/:id`

Delete a user. All their jobs, logs, customers, and invoices are transferred to the admin performing the deletion.

**Errors:** `400` cannot delete yourself | `403` not admin | `404` user not found

### `PATCH /api/users/:id/toggle-active`

Toggle user active/inactive status.

**Success (200):**
```json
{
  "message": "User deactivated successfully",
  "user_id": "5",
  "is_active": 0
}
```

---

## 3. Roles

### `GET /api/roles`

List all **active** roles (for dropdowns). Any authenticated user.

**Response (200):**
```json
[
  { "id": 1, "name": "SUPER_ADMIN", "description": "Full system access", "is_active": 1 },
  { "id": 2, "name": "DEV_ADMIN",   "description": "Developer / admin access", "is_active": 1 },
  { "id": 3, "name": "USER",        "description": "Standard user", "is_active": 1 }
]
```

### `GET /api/roles/all`

List all roles including inactive. `SUPER_ADMIN` / `DEV_ADMIN` only.

---

## 4. Customers

### `GET /api/customers`

List customers/vendors with optional filters.

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `status` | string | `active` or `inactive` |
| `company_type` | string | `customer`, `vendor`, or `customer_vendor` |
| `search` | string | Searches company_name, gstin, contact_person, email |

### `GET /api/customers/:id`

Get single customer by ID.

### `POST /api/customers`

Create a new customer/vendor.

**Body (JSON):**
```json
{
  "company_name": "ABC Traders",
  "company_type": "customer",
  "gstin": "08AABCU9603R1ZM",
  "contact_person": "Rahul",
  "contact_no": "9876543210",
  "email": "rahul@abc.com",
  "registration_type": "regular",
  "pan": "AABCU9603R",
  "address_line1": "Plot 5, Industrial Area",
  "address_line2": "",
  "landmark": "Near Highway",
  "city": "Jaipur",
  "state": "Rajasthan",
  "pincode": "302001",
  "status": "active"
}
```

**Required fields:** `company_name`, `city`

### `PUT /api/customers/:id`

Update customer fields. Send only the fields you want to change.

### `DELETE /api/customers/:id`

Soft-delete (sets status to `inactive`). **SUPER_ADMIN only.**

---

## 5. Jobs — CRUD

### `POST /api/jobs`

Create a new job (export or import). Auto-generates `job_no`, creates empty phase 1 row and empty charges row.

**Body (JSON):**
```json
{
  "job_type": "export",
  "customer_id": 3,
  "assigned_to": 2,
  "remarks": "Urgent shipment"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `job_type` | string | ✅ | `"export"` or `"import"` |
| `customer_id` | int | ❌ | FK to customers table |
| `assigned_to` | int | ❌ | FK to users table |
| `remarks` | string | ❌ | Free text |

**Success (200):**
```json
{
  "message": "Job created successfully",
  "job_id": 12,
  "job_no": "EXP/25-26/0001"
}
```

### `GET /api/jobs`

List all jobs with customer and user names.

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `job_type` | string | `export` or `import` |
| `status` | string | `draft`, `in_progress`, `completed`, `cancelled` |
| `search` | string | Searches job_no and company_name |

**Response (200):** Array of job objects:
```json
[
  {
    "id": 12,
    "job_type": "export",
    "job_no": "EXP/25-26/0001",
    "customer_id": 3,
    "created_by": 1,
    "assigned_to": 2,
    "current_phase": 1,
    "status": "draft",
    "remarks": "Urgent shipment",
    "customer_name": "ABC Traders",
    "created_by_name": "Super Admin",
    "assigned_to_name": "John Doe",
    "created_at": "2026-05-17T...",
    "updated_at": "2026-05-17T..."
  }
]
```

### `GET /api/jobs/:id`

Get a single job by ID with customer and user names.

### `DELETE /api/jobs/:id`

Delete a job. **SUPER_ADMIN only.** Cascades to all phase tables and charges.

---

## 6. Jobs — Export Phases

> Export jobs have **3 phases**. Phase 2 is locked until Phase 1 is complete. Phase 3 is locked until Phase 2 is complete.

### Phase 1 — Booking & Container

#### `GET /api/jobs/:id/export/phase/1`

Get export phase 1 data.

#### `PUT /api/jobs/:id/export/phase/1`

Update export phase 1. Send only fields to update.

**Body (JSON):**
```json
{
  "clearing_location": "Jaipur ICD",
  "booking_line": "MSC",
  "forwarder": "ABC Logistics",
  "container_no": "MSCU1234567",
  "container_size": "40HC",
  "line_no": "MSC/2026/001",
  "custom_seal_rfid": "SEAL001",
  "pol": "Mundra",
  "pod": "Jebel Ali",
  "fpod": "Dubai",
  "vessel_name": "MSC Oscar",
  "etd": "2026-06-15",
  "container_pickup_loc": "Concor Jaipur",
  "scheme_code": "DFIA",
  "remarks": "Handle with care"
}
```

**Updatable fields:** `clearing_location`, `booking_line`, `forwarder`, `container_no`, `container_size`, `line_no`, `custom_seal_rfid`, `pol`, `pod`, `fpod`, `vessel_name`, `etd`, `container_pickup_loc`, `scheme_code`, `remarks`

#### `POST /api/jobs/:id/export/phase/1/complete`

Mark phase 1 as complete. Unlocks phase 2. No body needed.

**Success (200):**
```json
{ "message": "Phase 1 marked complete" }
```

---

### Phase 2 — Transport & Advance

> ⚠️ Phase 1 must be complete to access phase 2. Returns `403` otherwise.

#### `GET /api/jobs/:id/export/phase/2`

#### `PUT /api/jobs/:id/export/phase/2`

**Body (JSON):**
```json
{
  "trailer_no": "RJ14GB1234",
  "transporter_name": "Raj Transport",
  "diesel_adv": 5000.00,
  "cash_adv": 2000.00,
  "freight": 25000.00,
  "remarks": "Paid in cash"
}
```

**Updatable fields:** `trailer_no`, `transporter_name`, `diesel_adv`, `cash_adv`, `freight`, `remarks`

#### `POST /api/jobs/:id/export/phase/2/complete`

Mark phase 2 complete. Unlocks phase 3.

---

### Phase 3 — Invoice, Shipping Bill & Handover

> ⚠️ Phase 2 must be complete to access phase 3. Returns `403` otherwise.

#### `GET /api/jobs/:id/export/phase/3`

#### `PUT /api/jobs/:id/export/phase/3`

**Content-Type:** `multipart/form-data` (supports image upload)

| Field | Type | Description |
|-------|------|-------------|
| `invoice_no` | string | Invoice number |
| `invoice_date` | date | `YYYY-MM-DD` |
| `cargo_description` | string | Description of cargo |
| `currency` | string | Default `INR` |
| `total_packets` | int | Number of packets |
| `net_weight` | decimal | Weight in KG |
| `gross_weight` | decimal | Weight in KG |
| `shipping_bill_no` | string | Shipping bill number |
| `shipping_bill_date` | date | `YYYY-MM-DD` |
| `leo_date` | date | Let Export Order date |
| `line_handover_date` | date | Line handover date |
| `port_handover_date` | date | Port handover date |
| `remarks` | string | Free text |
| `image` | file | Document image (JPG/PNG/GIF/WEBP, max 5MB) |

#### `POST /api/jobs/:id/export/phase/3/complete`

Mark phase 3 complete. **Job status changes to `completed`.**

---

## 7. Jobs — Import Phases

> Import jobs have **2 phases**. Phase 2 is locked until Phase 1 is complete.

### Phase 1 — Shipping, Container & Transport

#### `GET /api/jobs/:id/import/phase/1`

#### `PUT /api/jobs/:id/import/phase/1`

**Content-Type:** `multipart/form-data` (supports image upload)

| Field | Type | Description |
|-------|------|-------------|
| `shipping_line` | string | Shipping line name |
| `mbl_no` | string | Master Bill of Lading |
| `hbl_no` | string | House Bill of Lading |
| `container_no` | string | Container number |
| `container_size` | string | `20'`, `40'`, `40HC` etc. |
| `eta` | date | Estimated Time of Arrival (`YYYY-MM-DD`) |
| `port` | string | Port name |
| `tpt_name` | string | Transport company name |
| `trailer_no` | string | Trailer number |
| `transporter_name` | string | Transporter name |
| `diesel_adv` | decimal | Diesel advance amount |
| `cash_adv` | decimal | Cash advance amount |
| `freight` | decimal | Freight amount |
| `remarks` | string | Free text |
| `image` | file | Document image (JPG/PNG/GIF/WEBP, max 5MB) |

#### `POST /api/jobs/:id/import/phase/1/complete`

Mark phase 1 complete. Unlocks phase 2.

---

### Phase 2 — Bill of Entry, Cargo & Clearance

> ⚠️ Phase 1 must be complete to access phase 2. Returns `403` otherwise.

#### `GET /api/jobs/:id/import/phase/2`

#### `PUT /api/jobs/:id/import/phase/2`

**Content-Type:** `multipart/form-data` (supports image upload)

| Field | Type | Description |
|-------|------|-------------|
| `be_no` | string | Bill of Entry number |
| `be_date` | date | `YYYY-MM-DD` |
| `cargo_description` | string | Description of cargo |
| `net_weight` | decimal | Weight in KG |
| `gross_weight` | decimal | Weight in KG |
| `packages` | int | Number of packages |
| `ooc_date` | date | Out of Charge date (customs) |
| `scheme_code` | string | Scheme code |
| `tpt_name` | string | Transport company |
| `trailer_no` | string | Trailer number |
| `transporter_name` | string | Transporter name |
| `diesel_adv` | decimal | Diesel advance |
| `cash_adv` | decimal | Cash advance |
| `freight` | decimal | Freight amount |
| `remarks` | string | Free text |
| `image` | file | Document image (JPG/PNG/GIF/WEBP, max 5MB) |

#### `POST /api/jobs/:id/import/phase/2/complete`

Mark phase 2 complete. **Job status changes to `completed`.**

---

## 8. Jobs — Charges

> One charges record per job. Created automatically when a job is created. The `total_charges` field is auto-computed by MySQL — never send it.

### `GET /api/jobs/:id/charges`

Get all charges for a job. `total_charges` is included in the response (auto-computed).

**Response (200):**
```json
{
  "id": 1,
  "job_id": 12,
  "seal_charges": 500.00,
  "fumigation_charges": 1200.00,
  "empty_survey_report": 0.00,
  "transport_charges": 15000.00,
  "handling_charges_transport_bill": 0.00,
  "detention_charges": 0.00,
  "handling_charges_nk_yard": 0.00,
  "concor_freight_charges": 8000.00,
  "concor_handling_charges": 2000.00,
  "gsp_fees": 0.00,
  "gsp_making_charges": 0.00,
  "out_charges_handling": 0.00,
  "labour_charges": 3000.00,
  "examination_charges": 0.00,
  "direct_stuffing_charges": 0.00,
  "other_charges_1_desc": "Documentation",
  "other_charges_1_amount": 500.00,
  "other_charges_2_desc": null,
  "other_charges_2_amount": 0.00,
  "total_charges": 30200.00
}
```

### `PUT /api/jobs/:id/charges`

Update charge fields. Send only the fields you want to change.

**Body (JSON):**
```json
{
  "seal_charges": 500,
  "fumigation_charges": 1200,
  "transport_charges": 15000,
  "concor_freight_charges": 8000,
  "labour_charges": 3000,
  "other_charges_1_desc": "Documentation",
  "other_charges_1_amount": 500
}
```

> ⚠️ Do NOT send `total_charges`. MySQL computes it automatically.

---

## 9. Invoices

> Invoices can be linked to a job (`job_id`) or standalone (`job_id = null`).

### `GET /api/invoices`

List all invoices with customer info and line items.

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `status` | string | `draft`, `sent`, `paid`, `overdue`, `cancelled` |
| `customer_id` | int | Filter by customer |
| `search` | string | Searches invoice number, company name, sbill_no, cont_no |

### `GET /api/invoices/summary/monthly`

Monthly invoice totals. Optional `?year=2026` (defaults to current year).

**Response (200):**
```json
{
  "year": 2026,
  "grand_total_invoices": 45,
  "grand_total_amount": 1250000.00,
  "months": [
    {
      "month_number": 1,
      "month_label": "Jan 2026",
      "total_invoices": 5,
      "total_taxable": 100000.00,
      "total_cgst": 9000.00,
      "total_sgst": 9000.00,
      "total_igst": 0.00,
      "total_tax": 18000.00,
      "total_amount": 118000.00
    }
  ]
}
```

### `GET /api/invoices/:id`

Get single invoice with customer info and all line items.

### `GET /api/invoices/:id/print`

Get all data needed for bill printing — invoice, customer, items, company info, bank details, terms.

### `POST /api/invoices`

Create invoice with line items.

**Content-Type:** `multipart/form-data` (for optional e-invoice file upload)

**Body fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `customer_id` | int | ✅ | FK to customers |
| `job_id` | int | ❌ | FK to job_entries (null for standalone) |
| `invoice_number` | string | ✅ | Invoice number |
| `invoice_date` | date | ✅ | `YYYY-MM-DD` |
| `place_of_supply` | string | ✅ | State/place |
| `invoice_prefix` | string | ❌ | Default: `KSL/25-26/` |
| `invoice_post` | string | ❌ | Suffix text |
| `invoice_type` | string | ❌ | `tax_invoice` (default), `bill_of_supply`, `export_invoice` |
| `ship_to` | string | ❌ | Ship-to address |
| `rev_charge` | 0/1 | ❌ | Reverse charge flag |
| `shipper` | string | ❌ | Shipper name |
| `bl_no` | string | ❌ | Bill of Lading number |
| `sbill_no` | string | ❌ | Shipping bill number |
| `sbill_date` | date | ❌ | Shipping bill date |
| `ref_invoice_no` | string | ❌ | Reference invoice |
| `cont_no` | string | ❌ | Container number |
| `delivery_mode` | string | ❌ | Delivery mode |
| `taxable_amount` | decimal | ❌ | Total taxable |
| `cgst_amount` | decimal | ❌ | CGST amount |
| `sgst_amount` | decimal | ❌ | SGST amount |
| `igst_amount` | decimal | ❌ | IGST amount |
| `round_off` | decimal | ❌ | Round off |
| `total_amount` | decimal | ❌ | Grand total |
| `status` | string | ❌ | `draft` (default), `sent`, `paid`, `overdue`, `cancelled` |
| `remarks` | string | ❌ | Free text |
| `e_invoice_file` | file | ❌ | PDF/image (max 10MB) |
| `items` | JSON array | ❌ | Line items (see below) |

**Items array format:**
```json
{
  "items": [
    {
      "sr_no": 1,
      "product_name": "CHA Service",
      "hsn_sac": "996719",
      "qty": 1,
      "uom": "NOS",
      "rate": 5000.00,
      "taxable_value": 5000.00,
      "cgst_rate": 9.00,
      "cgst_amount": 450.00,
      "sgst_rate": 9.00,
      "sgst_amount": 450.00,
      "igst_rate": 0.00,
      "igst_amount": 0.00,
      "discount": 0.00,
      "total": 5900.00,
      "item_note": ""
    }
  ]
}
```

> When using `multipart/form-data`, send `items` as a JSON string.

**Success (200):**
```json
{
  "message": "Invoice created successfully",
  "invoice_id": 25
}
```

### `PUT /api/invoices/:id`

Update invoice header and items. Items use smart upsert:
- Items **with `id`** → updated
- Items **without `id`** → inserted as new
- Existing items **not in the request** → deleted

### `DELETE /api/invoices/:id`

Delete invoice. **SUPER_ADMIN only.** Items cascade-delete.

---

## 10. Logs

### `GET /api/logs`

Get all system activity logs. **SUPER_ADMIN / DEV_ADMIN only.**

**Response (200):**
```json
[
  {
    "id": 1,
    "action": "CREATE",
    "phase": 1,
    "description": "Created export job EXP/25-26/0001",
    "ip_address": "::1",
    "created_at": "2026-05-17T...",
    "user_name": "Super Admin",
    "user_email": "admin@example.com",
    "user_role": "SUPER_ADMIN",
    "job_no": "EXP/25-26/0001",
    "job_type": "export"
  }
]
```

---

## 11. Important Rules

### Phase Gate
Phase 2+ endpoints return **`403`** if the previous phase is not complete. Always check `current_phase` from `GET /api/jobs/:id` to know which phase tabs to enable.

### Job Workflow
```
POST /api/jobs → status: "draft", current_phase: 1
  ↓
PUT phase 1 → fill data → POST phase 1/complete
  ↓  status: "in_progress", current_phase: 2
PUT phase 2 → fill data → POST phase 2/complete
  ↓  current_phase: 3 (export only)
PUT phase 3 → fill data → POST phase 3/complete
  ↓  status: "completed"
```

### GENERATED Columns — Never Send These
- `total_charges` in charges response — auto-computed by MySQL
- `total_tax` in invoices response — auto-computed by MySQL

### Error Response Format
All errors return:
```json
{
  "message": "Error description"
}
```

### Common HTTP Status Codes
| Code | Meaning |
|------|---------|
| `200` | Success |
| `400` | Bad request / validation error |
| `401` | Missing or invalid token |
| `403` | Forbidden (wrong role or phase not unlocked) |
| `404` | Resource not found |
| `500` | Server error |
