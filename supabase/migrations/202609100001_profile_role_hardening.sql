-- Auth user metadata is user-editable and must never decide authorization.
-- New profiles always start as PACKING; an authenticated administrator assigns
-- the requested role only after Auth user creation succeeds.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    'PACKING'
  );
  return new;
end;
$$;
