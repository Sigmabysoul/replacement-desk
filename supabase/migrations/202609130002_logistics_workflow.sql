-- Consolidate the former Printing and Packing responsibilities into Logistics.
-- Existing users and in-flight orders are preserved; only the actor permissions
-- and the new-order handoff change.
update public.profiles
set role = 'LOGISTICS'
where role in ('PRINTING', 'PACKING');

alter table public.profiles alter column role set default 'LOGISTICS';

-- Self-service/auth-created profiles never receive a privileged role from user
-- metadata. An administrator must still assign Esha or Admin deliberately.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    'LOGISTICS'
  );
  return new;
end;
$$;

create or replace function public.admin_override_replacement(
  p_replacement_id uuid,
  p_target_status public.replacement_status,
  p_reason text
)
returns public.replacements language plpgsql security definer set search_path = '' as $$
declare
  current_row public.replacements;
  previous_status public.replacement_status;
begin
  if public.current_active_role() is distinct from 'ADMIN'::public.app_role then
    raise exception 'Admin access required';
  end if;
  if nullif(trim(p_reason), '') is null or char_length(trim(p_reason)) > 1000 then
    raise exception 'Override reason is required';
  end if;
  select * into current_row from public.replacements where id = p_replacement_id for update;
  if not found then raise exception 'Replacement not found'; end if;
  previous_status := current_row.status;

  update public.replacements set
    status = p_target_status,
    label_printed_at = case when p_target_status = 'LABEL_PRINTED' then coalesce(label_printed_at, now()) else label_printed_at end,
    qc_submitted_at = case when p_target_status = 'QC_PENDING' then coalesce(qc_submitted_at, now()) else qc_submitted_at end,
    qc_approved_at = case when p_target_status = 'QC_APPROVED' then coalesce(qc_approved_at, now()) else qc_approved_at end,
    packed_at = case when p_target_status = 'PACKED' then coalesce(packed_at, now()) else packed_at end,
    shipped_at = case when p_target_status = 'SHIPPED' then coalesce(shipped_at, now()) else shipped_at end,
    needs_token_at = case when p_target_status = 'NEEDS_TOKEN' then coalesce(needs_token_at, now()) else needs_token_at end
  where id = p_replacement_id
  returning * into current_row;

  insert into public.activity_logs(replacement_id, actor_id, action, message, metadata)
  values (
    p_replacement_id,
    auth.uid(),
    'ADMIN_STATUS_OVERRIDE',
    trim(p_reason),
    jsonb_build_object('from_status', previous_status, 'to_status', p_target_status)
  );
  return current_row;
end;
$$;

create or replace function public.archive_completed_replacements()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  archived_count integer;
begin
  if public.current_active_role() is distinct from 'ADMIN'::public.app_role then
    raise exception 'Administrator access required';
  end if;

  with archived as (
    update public.replacements
    set archived_at = now(), archived_by = auth.uid()
    where archived_at is null
      and status in ('SHIPPED', 'CANCELLED')
      and created_at < now() - interval '30 days'
    returning id
  )
  insert into public.activity_logs(replacement_id, actor_id, action, message)
  select id, auth.uid(), 'ORDER_ARCHIVED', 'Archived after 30 days in a completed status'
  from archived;

  get diagnostics archived_count = row_count;
  return archived_count;
end;
$$;

drop policy if exists "authorized users can add request files" on public.attachments;
drop policy if exists "logistics can add request files" on public.attachments;

drop policy if exists "authorized users can upload replacement files" on storage.objects;
create policy "authorized users can upload replacement files" on storage.objects
for insert to authenticated with check (
  bucket_id = 'replacement-files'
  and name like 'replacements/%'
  and public.current_active_role() in ('LOGISTICS', 'ADMIN')
  and coalesce((metadata ->> 'size')::bigint, 0) <= 26214400
);

create or replace function public.transition_replacement(
  p_replacement_id uuid,
  p_target_status public.replacement_status,
  p_message text default null
)
returns public.replacements language plpgsql security definer set search_path = '' as $$
declare
  current_row public.replacements;
  actor_role public.app_role;
  action_name text;
  previous_status public.replacement_status;
