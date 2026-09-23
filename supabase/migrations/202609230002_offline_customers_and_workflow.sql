-- =============================================================================
-- Migration: Offline Order Customer Details, Customer Presets & Workflow Update
-- 1. Adds customer details (name, phone, email, address) to offline_orders.
-- 2. Adds customer_presets table for reusable customer details.
-- 3. Updates delivery_status to include 'RTO' (Return to Origin).
-- 4. Reassigns dispatch preparation permission to LOGISTICS (formerly HR).
-- 5. Enables RTO / RTA outcome handling in shipment tracking RPCs.
-- =============================================================================

-- 1. Customer Presets Table
create table if not exists public.customer_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 200),
  phone text check (phone is null or char_length(phone) <= 50),
  email text check (email is null or char_length(email) <= 255),
  address text not null check (char_length(trim(address)) between 1 and 2000),
  active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists customer_presets_name_active_idx
  on public.customer_presets(lower(name)) where active = true;

drop trigger if exists customer_presets_set_updated_at on public.customer_presets;
create trigger customer_presets_set_updated_at
before update on public.customer_presets
for each row execute function public.set_updated_at();

alter table public.customer_presets enable row level security;

drop policy if exists "active users can view customer presets" on public.customer_presets;
create policy "active users can view customer presets" on public.customer_presets
for select to authenticated using (public.current_active_role() is not null);

drop policy if exists "staff can insert customer presets" on public.customer_presets;
create policy "staff can insert customer presets" on public.customer_presets
for insert to authenticated with check (
  public.has_any_role('BOSS', 'HR', 'CUSTOMER_SUPPORT') and created_by = auth.uid()
);

drop policy if exists "staff can update customer presets" on public.customer_presets;
create policy "staff can update customer presets" on public.customer_presets
for update to authenticated using (public.has_any_role('BOSS', 'HR', 'CUSTOMER_SUPPORT'))
with check (public.has_any_role('BOSS', 'HR', 'CUSTOMER_SUPPORT'));

grant select, insert, update on public.customer_presets to authenticated;
revoke delete on public.customer_presets from authenticated;

-- 2. Add Customer Columns to offline_orders
alter table public.offline_orders
  add column if not exists customer_name text check (customer_name is null or char_length(customer_name) <= 200),
  add column if not exists customer_address text check (customer_address is null or char_length(customer_address) <= 2000),
  add column if not exists customer_phone text check (customer_phone is null or char_length(customer_phone) <= 50),
  add column if not exists customer_email text check (customer_email is null or char_length(customer_email) <= 255),
  add column if not exists customer_preset_id uuid references public.customer_presets(id) on delete set null;

create index if not exists offline_orders_customer_preset_id_idx
  on public.offline_orders(customer_preset_id)
  where customer_preset_id is not null;

-- 3. Extend delivery_status check constraint to include 'RTO'
do $$
declare
  r record;
begin
  for r in (
    select conname, conrelid::regclass::text as tbl
    from pg_constraint
    where contype = 'c'
      and conname like '%delivery_status%'
  ) loop
    execute format('alter table %s drop constraint if exists %I', r.tbl, r.conname);
  end loop;
end $$;

alter table public.replacements
  add constraint replacements_delivery_status_check
  check (delivery_status is null or delivery_status in ('SUCCESSFUL', 'UNSUCCESSFUL', 'RTA', 'RTO'));

alter table public.offline_orders
  add constraint offline_orders_delivery_status_check
  check (delivery_status is null or delivery_status in ('SUCCESSFUL', 'UNSUCCESSFUL', 'RTA', 'RTO'));

-- 4. Update create_offline_order with customer fields
drop function if exists public.create_offline_order(uuid, text, text, text, integer, text, text, date, text, bigint);
drop function if exists public.create_offline_order(uuid, text, text, text, integer, text, text, date, text, bigint, text, text, text, text, uuid);

create or replace function public.create_offline_order(
  p_id uuid,
  p_so_number text,
  p_brand text,
  p_product_name text,
  p_quantity integer,
  p_unit text,
  p_logistics_partner text,
  p_dispatch_date date,
  p_notes text,
  p_order_number bigint default null,
  p_customer_name text default null,
  p_customer_address text default null,
  p_customer_phone text default null,
  p_customer_email text default null,
  p_customer_preset_id uuid default null
)
returns public.offline_orders
language plpgsql security definer set search_path = '' as $$
declare
  created_row public.offline_orders;
