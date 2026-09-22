-- =============================================================================
-- Migration: Allow Logistics role to confirm offline order delivery
-- Enables Logistics Head / team to track and mark offline orders delivered on /tracking.
-- =============================================================================

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

revoke all on function public.confirm_offline_delivery(uuid, text, jsonb) from public, anon;
grant execute on function public.confirm_offline_delivery(uuid, text, jsonb) to authenticated;

