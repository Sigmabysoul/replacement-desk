-- Makes the visible numeric Order ID immutable for operational users while
-- allowing audited Admin assignment during creation and later correction.

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
begin
  select public.current_active_role() into actor_role;
  if actor_role is null or actor_role not in ('CUSTOMER_SUPPORT', 'ADMIN') then
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
    requested_order_number := null;
    if actor_role = 'ADMIN' and nullif(order_item ->> 'requested_order_number', '') is not null then
      requested_order_number := (order_item ->> 'requested_order_number')::bigint;
      if requested_order_number < 501 then raise exception 'Order ID must be 501 or higher'; end if;
    end if;
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
      id, replacement_number, order_number, order_type, order_group_id, order_reference,
      customer_name, customer_reference, customer_address, customer_email, customer_phone,
      product_name, quantity, reason, notes, shipping_speed, dimension_preset_id,
      length_cm, breadth_cm, height_cm, status, created_by
    ) values (
      order_id, 'assigned-by-trigger',
      coalesce(requested_order_number, nextval('public.order_number_sequence')),
      order_type, p_group_id,
      trim(order_item ->> 'order_reference'), nullif(trim(order_item ->> 'customer_name'), ''),
      null, nullif(trim(order_item ->> 'customer_address'), ''),
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

    insert into public.attachments(
      replacement_id, qc_submission_id, attachment_type, storage_path, file_name, mime_type, uploaded_by
    )
    select order_id, null, 'PROOF_PHOTO', item.storage_path, item.file_name, item.mime_type, auth.uid()
    from jsonb_to_recordset(p_attachments) as item(
      replacement_id uuid, storage_path text, file_name text, mime_type text
    )
    where item.replacement_id = order_id
      and item.mime_type in ('image/jpeg', 'image/png', 'image/webp')
      and item.storage_path like ('replacements/' || order_id || '/CUSTOMER_SUPPORT/%/photos/%');
    get diagnostics attachment_count = row_count;
    if attachment_count <> expected_count then raise exception 'Invalid product photo metadata'; end if;

    return next created_row;
  end loop;
end;
$$;

create or replace function public.admin_update_order_number(
  p_replacement_id uuid,
  p_order_number bigint
)
returns public.replacements
language plpgsql security definer set search_path = '' as $$
declare
  current_row public.replacements;
  previous_number bigint;
begin
  if public.current_active_role() is distinct from 'ADMIN'::public.app_role then
    raise exception 'Administrator access required';
  end if;
  if p_order_number < 501 then raise exception 'Order ID must be 501 or higher'; end if;

  select * into current_row from public.replacements where id = p_replacement_id for update;
  if not found then raise exception 'Order not found'; end if;
  previous_number := current_row.order_number;

  update public.replacements set order_number = p_order_number
  where id = p_replacement_id returning * into current_row;

  if previous_number is distinct from p_order_number then
    insert into public.activity_logs(replacement_id, actor_id, action, metadata)
    values (
      p_replacement_id,
      auth.uid(),
      'ORDER_NUMBER_CHANGED',
      jsonb_build_object('from_order_number', previous_number, 'to_order_number', p_order_number)
    );
    perform setval(
      'public.order_number_sequence',
      greatest(
        p_order_number,
        (select last_value from public.order_number_sequence),
        (select max(order_number) from public.replacements)
      ),
      true
    );
  end if;
  return current_row;
end;
$$;

revoke all on function public.create_order_batch(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.create_order_batch(uuid, jsonb, jsonb) to authenticated;
revoke all on function public.admin_update_order_number(uuid, bigint) from public, anon;
grant execute on function public.admin_update_order_number(uuid, bigint) to authenticated;

-- Keep detail edits and an optional Admin order-ID correction atomic. A
-- duplicate order ID therefore cannot leave the other edits partially saved.
create or replace function public.update_replacement_details_with_order_number(
  p_replacement_id uuid,
  p_order_number bigint,
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
  previous_number bigint;
begin
  select public.current_active_role() into actor_role;
  if actor_role is null or actor_role not in ('CUSTOMER_SUPPORT', 'ADMIN') then
    raise exception 'Only CUSTOMER_SUPPORT can edit replacement details';
  end if;
  if actor_role <> 'ADMIN' and p_order_number is not null then
    raise exception 'Only Admin can change the Order ID';
  end if;
  if p_order_number is not null and p_order_number < 501 then
    raise exception 'Order ID must be 501 or higher';
  end if;
  if nullif(trim(p_order_reference), '') is null
    or nullif(trim(p_product_name), '') is null
    or p_quantity not between 1 and 999 then
    raise exception 'Invalid replacement details';
  end if;
  if clean_tracking_url is not null and clean_tracking_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'Tracking link must begin with http:// or https://';
  end if;

  select order_number into previous_number
  from public.replacements
  where id = p_replacement_id and status not in ('SHIPPED', 'CANCELLED')
  for update;
  if not found then raise exception 'Open replacement not found'; end if;

  update public.replacements
  set order_number = coalesce(p_order_number, order_number),
      order_reference = trim(p_order_reference),
      customer_name = nullif(trim(p_customer_name), ''),
      customer_reference = null,
      product_name = trim(p_product_name),
      quantity = p_quantity,
      reason = nullif(trim(p_reason), ''),
      notes = nullif(trim(p_notes), ''),
      tracking_url = clean_tracking_url
  where id = p_replacement_id;

  insert into public.activity_logs(replacement_id, actor_id, action, metadata)
  values (
    p_replacement_id,
    auth.uid(),
    'REPLACEMENT_UPDATED',
    jsonb_build_object(
      'has_tracking_link', clean_tracking_url is not null,
      'from_order_number', previous_number,
      'to_order_number', coalesce(p_order_number, previous_number)
    )
  );

  if p_order_number is not null and p_order_number is distinct from previous_number then
    perform setval(
      'public.order_number_sequence',
      greatest(
        p_order_number,
        (select last_value from public.order_number_sequence),
        (select max(order_number) from public.replacements)
      ),
      true
    );
  end if;
end;
$$;

revoke all on function public.update_replacement_details_with_order_number(uuid, bigint, text, text, text, text, integer, text, text, text) from public, anon;
grant execute on function public.update_replacement_details_with_order_number(uuid, bigint, text, text, text, text, integer, text, text, text) to authenticated;

notify pgrst, 'reload schema';
