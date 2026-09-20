-- Keep the shared sequence aligned even when an authorized workflow changes an
-- existing order ID. The next newly created order will therefore use N + 1.

create or replace function public.sync_changed_order_number_sequence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform setval('public.order_number_sequence', new.order_number, true);
  return new;
end;
$$;

drop trigger if exists replacements_sync_changed_order_number on public.replacements;
create trigger replacements_sync_changed_order_number
after update of order_number on public.replacements
for each row
when (old.order_number is distinct from new.order_number)
execute function public.sync_changed_order_number_sequence();

drop trigger if exists offline_orders_sync_changed_order_number on public.offline_orders;
create trigger offline_orders_sync_changed_order_number
after update of order_number on public.offline_orders
for each row
when (old.order_number is distinct from new.order_number)
execute function public.sync_changed_order_number_sequence();

revoke all on function public.sync_changed_order_number_sequence() from public, anon, authenticated;
