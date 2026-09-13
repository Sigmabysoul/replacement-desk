-- Add the consolidated operational role in its own committed migration. PostgreSQL
-- requires a newly-added enum value to be committed before later SQL can use it.
alter type public.app_role add value if not exists 'LOGISTICS' after 'PACKING';
