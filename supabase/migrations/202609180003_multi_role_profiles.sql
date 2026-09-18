-- =============================================================================
-- Multi-Role Support for Profiles
-- Allows users to possess multiple roles simultaneously (e.g. Packer + Printer,
-- CS + HR) while maintaining backward compatibility with the single role column.
-- =============================================================================

alter table public.profiles
  add column if not exists roles public.app_role[] not null default array['PRINTING'::public.app_role];

-- Populate existing rows with their current single role
update public.profiles
set roles = array[role]
where roles is null or roles = array['PRINTING'::public.app_role];

-- Trigger to keep role (primary) and roles (array) synchronized
create or replace function public.sync_profile_roles()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.roles is null or cardinality(new.roles) = 0 then
      new.roles := array[coalesce(new.role, 'PRINTING'::public.app_role)];
    end if;
    new.role := new.roles[1];
  elsif tg_op = 'UPDATE' then
    if new.roles is distinct from old.roles then
      if new.roles is null or cardinality(new.roles) = 0 then
        new.roles := array[coalesce(new.role, 'PRINTING'::public.app_role)];
      end if;
      new.role := new.roles[1];
    elsif new.role is distinct from old.role then
      new.roles := array[new.role];
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_profile_roles_trigger on public.profiles;
create trigger sync_profile_roles_trigger
before insert or update on public.profiles
for each row execute function public.sync_profile_roles();

-- -----------------------------------------------------------------------------
-- Helper Functions for Multi-Role Authorization
-- -----------------------------------------------------------------------------

create or replace function public.current_active_roles()
returns public.app_role[] language sql stable security definer set search_path = '' as $$
  select coalesce(roles, array[role]) from public.profiles where id = auth.uid() and active = true;
$$;

create or replace function public.has_role(p_role public.app_role)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active = true
      and ('ADMIN' = any(coalesce(roles, array[role])) or p_role = any(coalesce(roles, array[role])))
  );
$$;

create or replace function public.has_any_role(variadic p_roles public.app_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active = true
      and (
        'ADMIN' = any(coalesce(roles, array[role]))
        or coalesce(roles, array[role]) && p_roles
      )
  );
$$;

revoke all on function public.current_active_roles() from public, anon;
grant execute on function public.current_active_roles() to authenticated;

revoke all on function public.has_role(public.app_role) from public, anon;
grant execute on function public.has_role(public.app_role) to authenticated;

revoke all on function public.has_any_role(public.app_role[]) from public, anon;
grant execute on function public.has_any_role(public.app_role[]) to authenticated;
