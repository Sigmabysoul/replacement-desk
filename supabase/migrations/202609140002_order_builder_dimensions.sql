-- Adds offline orders, customer delivery details, reusable dimensions, batch creation,
-- and Logistics-owned tracking links without changing the established QC workflow.

create sequence if not exists public.order_number_sequence start with 501;

alter table public.replacements
  add column if not exists order_number bigint,
  add column if not exists order_type text not null default 'REPLACEMENT'
    check (order_type in ('REPLACEMENT', 'OFFLINE')),
  add column if not exists order_group_id uuid,
  add column if not exists customer_address text
    check (customer_address is null or char_length(customer_address) <= 1000),
  add column if not exists customer_email text
    check (customer_email is null or char_length(customer_email) <= 254),
  add column if not exists customer_phone text
    check (customer_phone is null or char_length(customer_phone) <= 40),
  add column if not exists shipping_speed text not null default 'STANDARD'
    check (shipping_speed in ('STANDARD', 'EXPRESS')),
  add column if not exists length_cm numeric(10,2),
  add column if not exists breadth_cm numeric(10,2),
  add column if not exists height_cm numeric(10,2);

update public.replacements
set order_number = nextval('public.order_number_sequence')
where order_number is null;

alter table public.replacements
  alter column order_number set default nextval('public.order_number_sequence'),
  alter column order_number set not null;

create unique index if not exists replacements_order_number_idx
  on public.replacements(order_number);
create index if not exists replacements_order_group_idx
  on public.replacements(order_group_id) where order_group_id is not null;

create table if not exists public.dimension_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 100),
  length_cm numeric(10,2) not null check (length_cm > 0 and length_cm <= 10000),
  breadth_cm numeric(10,2) not null check (breadth_cm > 0 and breadth_cm <= 10000),
  height_cm numeric(10,2) not null check (height_cm > 0 and height_cm <= 10000),
  active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists dimension_presets_name_active_idx
  on public.dimension_presets(lower(name)) where active = true;

drop trigger if exists dimension_presets_set_updated_at on public.dimension_presets;
create trigger dimension_presets_set_updated_at
before update on public.dimension_presets
for each row execute function public.set_updated_at();

alter table public.replacements
  add column if not exists dimension_preset_id uuid references public.dimension_presets(id) on delete set null;

alter table public.dimension_presets enable row level security;
drop policy if exists "active users can view dimension presets" on public.dimension_presets;
create policy "active users can view dimension presets" on public.dimension_presets
for select to authenticated using (public.current_active_role() is not null);
drop policy if exists "support can create dimension presets" on public.dimension_presets;
create policy "support can create dimension presets" on public.dimension_presets
for insert to authenticated with check (
  public.current_active_role() in ('customer_support', 'ADMIN') and created_by = auth.uid()
);
drop policy if exists "support can update dimension presets" on public.dimension_presets;
create policy "support can update dimension presets" on public.dimension_presets
for update to authenticated using (public.current_active_role() in ('customer_support', 'ADMIN'))
with check (public.current_active_role() in ('customer_support', 'ADMIN'));

grant select, insert, update on public.dimension_presets to authenticated;
revoke delete on public.dimension_presets from authenticated;
grant usage, select on sequence public.order_number_sequence to authenticated;

create or replace function public.enforce_logistics_tracking_owner()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.tracking_url is distinct from old.tracking_url
    and new.tracking_url is not null
    and public.current_active_role() not in ('LOGISTICS', 'ADMIN') then
    raise exception 'Tracking links can only be added by Logistics';
  end if;
  return new;
end;
$$;
drop trigger if exists replacements_enforce_tracking_owner on public.replacements;
create trigger replacements_enforce_tracking_owner
before update of tracking_url on public.replacements
for each row execute function public.enforce_logistics_tracking_owner();

create or replace function public.enforce_logistics_tracking_insert()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.tracking_url is not null and public.current_active_role() not in ('LOGISTICS', 'ADMIN') then
    raise exception 'Tracking links can only be added by Logistics';
  end if;
  return new;
end;
$$;
drop trigger if exists replacements_enforce_tracking_insert on public.replacements;
create trigger replacements_enforce_tracking_insert
before insert on public.replacements
for each row execute function public.enforce_logistics_tracking_insert();

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
  created_row public.replacements;
  attachment_count integer;
  expected_count integer;
