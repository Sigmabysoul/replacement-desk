-- Move product evidence to order creation. Esha must create each new replacement
-- with product photos; Logistics now supplies only the shipping label.

drop policy if exists "authorized users can upload replacement files" on storage.objects;
create policy "authorized users can upload replacement files" on storage.objects
for insert to authenticated with check (
  bucket_id = 'replacement-files'
  and name like 'replacements/%'
  and public.current_active_role() in ('ESHA', 'LOGISTICS', 'PACKING', 'ADMIN')
  and coalesce((metadata ->> 'size')::bigint, 0) <= 26214400
);

-- Creation goes through the function below so product evidence and the order row
-- commit together. A failed database write leaves no partially created order.
revoke insert on public.replacements from authenticated;

create or replace function public.create_replacement_with_photos(
  p_replacement_id uuid,
  p_upload_id uuid,
  p_order_reference text,
  p_customer_name text,
  p_customer_reference text,
  p_product_name text,
  p_quantity integer,
  p_reason text,
  p_notes text,
  p_tracking_url text,
  p_attachments jsonb
)
returns public.replacements language plpgsql security definer set search_path = '' as $$
declare
  created_row public.replacements;
  actor_role public.app_role;
  attachment_count integer := 0;
begin
  select public.current_active_role() into actor_role;
  if actor_role is null or actor_role not in ('ESHA', 'ADMIN') then
    raise exception 'Only Esha can create replacement orders';
  end if;
  if jsonb_typeof(p_attachments) is distinct from 'array'
    or jsonb_array_length(p_attachments) not between 1 and 12 then
    raise exception 'Between one and twelve product photos are required';
  end if;
  if (
    select count(*)
    from jsonb_to_recordset(p_attachments) as item(storage_path text)
    join storage.objects as stored
      on stored.bucket_id = 'replacement-files'
      and stored.name = item.storage_path
      and stored.owner_id = auth.uid()::text
  ) <> jsonb_array_length(p_attachments) then
    raise exception 'Product photo storage objects were not uploaded by the current user';
  end if;

  insert into public.replacements(
    id,
    replacement_number,
    order_reference,
    customer_name,
    customer_reference,
    product_name,
    quantity,
    reason,
    notes,
    tracking_url,
    status,
    created_by
  ) values (
    p_replacement_id,
    'assigned-by-trigger',
    p_order_reference,
    p_customer_name,
    p_customer_reference,
    p_product_name,
    p_quantity,
    p_reason,
    p_notes,
    p_tracking_url,
    'NEW',
    auth.uid()
  ) returning * into created_row;

  insert into public.attachments(
    replacement_id, qc_submission_id, attachment_type, storage_path, file_name, mime_type, uploaded_by
  )
  select
    p_replacement_id, null, 'PROOF_PHOTO', item.storage_path, item.file_name, item.mime_type, auth.uid()
  from jsonb_to_recordset(p_attachments) as item(storage_path text, file_name text, mime_type text)
  where item.mime_type in ('image/jpeg', 'image/png', 'image/webp')
    and item.storage_path like (
      'replacements/' || p_replacement_id || '/esha/' || p_upload_id || '/photos/%'
    );
  get diagnostics attachment_count = row_count;
  if attachment_count <> jsonb_array_length(p_attachments) then
    raise exception 'Invalid product photo metadata';
  end if;

  return created_row;
end;
$$;

create or replace function public.submit_logistics_label(
  p_replacement_id uuid,
  p_upload_id uuid,
  p_attachments jsonb
)
returns public.replacements language plpgsql security definer set search_path = '' as $$
declare
  current_row public.replacements;
  actor_role public.app_role;
  attachment_count integer := 0;
begin
  select * into current_row from public.replacements where id = p_replacement_id for update;
  if not found then raise exception 'Replacement not found'; end if;

  select public.current_active_role() into actor_role;
  if actor_role is null or actor_role not in ('LOGISTICS', 'ADMIN') then
    raise exception 'Only Logistics can upload the shipping label';
  end if;
  if current_row.status <> 'NEW' then
    raise exception 'A label can only be uploaded for a new replacement';
  end if;
  if jsonb_typeof(p_attachments) is distinct from 'array'
    or jsonb_array_length(p_attachments) <> 1 then
    raise exception 'Exactly one shipping label is required';
  end if;
  if (
    select count(*)
    from jsonb_to_recordset(p_attachments) as item(storage_path text)
    join storage.objects as stored
      on stored.bucket_id = 'replacement-files'
      and stored.name = item.storage_path
      and stored.owner_id = auth.uid()::text
  ) <> 1 then
    raise exception 'The label storage object was not uploaded by the current user';
  end if;

  insert into public.attachments(
    replacement_id, qc_submission_id, attachment_type, storage_path, file_name, mime_type, uploaded_by
  )
  select
    p_replacement_id, null, 'LABEL', item.storage_path, item.file_name, item.mime_type, auth.uid()
  from jsonb_to_recordset(p_attachments) as item(storage_path text, file_name text, mime_type text)
  where item.mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
    and item.storage_path like (
      'replacements/' || p_replacement_id || '/logistics/' || p_upload_id || '/labels/%'
    );
  get diagnostics attachment_count = row_count;
  if attachment_count <> 1 then raise exception 'Invalid label metadata'; end if;

  update public.replacements set status = 'LABEL_UPLOADED'
  where id = p_replacement_id
  returning * into current_row;

  insert into public.activity_logs(replacement_id, actor_id, action, metadata)
  values (
    p_replacement_id,
    auth.uid(),
    'LOGISTICS_SUBMITTED',
    jsonb_build_object('upload_id', p_upload_id, 'attachment_count', attachment_count)
  );
  return current_row;
end;
$$;

revoke all on function public.create_replacement_with_photos(uuid, uuid, text, text, text, text, integer, text, text, text, jsonb) from public, anon;
grant execute on function public.create_replacement_with_photos(uuid, uuid, text, text, text, text, integer, text, text, text, jsonb) to authenticated;
revoke all on function public.submit_logistics_label(uuid, uuid, jsonb) from public, anon;
grant execute on function public.submit_logistics_label(uuid, uuid, jsonb) to authenticated;

drop function if exists public.submit_logistics_package(uuid, uuid, jsonb, jsonb);

notify pgrst, 'reload schema';
