-- Add the new operational roles for offline orders in their own
-- committed migration. PostgreSQL requires new enum values to be committed
-- before later SQL functions can reference them.
alter type public.app_role add value if not exists 'BOSS';
alter type public.app_role add value if not exists 'HR';
alter type public.app_role add value if not exists 'CONSIGNMENT';

