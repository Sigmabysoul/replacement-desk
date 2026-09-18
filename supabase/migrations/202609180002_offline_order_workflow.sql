-- -----------------------------------------------------------------------------
-- 2. Offline Order Status Enum
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'offline_order_status') then
    create type public.offline_order_status as enum (
      'CREATED',
      'PRINTING_ASSIGNED',
      'PACKING_CONFIRMED',
      'DISPATCHED',
      'PICKED_UP',
      'DELIVERED',
      'ACKNOWLEDGED',
      'CANCELLED'
    );
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Offline Orders Table
-- -----------------------------------------------------------------------------
create table if not exists public.offline_orders (
  id uuid primary key default gen_random_uuid(),
  so_number text not null unique check (char_length(trim(so_number)) between 1 and 50),
  order_number bigint not null default nextval('public.order_number_sequence') unique,
  brand text check (brand is null or char_length(brand) <= 200),
  product_name text not null check (char_length(product_name) between 1 and 200),
  quantity integer not null check (quantity between 1 and 999999),
  unit text not null default 'Pieces' check (char_length(unit) between 1 and 50),
  logistics_partner text check (logistics_partner is null or char_length(logistics_partner) <= 200),
  dispatch_date date,
  notes text check (notes is null or char_length(notes) <= 2000),
  status public.offline_order_status not null default 'CREATED',

  -- Packing / consignment details (filled by CONSIGNMENT)
  carton_count integer check (carton_count is null or carton_count between 1 and 9999),
  carton_dimensions text check (carton_dimensions is null or char_length(carton_dimensions) <= 100),
  carton_weight_kg numeric(10,2) check (carton_weight_kg is null or carton_weight_kg > 0),

  -- Dispatch details (filled by HR)
  lr_number text check (lr_number is null or char_length(lr_number) <= 100),
  tracking_url text check (tracking_url is null or tracking_url ~* '^https?://[^[:space:]]+$'),

  -- Delivery
  pod_notes text check (pod_notes is null or char_length(pod_notes) <= 2000),

  -- Ownership and timestamps
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  printing_confirmed_at timestamptz,
  printing_confirmed_by uuid references public.profiles(id),
  packing_confirmed_at timestamptz,
  packing_confirmed_by uuid references public.profiles(id),
  dispatched_at timestamptz,
  dispatched_by uuid references public.profiles(id),
  picked_up_at timestamptz,
  picked_up_by uuid references public.profiles(id),
  delivered_at timestamptz,
  delivered_by uuid references public.profiles(id),
  acknowledged_at timestamptz,
  acknowledged_by uuid references public.profiles(id),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id)
);

create index if not exists offline_orders_status_idx
  on public.offline_orders(status, created_at desc);
create index if not exists offline_orders_created_at_idx
  on public.offline_orders(created_at desc);
create index if not exists offline_orders_so_number_idx
  on public.offline_orders(so_number);

