-- Store several products under one operational order. Workflow, customer,
-- fulfilment, files, and tracking remain on the parent order.

create table public.replacement_items (
  id uuid primary key default gen_random_uuid(),
  replacement_id uuid not null references public.replacements(id) on delete cascade,
  product_name text not null check (char_length(trim(product_name)) between 1 and 200),
  quantity integer not null check (quantity between 1 and 999),
  position smallint not null check (position between 1 and 20),
  created_at timestamptz not null default now(),
  unique (replacement_id, position)
);

create table public.offline_order_items (
  id uuid primary key default gen_random_uuid(),
  offline_order_id uuid not null references public.offline_orders(id) on delete cascade,
  product_name text not null check (char_length(trim(product_name)) between 1 and 200),
  quantity integer not null check (quantity between 1 and 999999),
  position smallint not null check (position between 1 and 20),
  created_at timestamptz not null default now(),
  unique (offline_order_id, position)
);

create index replacement_items_parent_idx on public.replacement_items(replacement_id, position);
create index replacement_items_product_idx on public.replacement_items(product_name);
create index offline_order_items_parent_idx on public.offline_order_items(offline_order_id, position);
create index offline_order_items_product_idx on public.offline_order_items(product_name);

insert into public.replacement_items(replacement_id, product_name, quantity, position)
select id, product_name, quantity, 1 from public.replacements
on conflict (replacement_id, position) do nothing;

insert into public.offline_order_items(offline_order_id, product_name, quantity, position)
select id, product_name, quantity, 1 from public.offline_orders
on conflict (offline_order_id, position) do nothing;

alter table public.replacement_items enable row level security;
alter table public.offline_order_items enable row level security;

create policy "active users can view replacement items" on public.replacement_items
for select to authenticated using (public.current_active_role() is not null);

create policy "active users can view offline order items" on public.offline_order_items
for select to authenticated using (public.current_active_role() is not null);

grant select on public.replacement_items, public.offline_order_items to authenticated;
revoke insert, update, delete on public.replacement_items, public.offline_order_items from authenticated;

create or replace function public.create_replacement_order_with_items(
  p_order jsonb,
  p_attachments jsonb,
  p_items jsonb
)
returns public.replacements
language plpgsql security definer set search_path = '' as $$
declare
  created_row public.replacements;
  normalized_order jsonb;
  first_item jsonb;
  item jsonb;
  item_position integer := 0;
begin
  if jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items) not between 1 and 20 then
    raise exception 'Add between one and twenty items';
  end if;

  first_item := p_items -> 0;
  normalized_order := jsonb_set(
    jsonb_set(p_order, '{product_name}', to_jsonb(trim(first_item ->> 'product_name'))),
    '{quantity}', to_jsonb((first_item ->> 'quantity')::integer)
  );

  select * into created_row
  from public.create_order_batch(null, jsonb_build_array(normalized_order), p_attachments)
  limit 1;

  for item in select value from jsonb_array_elements(p_items)
  loop
    item_position := item_position + 1;
    if nullif(trim(item ->> 'product_name'), '') is null
      or char_length(trim(item ->> 'product_name')) > 200 then
      raise exception 'Invalid product name for item %', item_position;
    end if;
    if coalesce((item ->> 'quantity')::integer, 0) not between 1 and 999 then
      raise exception 'Invalid quantity for item %', item_position;
    end if;
    insert into public.replacement_items(replacement_id, product_name, quantity, position)
    values (created_row.id, trim(item ->> 'product_name'), (item ->> 'quantity')::integer, item_position);
  end loop;

  update public.activity_logs
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('item_count', item_position)
  where id = (
    select id from public.activity_logs
    where replacement_id = created_row.id and action = 'ORDER_CREATED'
    order by created_at desc limit 1
  );

  return created_row;
end;
$$;

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
  p_items jsonb
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
    p_unit, p_logistics_partner, p_dispatch_date, p_notes, p_order_number
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

revoke all on function public.create_replacement_order_with_items(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.create_replacement_order_with_items(jsonb, jsonb, jsonb) to authenticated;
revoke all on function public.create_offline_order_with_items(uuid, text, text, text, integer, text, text, date, text, bigint, jsonb) from public, anon;
grant execute on function public.create_offline_order_with_items(uuid, text, text, text, integer, text, text, date, text, bigint, jsonb) to authenticated;
