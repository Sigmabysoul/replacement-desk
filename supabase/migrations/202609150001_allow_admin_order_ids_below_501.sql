-- Automatic order IDs still begin at 501. Admins may deliberately use any
-- unused positive whole number when importing or correcting an order.
do $migration$
declare
  function_identity text;
  definition text;
begin
  foreach function_identity in array array[
    'public.create_order_batch(uuid,jsonb,jsonb)',
    'public.admin_update_order_number(uuid,bigint)',
    'public.update_replacement_details_with_order_number(uuid,bigint,text,text,text,text,integer,text,text,text)'
  ] loop
    definition := pg_get_functiondef(to_regprocedure(function_identity));
    if definition is null then
      raise exception 'Required function % is missing', function_identity;
    end if;
    if position('Order ID must be 501 or higher' in definition) = 0 then
      raise exception 'Expected Order ID validation was not found in %', function_identity;
    end if;

    definition := replace(definition, 'requested_order_number < 501', 'requested_order_number < 1');
    definition := replace(definition, 'p_order_number < 501', 'p_order_number < 1');
    definition := replace(definition, 'Order ID must be 501 or higher', 'Order ID must be a positive whole number');
    execute definition;
  end loop;
end;
$migration$;
