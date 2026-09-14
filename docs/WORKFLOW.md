# Replacement workflow

```text
NEW
 │ Esha has already supplied product photos; Logistics uploads the shipping label
 ▼
LABEL_UPLOADED
 │ Printing marks the label printed
 ▼
LABEL_PRINTED
 │ Packing uploads QC photos and asks Esha for approval
 ▼
QC_PENDING
 ├── Esha rejects with reason ──► QC_REJECTED
 │                                  │ Packing fixes the item and resubmits photos
 │                                  └──────────────► QC_PENDING
 │
 └── Esha approves ─────────────► QC_APPROVED
                                      │ Packing confirms pack
                                      ▼
                                   PACKED
                                    ├── Packing: picked up ──► SHIPPED
                                    └── Packing: no pickup ──► NEEDS_TOKEN
                                                           │ later pickup
                                                           └──► SHIPPED
```

Existing orders already at `LABEL_PRINTED` continue directly with Packing QC. New orders use the explicit `LABEL_UPLOADED` handoff so uploading and printing cannot be confused.

Admin may cancel an open replacement or perform a reason-required, audited status override for exceptional recovery. Normal users only receive controls permitted by both their role and the current status. PostgreSQL rechecks every transition inside a locked transaction.

## Audit events

Creation with Esha's product photos, edits, Logistics label upload, Printing confirmation, every Packing QC-picture submission, each QC decision, packing, dispatch, comments, cancellation, and admin overrides create immutable activity entries. Each entry records the actor and server timestamp. Esha's product evidence and Logistics' label remain attached to the order, while Packing QC attempts use separate numbered rows so rejection and resubmission never overwrite earlier evidence.

Telegram is downstream of the database commit. It can alert the relevant role, but it never becomes the source of truth and cannot prevent work from completing.
