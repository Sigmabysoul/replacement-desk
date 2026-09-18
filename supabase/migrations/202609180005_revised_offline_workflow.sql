-- =============================================================================
-- Revised Offline Order Workflow
-- Reorders the lifecycle to:
-- 1. CREATED (Boss creates order)
-- 2. PACKING_CONFIRMED (Consignment sets box count, dimensions, weight)
-- 3. DISPATCH_PREPARED (HR adds courier, LR, tracking + uploads multiple photos)
-- 4. PRINTED (Print team prints photos/materials and marks printed)
-- 5. PICKED_UP (Consignment confirms courier pickup done)
-- 6. DELIVERED (HR confirms delivery with POD notes & attachments)
-- 7. ACKNOWLEDGED (Boss acknowledges delivery)
-- Also updates authorization checks to use multi-role public.has_any_role().
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Storage Policies with Multi-Role Checks
-- -----------------------------------------------------------------------------
drop policy if exists "authorized users can upload offline order files" on storage.objects;
create policy "authorized users can upload offline order files" on storage.objects
for insert to authenticated with check (
  bucket_id = 'offline-order-files'
  and name like 'offline-orders/%'
  and public.has_any_role('HR')
  and coalesce((metadata ->> 'size')::bigint, 0) <= 26214400
);

-- -----------------------------------------------------------------------------
-- 2. Step 1: Create Offline Order (BOSS, ADMIN)
-- -----------------------------------------------------------------------------
create or replace function public.create_offline_order(
  p_id uuid,
  p_so_number text,
  p_brand text,
  p_product_name text,
  p_quantity integer,
  p_unit text,
  p_logistics_partner text,
  p_dispatch_date date,
  p_notes text
)
returns public.offline_orders
language plpgsql security definer set search_path = '' as $$
declare
  created_row public.offline_orders;
begin
  if not public.has_any_role('BOSS') then
    raise exception 'Only Boss or Admin can create offline orders';
  end if;

  if nullif(trim(p_so_number), '') is null then
    raise exception 'SO number is required';
  end if;
  if nullif(trim(p_product_name), '') is null then
    raise exception 'Product name is required';
  end if;
  if p_quantity not between 1 and 999999 then
    raise exception 'Invalid quantity';
  end if;

  insert into public.offline_orders(
    id, so_number, brand, product_name, quantity, unit,
    logistics_partner, dispatch_date, notes, status, created_by
  ) values (
    p_id,
    trim(p_so_number),
    nullif(trim(p_brand), ''),
    trim(p_product_name),
    p_quantity,
    coalesce(nullif(trim(p_unit), ''), 'Pieces'),
    nullif(trim(p_logistics_partner), ''),
    p_dispatch_date,
    nullif(trim(p_notes), ''),
    'CREATED',
    auth.uid()
  ) returning * into created_row;

  insert into public.offline_order_activity_logs(offline_order_id, actor_id, action, metadata)
  values (
    p_id, auth.uid(), 'ORDER_CREATED',
    jsonb_build_object('so_number', trim(p_so_number), 'product', trim(p_product_name), 'quantity', p_quantity)
  );

  return created_row;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Step 2: Confirm Packing (CONSIGNMENT, ADMIN) - sets boxes, dimensions, weight
-- -----------------------------------------------------------------------------
create or replace function public.confirm_offline_packing(
  p_order_id uuid,
  p_carton_count integer,
  p_carton_dimensions text,
  p_carton_weight_kg numeric
)
returns public.offline_orders
language plpgsql security definer set search_path = '' as $$
declare
  current_row public.offline_orders;
begin
  select * into current_row from public.offline_orders where id = p_order_id for update;
  if not found then raise exception 'Offline order not found'; end if;

  if not public.has_any_role('CONSIGNMENT') then
    raise exception 'Only Consignment or Admin can confirm packing';
  end if;
  if current_row.status <> 'CREATED' then
    raise exception 'Packing can only be confirmed for newly created orders';
  end if;
  if p_carton_count is null or p_carton_count < 1 then
    raise exception 'Carton count is required';
  end if;

  update public.offline_orders set
    status = 'PACKING_CONFIRMED',
    carton_count = p_carton_count,
    carton_dimensions = nullif(trim(p_carton_dimensions), ''),
    carton_weight_kg = p_carton_weight_kg,
    packing_confirmed_at = now(),
    packing_confirmed_by = auth.uid()
  where id = p_order_id
  returning * into current_row;

  insert into public.offline_order_activity_logs(offline_order_id, actor_id, action, metadata)
  values (
    p_order_id, auth.uid(), 'PACKING_CONFIRMED',
    jsonb_build_object(
      'carton_count', p_carton_count,
      'carton_dimensions', nullif(trim(p_carton_dimensions), ''),
      'carton_weight_kg', p_carton_weight_kg
    )
  );

  return current_row;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Step 3: Prepare Dispatch with Photos (HR, ADMIN)
