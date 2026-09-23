-- =============================================================================
-- Migration: Shipment Tracking RTA (Return to Address / Re-attempt) Support
-- Enables Logistics and Admin to mark delivery outcomes (SUCCESSFUL, UNSUCCESSFUL, RTA)
-- and re-assign new delivery partner, tracking ID, and tracking link.
-- =============================================================================

alter table public.replacements
  add column if not exists delivery_status text check (
    delivery_status is null or delivery_status in ('SUCCESSFUL', 'UNSUCCESSFUL', 'RTA')
  ),
  add column if not exists rta_reason text check (
    rta_reason is null or char_length(rta_reason) <= 2000
  ),
  add column if not exists rta_at timestamptz,
  add column if not exists rta_by uuid references public.profiles(id);

alter table public.offline_orders
  add column if not exists delivery_status text check (
    delivery_status is null or delivery_status in ('SUCCESSFUL', 'UNSUCCESSFUL', 'RTA')
  ),
  add column if not exists rta_reason text check (
    rta_reason is null or char_length(rta_reason) <= 2000
  ),
  add column if not exists rta_at timestamptz,
  add column if not exists rta_by uuid references public.profiles(id);

create index if not exists replacements_delivery_status_idx
  on public.replacements(delivery_status)
  where delivery_status is not null;

create index if not exists offline_orders_delivery_status_idx
  on public.offline_orders(delivery_status)
  where delivery_status is not null;

-- RPC for marking replacement delivery unsuccessful / RTA
create or replace function public.mark_replacement_unsuccessful(
  p_replacement_id uuid,
  p_reason text default null,
  p_new_courier text default null,
  p_new_tracking_id text default null,
  p_new_tracking_url text default null
)
returns public.replacements
language plpgsql security definer set search_path = '' as $$
declare
  current_row public.replacements;
  clean_reason text := nullif(trim(p_reason), '');
  clean_courier text := nullif(trim(p_new_courier), '');
  clean_tracking_id text := nullif(trim(p_new_tracking_id), '');
  clean_tracking_url text := nullif(trim(p_new_tracking_url), '');
  has_new_tracking boolean;
begin
  if not public.has_any_role('LOGISTICS') then
    raise exception 'Only Logistics or Admin can update delivery status';
  end if;

  select * into current_row from public.replacements where id = p_replacement_id for update;
  if not found then raise exception 'Replacement order not found'; end if;

  if clean_reason is null and current_row.rta_reason is not null then
    clean_reason := current_row.rta_reason;
  end if;

  if clean_reason is null then
    raise exception 'Reason for unsuccessful delivery is required';
  end if;

  if current_row.status not in ('SHIPPED', 'DELIVERED') then
    raise exception 'Can only mark shipped or delivered orders as unsuccessful';
  end if;

  if clean_tracking_url is not null and clean_tracking_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'Tracking link must begin with http:// or https://';
  end if;

  has_new_tracking := (clean_courier is not null and clean_tracking_id is not null);

  update public.replacements set
    status = 'SHIPPED',
    delivery_status = case when has_new_tracking then 'RTA' else 'UNSUCCESSFUL' end,
    rta_reason = clean_reason,
    rta_at = now(),
    rta_by = auth.uid(),
    courier_partner = coalesce(clean_courier, courier_partner),
    tracking_id = coalesce(clean_tracking_id, tracking_id),
    tracking_url = coalesce(clean_tracking_url, tracking_url),
    shipped_at = case when has_new_tracking then now() else shipped_at end,
    delivered_at = null,
    delivered_by = null,
    delivery_notes = null
  where id = p_replacement_id
  returning * into current_row;

  insert into public.activity_logs(replacement_id, actor_id, action, message, metadata)
  values (
    p_replacement_id,
    auth.uid(),
    case when has_new_tracking then 'RTA_REASSIGNED' else 'DELIVERY_UNSUCCESSFUL' end,
    clean_reason,
    jsonb_build_object(
      'new_courier', clean_courier,
      'new_tracking_id', clean_tracking_id,
      'new_tracking_url', clean_tracking_url
    )
  );

  return current_row;
end;
$$;

revoke all on function public.mark_replacement_unsuccessful from public;
grant execute on function public.mark_replacement_unsuccessful to authenticated;

-- RPC for marking offline order delivery unsuccessful / RTA
create or replace function public.mark_offline_delivery_unsuccessful(
  p_order_id uuid,
  p_reason text default null,
  p_new_logistics_partner text default null,
  p_new_lr_number text default null,
  p_new_tracking_url text default null
)
returns public.offline_orders
language plpgsql security definer set search_path = '' as $$
declare
  current_row public.offline_orders;
  clean_reason text := nullif(trim(p_reason), '');
  clean_partner text := nullif(trim(p_new_logistics_partner), '');
  clean_lr text := nullif(trim(p_new_lr_number), '');
  clean_tracking_url text := nullif(trim(p_new_tracking_url), '');
  has_new_tracking boolean;
