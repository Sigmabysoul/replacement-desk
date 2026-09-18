-- Migration: Support DELIVERED status, Courier Partner, and Tracking ID on Replacements
-- Also updates create_order_batch, submit_logistics_label, and transition_replacement.

alter table public.replacements
  add column if not exists courier_partner text,
  add column if not exists tracking_id text,
  add column if not exists delivered_at timestamptz,
  add column if not exists delivered_by uuid references public.profiles(id),
  add column if not exists delivery_notes text;

alter table public.replacements alter column order_reference drop not null;
alter table public.replacements drop constraint if exists replacements_order_reference_check;
alter table public.replacements add constraint replacements_order_reference_check
  check (order_reference is null or char_length(order_reference) <= 100);

-- Update create_order_batch: order_reference is now optional from Customer Support
create or replace function public.create_order_batch(
  p_group_id uuid,
  p_orders jsonb,
  p_attachments jsonb
)
returns setof public.replacements
language plpgsql security definer set search_path = '' as $$
declare
  actor_role public.app_role;
  order_item jsonb;
  order_id uuid;
  order_type text;
  requested_order_number bigint;
  created_row public.replacements;
  attachment_count integer;
  expected_count integer;
  assigned_ref text;
begin
  select public.current_active_role() into actor_role;
  if actor_role is null or not (actor_role in ('CUSTOMER_SUPPORT', 'ADMIN') or public.has_any_role('CUSTOMER_SUPPORT', 'ADMIN')) then
    raise exception 'Only customer support can create orders';
  end if;
  if jsonb_typeof(p_orders) is distinct from 'array'
    or jsonb_array_length(p_orders) not between 1 and 20 then
    raise exception 'Create between one and twenty orders at a time';
  end if;
  if jsonb_typeof(p_attachments) is distinct from 'array' then
    raise exception 'Invalid product photo metadata';
  end if;

  for order_item in select value from jsonb_array_elements(p_orders)
  loop
    order_id := (order_item ->> 'id')::uuid;
    order_type := coalesce(order_item ->> 'order_type', 'REPLACEMENT');
    requested_order_number := null;
    if (actor_role = 'ADMIN' or public.has_role('ADMIN')) and nullif(order_item ->> 'requested_order_number', '') is not null then
      requested_order_number := (order_item ->> 'requested_order_number')::bigint;
      if requested_order_number < 1 then raise exception 'Order ID must be a positive whole number'; end if;
    end if;
    if order_type not in ('REPLACEMENT', 'OFFLINE') then raise exception 'Invalid order type'; end if;
    if nullif(trim(order_item ->> 'product_name'), '') is null then raise exception 'Product is required'; end if;
    if coalesce((order_item ->> 'quantity')::integer, 0) not between 1 and 999 then raise exception 'Invalid quantity'; end if;
    if order_type = 'REPLACEMENT' and (
      coalesce((order_item ->> 'length_cm')::numeric, 0) <= 0 or
      coalesce((order_item ->> 'breadth_cm')::numeric, 0) <= 0 or
      coalesce((order_item ->> 'height_cm')::numeric, 0) <= 0
    ) then raise exception 'Replacement dimensions are required'; end if;

    assigned_ref := coalesce(nullif(trim(order_item ->> 'order_reference'), ''), 'REF-AUTO');

    expected_count := (
      select count(*) from jsonb_array_elements(p_attachments) attachment
      where attachment ->> 'replacement_id' = order_id::text
    );
    if expected_count not between 1 and 12 then
      raise exception 'Between one and twelve product photos are required for every order';
    end if;
    if (
      select count(*) from jsonb_to_recordset(p_attachments) item(replacement_id uuid, storage_path text)
      join storage.objects stored on stored.bucket_id = 'replacement-files' and stored.name = item.storage_path and stored.owner_id = auth.uid()::text
      where item.replacement_id = order_id
    ) <> expected_count then
      raise exception 'One or more photo storage objects are missing or not owned by the current user';
    end if;

    insert into public.replacements (
      id,
      replacement_number,
      order_number,
      order_type,
      order_group_id,
      order_reference,
      customer_name,
      customer_reference,
      customer_address,
      customer_email,
      customer_phone,
      product_name,
      quantity,
      reason,
      notes,
      shipping_speed,
      dimension_preset_id,
      length_cm,
      breadth_cm,
      height_cm,
      status,
      created_by
    ) values (
      order_id,
      'assigned-by-trigger',
      coalesce(requested_order_number, nextval('public.order_number_sequence')),
      order_type,
      p_group_id,
      assigned_ref,
      nullif(trim(order_item ->> 'customer_name'), ''),
      nullif(trim(order_item ->> 'customer_reference'), ''),
      nullif(trim(order_item ->> 'customer_address'), ''),
      lower(nullif(trim(order_item ->> 'customer_email'), '')),
      nullif(trim(order_item ->> 'customer_phone'), ''),
      trim(order_item ->> 'product_name'),
      (order_item ->> 'quantity')::integer,
      nullif(trim(order_item ->> 'reason'), ''),
      nullif(trim(order_item ->> 'notes'), ''),
      coalesce(nullif(order_item ->> 'shipping_speed', ''), 'STANDARD'),
      nullif(order_item ->> 'dimension_preset_id', '')::uuid,
      case when order_type = 'REPLACEMENT' then (order_item ->> 'length_cm')::numeric else null end,
      case when order_type = 'REPLACEMENT' then (order_item ->> 'breadth_cm')::numeric else null end,
      case when order_type = 'REPLACEMENT' then (order_item ->> 'height_cm')::numeric else null end,
      'NEW',
      auth.uid()
    )
    returning * into created_row;

    if requested_order_number is not null then
      perform setval(
        'public.order_number_sequence',
        greatest(
          requested_order_number,
          (select last_value from public.order_number_sequence),
          (select max(order_number) from public.replacements)
        ),
        true
      );
    end if;

    insert into public.attachments(replacement_id, qc_submission_id, attachment_type, storage_path, file_name, mime_type, uploaded_by)
    select order_id, null, 'PROOF_PHOTO', item.storage_path, item.file_name, item.mime_type, auth.uid()
    from jsonb_to_recordset(p_attachments) as item(replacement_id uuid, storage_path text, file_name text, mime_type text)
    where item.replacement_id = order_id
      and item.mime_type in ('image/jpeg', 'image/png', 'image/webp')
      and (
        item.storage_path ilike ('replacements/' || order_id || '/customer_support/%/photos/%')
        or item.storage_path like ('replacements/' || order_id || '/products/%')
      );
    get diagnostics attachment_count = row_count;
    if attachment_count <> expected_count then
      raise exception 'Invalid product photo metadata';
    end if;

    insert into public.activity_logs(replacement_id, actor_id, action, metadata)
    values (order_id, auth.uid(), 'ORDER_CREATED', jsonb_build_object('attachment_count', attachment_count, 'order_type', order_type));

    return next created_row;
  end loop;
