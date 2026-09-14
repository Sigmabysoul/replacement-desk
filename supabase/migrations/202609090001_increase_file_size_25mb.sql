-- Increase replacement-files bucket file size limit to 25 MB (26214400 bytes)
update storage.buckets
set file_size_limit = 26214400
where id = 'replacement-files';

-- Update RLS upload policy check to 25 MB
drop policy if exists "authorized users can upload replacement files" on storage.objects;
create policy "authorized users can upload replacement files" on storage.objects for insert to authenticated with check (
  bucket_id = 'replacement-files' and name like 'replacements/%' and
  public.current_active_role() in ('customer_support', 'PACKING', 'ADMIN') and
  coalesce((metadata ->> 'size')::bigint, 0) <= 26214400
);

