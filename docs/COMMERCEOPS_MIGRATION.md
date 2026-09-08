# Future CommerceOps migration

Replacement Desk deliberately uses stable UUIDs, explicit statuses, UTC timestamps, and append-only activity so it can later become a CommerceOps module without rewriting its operational history.

## Data mapping

| Standalone table | Future CommerceOps responsibility |
| --- | --- |
| `replacements` | Replacement aggregate/root entity. Preserve the UUID and `replacement_number` as an external business key. Map `order_reference` to the CommerceOps order identity only after verified reconciliation. |
| `qc_submissions` | Child QC-attempt records. Preserve submission order, decision, reviewer, timestamps, and rejection text. |
| `attachments` | Object metadata linked to replacements and optional QC submissions. |
| `activity_logs` | Append-only replacement audit events. Preserve original actor and timestamp; add import provenance rather than rewriting entries. |
| `notifications` | Delivery-attempt history. It can remain operational history or be archived after CommerceOps owns notification delivery. |
| `profiles` | Temporary identity/role source. Map to CommerceOps users and permissions rather than copying passwords or Supabase Auth identities. |

## Identity migration

Create an explicit mapping table from Supabase Auth/profile UUID to CommerceOps user ID. Resolve inactive and departed users before import. Historical actors must remain representable even if they have no active CommerceOps login; use a disabled identity or immutable actor snapshot rather than assigning events to another employee.

## Attachments

Copy each private object to CommerceOps object storage, verify byte size or checksum, then update a new object locator. Retain original file name, MIME type, uploader, attachment type, QC submission link, and created time. Do not expose the source bucket or turn migrated files public. Keep the old storage path as import metadata until migration verification is complete.

## Status compatibility

Retain the current enum meanings: `NEW`, `LABEL_PRINTED`, `QC_PENDING`, `QC_REJECTED`, `QC_APPROVED`, `PACKED`, `SHIPPED`, `NEEDS_TOKEN`, and `CANCELLED`. If CommerceOps uses different internal states, add a versioned mapping at the module boundary. Do not infer inventory movements: this workflow is operational and inventory-neutral unless a later business design explicitly connects it.

## Activity history

Import activities in chronological order with their original UUID where the target allows it. Store the source application and import batch ID. The CommerceOps module should continue appending new events rather than updating imported ones. Admin overrides must remain visibly distinct from normal transitions.

## Notifications

The Telegram adapter can be moved behind a CommerceOps notification interface with the same event-to-recipient mapping. Alternatively, CommerceOps can replace Telegram while retaining old `notifications` rows as delivery evidence. In either design, delivery stays best-effort and cannot control transaction success.

## Cutover outline

1. Freeze new standalone writes for a short maintenance window.
2. Export rows and build the verified identity map.
3. Import replacements, QC submissions, attachments, activities, then notification history.
4. Copy and verify private objects.
5. Compare counts, status distribution, latest activity, and a sample of signed downloads.
6. Point notification links to CommerceOps and enable writes there.
7. Retain the standalone database read-only until the agreed rollback window closes.

The migration should be its own planned CommerceOps phase; this repository does not implement it.