end;
$$;

-- Update submit_logistics_label to accept Courier Partner and Tracking ID
drop function if exists public.submit_logistics_label(uuid, uuid, text, jsonb);
drop function if exists public.submit_logistics_label(uuid, uuid, jsonb);
create or replace function public.submit_logistics_label(
  p_replacement_id uuid,
  p_upload_id uuid,
  p_tracking_url text,
  p_attachments jsonb,
  p_courier_partner text default null,
  p_tracking_id text default null
)
returns public.replacements language plpgsql security definer set search_path = '' as $$
declare
  current_row public.replacements;
  actor_role public.app_role;
  attachment_count integer := 0;
  clean_tracking_url text := nullif(trim(p_tracking_url), '');
  clean_courier text := nullif(trim(p_courier_partner), '');
  clean_tracking_id text := nullif(trim(p_tracking_id), '');
begin
  select * into current_row from public.replacements where id = p_replacement_id for update;
  if not found then raise exception 'Order not found'; end if;
  select public.current_active_role() into actor_role;
  if actor_role is null or not (actor_role in ('LOGISTICS', 'ADMIN') or public.has_any_role('LOGISTICS', 'ADMIN')) then
    raise exception 'Only Logistics can upload the shipping label';
  end if;
  if current_row.status <> 'NEW' then raise exception 'A label can only be uploaded for a new order'; end if;
  if clean_tracking_url is not null and clean_tracking_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'Tracking link must begin with http:// or https://';
  end if;
  if jsonb_typeof(p_attachments) is distinct from 'array' or jsonb_array_length(p_attachments) <> 1 then
    raise exception 'Exactly one shipping label is required';
  end if;
  if (select count(*) from jsonb_to_recordset(p_attachments) item(storage_path text)
      join storage.objects stored on stored.bucket_id = 'replacement-files' and stored.name = item.storage_path and stored.owner_id = auth.uid()::text) <> 1
  then raise exception 'The label storage object was not uploaded by the current user'; end if;

  insert into public.attachments(replacement_id, qc_submission_id, attachment_type, storage_path, file_name, mime_type, uploaded_by)
  select p_replacement_id, null, 'LABEL', item.storage_path, item.file_name, item.mime_type, auth.uid()
  from jsonb_to_recordset(p_attachments) item(storage_path text, file_name text, mime_type text)
  where item.mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
    and item.storage_path like ('replacements/' || p_replacement_id || '/logistics/' || p_upload_id || '/labels/%');
  get diagnostics attachment_count = row_count;
  if attachment_count <> 1 then raise exception 'Invalid label metadata'; end if;

  update public.replacements set
    status = 'LABEL_UPLOADED',
    tracking_url = clean_tracking_url,
    courier_partner = clean_courier,
    tracking_id = clean_tracking_id,
    order_reference = coalesce(clean_courier, order_reference)
  where id = p_replacement_id returning * into current_row;

  insert into public.activity_logs(replacement_id, actor_id, action, metadata)
  values (p_replacement_id, auth.uid(), 'LOGISTICS_SUBMITTED', jsonb_build_object(
    'upload_id', p_upload_id,
    'attachment_count', attachment_count,
    'has_tracking_link', clean_tracking_url is not null,
    'courier_partner', clean_courier,
    'tracking_id', clean_tracking_id
  ));
  return current_row;
