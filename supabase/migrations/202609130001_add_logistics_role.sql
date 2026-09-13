-- Add the new operational role and intermediate label state in their own
-- committed migration. PostgreSQL requires new enum values to be committed
-- before later SQL functions can reference them.
alter type public.app_role add value if not exists 'LOGISTICS' after 'PACKING';
alter type public.replacement_status add value if not exists 'LABEL_UPLOADED' after 'NEW';
alter type public.attachment_type add value if not exists 'PROOF_PHOTO' after 'LABEL';