-- -----------------------------------------------------------------------------
create or replace function public.dispatch_prepare_offline_order(
  p_order_id uuid,
  p_lr_number text,
  p_tracking_url text,
  p_logistics_partner text,
  p_attachments jsonb default '[]'::jsonb
)
returns public.offline_orders
language plpgsql security definer set search_path = '' as $$
declare
  current_row public.offline_orders;
  attachment_count integer := 0;
  clean_tracking_url text := nullif(trim(p_tracking_url), '');
begin
  select * into current_row from public.offline_orders where id = p_order_id for update;
  if not found then raise exception 'Offline order not found'; end if;

  if not public.has_any_role('HR') then
    raise exception 'Only HR or Admin can prepare dispatch details and photos';
  end if;
  if current_row.status <> 'PACKING_CONFIRMED' then
    raise exception 'Dispatch details can only be added after packing is confirmed';
  end if;
  if clean_tracking_url is not null and clean_tracking_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'Tracking link must begin with http:// or https://';
  end if;

  -- Insert document / photo attachments
  if jsonb_typeof(p_attachments) = 'array' and jsonb_array_length(p_attachments) > 0 then
    if jsonb_array_length(p_attachments) > 20 then
      raise exception 'Maximum 20 photos / documents allowed';
    end if;

    insert into public.offline_order_attachments(
      offline_order_id, attachment_type, storage_path, file_name, mime_type, uploaded_by
    )
    select
      p_order_id, 'DISPATCH_DOC', item.storage_path, item.file_name, item.mime_type, auth.uid()
    from jsonb_to_recordset(p_attachments) as item(storage_path text, file_name text, mime_type text)
    where item.mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
      and item.storage_path like ('offline-orders/' || p_order_id || '/dispatch/%');
    get diagnostics attachment_count = row_count;
    if attachment_count <> jsonb_array_length(p_attachments) then
      raise exception 'Invalid photo / document metadata';
    end if;
  end if;

  update public.offline_orders set
    status = 'DISPATCH_PREPARED',
    lr_number = nullif(trim(p_lr_number), ''),
    tracking_url = clean_tracking_url,
    logistics_partner = coalesce(nullif(trim(p_logistics_partner), ''), logistics_partner),
    dispatched_at = now(),
    dispatched_by = auth.uid()
  where id = p_order_id
  returning * into current_row;

  insert into public.offline_order_activity_logs(offline_order_id, actor_id, action, metadata)
  values (
    p_order_id, auth.uid(), 'DISPATCH_PREPARED',
    jsonb_build_object(
      'lr_number', nullif(trim(p_lr_number), ''),
      'has_tracking_link', clean_tracking_url is not null,
      'attachment_count', attachment_count
    )
  );

  return current_row;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Step 4: Confirm Printing (PRINTING, ADMIN) - prints photos and marks printed
-- -----------------------------------------------------------------------------
create or replace function public.confirm_offline_printed(
  p_order_id uuid
)
returns public.offline_orders
language plpgsql security definer set search_path = '' as $$
declare
  current_row public.offline_orders;
begin
  select * into current_row from public.offline_orders where id = p_order_id for update;
  if not found then raise exception 'Offline order not found'; end if;

  if not public.has_any_role('PRINTING') then
    raise exception 'Only Printing or Admin can confirm printing';
  end if;
  if current_row.status <> 'DISPATCH_PREPARED' then
    raise exception 'Printing can only be confirmed after HR adds dispatch details and photos';
  end if;

  update public.offline_orders set
    status = 'PRINTED',
    printing_confirmed_at = now(),
    printing_confirmed_by = auth.uid()
  where id = p_order_id
  returning * into current_row;

  insert into public.offline_order_activity_logs(offline_order_id, actor_id, action)
  values (p_order_id, auth.uid(), 'PRINTING_CONFIRMED');

  return current_row;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Step 5: Confirm Pickup (CONSIGNMENT, ADMIN)
-- -----------------------------------------------------------------------------
create or replace function public.confirm_offline_pickup(
  p_order_id uuid
)
returns public.offline_orders
language plpgsql security definer set search_path = '' as $$
declare
  current_row public.offline_orders;