end;
$$;

revoke all on function public.submit_logistics_label(uuid, uuid, text, jsonb, text, text) from public, anon;
grant execute on function public.submit_logistics_label(uuid, uuid, text, jsonb, text, text) to authenticated;

-- Backward compatibility overload for legacy 3-parameter callers
create or replace function public.submit_logistics_label(
  p_replacement_id uuid,
  p_upload_id uuid,
  p_attachments jsonb
)
returns public.replacements language sql security definer set search_path = '' as $$
  select public.submit_logistics_label(p_replacement_id, p_upload_id, null, p_attachments, null, null);
$$;

revoke all on function public.submit_logistics_label(uuid, uuid, jsonb) from public, anon;
grant execute on function public.submit_logistics_label(uuid, uuid, jsonb) to authenticated;

-- Update transition_replacement to support DELIVERED status
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

  if p_target_status = 'LABEL_PRINTED' then
    if not (current_row.status = 'LABEL_UPLOADED' and (actor_role in ('PRINTING', 'ADMIN') or public.has_any_role('PRINTING', 'ADMIN'))) then
      raise exception 'Only Printing can mark an uploaded label as printed';
    end if;
  elsif p_target_status in ('QC_APPROVED', 'QC_REJECTED') then
    if not (current_row.status = 'QC_PENDING' and (actor_role in ('CUSTOMER_SUPPORT', 'ADMIN') or public.has_any_role('CUSTOMER_SUPPORT', 'ADMIN'))) then
      raise exception 'Only CUSTOMER_SUPPORT can review pending QC';
    end if;
  elsif p_target_status = 'PACKED' then
    if not (current_row.status = 'QC_APPROVED' and (actor_role in ('PACKING', 'ADMIN') or public.has_any_role('PACKING', 'ADMIN'))) then
      raise exception 'QC must be approved before Packing packs the order';
    end if;
  elsif p_target_status = 'SHIPPED' then
    if not (current_row.status in ('PACKED', 'NEEDS_TOKEN') and (actor_role in ('PACKING', 'ADMIN') or public.has_any_role('PACKING', 'ADMIN'))) then
      raise exception 'Only Packing can mark a packed replacement as shipped';
    end if;
  elsif p_target_status = 'NEEDS_TOKEN' then
    if not (current_row.status = 'PACKED' and (actor_role in ('PACKING', 'ADMIN') or public.has_any_role('PACKING', 'ADMIN'))) then
      raise exception 'Only Packing can mark a packed replacement as needing a token';
    end if;
  elsif p_target_status = 'DELIVERED' then
    if not (current_row.status = 'SHIPPED' and (actor_role in ('LOGISTICS', 'ADMIN') or public.has_any_role('LOGISTICS', 'ADMIN'))) then
      raise exception 'Only Logistics can mark a shipped replacement as delivered';
    end if;
  elsif p_target_status = 'CANCELLED' then
    if not (current_row.status not in ('SHIPPED', 'DELIVERED', 'CANCELLED') and (actor_role = 'ADMIN' or public.has_role('ADMIN'))) then
      raise exception 'Only Admin can cancel an open replacement';
    end if;
  else
    raise exception 'Unsupported transition';
  end if;

  if p_target_status = 'QC_REJECTED' and nullif(trim(p_message), '') is null then
    raise exception 'A rejection reason is required';
  end if;

  if p_target_status in ('QC_APPROVED', 'QC_REJECTED') then
    update public.qc_submissions set
      decision = case when p_target_status = 'QC_APPROVED' then 'APPROVED'::public.qc_decision else 'REJECTED'::public.qc_decision end,
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
    needs_token_at = case when p_target_status = 'NEEDS_TOKEN' then now() else needs_token_at end,
    delivered_at = case when p_target_status = 'DELIVERED' then now() else delivered_at end,
    delivered_by = case when p_target_status = 'DELIVERED' then auth.uid() else delivered_by end,
    delivery_notes = case when p_target_status = 'DELIVERED' and nullif(trim(p_message), '') is not null then trim(p_message) else delivery_notes end
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

