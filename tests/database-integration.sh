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
grant usage on schema storage to authenticated;
grant select, insert, delete on storage.objects to authenticated;
create publication supabase_realtime;

alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;
SQL

for migration in supabase/migrations/*.sql; do
  case "$(basename "$migration")" in
    2026091[34]*) continue ;;
  esac
  "${psql[@]}" -f "$migration" >/dev/null
done

"${psql[@]}" <<'SQL'
insert into auth.users(id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'admin@example.com', '{"full_name":"Admin","role":"ADMIN"}'),
  ('22222222-2222-2222-2222-222222222222', 'customer_support@example.com', '{"full_name":"customer_support"}'),
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
update public.profiles set role = 'customer_support' where id = '22222222-2222-2222-2222-222222222222';
update public.profiles set role = 'PRINTING' where id = '33333333-3333-3333-3333-333333333333';
update public.profiles set role = 'PACKING' where id = '44444444-4444-4444-4444-444444444444';
update public.profiles set active = false where id = '55555555-5555-5555-5555-555555555555';

insert into public.replacements(id, replacement_number, order_reference, product_name, quantity, created_by)
values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'assigned-by-trigger', 'LEGACY-ORDER', 'Legacy Product', 1, '22222222-2222-2222-2222-222222222222');
update public.replacements set status = 'LABEL_PRINTED' where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
insert into storage.objects(id, bucket_id, name, metadata, owner_id) values
  (gen_random_uuid(), 'replacement-files', 'replacements/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/legacy-label.pdf', '{"size":1024}', '33333333-3333-3333-3333-333333333333');
insert into public.attachments(replacement_id, attachment_type, storage_path, file_name, mime_type, uploaded_by)
values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'LABEL', 'replacements/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/legacy-label.pdf', 'legacy-label.pdf', 'application/pdf', '33333333-3333-3333-3333-333333333333');
SQL

for migration in supabase/migrations/2026091[34]*.sql; do
  "${psql[@]}" -f "$migration" >/dev/null
done

"${psql[@]}" <<'SQL'
insert into auth.users(id, email, raw_user_meta_data) values
  ('66666666-6666-4666-8666-666666666666', 'logistics@example.com', '{"full_name":"Logistics"}'),
  ('77777777-7777-4777-8777-777777777777', 'new-default@example.com', '{"full_name":"New Default","role":"ADMIN"}');
update public.profiles set role = 'LOGISTICS' where id = '66666666-6666-4666-8666-666666666666';

do $$
begin
  if (select role from public.profiles where id = '33333333-3333-3333-3333-333333333333') <> 'PRINTING' then
    raise exception 'Printing role was not preserved';
  end if;
  if (select role from public.profiles where id = '44444444-4444-4444-4444-444444444444') <> 'PACKING' then
    raise exception 'Packing role was not preserved';
  end if;
  if (select role from public.profiles where id = '77777777-7777-4777-8777-777777777777') <> 'PRINTING' then
    raise exception 'New profiles do not default safely to Printing';
  end if;
  if (select status from public.replacements where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') <> 'LABEL_PRINTED' then
    raise exception 'In-flight order status was not preserved';
  end if;
end
$$;

set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);

do $$
begin
  insert into public.replacements(id, replacement_number, order_reference, product_name, quantity, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'assigned-by-trigger', 'ORDER-1', 'Test Product', 2, '22222222-2222-2222-2222-222222222222');
  raise exception 'Direct replacement creation unexpectedly succeeded';
exception when insufficient_privilege then
  null;
end
$$;

do $$
begin
  perform public.create_replacement_with_photos(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '99999999-9999-4999-8999-999999999999',
    'ORDER-1', null, null, 'Test Product', 2, null, null, 'https://tracking.example.test/ORDER-1', '[]'
  );
  raise exception 'Replacement without customer_support product photos unexpectedly succeeded';
exception when others then
  if sqlerrm <> 'Between one and twelve product photos are required' then raise; end if;
end
$$;

do $$
begin
  perform public.create_replacement_with_photos(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '99999999-9999-4999-8999-999999999999',
    'ORDER-1', null, null, 'Test Product', 2, null, null, 'https://tracking.example.test/ORDER-1',
    '[{"storage_path":"replacements/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/customer_support/99999999-9999-4999-8999-999999999999/photos/fabricated.jpg","file_name":"fabricated.jpg","mime_type":"image/jpeg"}]'
  );
  raise exception 'Fabricated customer_support product evidence unexpectedly succeeded';
exception when others then
  if sqlerrm <> 'Product photo storage objects were not uploaded by the current user' then raise; end if;
end
$$;

insert into storage.objects(id, bucket_id, name, metadata, owner_id) values
  (gen_random_uuid(), 'replacement-files', 'replacements/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/customer_support/99999999-9999-4999-8999-999999999999/photos/product.jpg', '{"size":1024}', '22222222-2222-2222-2222-222222222222');
select public.create_replacement_with_photos(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '99999999-9999-4999-8999-999999999999',
  'ORDER-1', null, null, 'Test Product', 2, null, null, 'https://tracking.example.test/ORDER-1',
  '[{"storage_path":"replacements/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/customer_support/99999999-9999-4999-8999-999999999999/photos/product.jpg","file_name":"product.jpg","mime_type":"image/jpeg"}]'
);

do $$
begin
  perform public.submit_logistics_label('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '[]');
  raise exception 'customer_support Logistics authorization unexpectedly succeeded';
exception when others then
  if sqlerrm <> 'Only Logistics can upload the shipping label' then raise; end if;
end
$$;

select set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-666666666666', false);
do $$
begin
  perform public.create_replacement_with_photos(
    '88888888-8888-4888-8888-888888888888', '99999999-9999-4999-8999-999999999999',
    'UNAUTHORIZED', null, null, 'Test Product', 1, null, null, null, '[]'
  );
  raise exception 'Logistics replacement creation unexpectedly succeeded';
exception when others then
  if sqlerrm <> 'Only customer_support can create replacement orders' then raise; end if;
end
$$;

do $$
begin
  perform public.submit_logistics_label(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '[{"storage_path":"replacements/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/logistics/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/labels/fabricated.pdf","file_name":"fabricated.pdf","mime_type":"application/pdf"}]'
  );
  raise exception 'Fabricated label evidence unexpectedly succeeded';
exception when others then
  if sqlerrm <> 'The label storage object was not uploaded by the current user' then raise; end if;
end
$$;

insert into storage.objects(id, bucket_id, name, metadata, owner_id) values
  (gen_random_uuid(), 'replacement-files', 'replacements/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/logistics/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/labels/label.pdf', '{"size":1024}', '66666666-6666-4666-8666-666666666666');
select public.submit_logistics_label(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '[{"storage_path":"replacements/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/logistics/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/labels/label.pdf","file_name":"label.pdf","mime_type":"application/pdf"}]'
);

do $$
begin
  if (select status from public.replacements where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 'LABEL_UPLOADED' then
    raise exception 'Logistics handoff did not reach LABEL_UPLOADED';
  end if;
  perform public.submit_packing_qc('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '[]');
  raise exception 'Logistics QC authorization unexpectedly succeeded';
exception when others then
  if sqlerrm <> 'Only Packing can submit QC photos' then raise; end if;
end
$$;

select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);
do $$
begin
  perform public.transition_replacement('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'LABEL_PRINTED');
  raise exception 'Packing print confirmation unexpectedly succeeded';
exception when others then
  if sqlerrm <> 'Only Printing can mark an uploaded label as printed' then raise; end if;
end
$$;

select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
select public.transition_replacement('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'LABEL_PRINTED');

do $$
begin
  insert into storage.objects(id, bucket_id, name, metadata, owner_id) values
    (gen_random_uuid(), 'replacement-files', 'replacements/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/printing/not-allowed.jpg', '{"size":1024}', '33333333-3333-3333-3333-333333333333');
  raise exception 'Printing storage upload unexpectedly succeeded';
exception when insufficient_privilege then
  null;
end
$$;

select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);
do $$
begin
  insert into public.attachments(replacement_id, attachment_type, storage_path, file_name, mime_type, uploaded_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'QC_PHOTO', 'fabricated.jpg', 'fabricated.jpg', 'image/jpeg', '44444444-4444-4444-4444-444444444444');
  raise exception 'Direct attachment metadata insert unexpectedly succeeded';
exception when insufficient_privilege then
  null;
end
$$;

do $$
begin
  perform public.submit_packing_qc('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', null);
  raise exception 'Null QC metadata unexpectedly succeeded';
exception when others then
  if sqlerrm <> 'Between one and twelve QC photos are required' then raise; end if;
end
$$;

do $$
begin
  perform public.submit_packing_qc(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '[{"storage_path":"replacements/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/packing/cccccccc-cccc-4ccc-8ccc-cccccccccccc/photos/fabricated.jpg","file_name":"fabricated.jpg","mime_type":"image/jpeg"}]'
  );
  raise exception 'Fabricated QC evidence unexpectedly succeeded';
exception when others then
  if sqlerrm <> 'QC photo storage objects were not uploaded by the current user' then raise; end if;
end
$$;

insert into storage.objects(id, bucket_id, name, metadata, owner_id) values
  (gen_random_uuid(), 'replacement-files', 'replacements/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/packing/cccccccc-cccc-4ccc-8ccc-cccccccccccc/photos/one.jpg', '{"size":1024}', '44444444-4444-4444-4444-444444444444');
select public.submit_packing_qc(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '[{"storage_path":"replacements/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/packing/cccccccc-cccc-4ccc-8ccc-cccccccccccc/photos/one.jpg","file_name":"one.jpg","mime_type":"image/jpeg"}]'
);

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select public.transition_replacement('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'QC_REJECTED', 'Retake photo');

select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);
insert into storage.objects(id, bucket_id, name, metadata, owner_id) values
  (gen_random_uuid(), 'replacement-files', 'replacements/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/packing/dddddddd-dddd-4ddd-8ddd-dddddddddddd/photos/two.jpg', '{"size":1024}', '44444444-4444-4444-4444-444444444444');
select public.submit_packing_qc(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  '[{"storage_path":"replacements/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/packing/dddddddd-dddd-4ddd-8ddd-dddddddddddd/photos/two.jpg","file_name":"two.jpg","mime_type":"image/jpeg"}]'
);

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select public.transition_replacement('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'QC_APPROVED');
do $$
begin
  perform public.transition_replacement('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'SHIPPED');
  raise exception 'customer_support dispatch unexpectedly succeeded';
exception when others then
  if sqlerrm <> 'Only Packing can mark a packed replacement as shipped' then raise; end if;
end
$$;

select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);
select public.transition_replacement('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'PACKED');
select public.transition_replacement('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'NEEDS_TOKEN');
select public.transition_replacement('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'SHIPPED');

do $$
begin
  if has_function_privilege('authenticated', 'public.submit_qc(uuid,uuid,jsonb)', 'execute') then
    raise exception 'Legacy submit_qc RPC is still callable';
  end if;
  if (select status from public.replacements where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 'SHIPPED' then
    raise exception 'Workflow did not reach SHIPPED';
  end if;
  if (select count(*) from public.qc_submissions where replacement_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 2 then
    raise exception 'QC resubmission history was not preserved';
  end if;
  if (select count(*) from public.attachments where replacement_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and attachment_type = 'LABEL') <> 1 then
    raise exception 'Logistics label was not retained';
  end if;
  if (select count(*) from public.attachments where replacement_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and attachment_type = 'PROOF_PHOTO' and uploaded_by = '22222222-2222-2222-2222-222222222222') <> 1 then
    raise exception 'customer_support product photo was not retained with the order';
  end if;
  if (select count(*) from public.activity_logs where replacement_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') < 10 then
    raise exception 'Workflow audit trail is incomplete';
  end if;
end
$$;

reset role;
update public.replacements set created_at = now() - interval '31 days'
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select public.archive_completed_replacements();

do $$
begin
  if (select archived_at is null from public.replacements where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') then
    raise exception 'Completed replacement was not archived';
  end if;
end
$$;

select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', false);
do $$
begin
  if (select count(*) from public.replacements) <> 0 then
    raise exception 'Inactive profile can read replacements';
  end if;
  begin
    perform public.submit_logistics_label('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'ffffffff-ffff-4fff-8fff-ffffffffffff', '[]');
    raise exception 'Inactive profile submitted Logistics files';
  exception when others then
    if sqlerrm <> 'Only Logistics can upload the shipping label' then raise; end if;
  end;
  begin
    perform public.submit_packing_qc('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'ffffffff-ffff-4fff-8fff-ffffffffffff', '[]');
    raise exception 'Inactive profile submitted QC';
  exception when others then
    if sqlerrm <> 'Only Packing can submit QC photos' then raise; end if;
  end;
  begin
    perform public.update_replacement_details('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'ATTACK', null, null, 'Attack', 1, null, null, null);
    raise exception 'Inactive profile edited a replacement';
  exception when others then
    if sqlerrm <> 'Only customer_support can edit replacement details' then raise; end if;
  end;
  begin
    perform public.admin_override_replacement('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'CANCELLED', 'unauthorized override');
    raise exception 'Inactive profile used the admin override';
  exception when others then
    if sqlerrm <> 'Admin access required' then raise; end if;
  end;
  begin
    perform public.archive_completed_replacements();
    raise exception 'Inactive profile archived replacements';
  exception when others then
    if sqlerrm <> 'Administrator access required' then raise; end if;
  end;
end
$$;
SQL

echo "TBC_KART PostgreSQL integration test passed."