begin
  select * into current_row from public.offline_orders where id = p_order_id for update;
  if not found then raise exception 'Offline order not found'; end if;

  if not public.has_any_role('CONSIGNMENT') then
    raise exception 'Only Consignment or Admin can confirm pickup';
  end if;
  if current_row.status <> 'PRINTED' then
    raise exception 'Pickup can only be confirmed after labels/materials are printed';
  end if;

  update public.offline_orders set
    status = 'PICKED_UP',
    picked_up_at = now(),
    picked_up_by = auth.uid()
  where id = p_order_id
  returning * into current_row;

  insert into public.offline_order_activity_logs(offline_order_id, actor_id, action)
  values (p_order_id, auth.uid(), 'PICKUP_CONFIRMED');

  return current_row;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Step 6: Confirm Delivery (HR, ADMIN) - attaches POD
-- -----------------------------------------------------------------------------
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

  if not public.has_any_role('HR') then
    raise exception 'Only HR or Admin can confirm delivery';
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
      p_order_id, 'POD', item.storage_path, item.file_name, item.mime_type, auth.uid()
    from jsonb_to_recordset(p_attachments) as item(storage_path text, file_name text, mime_type text)
    where item.mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
      and item.storage_path like ('offline-orders/' || p_order_id || '/pod/%');
    get diagnostics attachment_count = row_count;
    if attachment_count <> jsonb_array_length(p_attachments) then
      raise exception 'Invalid POD document metadata';
    end if;
  end if;

  update public.offline_orders set
    status = 'DELIVERED',
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

-- -----------------------------------------------------------------------------
-- 8. Step 7: Acknowledge Order (BOSS, ADMIN)
-- -----------------------------------------------------------------------------
create or replace function public.acknowledge_offline_order(
  p_order_id uuid
)
returns public.offline_orders
language plpgsql security definer set search_path = '' as $$
declare
  current_row public.offline_orders;
begin
  select * into current_row from public.offline_orders where id = p_order_id for update;
  if not found then raise exception 'Offline order not found'; end if;

  if not public.has_any_role('BOSS') then
    raise exception 'Only Boss or Admin can acknowledge delivery';
  end if;
  if current_row.status <> 'DELIVERED' then
    raise exception 'Only delivered orders can be acknowledged';
  end if;

  update public.offline_orders set
    status = 'ACKNOWLEDGED',
    acknowledged_at = now(),
    acknowledged_by = auth.uid()
  where id = p_order_id
  returning * into current_row;

  insert into public.offline_order_activity_logs(offline_order_id, actor_id, action)
  values (p_order_id, auth.uid(), 'ORDER_ACKNOWLEDGED');

  return current_row;
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. Cancel Offline Order (BOSS, ADMIN)
-- -----------------------------------------------------------------------------
create or replace function public.cancel_offline_order(
  p_order_id uuid,
  p_reason text
)
returns public.offline_orders
language plpgsql security definer set search_path = '' as $$
declare
  current_row public.offline_orders;
  previous_status public.offline_order_status;
begin
  select * into current_row from public.offline_orders where id = p_order_id for update;
  if not found then raise exception 'Offline order not found'; end if;

  if not public.has_any_role('BOSS') then
    raise exception 'Only Boss or Admin can cancel offline orders';
  end if;
  if current_row.status in ('ACKNOWLEDGED', 'CANCELLED') then
    raise exception 'This order cannot be cancelled';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'A cancellation reason is required';
  end if;

  previous_status := current_row.status;

  update public.offline_orders set
    status = 'CANCELLED',
    cancelled_at = now(),
    cancelled_by = auth.uid()
  where id = p_order_id
  returning * into current_row;

  insert into public.offline_order_activity_logs(offline_order_id, actor_id, action, message, metadata)
  values (
    p_order_id, auth.uid(), 'ORDER_CANCELLED', trim(p_reason),
    jsonb_build_object('from_status', previous_status::text)
  );

  return current_row;
end;
$$;

-- -----------------------------------------------------------------------------
-- 10. Function Grants
-- -----------------------------------------------------------------------------
revoke all on function public.dispatch_prepare_offline_order(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.dispatch_prepare_offline_order(uuid, text, text, text, jsonb) to authenticated;

revoke all on function public.confirm_offline_printed(uuid) from public, anon;
grant execute on function public.confirm_offline_printed(uuid) to authenticated;

notify pgrst, 'reload schema';