-- Update admin_override_replacement to support DELIVERED
create or replace function public.admin_override_replacement(
  p_replacement_id uuid,
  p_target_status public.replacement_status,
  p_reason text
)
returns public.replacements language plpgsql security definer set search_path = '' as $$
declare
  current_row public.replacements;
  previous_status public.replacement_status;
  actor_role public.app_role;
  trimmed_reason text := trim(p_reason);
begin
  select public.current_active_role() into actor_role;
  if actor_role is null or (actor_role is distinct from 'ADMIN'::public.app_role and not public.has_role('ADMIN')) then
    raise exception 'Admin access required';
  end if;
  if nullif(trimmed_reason, '') is null then
    raise exception 'An override reason is required';
  end if;

  select * into current_row from public.replacements where id = p_replacement_id for update;
  if not found then raise exception 'Replacement not found'; end if;
  previous_status := current_row.status;

  update public.replacements set
    status = p_target_status,
    label_printed_at = case when p_target_status = 'LABEL_PRINTED' and label_printed_at is null then now() else label_printed_at end,
    qc_approved_at = case when p_target_status = 'QC_APPROVED' and qc_approved_at is null then now() else qc_approved_at end,
    packed_at = case when p_target_status = 'PACKED' and packed_at is null then now() else packed_at end,
    shipped_at = case when p_target_status = 'SHIPPED' and shipped_at is null then now() else shipped_at end,
    delivered_at = case when p_target_status = 'DELIVERED' and delivered_at is null then now() else delivered_at end,
    delivered_by = case when p_target_status = 'DELIVERED' and delivered_by is null then auth.uid() else delivered_by end
  where id = p_replacement_id
  returning * into current_row;

  insert into public.activity_logs(replacement_id, actor_id, action, message, metadata)
  values (
    p_replacement_id,
    auth.uid(),
    'ADMIN_OVERRIDE',
    trimmed_reason,
    jsonb_build_object('from_status', previous_status, 'to_status', p_target_status)
  );

  return current_row;
end;
$$;

-- Update archive_completed_replacements to support archiving DELIVERED replacements older than 30 days
create or replace function public.archive_completed_replacements()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  archived_count integer;
  actor_role public.app_role;
begin
  select public.current_active_role() into actor_role;
  if actor_role is null or (actor_role is distinct from 'ADMIN'::public.app_role and not public.has_role('ADMIN')) then
    raise exception 'Administrator access required';
  end if;

  with archived as (
    update public.replacements
    set archived_at = now(), archived_by = auth.uid()
    where archived_at is null
      and status in ('SHIPPED', 'DELIVERED', 'CANCELLED')
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