-- Auto-update updated_at
drop trigger if exists offline_orders_set_updated_at on public.offline_orders;
create trigger offline_orders_set_updated_at
before update on public.offline_orders
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. Offline Order Attachments
-- -----------------------------------------------------------------------------
create table if not exists public.offline_order_attachments (
  id uuid primary key default gen_random_uuid(),
  offline_order_id uuid not null references public.offline_orders(id) on delete cascade,
  attachment_type text not null check (attachment_type in ('DISPATCH_DOC', 'POD', 'OTHER')),
  storage_path text not null unique check (storage_path like 'offline-orders/%'),
  file_name text not null check (char_length(file_name) between 1 and 100),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists offline_order_attachments_order_idx
  on public.offline_order_attachments(offline_order_id, created_at);

-- -----------------------------------------------------------------------------
-- 5. Offline Order Activity Logs
-- -----------------------------------------------------------------------------
create table if not exists public.offline_order_activity_logs (
  id uuid primary key default gen_random_uuid(),
  offline_order_id uuid not null references public.offline_orders(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  action text not null check (char_length(action) between 1 and 80),
  message text check (message is null or char_length(message) <= 1000),
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists offline_order_activity_logs_order_idx
  on public.offline_order_activity_logs(offline_order_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 6. Row-Level Security
-- -----------------------------------------------------------------------------
alter table public.offline_orders enable row level security;
alter table public.offline_order_attachments enable row level security;
alter table public.offline_order_activity_logs enable row level security;

-- All active users can view offline orders
drop policy if exists "active users can view offline orders" on public.offline_orders;
create policy "active users can view offline orders" on public.offline_orders
for select to authenticated using (public.current_active_role() is not null);

-- Only BOSS and ADMIN can insert offline orders directly (via RPC, but just in case)
drop policy if exists "boss and admin can create offline orders" on public.offline_orders;
create policy "boss and admin can create offline orders" on public.offline_orders
for insert to authenticated with check (
  public.current_active_role() in ('BOSS', 'ADMIN') and created_by = auth.uid()
);

-- All active users can view attachments
drop policy if exists "active users can view offline order attachments" on public.offline_order_attachments;
create policy "active users can view offline order attachments" on public.offline_order_attachments
for select to authenticated using (public.current_active_role() is not null);

-- All active users can view activity logs
drop policy if exists "active users can view offline order activity" on public.offline_order_activity_logs;
create policy "active users can view offline order activity" on public.offline_order_activity_logs
for select to authenticated using (public.current_active_role() is not null);

-- Restrict direct table writes (all mutations go through RPCs)
revoke insert, update, delete on public.offline_order_activity_logs from authenticated;
revoke insert, update, delete on public.offline_order_attachments from authenticated;
revoke update, delete on public.offline_orders from authenticated;

-- Grant read access
grant select on public.offline_orders to authenticated;
grant select on public.offline_order_attachments to authenticated;
grant select on public.offline_order_activity_logs to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Storage Bucket & Policies for Offline Orders
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('offline-order-files', 'offline-order-files', false, 26214400,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "active users can read offline order files" on storage.objects;
create policy "active users can read offline order files" on storage.objects
for select to authenticated using (
  bucket_id = 'offline-order-files' and public.current_active_role() is not null
);

drop policy if exists "authorized users can upload offline order files" on storage.objects;
create policy "authorized users can upload offline order files" on storage.objects
for insert to authenticated with check (
  bucket_id = 'offline-order-files'
  and name like 'offline-orders/%'
  and public.current_active_role() in ('HR', 'ADMIN')
  and coalesce((metadata ->> 'size')::bigint, 0) <= 26214400
);

drop policy if exists "uploaders can remove failed offline order uploads" on storage.objects;
create policy "uploaders can remove failed offline order uploads" on storage.objects
for delete to authenticated using (
  bucket_id = 'offline-order-files' and owner_id = auth.uid()::text
);

-- -----------------------------------------------------------------------------
-- 8. RPC Functions
-- -----------------------------------------------------------------------------

-- 8a. Create Offline Order (BOSS, ADMIN)
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
  actor_role public.app_role;
  created_row public.offline_orders;
begin
  select public.current_active_role() into actor_role;
  if actor_role is null or actor_role not in ('BOSS', 'ADMIN') then
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

-- 8b. Confirm Printing (PRINTING, ADMIN)
create or replace function public.confirm_offline_printing(
  p_order_id uuid
)
returns public.offline_orders
language plpgsql security definer set search_path = '' as $$
declare
  current_row public.offline_orders;
  actor_role public.app_role;
begin
  select * into current_row from public.offline_orders where id = p_order_id for update;
  if not found then raise exception 'Offline order not found'; end if;

  select public.current_active_role() into actor_role;
  if actor_role is null or actor_role not in ('PRINTING', 'ADMIN') then
    raise exception 'Only Printing or Admin can confirm printing';
  end if;
  if current_row.status <> 'CREATED' then
    raise exception 'Printing can only be confirmed for newly created orders';
  end if;

  update public.offline_orders set
    status = 'PRINTING_ASSIGNED',
    printing_confirmed_at = now(),
    printing_confirmed_by = auth.uid()
  where id = p_order_id
  returning * into current_row;

  insert into public.offline_order_activity_logs(offline_order_id, actor_id, action)
  values (p_order_id, auth.uid(), 'PRINTING_CONFIRMED');

  return current_row;
end;
$$;

-- 8c. Confirm Packing (CONSIGNMENT, ADMIN)
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
  actor_role public.app_role;
begin
  select * into current_row from public.offline_orders where id = p_order_id for update;
  if not found then raise exception 'Offline order not found'; end if;

  select public.current_active_role() into actor_role;
  if actor_role is null or actor_role not in ('CONSIGNMENT', 'ADMIN') then
    raise exception 'Only Consignment or Admin can confirm packing';
  end if;
  if current_row.status <> 'PRINTING_ASSIGNED' then
    raise exception 'Packing can only be confirmed after printing is assigned';
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

-- 8d. Dispatch Offline Order (HR, ADMIN) — attaches LR, tracking, and optional docs
create or replace function public.dispatch_offline_order(
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
  actor_role public.app_role;
  attachment_count integer := 0;
  clean_tracking_url text := nullif(trim(p_tracking_url), '');
begin
  select * into current_row from public.offline_orders where id = p_order_id for update;
  if not found then raise exception 'Offline order not found'; end if;

  select public.current_active_role() into actor_role;
  if actor_role is null or actor_role not in ('HR', 'ADMIN') then
    raise exception 'Only HR or Admin can dispatch offline orders';
  end if;
  if current_row.status <> 'PACKING_CONFIRMED' then
    raise exception 'Order can only be dispatched after packing is confirmed';
  end if;
  if clean_tracking_url is not null and clean_tracking_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'Tracking link must begin with http:// or https://';
  end if;

  -- Insert dispatch document attachments if provided
  if jsonb_typeof(p_attachments) = 'array' and jsonb_array_length(p_attachments) > 0 then
    if jsonb_array_length(p_attachments) > 10 then
      raise exception 'Maximum 10 dispatch documents allowed';
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
      raise exception 'Invalid dispatch document metadata';
    end if;
  end if;

  update public.offline_orders set
    status = 'DISPATCHED',
    lr_number = nullif(trim(p_lr_number), ''),
    tracking_url = clean_tracking_url,
    logistics_partner = coalesce(nullif(trim(p_logistics_partner), ''), logistics_partner),
    dispatched_at = now(),
    dispatched_by = auth.uid()
  where id = p_order_id
  returning * into current_row;

  insert into public.offline_order_activity_logs(offline_order_id, actor_id, action, metadata)
  values (
    p_order_id, auth.uid(), 'ORDER_DISPATCHED',
    jsonb_build_object(
      'lr_number', nullif(trim(p_lr_number), ''),
      'has_tracking_link', clean_tracking_url is not null,
      'attachment_count', attachment_count
    )
  );

  return current_row;
end;
$$;

-- 8e. Confirm Pickup (CONSIGNMENT, ADMIN)
create or replace function public.confirm_offline_pickup(
  p_order_id uuid
)
returns public.offline_orders
language plpgsql security definer set search_path = '' as $$
declare
  current_row public.offline_orders;
  actor_role public.app_role;
begin
  select * into current_row from public.offline_orders where id = p_order_id for update;
  if not found then raise exception 'Offline order not found'; end if;

  select public.current_active_role() into actor_role;
  if actor_role is null or actor_role not in ('CONSIGNMENT', 'ADMIN') then
    raise exception 'Only Consignment or Admin can confirm pickup';
  end if;
  if current_row.status <> 'DISPATCHED' then
    raise exception 'Pickup can only be confirmed after dispatch';
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

-- 8f. Confirm Delivery (HR, ADMIN) — attaches POD
create or replace function public.confirm_offline_delivery(
  p_order_id uuid,
  p_pod_notes text,
  p_attachments jsonb default '[]'::jsonb
)
returns public.offline_orders
language plpgsql security definer set search_path = '' as $$
declare
  current_row public.offline_orders;
  actor_role public.app_role;
  attachment_count integer := 0;
begin
  select * into current_row from public.offline_orders where id = p_order_id for update;
  if not found then raise exception 'Offline order not found'; end if;

  select public.current_active_role() into actor_role;
  if actor_role is null or actor_role not in ('HR', 'ADMIN') then
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

-- 8g. Acknowledge Order (BOSS, ADMIN)
create or replace function public.acknowledge_offline_order(
  p_order_id uuid
)
returns public.offline_orders
language plpgsql security definer set search_path = '' as $$
declare
  current_row public.offline_orders;
  actor_role public.app_role;
begin
  select * into current_row from public.offline_orders where id = p_order_id for update;
  if not found then raise exception 'Offline order not found'; end if;

  select public.current_active_role() into actor_role;
  if actor_role is null or actor_role not in ('BOSS', 'ADMIN') then
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

-- 8h. Add Comment to Offline Order (Any Active Role)
create or replace function public.add_offline_order_comment(
  p_order_id uuid,
  p_message text
)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.current_active_role() is null then
    raise exception 'Active account required';
  end if;
  if nullif(trim(p_message), '') is null or char_length(trim(p_message)) > 1000 then
    raise exception 'Comment must be between 1 and 1000 characters';
  end if;
  if not exists (select 1 from public.offline_orders where id = p_order_id) then
    raise exception 'Offline order not found';
  end if;

  insert into public.offline_order_activity_logs(offline_order_id, actor_id, action, message)
  values (p_order_id, auth.uid(), 'COMMENT_ADDED', trim(p_message));
end;
$$;

-- 8i. Cancel Offline Order (BOSS, ADMIN)
create or replace function public.cancel_offline_order(
  p_order_id uuid,
  p_reason text
)
returns public.offline_orders
language plpgsql security definer set search_path = '' as $$
declare
  current_row public.offline_orders;
  actor_role public.app_role;
  previous_status public.offline_order_status;
begin
  select * into current_row from public.offline_orders where id = p_order_id for update;
  if not found then raise exception 'Offline order not found'; end if;

  select public.current_active_role() into actor_role;
  if actor_role is null or actor_role not in ('BOSS', 'ADMIN') then
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
-- 9. Function Grants
-- -----------------------------------------------------------------------------
revoke all on function public.create_offline_order(uuid, text, text, text, integer, text, text, date, text) from public, anon;
grant execute on function public.create_offline_order(uuid, text, text, text, integer, text, text, date, text) to authenticated;

revoke all on function public.confirm_offline_printing(uuid) from public, anon;
grant execute on function public.confirm_offline_printing(uuid) to authenticated;

revoke all on function public.confirm_offline_packing(uuid, integer, text, numeric) from public, anon;
grant execute on function public.confirm_offline_packing(uuid, integer, text, numeric) to authenticated;

revoke all on function public.dispatch_offline_order(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.dispatch_offline_order(uuid, text, text, text, jsonb) to authenticated;

revoke all on function public.confirm_offline_pickup(uuid) from public, anon;
grant execute on function public.confirm_offline_pickup(uuid) to authenticated;

revoke all on function public.confirm_offline_delivery(uuid, text, jsonb) from public, anon;
grant execute on function public.confirm_offline_delivery(uuid, text, jsonb) to authenticated;

revoke all on function public.acknowledge_offline_order(uuid) from public, anon;
grant execute on function public.acknowledge_offline_order(uuid) to authenticated;

revoke all on function public.add_offline_order_comment(uuid, text) from public, anon;
grant execute on function public.add_offline_order_comment(uuid, text) to authenticated;

revoke all on function public.cancel_offline_order(uuid, text) from public, anon;
grant execute on function public.cancel_offline_order(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 10. Realtime Publication
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'offline_orders'
  ) then
    alter publication supabase_realtime add table public.offline_orders;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 11. Refresh PostgREST Schema Cache
-- -----------------------------------------------------------------------------
notify pgrst, 'reload schema';

