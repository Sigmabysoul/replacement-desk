-- Preserve the already-shipped Logistics migration and advance existing databases
-- to the corrected workflow: Logistics submits one label plus product evidence,
-- while Packing continues to submit separate QC evidence for customer_support's review.

alter type public.attachment_type add value if not exists 'PROOF_PHOTO' after 'LABEL';

create or replace function public.submit_logistics_package(
  p_replacement_id uuid,
  p_upload_id uuid,
  p_label_attachments jsonb,
  p_photo_attachments jsonb
)
returns public.replacements language plpgsql security definer set search_path = '' as $$
declare
  current_row public.replacements;
  actor_role public.app_role;
  label_count integer := 0;
  photo_count integer := 0;
begin
  select * into current_row from public.replacements where id = p_replacement_id for update;
  if not found then raise exception 'Replacement not found'; end if;

  select public.current_active_role() into actor_role;
  if actor_role is null or actor_role not in ('LOGISTICS', 'ADMIN') then
    raise exception 'Only Logistics can upload labels and product photos';
  end if;
  if current_row.status <> 'NEW' then
    raise exception 'Logistics files can only be uploaded for a new replacement';
  end if;
  if jsonb_typeof(p_label_attachments) is distinct from 'array'
    or jsonb_array_length(p_label_attachments) <> 1 then
    raise exception 'Exactly one shipping label is required';
  end if;
  if jsonb_typeof(p_photo_attachments) is distinct from 'array'
    or jsonb_array_length(p_photo_attachments) not between 1 and 12 then
    raise exception 'Between one and twelve product photos are required';
  end if;
  if (
    select count(*)
    from jsonb_to_recordset(p_label_attachments) as item(storage_path text)
    join storage.objects as stored
      on stored.bucket_id = 'replacement-files'
      and stored.name = item.storage_path
      and stored.owner_id = auth.uid()::text
  ) <> 1 then
    raise exception 'The label storage object was not uploaded by the current user';
  end if;
  if (
    select count(*)
    from jsonb_to_recordset(p_photo_attachments) as item(storage_path text)
    join storage.objects as stored
      on stored.bucket_id = 'replacement-files'
      and stored.name = item.storage_path
      and stored.owner_id = auth.uid()::text
  ) <> jsonb_array_length(p_photo_attachments) then
    raise exception 'Product photo storage objects were not uploaded by the current user';
  end if;

  insert into public.attachments(
    replacement_id, qc_submission_id, attachment_type, storage_path, file_name, mime_type, uploaded_by
  )
  select
    p_replacement_id, null, 'LABEL', item.storage_path, item.file_name, item.mime_type, auth.uid()
  from jsonb_to_recordset(p_label_attachments) as item(storage_path text, file_name text, mime_type text)
  where item.mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
    and item.storage_path like (
      'replacements/' || p_replacement_id || '/logistics/' || p_upload_id || '/labels/%'
    );
  get diagnostics label_count = row_count;
  if label_count <> 1 then raise exception 'Invalid label metadata'; end if;

  insert into public.attachments(
    replacement_id, qc_submission_id, attachment_type, storage_path, file_name, mime_type, uploaded_by
  )
  select
    p_replacement_id, null, 'PROOF_PHOTO', item.storage_path, item.file_name, item.mime_type, auth.uid()
  from jsonb_to_recordset(p_photo_attachments) as item(storage_path text, file_name text, mime_type text)
  where item.mime_type in ('image/jpeg', 'image/png', 'image/webp')
    and item.storage_path like (
      'replacements/' || p_replacement_id || '/logistics/' || p_upload_id || '/photos/%'
    );
  get diagnostics photo_count = row_count;
  if photo_count <> jsonb_array_length(p_photo_attachments) then
    raise exception 'Invalid product photo metadata';
  end if;

  update public.replacements set status = 'LABEL_UPLOADED'
  where id = p_replacement_id
  returning * into current_row;

  insert into public.activity_logs(replacement_id, actor_id, action, metadata)
  values (
    p_replacement_id,
    auth.uid(),
    'LOGISTICS_SUBMITTED',
    jsonb_build_object('upload_id', p_upload_id, 'label_count', label_count, 'photo_count', photo_count)
  );
  return current_row;
end;
$$;

revoke all on function public.submit_logistics_package(uuid, uuid, jsonb, jsonb) from public;
grant execute on function public.submit_logistics_package(uuid, uuid, jsonb, jsonb) to authenticated;

drop function if exists public.submit_logistics_label(uuid, uuid, jsonb);

-- Notify PostgREST to refresh its schema cache immediately
notify pgrst, 'reload schema';