begin
  select public.current_active_role() into actor_role;
  if actor_role is null or actor_role not in ('customer_support', 'ADMIN') then
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
    order_type := order_item ->> 'order_type';
    if order_type not in ('REPLACEMENT', 'OFFLINE') then raise exception 'Invalid order type'; end if;
    if nullif(trim(order_item ->> 'order_reference'), '') is null then raise exception 'Order reference is required'; end if;
    if nullif(trim(order_item ->> 'product_name'), '') is null then raise exception 'Product is required'; end if;
    if coalesce((order_item ->> 'quantity')::integer, 0) not between 1 and 999 then raise exception 'Invalid quantity'; end if;
    if order_type = 'REPLACEMENT' and (
      coalesce((order_item ->> 'length_cm')::numeric, 0) <= 0 or
      coalesce((order_item ->> 'breadth_cm')::numeric, 0) <= 0 or
      coalesce((order_item ->> 'height_cm')::numeric, 0) <= 0
    ) then raise exception 'Replacement dimensions are required'; end if;

    expected_count := (
      select count(*) from jsonb_array_elements(p_attachments) attachment
      where attachment ->> 'replacement_id' = order_id::text
    );
    if expected_count not between 1 and 12 then
      raise exception 'Between one and twelve product photos are required for every order';
    end if;
    if (
      select count(*)
      from jsonb_to_recordset(p_attachments) as item(replacement_id uuid, storage_path text)
      join storage.objects stored on stored.bucket_id = 'replacement-files'
        and stored.name = item.storage_path and stored.owner_id = auth.uid()::text
      where item.replacement_id = order_id
    ) <> expected_count then
      raise exception 'Product photo storage objects were not uploaded by the current user';
    end if;

    insert into public.replacements(
      id, replacement_number, order_type, order_group_id, order_reference,
      customer_name, customer_reference, customer_address, customer_email, customer_phone,
      product_name, quantity, reason, notes, shipping_speed, dimension_preset_id,
      length_cm, breadth_cm, height_cm, status, created_by
    ) values (
      order_id, 'assigned-by-trigger', order_type, p_group_id,
      trim(order_item ->> 'order_reference'), nullif(trim(order_item ->> 'customer_name'), ''),
      nullif(trim(order_item ->> 'customer_reference'), ''), nullif(trim(order_item ->> 'customer_address'), ''),
      lower(nullif(trim(order_item ->> 'customer_email'), '')), nullif(trim(order_item ->> 'customer_phone'), ''),
      trim(order_item ->> 'product_name'), (order_item ->> 'quantity')::integer,
      nullif(trim(order_item ->> 'reason'), ''), nullif(trim(order_item ->> 'notes'), ''),
      coalesce(nullif(order_item ->> 'shipping_speed', ''), 'STANDARD'),
      nullif(order_item ->> 'dimension_preset_id', '')::uuid,
      case when order_type = 'REPLACEMENT' then (order_item ->> 'length_cm')::numeric else null end,
      case when order_type = 'REPLACEMENT' then (order_item ->> 'breadth_cm')::numeric else null end,
      case when order_type = 'REPLACEMENT' then (order_item ->> 'height_cm')::numeric else null end,
      'NEW', auth.uid()
    ) returning * into created_row;

    insert into public.attachments(
      replacement_id, qc_submission_id, attachment_type, storage_path, file_name, mime_type, uploaded_by
    )
    select order_id, null, 'PROOF_PHOTO', item.storage_path, item.file_name, item.mime_type, auth.uid()
    from jsonb_to_recordset(p_attachments) as item(
      replacement_id uuid, storage_path text, file_name text, mime_type text
    )
    where item.replacement_id = order_id
      and item.mime_type in ('image/jpeg', 'image/png', 'image/webp')
      and item.storage_path like ('replacements/' || order_id || '/customer_support/%/photos/%');
    get diagnostics attachment_count = row_count;
    if attachment_count <> expected_count then raise exception 'Invalid product photo metadata'; end if;

    return next created_row;
  end loop;
end;
$$;

revoke all on function public.create_order_batch(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.create_order_batch(uuid, jsonb, jsonb) to authenticated;

-- Tracking is entered at the Logistics handoff, not by Customer Support.
create or replace function public.submit_logistics_label(
  p_replacement_id uuid,
  p_upload_id uuid,
  p_tracking_url text,
  p_attachments jsonb
)
returns public.replacements language plpgsql security definer set search_path = '' as $$
declare
  current_row public.replacements;
  actor_role public.app_role;
  attachment_count integer := 0;
  clean_tracking_url text := nullif(trim(p_tracking_url), '');
begin
  select * into current_row from public.replacements where id = p_replacement_id for update;
  if not found then raise exception 'Order not found'; end if;
  select public.current_active_role() into actor_role;
  if actor_role is null or actor_role not in ('LOGISTICS', 'ADMIN') then raise exception 'Only Logistics can upload the shipping label'; end if;
  if current_row.status <> 'NEW' then raise exception 'A label can only be uploaded for a new order'; end if;
  if clean_tracking_url is not null and clean_tracking_url !~* '^https?://[^[:space:]]+$' then raise exception 'Tracking link must begin with http:// or https://'; end if;
  if jsonb_typeof(p_attachments) is distinct from 'array' or jsonb_array_length(p_attachments) <> 1 then raise exception 'Exactly one shipping label is required'; end if;
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

  update public.replacements set status = 'LABEL_UPLOADED', tracking_url = clean_tracking_url
  where id = p_replacement_id returning * into current_row;
  insert into public.activity_logs(replacement_id, actor_id, action, metadata)
  values (p_replacement_id, auth.uid(), 'LOGISTICS_SUBMITTED', jsonb_build_object(
    'upload_id', p_upload_id, 'attachment_count', attachment_count, 'has_tracking_link', clean_tracking_url is not null
  ));
  return current_row;
end;
$$;

revoke all on function public.submit_logistics_label(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.submit_logistics_label(uuid, uuid, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