begin
  select * into current_row from public.replacements where id = p_replacement_id for update;
  if not found then raise exception 'Replacement not found'; end if;
  previous_status := current_row.status;
  select public.current_active_role() into actor_role;
  if actor_role is null then raise exception 'Active account required'; end if;

  -- LABEL_PRINTED is retained for legacy clients/orders. New clients submit the
  -- label and photos together through submit_logistics_package instead.
  if p_target_status = 'LABEL_PRINTED'
    and not (current_row.status = 'NEW' and actor_role in ('LOGISTICS', 'ADMIN'))
    then raise exception 'Only Logistics can confirm a new label';
  elsif p_target_status in ('QC_APPROVED', 'QC_REJECTED')
    and not (current_row.status = 'QC_PENDING' and actor_role in ('ESHA', 'ADMIN'))
    then raise exception 'Only Esha can review pending QC';
  elsif p_target_status = 'PACKED'
    and not (current_row.status = 'QC_APPROVED' and actor_role in ('LOGISTICS', 'ADMIN'))
    then raise exception 'QC must be approved before Logistics packs the order';
  elsif p_target_status = 'SHIPPED'
    and not (current_row.status in ('PACKED', 'NEEDS_TOKEN') and actor_role in ('ESHA', 'ADMIN'))
    then raise exception 'Only packed replacements can be shipped by Esha';
  elsif p_target_status = 'NEEDS_TOKEN'
    and not (current_row.status = 'PACKED' and actor_role in ('ESHA', 'ADMIN'))
    then raise exception 'Only packed replacements can need a token';
  elsif p_target_status = 'CANCELLED'
    and not (current_row.status not in ('SHIPPED', 'CANCELLED') and actor_role = 'ADMIN')
    then raise exception 'Only Admin can cancel an open replacement';
  elsif p_target_status not in ('LABEL_PRINTED', 'QC_APPROVED', 'QC_REJECTED', 'PACKED', 'SHIPPED', 'NEEDS_TOKEN', 'CANCELLED')
    then raise exception 'Unsupported transition';
  end if;

  if p_target_status = 'QC_REJECTED' and nullif(trim(p_message), '') is null then
    raise exception 'A rejection reason is required';
  end if;

  if p_target_status in ('QC_APPROVED', 'QC_REJECTED') then
    update public.qc_submissions set
      decision = case
        when p_target_status = 'QC_APPROVED' then 'APPROVED'::public.qc_decision
        else 'REJECTED'::public.qc_decision
      end,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      rejection_reason = case when p_target_status = 'QC_REJECTED' then trim(p_message) else null end
    where id = (
      select id from public.qc_submissions
      where replacement_id = p_replacement_id and decision = 'PENDING'
      order by submission_number desc limit 1
    );
    if not found then raise exception 'Pending QC submission not found'; end if;
  end if;

  update public.replacements set
    status = p_target_status,
    label_printed_at = case when p_target_status = 'LABEL_PRINTED' then now() else label_printed_at end,
    qc_approved_at = case when p_target_status = 'QC_APPROVED' then now() else qc_approved_at end,
    packed_at = case when p_target_status = 'PACKED' then now() else packed_at end,
    shipped_at = case when p_target_status = 'SHIPPED' then now() else shipped_at end,
    needs_token_at = case when p_target_status = 'NEEDS_TOKEN' then now() else needs_token_at end
  where id = p_replacement_id
  returning * into current_row;

  action_name := case p_target_status when 'CANCELLED' then 'CANCELLED' else p_target_status::text end;
  insert into public.activity_logs(replacement_id, actor_id, action, message, metadata)
  values (
    p_replacement_id,
    auth.uid(),
    action_name,
    nullif(trim(p_message), ''),
    jsonb_build_object('from_status', previous_status, 'to_status', p_target_status)
  );
  return current_row;
end;
$$;

create or replace function public.submit_logistics_package(
  p_replacement_id uuid,
  p_submission_id uuid,
  p_label_attachments jsonb,
  p_photo_attachments jsonb
)
returns public.replacements language plpgsql security definer set search_path = '' as $$
declare
  current_row public.replacements;
  actor_role public.app_role;
  next_submission integer;
  label_count integer := 0;
  photo_count integer := 0;