begin
  if not public.has_any_role('HR', 'BOSS') then
    raise exception 'Only HR, Boss, or Admin can create offline orders';
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

  if p_order_number is not null then
    if p_order_number < 1 then
      raise exception 'Order ID must be a positive whole number';
    end if;
    if exists (select 1 from public.offline_orders where order_number = p_order_number) then
      raise exception 'Order ID % is already in use by another offline order', p_order_number using errcode = '23505';
    end if;
  end if;

  insert into public.offline_orders(
    id, so_number, order_number, brand, product_name, quantity, unit,
    logistics_partner, dispatch_date, notes, status, created_by,
    customer_name, customer_address, customer_phone, customer_email, customer_preset_id
  ) values (
    p_id,
    trim(p_so_number),
    coalesce(p_order_number, nextval('public.order_number_sequence')),
    nullif(trim(p_brand), ''),
    trim(p_product_name),
    p_quantity,
    coalesce(nullif(trim(p_unit), ''), 'Pieces'),
    nullif(trim(p_logistics_partner), ''),
    p_dispatch_date,
    nullif(trim(p_notes), ''),
    'CREATED',
    auth.uid(),
    nullif(trim(p_customer_name), ''),
    nullif(trim(p_customer_address), ''),
    nullif(trim(p_customer_phone), ''),
    nullif(trim(p_customer_email), ''),
    p_customer_preset_id
  ) returning * into created_row;

  if p_order_number is not null then
    perform setval('public.order_number_sequence', p_order_number, true);
  end if;

  insert into public.offline_order_activity_logs(offline_order_id, actor_id, action, metadata)
  values (
    p_id, auth.uid(), 'ORDER_CREATED',
    jsonb_build_object(
      'so_number', trim(p_so_number),
      'order_number', created_row.order_number,
      'product', trim(p_product_name),
      'quantity', p_quantity,
      'customer_name', nullif(trim(p_customer_name), '')
    )
  );

  return created_row;
end;
$$;

revoke all on function public.create_offline_order(uuid, text, text, text, integer, text, text, date, text, bigint, text, text, text, text, uuid) from public, anon;
grant execute on function public.create_offline_order(uuid, text, text, text, integer, text, text, date, text, bigint, text, text, text, text, uuid) to authenticated;

-- 5. Update create_offline_order_with_items
drop function if exists public.create_offline_order_with_items(uuid, text, text, text, integer, text, text, date, text, bigint, jsonb);
drop function if exists public.create_offline_order_with_items(uuid, text, text, text, integer, text, text, date, text, bigint, jsonb, text, text, text, text, uuid);

create or replace function public.create_offline_order_with_items(
  p_id uuid,
  p_so_number text,
  p_brand text,
  p_product_name text,
  p_quantity integer,
  p_unit text,
  p_logistics_partner text,
  p_dispatch_date date,
  p_notes text,
  p_order_number bigint,
  p_items jsonb,
  p_customer_name text default null,
  p_customer_address text default null,
  p_customer_phone text default null,
  p_customer_email text default null,
  p_customer_preset_id uuid default null
)
returns public.offline_orders
language plpgsql security definer set search_path = '' as $$
declare
  created_row public.offline_orders;
  first_item jsonb;
  item jsonb;
  item_position integer := 0;
begin
  if jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items) not between 1 and 20 then
    raise exception 'Add between one and twenty items';
  end if;

  first_item := p_items -> 0;
  select * into created_row
  from public.create_offline_order(
    p_id, p_so_number, p_brand,
    trim(first_item ->> 'product_name'), (first_item ->> 'quantity')::integer,
    p_unit, p_logistics_partner, p_dispatch_date, p_notes, p_order_number,
    p_customer_name, p_customer_address, p_customer_phone, p_customer_email, p_customer_preset_id
  );

  for item in select value from jsonb_array_elements(p_items)
  loop
    item_position := item_position + 1;
    if nullif(trim(item ->> 'product_name'), '') is null
      or char_length(trim(item ->> 'product_name')) > 200 then
      raise exception 'Invalid product name for item %', item_position;
    end if;
    if coalesce((item ->> 'quantity')::integer, 0) not between 1 and 999999 then
      raise exception 'Invalid quantity for item %', item_position;
    end if;
    insert into public.offline_order_items(offline_order_id, product_name, quantity, position)
    values (created_row.id, trim(item ->> 'product_name'), (item ->> 'quantity')::integer, item_position);
  end loop;

  update public.offline_order_activity_logs
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('item_count', item_position)
  where id = (
    select id from public.offline_order_activity_logs
    where offline_order_id = created_row.id and action = 'ORDER_CREATED'
    order by created_at desc limit 1
  );

  return created_row;
end;
$$;

revoke all on function public.create_offline_order_with_items(uuid, text, text, text, integer, text, text, date, text, bigint, jsonb, text, text, text, text, uuid) from public, anon;
grant execute on function public.create_offline_order_with_items(uuid, text, text, text, integer, text, text, date, text, bigint, jsonb, text, text, text, text, uuid) to authenticated;

