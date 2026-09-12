-- Adds shipment tracking and a logical archive. Archived orders remain in the
-- database (and therefore searchable/auditable) but are excluded from normal
-- operational queues. Storage files are intentionally retained as evidence.

alter table public.replacements
  add column if not exists tracking_url text check (
    tracking_url is null or tracking_url ~* '^https?://[^[:space:]]+$'
  ),
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id);

create index if not exists replacements_archived_created_idx
  on public.replacements(archived_at, created_at desc);

drop function if exists public.update_replacement_details(uuid, text, text, text, text, integer, text, text);
create function public.update_replacement_details(
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
  if actor_role not in ('ESHA', 'ADMIN') then raise exception 'Only Esha can edit replacement details'; end if;
  if nullif(trim(p_order_reference), '') is null or nullif(trim(p_product_name), '') is null or p_quantity not between 1 and 999 then
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
  values (p_replacement_id, auth.uid(), 'REPLACEMENT_UPDATED', jsonb_build_object('has_tracking_link', clean_tracking_url is not null));
end;
$$;

create function public.archive_completed_replacements()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  archived_count integer;
begin
  if public.current_active_role() <> 'ADMIN' then raise exception 'Administrator access required'; end if;

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

revoke all on function public.update_replacement_details(uuid, text, text, text, text, integer, text, text, text) from public;
revoke all on function public.archive_completed_replacements() from public;
grant execute on function public.update_replacement_details(uuid, text, text, text, text, integer, text, text, text) to authenticated;
grant execute on function public.archive_completed_replacements() to authenticated;
