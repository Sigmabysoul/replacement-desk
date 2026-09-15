# Order workflow

```text
NEW
 │ Customer Support has already supplied product photos; Logistics uploads the shipping label and adds tracking
 ▼
LABEL_UPLOADED
 │ Printing marks the label printed
 ▼
LABEL_PRINTED
 │ Packing uploads QC photos and asks CUSTOMER_SUPPORT for approval
 ▼
QC_PENDING
 ├── CUSTOMER_SUPPORT rejects with reason ──► QC_REJECTED
 │                                  │ Packing fixes the item and resubmits photos
 │                                  └──────────────► QC_PENDING
 │
 └── CUSTOMER_SUPPORT approves ─────────────► QC_APPROVED
                                      │ Packing confirms pack
                                      ▼
                                   PACKED
                                    ├── Packing: picked up ──► SHIPPED
                                    └── Packing: no pickup ──► NEEDS_TOKEN
                                                           │ later pickup
                                                           └──► SHIPPED
```

Replacement and offline orders use the same operational workflow. Replacement orders capture length, breadth, and height in centimetres (manually or from a preset); offline orders intentionally omit dimensions. Standard is the default shipping speed. Automatic `order_number` allocation starts at 501, while an Admin may assign any unused positive whole number; `replacement_number` remains the stable legacy audit key.

Customer Support and Admin can create, update, and archive dimension presets. Archiving hides a preset from new forms but keeps the captured measurements and reference on older orders.

Multi-order creation is a batch entry experience: each item remains an independent order with its own status, files, audit history, and automatic number. A branch may reuse the same customer details or create a different customer. Customer Support can see the proposed numeric Order ID but cannot change it. Admin may assign or correct any unused positive whole-number Order ID, including IDs below 501; that permission is enforced in PostgreSQL and later corrections are written to the audit history.

Existing orders already at `LABEL_PRINTED` continue directly with Packing QC. New orders use the explicit `LABEL_UPLOADED` handoff so uploading and printing cannot be confused.

Admin may cancel an open replacement or perform a reason-required, audited status override for exceptional recovery. Normal users only receive controls permitted by both their role and the current status. PostgreSQL rechecks every transition inside a locked transaction.

## Audit events

Creation with Customer Support's product photos, edits, Logistics label/tracking handoff, Printing confirmation, every Packing QC-picture submission, each QC decision, packing, dispatch, comments, cancellation, and admin overrides create immutable activity entries. Each entry records the actor and server timestamp. Customer Support's product evidence and Logistics' label remain attached to the order, while Packing QC attempts use separate numbered rows so rejection and resubmission never overwrite earlier evidence.

Telegram is downstream of the database commit. It can alert the relevant role, but it never becomes the source of truth and cannot prevent work from completing.