-- 6. Update dispatch_prepare_offline_order to LOGISTICS (formerly HR)
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

  if not public.has_any_role('LOGISTICS') then
    raise exception 'Only Logistics or Admin can prepare dispatch details and photos';
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
      'logistics_partner', current_row.logistics_partner,
      'has_tracking_link', clean_tracking_url is not null,
      'attachment_count', attachment_count
    )
  );

  return current_row;
end;
$$;

revoke all on function public.dispatch_prepare_offline_order(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.dispatch_prepare_offline_order(uuid, text, text, text, jsonb) to authenticated;

-- 7. Update mark_replacement_unsuccessful with outcome (RTO / RTA / UNSUCCESSFUL)
drop function if exists public.mark_replacement_unsuccessful(uuid, text, text, text, text);
drop function if exists public.mark_replacement_unsuccessful(uuid, text, text, text, text, text);

create or replace function public.mark_replacement_unsuccessful(
  p_replacement_id uuid,
  p_reason text default null,
  p_new_courier text default null,
  p_new_tracking_id text default null,
  p_new_tracking_url text default null,
  p_outcome text default null
)
returns public.replacements
language plpgsql security definer set search_path = '' as $$
declare
  current_row public.replacements;
  clean_reason text := nullif(trim(p_reason), '');
  clean_courier text := nullif(trim(p_new_courier), '');
  clean_tracking_id text := nullif(trim(p_new_tracking_id), '');
  clean_tracking_url text := nullif(trim(p_new_tracking_url), '');
  clean_outcome text := upper(trim(coalesce(p_outcome, '')));
  has_new_tracking boolean;
  final_delivery_status text;
  action_name text;
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

  if clean_outcome = 'RTO' then
    final_delivery_status := 'RTO';
    action_name := 'RTO_MARKED';
  elsif has_new_tracking or clean_outcome = 'RTA' then
    final_delivery_status := 'RTA';
    action_name := 'RTA_REASSIGNED';
  else
    final_delivery_status := 'UNSUCCESSFUL';
    action_name := 'DELIVERY_UNSUCCESSFUL';
  end if;

  update public.replacements set
    status = 'SHIPPED',
    delivery_status = final_delivery_status,
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
    action_name,
    clean_reason,
    jsonb_build_object(
      'outcome', final_delivery_status,
      'new_courier', clean_courier,
      'new_tracking_id', clean_tracking_id,
      'new_tracking_url', clean_tracking_url
    )
  );

  return current_row;
end;
$$;

revoke all on function public.mark_replacement_unsuccessful(uuid, text, text, text, text, text) from public;
grant execute on function public.mark_replacement_unsuccessful(uuid, text, text, text, text, text) to authenticated;

-- 8. Update mark_offline_delivery_unsuccessful with outcome (RTO / RTA / UNSUCCESSFUL)
drop function if exists public.mark_offline_delivery_unsuccessful(uuid, text, text, text, text);
drop function if exists public.mark_offline_delivery_unsuccessful(uuid, text, text, text, text, text);

create or replace function public.mark_offline_delivery_unsuccessful(
  p_order_id uuid,
  p_reason text default null,
  p_new_logistics_partner text default null,
  p_new_lr_number text default null,
  p_new_tracking_url text default null,
  p_outcome text default null
)
returns public.offline_orders
language plpgsql security definer set search_path = '' as $$
declare
  current_row public.offline_orders;
  clean_reason text := nullif(trim(p_reason), '');
  clean_partner text := nullif(trim(p_new_logistics_partner), '');
  clean_lr text := nullif(trim(p_new_lr_number), '');
  clean_tracking_url text := nullif(trim(p_new_tracking_url), '');
  clean_outcome text := upper(trim(coalesce(p_outcome, '')));
  has_new_tracking boolean;
  final_delivery_status text;
  action_name text;
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

  if clean_outcome = 'RTO' then
    final_delivery_status := 'RTO';
    action_name := 'RTO_MARKED';
  elsif has_new_tracking or clean_outcome = 'RTA' then
    final_delivery_status := 'RTA';
    action_name := 'RTA_REASSIGNED';
  else
    final_delivery_status := 'UNSUCCESSFUL';
    action_name := 'DELIVERY_UNSUCCESSFUL';
  end if;

  update public.offline_orders set
    status = 'PICKED_UP',
    delivery_status = final_delivery_status,
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
    action_name,
    clean_reason,
    jsonb_build_object(
      'outcome', final_delivery_status,
      'new_partner', clean_partner,
      'new_lr_number', clean_lr,
      'new_tracking_url', clean_tracking_url
    )
  );

  return current_row;
end;
$$;

revoke all on function public.mark_offline_delivery_unsuccessful(uuid, text, text, text, text, text) from public;
grant execute on function public.mark_offline_delivery_unsuccessful(uuid, text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
