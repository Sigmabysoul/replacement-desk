#!/usr/bin/env bash
set -euo pipefail

test_root="$(mktemp -d /tmp/replacement-desk-db-test.XXXXXX)"
db_dir="$test_root/data"
socket_dir="$test_root/socket"
mkdir -p "$socket_dir"

cleanup() {
  if [ -f "$db_dir/postmaster.pid" ]; then
    pg_ctl -D "$db_dir" -m fast stop >/dev/null
  fi
  rm -rf "$test_root"
}
trap cleanup EXIT

initdb -D "$db_dir" -A trust -U postgres >/dev/null
pg_ctl -D "$db_dir" -o "-F -k $socket_dir -c listen_addresses=''" -w start >/dev/null
psql=(psql -X -v ON_ERROR_STOP=1 -h "$socket_dir" -U postgres -d postgres)

"${psql[@]}" <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key,
  bucket_id text not null,
  name text not null,
  metadata jsonb,
  owner_id text
);
alter table storage.objects enable row level security;
grant select, insert, delete on storage.objects to authenticated;
create publication supabase_realtime;

alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;
SQL

for migration in supabase/migrations/*.sql; do
  "${psql[@]}" -f "$migration" >/dev/null
done

"${psql[@]}" <<'SQL'
insert into auth.users(id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'admin@example.com', '{"full_name":"Admin","role":"ADMIN"}'),
  ('22222222-2222-2222-2222-222222222222', 'esha@example.com', '{"full_name":"Esha"}'),
  ('33333333-3333-3333-3333-333333333333', 'print@example.com', '{"full_name":"Printer"}'),
  ('44444444-4444-4444-4444-444444444444', 'pack@example.com', '{"full_name":"Packer"}'),
  ('55555555-5555-5555-5555-555555555555', 'inactive@example.com', '{"full_name":"Inactive"}');

do $$
begin
  if (select role from public.profiles where id = '11111111-1111-1111-1111-111111111111') <> 'PACKING' then
    raise exception 'Auth metadata escalated a new user role';
  end if;
end
$$;

update public.profiles set role = 'ADMIN' where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set role = 'ESHA' where id = '22222222-2222-2222-2222-222222222222';
update public.profiles set role = 'PRINTING' where id = '33333333-3333-3333-3333-333333333333';
update public.profiles set role = 'PACKING' where id = '44444444-4444-4444-4444-444444444444';
update public.profiles set active = false where id = '55555555-5555-5555-5555-555555555555';

set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
insert into public.replacements(id, replacement_number, order_reference, product_name, quantity, created_by)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'assigned-by-trigger', 'ORDER-1', 'Test Product', 2, '22222222-2222-2222-2222-222222222222');

select public.update_replacement_details(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ORDER-1', null, null, 'Test Product', 2, null, null,
  'https://tracking.example.test/ORDER-1'
);

do $$
begin
  if (select tracking_url from public.replacements where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 'https://tracking.example.test/ORDER-1' then
    raise exception 'tracking link was not retained';
  end if;
end
$$;

select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
select public.transition_replacement('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'LABEL_PRINTED');

select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);
select public.submit_qc(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '[{"storage_path":"replacements/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/qc/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/one.jpg","file_name":"one.jpg","mime_type":"image/jpeg"}]'
);

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select public.transition_replacement('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'QC_REJECTED', 'Retake photo');

select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);
select public.submit_qc(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '[{"storage_path":"replacements/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/qc/cccccccc-cccc-4ccc-8ccc-cccccccccccc/two.jpg","file_name":"two.jpg","mime_type":"image/jpeg"}]'
);

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select public.transition_replacement('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'QC_APPROVED');

select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);
select public.transition_replacement('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'PACKED');

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select public.transition_replacement('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'SHIPPED');

do $$
begin
  if (select status from public.replacements where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 'SHIPPED' then
    raise exception 'workflow did not reach SHIPPED';
  end if;
  if (select count(*) from public.qc_submissions where replacement_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 2 then
    raise exception 'QC resubmission history was not preserved';
  end if;
  if (select count(*) from public.activity_logs where replacement_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') < 9 then
    raise exception 'workflow audit trail is incomplete';
  end if;
end
$$;

reset role;
update public.replacements
set created_at = now() - interval '31 days'
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select public.archive_completed_replacements();

do $$
begin
  if (select archived_at is null from public.replacements where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') then
    raise exception 'completed replacement was not archived';
  end if;
  if not exists (select 1 from public.activity_logs where replacement_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and action = 'ORDER_ARCHIVED') then
    raise exception 'archive action was not recorded';
  end if;
end
$$;

select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', false);
do $$
begin
  if (select count(*) from public.replacements) <> 0 then
    raise exception 'inactive profile can read replacements';
  end if;
end
$$;
SQL

echo "Replacement Desk PostgreSQL integration test passed."
