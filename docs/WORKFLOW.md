# Replacement workflow

```text
NEW
 │ Logistics uploads the shipping label and proof photos together
 ▼
QC_PENDING
 ├── Esha rejects with reason ──► QC_REJECTED
 │                                  │ Logistics fixes the item and resubmits photos
 │                                  └──────────────► QC_PENDING
 │
 └── Esha approves ─────────────► QC_APPROVED
                                      │ Logistics confirms pack
                                      ▼
                                   PACKED
                                    ├── picked up ──► SHIPPED
                                    └── not picked ─► NEEDS_TOKEN
                                                           │ later pickup
                                                           └──► SHIPPED
```

`LABEL_PRINTED` remains supported only so orders already at that stage before the Logistics migration can continue to `QC_PENDING`; new orders skip that legacy stage.

Admin may cancel an open replacement or perform a reason-required, audited status override for exceptional recovery. Normal users only receive controls permitted by both their role and the current status. PostgreSQL rechecks every transition inside a locked transaction.

## Audit events

Creation, edits, every Logistics label/photo submission, each QC decision, packing, dispatch, comments, cancellation, and admin overrides create immutable activity entries. Each entry records the actor and server timestamp. Submission attempts use separate numbered rows, so rejection and resubmission never overwrite earlier evidence.

Telegram is downstream of the database commit. It can alert the relevant role, but it never becomes the source of truth and cannot prevent work from completing.
