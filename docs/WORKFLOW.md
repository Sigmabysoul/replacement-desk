# Replacement workflow

```text
NEW
 │ Printing confirms physical label output
 ▼
LABEL_PRINTED
 │ Packing uploads one or more QC photos
 ▼
QC_PENDING
 ├── Esha rejects with reason ──► QC_REJECTED
 │                                  │ Packing fixes/replaces item
 │                                  └──────────────► QC_PENDING
 │
 └── Esha approves ─────────────► QC_APPROVED
                                      │ Packing confirms pack
                                      ▼
                                   PACKED
                                    ├── picked up ──► SHIPPED
                                    └── not picked ─► NEEDS_TOKEN
                                                           │ later pickup
                                                           └──► SHIPPED
```

Admin may cancel an open replacement or perform a reason-required, audited status override for exceptional recovery. Normal users only receive controls permitted by both their role and the current status. PostgreSQL rechecks every transition inside a locked transaction.

## Audit events

Creation, edits, uploads, label printing, each QC submission and decision, packing, dispatch, comments, cancellation, and admin overrides create immutable activity entries. Each entry records the actor and server timestamp. QC attempts use separate numbered rows, so rejection and resubmission never overwrite the earlier evidence.

Telegram is downstream of the database commit. It can alert the relevant role, but it never becomes the source of truth and cannot prevent work from completing.
