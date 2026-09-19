-- =============================================================================
-- Migration: 202609190004_cancel_replacement.sql
-- Description: Dedicated, audited Admin-only cancellation for open replacements.
-- =============================================================================

create or replace function public.cancel_replacement_order(
  p_replacement_id uuid,
  p_reason text
)
returns public.replacements
language plpgsql security definer set search_path = '' as $$
declare
  current_row public.replacements;
  previous_status public.replacement_status;
begin
  select * into current_row from public.replacements where id = p_replacement_id for update;
  if not found then raise exception 'Replacement order not found'; end if;

  if not public.has_any_role('ADMIN') then
    raise exception 'Only Admin can cancel replacement orders';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'A cancellation reason is required';
  end if;
  if char_length(trim(p_reason)) > 1000 then
    raise exception 'Cancellation reason is too long';
  end if;
  if current_row.status in ('SHIPPED', 'DELIVERED', 'CANCELLED') then
    raise exception 'This replacement order cannot be cancelled';
  end if;

  previous_status := current_row.status;

  update public.replacements set
    status = 'CANCELLED'
  where id = p_replacement_id
  returning * into current_row;

  insert into public.activity_logs(replacement_id, actor_id, action, message, metadata)
  values (
    p_replacement_id,
    auth.uid(),
    'ORDER_CANCELLED',
    trim(p_reason),
    jsonb_build_object('from_status', previous_status, 'to_status', 'CANCELLED')
  );

  return current_row;
end;
$$;

revoke all on function public.cancel_replacement_order(uuid, text) from public, anon;
grant execute on function public.cancel_replacement_order(uuid, text) to authenticated;
