-- Production access baseline
--
-- The first administrator is bootstrapped exactly once. After that marker is
-- written, deleting profiles cannot reopen first-user administrator access.

create table if not exists public.workspace_bootstrap (
  singleton boolean primary key default true check (singleton),
  first_admin_user_id uuid references auth.users(id) on delete set null,
  bootstrapped_at timestamptz not null default now()
);

alter table public.workspace_bootstrap enable row level security;
revoke all on public.workspace_bootstrap from public, anon, authenticated;

-- Existing installations may already have an administrator. Record that fact
-- before replacing the signup trigger.
insert into public.workspace_bootstrap(singleton, first_admin_user_id)
select true, id
from public.profiles
where 'ADMIN' = any(coalesce(roles, array[role]))
order by created_at
limit 1
on conflict (singleton) do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  bootstrap_admin boolean := false;
  initial_role public.app_role := 'PRINTING';
begin
  -- Serialize the extremely rare first-signup decision.
  perform pg_advisory_xact_lock(hashtext('replacement-desk:first-admin'));

  if not exists (select 1 from public.workspace_bootstrap where singleton = true)
     and not exists (select 1 from public.profiles) then
    bootstrap_admin := true;
    initial_role := 'ADMIN';
  end if;

  insert into public.profiles(id, full_name, role, roles, active)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    initial_role,
    array[initial_role],
    true
  )
  on conflict (id) do nothing;

  if bootstrap_admin then
    insert into public.workspace_bootstrap(singleton, first_admin_user_id)
    values (true, new.id)
    on conflict (singleton) do nothing;
  end if;

  return new;
end;
$$;

-- Remove obsolete overloads retained by earlier iterative migrations. Current
-- callers use the order-number-aware and packing-QC functions exclusively.
drop function if exists public.create_offline_order(uuid, text, text, text, integer, text, text, date, text);
drop function if exists public.submit_qc(uuid, uuid, jsonb);

-- No application table is intentionally writable or readable as anon.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

notify pgrst, 'reload schema';
