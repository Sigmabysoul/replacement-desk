-- Audited escape hatch for exceptional corrections. Only active admins may call it.
create or replace function public.admin_override_replacement(p_replacement_id uuid, p_target_status public.replacement_status, p_reason text)
returns public.replacements language plpgsql security definer set search_path = '' as $$
declare
  current_row public.replacements;
  previous_status public.replacement_status;
begin
  if public.current_active_role() <> 'ADMIN' then raise exception 'Admin access required'; end if;
  if nullif(trim(p_reason), '') is null or char_length(trim(p_reason)) > 1000 then raise exception 'Override reason is required'; end if;
  select * into current_row from public.replacements where id = p_replacement_id for update;
  if not found then raise exception 'Replacement not found'; end if;
  previous_status := current_row.status;
  update public.replacements set status = p_target_status,
    label_printed_at = case when p_target_status = 'LABEL_PRINTED' then coalesce(label_printed_at, now()) else label_printed_at end,
    qc_submitted_at = case when p_target_status = 'QC_PENDING' then coalesce(qc_submitted_at, now()) else qc_submitted_at end,
    qc_approved_at = case when p_target_status = 'QC_APPROVED' then coalesce(qc_approved_at, now()) else qc_approved_at end,
    packed_at = case when p_target_status = 'PACKED' then coalesce(packed_at, now()) else packed_at end,
    shipped_at = case when p_target_status = 'SHIPPED' then coalesce(shipped_at, now()) else shipped_at end,
    needs_token_at = case when p_target_status = 'NEEDS_TOKEN' then coalesce(needs_token_at, now()) else needs_token_at end
  where id = p_replacement_id returning * into current_row;
  insert into public.activity_logs(replacement_id, actor_id, action, message, metadata)
  values (p_replacement_id, auth.uid(), 'ADMIN_STATUS_OVERRIDE', trim(p_reason), jsonb_build_object('from_status', previous_status, 'to_status', p_target_status));
  return current_row;
end;
$$;
revoke all on function public.admin_override_replacement(uuid, public.replacement_status, text) from public;
grant execute on function public.admin_override_replacement(uuid, public.replacement_status, text) to authenticated;