begin
  select * into current_row from public.replacements where id = p_replacement_id for update;
  if not found then raise exception 'Replacement not found'; end if;

  select public.current_active_role() into actor_role;
  if actor_role is null or actor_role not in ('LOGISTICS', 'ADMIN') then
    raise exception 'Only Logistics can add labels and proof photos';
  end if;
  if current_row.status not in ('NEW', 'LABEL_PRINTED', 'QC_REJECTED') then
    raise exception 'Logistics files cannot be submitted from this status';
  end if;
  if jsonb_typeof(p_label_attachments) is distinct from 'array' or jsonb_array_length(p_label_attachments) > 4 then
    raise exception 'A maximum of four label files is allowed';
  end if;
  if jsonb_typeof(p_photo_attachments) is distinct from 'array' or jsonb_array_length(p_photo_attachments) not between 1 and 12 then
    raise exception 'Between one and twelve proof photos are required';
  end if;
  if jsonb_array_length(p_label_attachments) = 0
    and not exists (
      select 1
      from public.attachments attachment
      join storage.objects stored
        on stored.bucket_id = 'replacement-files'
        and stored.name = attachment.storage_path
      where attachment.replacement_id = p_replacement_id
        and attachment.attachment_type = 'LABEL'
    )
    then raise exception 'A shipping label is required for this replacement';
  end if;

  if (
    select count(*)
    from jsonb_to_recordset(p_label_attachments) as item(storage_path text)
    join storage.objects as stored
      on stored.bucket_id = 'replacement-files'
      and stored.name = item.storage_path
      and stored.owner_id = auth.uid()::text
  ) <> jsonb_array_length(p_label_attachments) then
    raise exception 'Label storage objects were not uploaded by the current user';
  end if;

  if (
    select count(*)
    from jsonb_to_recordset(p_photo_attachments) as item(storage_path text)
    join storage.objects as stored
      on stored.bucket_id = 'replacement-files'
      and stored.name = item.storage_path
      and stored.owner_id = auth.uid()::text
  ) <> jsonb_array_length(p_photo_attachments) then
    raise exception 'Proof photo storage objects were not uploaded by the current user';
  end if;

  select coalesce(max(submission_number), 0) + 1
  into next_submission
  from public.qc_submissions
  where replacement_id = p_replacement_id;

  insert into public.qc_submissions(id, replacement_id, submission_number, submitted_by)
  values (p_submission_id, p_replacement_id, next_submission, auth.uid());

  insert into public.attachments(
    replacement_id, qc_submission_id, attachment_type, storage_path, file_name, mime_type, uploaded_by
  )
  select
    p_replacement_id, null, 'LABEL', item.storage_path, item.file_name, item.mime_type, auth.uid()
  from jsonb_to_recordset(p_label_attachments) as item(storage_path text, file_name text, mime_type text)
  where item.mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
    and item.storage_path like (
      'replacements/' || p_replacement_id || '/logistics/' || p_submission_id || '/labels/%'
    );
  get diagnostics label_count = row_count;
  if label_count <> jsonb_array_length(p_label_attachments) then raise exception 'Invalid label metadata'; end if;

  insert into public.attachments(
    replacement_id, qc_submission_id, attachment_type, storage_path, file_name, mime_type, uploaded_by
  )
  select
    p_replacement_id, p_submission_id, 'QC_PHOTO', item.storage_path, item.file_name, item.mime_type, auth.uid()
  from jsonb_to_recordset(p_photo_attachments) as item(storage_path text, file_name text, mime_type text)
  where item.mime_type in ('image/jpeg', 'image/png', 'image/webp')
    and item.storage_path like (
      'replacements/' || p_replacement_id || '/logistics/' || p_submission_id || '/photos/%'
    );
  get diagnostics photo_count = row_count;
  if photo_count <> jsonb_array_length(p_photo_attachments) then raise exception 'Invalid proof photo metadata'; end if;

  update public.replacements set
    status = 'QC_PENDING',
    label_printed_at = coalesce(label_printed_at, now()),
    qc_submitted_at = now()
  where id = p_replacement_id
  returning * into current_row;

  insert into public.activity_logs(replacement_id, actor_id, action, metadata)
  values (
    p_replacement_id,
    auth.uid(),
    'LOGISTICS_SUBMITTED',
    jsonb_build_object(
      'submission_id', p_submission_id,
      'submission_number', next_submission,
      'label_count', label_count,
      'photo_count', photo_count
    )
  );
  return current_row;
end;
$$;

revoke all on function public.submit_logistics_package(uuid, uuid, jsonb, jsonb) from public;
grant execute on function public.submit_logistics_package(uuid, uuid, jsonb, jsonb) to authenticated;

-- Retire the old Packing-only RPC from public clients. It remains in the schema
-- solely so historical migrations and audit data stay understandable.
revoke execute on function public.submit_qc(uuid, uuid, jsonb) from authenticated;

-- Harden older security-definer mutations against SQL's three-valued NULL
-- comparisons. Inactive profiles return NULL from current_active_role().
create or replace function public.update_replacement_details(
  p_replacement_id uuid,
  p_order_reference text,
  p_customer_name text,
  p_customer_reference text,
  p_product_name text,
  p_quantity integer,
  p_reason text,
  p_notes text,
  p_tracking_url text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  actor_role public.app_role;
  clean_tracking_url text := nullif(trim(p_tracking_url), '');
begin
  select public.current_active_role() into actor_role;
  if actor_role is null or actor_role not in ('ESHA', 'ADMIN') then
    raise exception 'Only Esha can edit replacement details';
  end if;
  if nullif(trim(p_order_reference), '') is null
    or nullif(trim(p_product_name), '') is null
    or p_quantity not between 1 and 999 then
    raise exception 'Invalid replacement details';
  end if;
  if clean_tracking_url is not null and clean_tracking_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'Tracking link must begin with http:// or https://';
  end if;

  update public.replacements
  set order_reference = trim(p_order_reference),
      customer_name = nullif(trim(p_customer_name), ''),
      customer_reference = nullif(trim(p_customer_reference), ''),
      product_name = trim(p_product_name),
      quantity = p_quantity,
      reason = nullif(trim(p_reason), ''),
      notes = nullif(trim(p_notes), ''),
      tracking_url = clean_tracking_url
  where id = p_replacement_id and status not in ('SHIPPED', 'CANCELLED');
  if not found then raise exception 'Open replacement not found'; end if;

  insert into public.activity_logs(replacement_id, actor_id, action, metadata)
  values (
    p_replacement_id,
    auth.uid(),
    'REPLACEMENT_UPDATED',
    jsonb_build_object('has_tracking_link', clean_tracking_url is not null)
  );
end;
$$;