begin
  if not public.has_any_role('LOGISTICS') then
    raise exception 'Only Logistics or Admin can update delivery status';
  end if;

  select * into current_row from public.offline_orders where id = p_order_id for update;
  if not found then raise exception 'Offline order not found'; end if;

  if clean_reason is null and current_row.rta_reason is not null then
    clean_reason := current_row.rta_reason;
  end if;

  if clean_reason is null then
    raise exception 'Reason for unsuccessful delivery is required';
  end if;

  if current_row.status not in ('PICKED_UP', 'DELIVERED', 'ACKNOWLEDGED') then
    raise exception 'Can only update delivery status for picked up or delivered orders';
  end if;

  if clean_tracking_url is not null and clean_tracking_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'Tracking link must begin with http:// or https://';
  end if;

  has_new_tracking := (clean_partner is not null and clean_lr is not null);

  update public.offline_orders set
    status = 'PICKED_UP',
    delivery_status = case when has_new_tracking then 'RTA' else 'UNSUCCESSFUL' end,
    rta_reason = clean_reason,
    rta_at = now(),
    rta_by = auth.uid(),
    logistics_partner = coalesce(clean_partner, logistics_partner),
    lr_number = coalesce(clean_lr, lr_number),
    tracking_url = coalesce(clean_tracking_url, tracking_url),
    picked_up_at = case when has_new_tracking then now() else picked_up_at end,
    delivered_at = null,
    delivered_by = null,
    pod_notes = null
  where id = p_order_id
  returning * into current_row;

  insert into public.offline_order_activity_logs(offline_order_id, actor_id, action, message, metadata)
  values (
    p_order_id,
    auth.uid(),
    case when has_new_tracking then 'RTA_REASSIGNED' else 'DELIVERY_UNSUCCESSFUL' end,
    clean_reason,
    jsonb_build_object(
      'new_partner', clean_partner,
      'new_lr_number', clean_lr,
      'new_tracking_url', clean_tracking_url
    )
  );

  return current_row;
end;
$$;

revoke all on function public.mark_offline_delivery_unsuccessful from public;
grant execute on function public.mark_offline_delivery_unsuccessful to authenticated;

-- Allow Logistics in confirm_offline_delivery and set delivery_status = 'SUCCESSFUL'
create or replace function public.confirm_offline_delivery(
  p_order_id uuid,
  p_pod_notes text,
  p_attachments jsonb default '[]'::jsonb
)
returns public.offline_orders
language plpgsql security definer set search_path = '' as $$
declare
  current_row public.offline_orders;
  attachment_count integer := 0;
begin
  select * into current_row from public.offline_orders where id = p_order_id for update;
  if not found then raise exception 'Offline order not found'; end if;

  if not public.has_any_role('HR', 'LOGISTICS') then
    raise exception 'Only HR, Logistics, or Admin can confirm delivery';
  end if;
  if current_row.status <> 'PICKED_UP' then
    raise exception 'Delivery can only be confirmed after pickup';
  end if;

  -- Insert POD attachments if provided
  if jsonb_typeof(p_attachments) = 'array' and jsonb_array_length(p_attachments) > 0 then
    if jsonb_array_length(p_attachments) > 10 then
      raise exception 'Maximum 10 POD documents allowed';
    end if;

    insert into public.offline_order_attachments(
      offline_order_id, attachment_type, storage_path, file_name, mime_type, uploaded_by
    )
    select
      p_order_id,
      coalesce((elem->>'attachment_type')::public.offline_attachment_type, 'POD'::public.offline_attachment_type),
      elem->>'storage_path',
      elem->>'file_name',
      elem->>'mime_type',
      auth.uid()
    from jsonb_array_elements(p_attachments) as elem
    where elem->>'storage_path' is not null;

    get diagnostics attachment_count = row_count;
  end if;

  update public.offline_orders set
    status = 'DELIVERED',
    delivery_status = 'SUCCESSFUL',
    pod_notes = nullif(trim(p_pod_notes), ''),
    delivered_at = now(),
    delivered_by = auth.uid()
  where id = p_order_id
  returning * into current_row;

  insert into public.offline_order_activity_logs(offline_order_id, actor_id, action, metadata)
  values (
    p_order_id, auth.uid(), 'DELIVERY_CONFIRMED',
    jsonb_build_object('pod_notes', nullif(trim(p_pod_notes), ''), 'attachment_count', attachment_count)
  );

  return current_row;
end;
$$;

revoke all on function public.confirm_offline_delivery from public;
grant execute on function public.confirm_offline_delivery to authenticated;

