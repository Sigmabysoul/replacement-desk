-- =============================================================================
-- TBC_KART - Complete Database Schema & Initialization
-- Compatible with Supabase PostgreSQL (PostgREST, Auth, Storage, Realtime)
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. Custom Types & Enums
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('customer_support', 'LOGISTICS', 'PRINTING', 'PACKING', 'ADMIN');
  end if;
  if not exists (select 1 from pg_type where typname = 'replacement_status') then
    create type public.replacement_status as enum (
      'NEW', 'LABEL_UPLOADED', 'LABEL_PRINTED', 'QC_PENDING',
      'QC_REJECTED', 'QC_APPROVED', 'PACKED', 'SHIPPED', 'NEEDS_TOKEN', 'CANCELLED'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'attachment_type') then
    create type public.attachment_type as enum ('CUSTOMER_PHOTO', 'LABEL', 'PROOF_PHOTO', 'QC_PHOTO', 'OTHER');
  end if;
  if not exists (select 1 from pg_type where typname = 'qc_decision') then
    create type public.qc_decision as enum ('PENDING', 'APPROVED', 'REJECTED');
  end if;
  if not exists (select 1 from pg_type where typname = 'notification_status') then
    create type public.notification_status as enum ('SENT', 'FAILED');
  end if;
end;
$$;

-- Ensure enum values exist if type was created previously with older subset
alter type public.app_role add value if not exists 'LOGISTICS' after 'PACKING';
alter type public.replacement_status add value if not exists 'LABEL_UPLOADED' after 'NEW';
alter type public.attachment_type add value if not exists 'PROOF_PHOTO' after 'LABEL';

-- -----------------------------------------------------------------------------
-- 2. Core Tables
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 120),
  role public.app_role not null default 'PRINTING',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.replacement_sequences (
  year integer primary key check (year between 2000 and 9999),
  last_value integer not null check (last_value between 1 and 9999)
);

create table if not exists public.replacements (
  id uuid primary key default gen_random_uuid(),
  replacement_number text not null unique,
  order_reference text not null check (char_length(order_reference) between 1 and 100),
  customer_name text check (customer_name is null or char_length(customer_name) <= 120),
  customer_reference text check (customer_reference is null or char_length(customer_reference) <= 100),
  product_name text not null check (char_length(product_name) between 1 and 200),
  quantity integer not null check (quantity between 1 and 999),
  reason text check (reason is null or char_length(reason) <= 200),
  notes text check (notes is null or char_length(notes) <= 2000),
  tracking_url text check (tracking_url is null or tracking_url ~* '^https?://[^[:space:]]+$'),
  status public.replacement_status not null default 'NEW',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  label_printed_at timestamptz,
  qc_submitted_at timestamptz,
  qc_approved_at timestamptz,
  packed_at timestamptz,
  shipped_at timestamptz,
  needs_token_at timestamptz,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id)
);

create index if not exists replacements_status_created_idx on public.replacements(status, created_at desc);
create index if not exists replacements_order_reference_idx on public.replacements(order_reference);
create index if not exists replacements_product_name_idx on public.replacements(product_name);
create index if not exists replacements_archived_created_idx on public.replacements(archived_at, created_at desc);

create table if not exists public.qc_submissions (
  id uuid primary key default gen_random_uuid(),
  replacement_id uuid not null references public.replacements(id) on delete cascade,
  submission_number integer not null check (submission_number > 0),
  submitted_by uuid not null references public.profiles(id),
  submitted_at timestamptz not null default now(),
  decision public.qc_decision not null default 'PENDING',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 1000),
  unique(replacement_id, submission_number)
);

create index if not exists qc_submissions_replacement_idx on public.qc_submissions(replacement_id, submission_number desc);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  replacement_id uuid not null references public.replacements(id) on delete cascade,
  qc_submission_id uuid references public.qc_submissions(id) on delete cascade,
  attachment_type public.attachment_type not null,
  storage_path text not null unique check (storage_path like 'replacements/%'),
  file_name text not null check (char_length(file_name) between 1 and 100),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check ((attachment_type = 'QC_PHOTO' and qc_submission_id is not null and mime_type <> 'application/pdf') or (attachment_type <> 'QC_PHOTO' and qc_submission_id is null))
);

create index if not exists attachments_replacement_idx on public.attachments(replacement_id, created_at);
create index if not exists attachments_qc_submission_idx on public.attachments(qc_submission_id) where qc_submission_id is not null;

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  replacement_id uuid not null references public.replacements(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  action text not null check (char_length(action) between 1 and 80),
  message text check (message is null or char_length(message) <= 1000),
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_replacement_idx on public.activity_logs(replacement_id, created_at desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  replacement_id uuid not null references public.replacements(id) on delete cascade,
  channel text not null check (channel = 'TELEGRAM'),
  type text not null check (char_length(type) between 1 and 80),
  status public.notification_status not null,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists notifications_replacement_idx on public.notifications(replacement_id, created_at desc);
create index if not exists notifications_failed_idx on public.notifications(status, created_at desc) where status = 'FAILED';

-- -----------------------------------------------------------------------------
-- 3. Automatic Triggers
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();

drop trigger if exists replacements_set_updated_at on public.replacements;
create trigger replacements_set_updated_at before update on public.replacements for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    'PRINTING'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.assign_replacement_number()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  number_year integer := extract(year from now())::integer;
  number_sequence integer;
begin
  insert into public.replacement_sequences(year, last_value) values (number_year, 1)
  on conflict (year) do update set last_value = public.replacement_sequences.last_value + 1
  returning last_value into number_sequence;
  if number_sequence > 9999 then raise exception 'Annual replacement number limit reached'; end if;
  new.replacement_number := format('REP-%s-%s', number_year, lpad(number_sequence::text, 4, '0'));
  return new;
end;
$$;

drop trigger if exists replacements_assign_number on public.replacements;
create trigger replacements_assign_number before insert on public.replacements for each row execute function public.assign_replacement_number();

create or replace function public.log_replacement_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.activity_logs(replacement_id, actor_id, action) values (new.id, new.created_by, 'REPLACEMENT_CREATED');
  return new;
end;
$$;

drop trigger if exists replacements_log_created on public.replacements;
create trigger replacements_log_created after insert on public.replacements for each row execute function public.log_replacement_created();

-- -----------------------------------------------------------------------------
-- 4. Row-Level Security (RLS)
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.replacements enable row level security;
alter table public.qc_submissions enable row level security;
alter table public.attachments enable row level security;
alter table public.activity_logs enable row level security;
alter table public.notifications enable row level security;

create or replace function public.current_active_role()
returns public.app_role language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid() and active = true
$$;

drop policy if exists "active users can view profiles" on public.profiles;
create policy "active users can view profiles" on public.profiles for select to authenticated using (public.current_active_role() is not null);

drop policy if exists "active users can view replacements" on public.replacements;
create policy "active users can view replacements" on public.replacements for select to authenticated using (public.current_active_role() is not null);

drop policy if exists "customer_support and admin can create replacements" on public.replacements;
create policy "customer_support and admin can create replacements" on public.replacements for insert to authenticated with check (
  public.current_active_role() in ('customer_support', 'ADMIN') and created_by = auth.uid() and status = 'NEW'
);

drop policy if exists "active users can view qc" on public.qc_submissions;
create policy "active users can view qc" on public.qc_submissions for select to authenticated using (public.current_active_role() is not null);

drop policy if exists "active users can view attachments" on public.attachments;
create policy "active users can view attachments" on public.attachments for select to authenticated using (public.current_active_role() is not null);

drop policy if exists "active users can view activity" on public.activity_logs;
create policy "active users can view activity" on public.activity_logs for select to authenticated using (public.current_active_role() is not null);

drop policy if exists "admins can view notifications" on public.notifications;
create policy "admins can view notifications" on public.notifications for select to authenticated using (public.current_active_role() = 'ADMIN');

-- -----------------------------------------------------------------------------
-- 5. Storage Bucket & Policies
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('replacement-files', 'replacement-files', false, 26214400, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "active users can read replacement files" on storage.objects;
create policy "active users can read replacement files" on storage.objects for select to authenticated using (
  bucket_id = 'replacement-files' and public.current_active_role() is not null
);

drop policy if exists "authorized users can upload replacement files" on storage.objects;
create policy "authorized users can upload replacement files" on storage.objects for insert to authenticated with check (
  bucket_id = 'replacement-files' and
  name like 'replacements/%' and
  public.current_active_role() in ('customer_support', 'LOGISTICS', 'PACKING', 'ADMIN') and
  coalesce((metadata ->> 'size')::bigint, 0) <= 26214400
);

drop policy if exists "uploaders can remove failed uploads" on storage.objects;
create policy "uploaders can remove failed uploads" on storage.objects for delete to authenticated using (
  bucket_id = 'replacement-files' and owner_id = auth.uid()::text
);

-- -----------------------------------------------------------------------------
-- 6. RPC Functions
-- -----------------------------------------------------------------------------

-- Compatibility definition from the earlier workflow; the final handoff below replaces it.
create or replace function public.submit_logistics_package(
  p_replacement_id uuid,
  p_upload_id uuid,
  p_label_attachments jsonb,
  p_photo_attachments jsonb
)
returns public.replacements language plpgsql security definer set search_path = '' as $$
declare
  current_row public.replacements;
  actor_role public.app_role;
  label_count integer := 0;
  photo_count integer := 0;
begin
  select * into current_row from public.replacements where id = p_replacement_id for update;
  if not found then raise exception 'Replacement not found'; end if;

  select public.current_active_role() into actor_role;
  if actor_role is null or actor_role not in ('LOGISTICS', 'ADMIN') then
    raise exception 'Only Logistics can upload labels and product photos';
  end if;
  if current_row.status <> 'NEW' then
    raise exception 'Logistics files can only be uploaded for a new replacement';
  end if;
  if jsonb_typeof(p_label_attachments) is distinct from 'array' or jsonb_array_length(p_label_attachments) <> 1 then
    raise exception 'Exactly one shipping label is required';
  end if;
  if jsonb_typeof(p_photo_attachments) is distinct from 'array' or jsonb_array_length(p_photo_attachments) not between 1 and 12 then
    raise exception 'Between one and twelve product photos are required';
  end if;
  if (
    select count(*)
    from jsonb_to_recordset(p_label_attachments) as item(storage_path text)
    join storage.objects as stored
      on stored.bucket_id = 'replacement-files'
      and stored.name = item.storage_path
      and stored.owner_id = auth.uid()::text
  ) <> 1 then
    raise exception 'The label storage object was not uploaded by the current user';
  end if;
  if (
    select count(*)
    from jsonb_to_recordset(p_photo_attachments) as item(storage_path text)
    join storage.objects as stored
      on stored.bucket_id = 'replacement-files'
      and stored.name = item.storage_path
      and stored.owner_id = auth.uid()::text
  ) <> jsonb_array_length(p_photo_attachments) then
    raise exception 'Product photo storage objects were not uploaded by the current user';
  end if;

  insert into public.attachments(
    replacement_id, qc_submission_id, attachment_type, storage_path, file_name, mime_type, uploaded_by
  )
  select
    p_replacement_id, null, 'LABEL', item.storage_path, item.file_name, item.mime_type, auth.uid()
  from jsonb_to_recordset(p_label_attachments) as item(storage_path text, file_name text, mime_type text)
  where item.mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
    and item.storage_path like ('replacements/' || p_replacement_id || '/logistics/' || p_upload_id || '/labels/%');
  get diagnostics label_count = row_count;
  if label_count <> 1 then raise exception 'Invalid label metadata'; end if;

  insert into public.attachments(
    replacement_id, qc_submission_id, attachment_type, storage_path, file_name, mime_type, uploaded_by
  )
  select
    p_replacement_id, null, 'PROOF_PHOTO', item.storage_path, item.file_name, item.mime_type, auth.uid()
  from jsonb_to_recordset(p_photo_attachments) as item(storage_path text, file_name text, mime_type text)
  where item.mime_type in ('image/jpeg', 'image/png', 'image/webp')
    and item.storage_path like ('replacements/' || p_replacement_id || '/logistics/' || p_upload_id || '/photos/%');
  get diagnostics photo_count = row_count;
  if photo_count <> jsonb_array_length(p_photo_attachments) then
    raise exception 'Invalid product photo metadata';
  end if;

  update public.replacements set status = 'LABEL_UPLOADED' where id = p_replacement_id returning * into current_row;

  insert into public.activity_logs(replacement_id, actor_id, action, metadata)
  values (
    p_replacement_id,
    auth.uid(),
    'LOGISTICS_SUBMITTED',
    jsonb_build_object('upload_id', p_upload_id, 'label_count', label_count, 'photo_count', photo_count)
  );
  return current_row;
end;
$$;

-- Packing QC Submission: 1-12 QC photos -> QC_PENDING
create or replace function public.submit_packing_qc(
  p_replacement_id uuid,
  p_submission_id uuid,
  p_attachments jsonb
)
returns public.replacements language plpgsql security definer set search_path = '' as $$
declare
  current_row public.replacements;
  actor_role public.app_role;
  next_submission integer;
  attachment_count integer := 0;
begin
  select * into current_row from public.replacements where id = p_replacement_id for update;
  if not found then raise exception 'Replacement not found'; end if;

  select public.current_active_role() into actor_role;
  if actor_role is null or actor_role not in ('PACKING', 'ADMIN') then
    raise exception 'Only Packing can submit QC photos';
  end if;
  if current_row.status not in ('LABEL_PRINTED', 'QC_REJECTED') then
    raise exception 'QC can only be submitted after label printing or a rejection';
  end if;
  if jsonb_typeof(p_attachments) is distinct from 'array' or jsonb_array_length(p_attachments) not between 1 and 12 then
    raise exception 'Between one and twelve QC photos are required';
  end if;
  if not exists (
    select 1 from public.attachments attachment
    join storage.objects stored on stored.bucket_id = 'replacement-files' and stored.name = attachment.storage_path
    where attachment.replacement_id = p_replacement_id and attachment.attachment_type = 'LABEL'
  ) then
    raise exception 'A stored shipping label is required before QC';
  end if;
  if (
    select count(*)
    from jsonb_to_recordset(p_attachments) as item(storage_path text)
    join storage.objects as stored on stored.bucket_id = 'replacement-files' and stored.name = item.storage_path and stored.owner_id = auth.uid()::text
  ) <> jsonb_array_length(p_attachments) then
    raise exception 'QC photo storage objects were not uploaded by the current user';
  end if;

  select coalesce(max(submission_number), 0) + 1 into next_submission from public.qc_submissions where replacement_id = p_replacement_id;

  insert into public.qc_submissions(id, replacement_id, submission_number, submitted_by)
  values (p_submission_id, p_replacement_id, next_submission, auth.uid());

  insert into public.attachments(
    replacement_id, qc_submission_id, attachment_type, storage_path, file_name, mime_type, uploaded_by
  )
  select
    p_replacement_id, p_submission_id, 'QC_PHOTO', item.storage_path, item.file_name, item.mime_type, auth.uid()
  from jsonb_to_recordset(p_attachments) as item(storage_path text, file_name text, mime_type text)
  where item.mime_type in ('image/jpeg', 'image/png', 'image/webp')
    and item.storage_path like ('replacements/' || p_replacement_id || '/packing/' || p_submission_id || '/photos/%');
  get diagnostics attachment_count = row_count;
  if attachment_count <> jsonb_array_length(p_attachments) then raise exception 'Invalid QC photo metadata'; end if;

  update public.replacements set status = 'QC_PENDING', qc_submitted_at = now() where id = p_replacement_id returning * into current_row;

  insert into public.activity_logs(replacement_id, actor_id, action, metadata)
  values (
    p_replacement_id,
    auth.uid(),
    'QC_SUBMITTED',
    jsonb_build_object('submission_id', p_submission_id, 'submission_number', next_submission, 'attachment_count', attachment_count)
  );
  return current_row;
end;
$$;

-- Atomic Lifecycle Transitions
create or replace function public.transition_replacement(
  p_replacement_id uuid,
  p_target_status public.replacement_status,
  p_message text default null
)
returns public.replacements language plpgsql security definer set search_path = '' as $$
declare
  current_row public.replacements;
  actor_role public.app_role;
  action_name text;
  previous_status public.replacement_status;
begin
  select * into current_row from public.replacements where id = p_replacement_id for update;
  if not found then raise exception 'Replacement not found'; end if;
  previous_status := current_row.status;
  select public.current_active_role() into actor_role;
  if actor_role is null then raise exception 'Active account required'; end if;

  if p_target_status = 'LABEL_PRINTED'
    and not (current_row.status = 'LABEL_UPLOADED' and actor_role in ('PRINTING', 'ADMIN'))
    then raise exception 'Only Printing can mark an uploaded label as printed';
  elsif p_target_status in ('QC_APPROVED', 'QC_REJECTED')
    and not (current_row.status = 'QC_PENDING' and actor_role in ('customer_support', 'ADMIN'))
    then raise exception 'Only customer_support can review pending QC';
  elsif p_target_status = 'PACKED'
    and not (current_row.status = 'QC_APPROVED' and actor_role in ('PACKING', 'ADMIN'))
    then raise exception 'QC must be approved before Packing packs the order';
  elsif p_target_status = 'SHIPPED'
    and not (current_row.status in ('PACKED', 'NEEDS_TOKEN') and actor_role in ('PACKING', 'ADMIN'))
    then raise exception 'Only Packing can mark a packed replacement as shipped';
  elsif p_target_status = 'NEEDS_TOKEN'
    and not (current_row.status = 'PACKED' and actor_role in ('PACKING', 'ADMIN'))
    then raise exception 'Only Packing can mark a packed replacement as needing a token';
  elsif p_target_status = 'CANCELLED'
    and not (current_row.status not in ('SHIPPED', 'CANCELLED') and actor_role = 'ADMIN')
    then raise exception 'Only Admin can cancel an open replacement';
  elsif p_target_status not in ('LABEL_PRINTED', 'QC_APPROVED', 'QC_REJECTED', 'PACKED', 'SHIPPED', 'NEEDS_TOKEN', 'CANCELLED')
    then raise exception 'Unsupported transition';
  end if;

  if p_target_status = 'QC_REJECTED' and nullif(trim(p_message), '') is null then
    raise exception 'A rejection reason is required';
  end if;

  if p_target_status in ('QC_APPROVED', 'QC_REJECTED') then
    update public.qc_submissions set
      decision = case when p_target_status = 'QC_APPROVED' then 'APPROVED'::public.qc_decision else 'REJECTED'::public.qc_decision end,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      rejection_reason = case when p_target_status = 'QC_REJECTED' then trim(p_message) else null end
    where id = (
      select id from public.qc_submissions
      where replacement_id = p_replacement_id and decision = 'PENDING'
      order by submission_number desc limit 1
    );
    if not found then raise exception 'Pending QC submission not found'; end if;
  end if;

  update public.replacements set
    status = p_target_status,
    label_printed_at = case when p_target_status = 'LABEL_PRINTED' then now() else label_printed_at end,
    qc_approved_at = case when p_target_status = 'QC_APPROVED' then now() else qc_approved_at end,
    packed_at = case when p_target_status = 'PACKED' then now() else packed_at end,
    shipped_at = case when p_target_status = 'SHIPPED' then now() else shipped_at end,
    needs_token_at = case when p_target_status = 'NEEDS_TOKEN' then now() else needs_token_at end
  where id = p_replacement_id
  returning * into current_row;

  action_name := case p_target_status when 'CANCELLED' then 'CANCELLED' else p_target_status::text end;
  insert into public.activity_logs(replacement_id, actor_id, action, message, metadata)
  values (
    p_replacement_id,
    auth.uid(),
    action_name,
    nullif(trim(p_message), ''),
    jsonb_build_object('from_status', previous_status, 'to_status', p_target_status)
  );
  return current_row;
end;
$$;

-- Edit Replacement Details (customer_support / Admin)
create or replace function public.update_replacement_details(
  p_replacement_id uuid,
  p_order_reference text,
  p_customer_name text,
  p_customer_reference text,
  p_product_name text,
  p_quantity integer,
  p_reason text,
  p_notes text,
  p_tracking_url text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  actor_role public.app_role;
  clean_tracking_url text := nullif(trim(p_tracking_url), '');
begin
  select public.current_active_role() into actor_role;
  if actor_role is null or actor_role not in ('customer_support', 'ADMIN') then
    raise exception 'Only customer_support can edit replacement details';
  end if;
  if nullif(trim(p_order_reference), '') is null
    or nullif(trim(p_product_name), '') is null
    or p_quantity not between 1 and 999 then
    raise exception 'Invalid replacement details';
  end if;
  if clean_tracking_url is not null and clean_tracking_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'Tracking link must begin with http:// or https://';
  end if;

  update public.replacements
  set order_reference = trim(p_order_reference),
      customer_name = nullif(trim(p_customer_name), ''),
      customer_reference = nullif(trim(p_customer_reference), ''),
      product_name = trim(p_product_name),
      quantity = p_quantity,
      reason = nullif(trim(p_reason), ''),
      notes = nullif(trim(p_notes), ''),
      tracking_url = clean_tracking_url
  where id = p_replacement_id and status not in ('SHIPPED', 'CANCELLED');
  if not found then raise exception 'Open replacement not found'; end if;

  insert into public.activity_logs(replacement_id, actor_id, action, metadata)
  values (
    p_replacement_id,
    auth.uid(),
    'REPLACEMENT_UPDATED',
    jsonb_build_object('has_tracking_link', clean_tracking_url is not null)
  );
end;
$$;

-- Admin Emergency Status Override
create or replace function public.admin_override_replacement(
  p_replacement_id uuid,
  p_target_status public.replacement_status,
  p_reason text
)
returns public.replacements language plpgsql security definer set search_path = '' as $$
declare
  current_row public.replacements;
  previous_status public.replacement_status;
begin
  if public.current_active_role() is distinct from 'ADMIN'::public.app_role then
    raise exception 'Admin access required';
  end if;
  if nullif(trim(p_reason), '') is null or char_length(trim(p_reason)) > 1000 then
    raise exception 'Override reason is required';
  end if;
  select * into current_row from public.replacements where id = p_replacement_id for update;
  if not found then raise exception 'Replacement not found'; end if;
  previous_status := current_row.status;

  update public.replacements set
    status = p_target_status,
    label_printed_at = case when p_target_status = 'LABEL_PRINTED' then coalesce(label_printed_at, now()) else label_printed_at end,
    qc_submitted_at = case when p_target_status = 'QC_PENDING' then coalesce(qc_submitted_at, now()) else qc_submitted_at end,
    qc_approved_at = case when p_target_status = 'QC_APPROVED' then coalesce(qc_approved_at, now()) else qc_approved_at end,
    packed_at = case when p_target_status = 'PACKED' then coalesce(packed_at, now()) else packed_at end,
    shipped_at = case when p_target_status = 'SHIPPED' then coalesce(shipped_at, now()) else shipped_at end,
    needs_token_at = case when p_target_status = 'NEEDS_TOKEN' then coalesce(needs_token_at, now()) else needs_token_at end
  where id = p_replacement_id
  returning * into current_row;

  insert into public.activity_logs(replacement_id, actor_id, action, message, metadata)
  values (
    p_replacement_id,
    auth.uid(),
    'ADMIN_STATUS_OVERRIDE',
    trim(p_reason),
    jsonb_build_object('from_status', previous_status, 'to_status', p_target_status)
  );
  return current_row;
end;
$$;

-- Archive Completed Replacements Older than 30 Days (Admin)
create or replace function public.archive_completed_replacements()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  archived_count integer;
begin
  if public.current_active_role() is distinct from 'ADMIN'::public.app_role then
    raise exception 'Administrator access required';
  end if;

  with archived as (
    update public.replacements
    set archived_at = now(), archived_by = auth.uid()
    where archived_at is null
      and status in ('SHIPPED', 'CANCELLED')
      and created_at < now() - interval '30 days'
    returning id
  )
  insert into public.activity_logs(replacement_id, actor_id, action, message)
  select id, auth.uid(), 'ORDER_ARCHIVED', 'Archived after 30 days in a completed status'
  from archived;

  get diagnostics archived_count = row_count;
  return archived_count;
end;
$$;

-- Add Order Comment (Any Active Role)
create or replace function public.add_replacement_comment(p_replacement_id uuid, p_message text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.current_active_role() is null then raise exception 'Active account required'; end if;
  if nullif(trim(p_message), '') is null or char_length(trim(p_message)) > 1000 then raise exception 'Comment must be between 1 and 1000 characters'; end if;
  if not exists (select 1 from public.replacements where id = p_replacement_id) then raise exception 'Replacement not found'; end if;
  insert into public.activity_logs(replacement_id, actor_id, action, message) values (p_replacement_id, auth.uid(), 'COMMENT_ADDED', trim(p_message));
end;
$$;

-- Drop deprecated/interim functions safely
drop function if exists public.submit_logistics_label(uuid, uuid, jsonb);
drop function if exists public.submit_qc(uuid, uuid, jsonb);

-- Final creation handoff: customer_support supplies product photos and Logistics supplies only the label.
create or replace function public.create_replacement_with_photos(
  p_replacement_id uuid, p_upload_id uuid, p_order_reference text,
  p_customer_name text, p_customer_reference text, p_product_name text,
  p_quantity integer, p_reason text, p_notes text, p_tracking_url text,
  p_attachments jsonb
)
returns public.replacements language plpgsql security definer set search_path = '' as $$
declare
  created_row public.replacements;
  actor_role public.app_role;
  attachment_count integer := 0;
begin
  select public.current_active_role() into actor_role;
  if actor_role is null or actor_role not in ('customer_support', 'ADMIN') then
    raise exception 'Only customer_support can create replacement orders';
  end if;
  if jsonb_typeof(p_attachments) is distinct from 'array'
    or jsonb_array_length(p_attachments) not between 1 and 12 then
    raise exception 'Between one and twelve product photos are required';
  end if;
  if (
    select count(*)
    from jsonb_to_recordset(p_attachments) as item(storage_path text)
    join storage.objects as stored on stored.bucket_id = 'replacement-files'
      and stored.name = item.storage_path and stored.owner_id = auth.uid()::text
  ) <> jsonb_array_length(p_attachments) then
    raise exception 'Product photo storage objects were not uploaded by the current user';
  end if;

  insert into public.replacements(
    id, replacement_number, order_reference, customer_name, customer_reference,
    product_name, quantity, reason, notes, tracking_url, status, created_by
  ) values (
    p_replacement_id, 'assigned-by-trigger', p_order_reference, p_customer_name,
    p_customer_reference, p_product_name, p_quantity, p_reason, p_notes,
    p_tracking_url, 'NEW', auth.uid()
  ) returning * into created_row;

  insert into public.attachments(
    replacement_id, qc_submission_id, attachment_type, storage_path, file_name, mime_type, uploaded_by
  )
  select p_replacement_id, null, 'PROOF_PHOTO', item.storage_path, item.file_name, item.mime_type, auth.uid()
  from jsonb_to_recordset(p_attachments) as item(storage_path text, file_name text, mime_type text)
  where item.mime_type in ('image/jpeg', 'image/png', 'image/webp')
    and item.storage_path like ('replacements/' || p_replacement_id || '/customer_support/' || p_upload_id || '/photos/%');
  get diagnostics attachment_count = row_count;
  if attachment_count <> jsonb_array_length(p_attachments) then
    raise exception 'Invalid product photo metadata';
  end if;
  return created_row;
end;
$$;

create or replace function public.submit_logistics_label(
  p_replacement_id uuid, p_upload_id uuid, p_attachments jsonb
)
returns public.replacements language plpgsql security definer set search_path = '' as $$
declare
  current_row public.replacements;
  actor_role public.app_role;
  attachment_count integer := 0;
begin
  select * into current_row from public.replacements where id = p_replacement_id for update;
  if not found then raise exception 'Replacement not found'; end if;
  select public.current_active_role() into actor_role;
  if actor_role is null or actor_role not in ('LOGISTICS', 'ADMIN') then
    raise exception 'Only Logistics can upload the shipping label';
  end if;
  if current_row.status <> 'NEW' then
    raise exception 'A label can only be uploaded for a new replacement';
  end if;
  if jsonb_typeof(p_attachments) is distinct from 'array' or jsonb_array_length(p_attachments) <> 1 then
    raise exception 'Exactly one shipping label is required';
  end if;
  if (
    select count(*)
    from jsonb_to_recordset(p_attachments) as item(storage_path text)
    join storage.objects as stored on stored.bucket_id = 'replacement-files'
      and stored.name = item.storage_path and stored.owner_id = auth.uid()::text
  ) <> 1 then
    raise exception 'The label storage object was not uploaded by the current user';
  end if;

  insert into public.attachments(
    replacement_id, qc_submission_id, attachment_type, storage_path, file_name, mime_type, uploaded_by
  )
  select p_replacement_id, null, 'LABEL', item.storage_path, item.file_name, item.mime_type, auth.uid()
  from jsonb_to_recordset(p_attachments) as item(storage_path text, file_name text, mime_type text)
  where item.mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
    and item.storage_path like ('replacements/' || p_replacement_id || '/logistics/' || p_upload_id || '/labels/%');
  get diagnostics attachment_count = row_count;
  if attachment_count <> 1 then raise exception 'Invalid label metadata'; end if;

  update public.replacements set status = 'LABEL_UPLOADED'
  where id = p_replacement_id returning * into current_row;
  insert into public.activity_logs(replacement_id, actor_id, action, metadata)
  values (
    p_replacement_id, auth.uid(), 'LOGISTICS_SUBMITTED',
    jsonb_build_object('upload_id', p_upload_id, 'attachment_count', attachment_count)
  );
  return current_row;
end;
$$;

drop function if exists public.submit_logistics_package(uuid, uuid, jsonb, jsonb);

-- -----------------------------------------------------------------------------
-- 7. Permissions & Grants
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to postgres, anon, authenticated, service_role;
grant all on all sequences in schema public to postgres, anon, authenticated, service_role;
grant all on all routines in schema public to postgres, anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on routines to postgres, anon, authenticated, service_role;

-- Enforce explicit write restrictions
revoke insert, update, delete on public.activity_logs from authenticated;
revoke insert, update, delete on public.qc_submissions from authenticated;
revoke update, delete on public.replacements from authenticated;
revoke insert on public.replacements from authenticated;
revoke all on public.replacement_sequences from authenticated;
revoke insert, update, delete on public.notifications from authenticated;
revoke insert, update, delete on all tables in schema public from anon;

-- Operational RPC execution grants
revoke all on function public.create_replacement_with_photos(uuid, uuid, text, text, text, text, integer, text, text, text, jsonb) from public, anon;
grant execute on function public.create_replacement_with_photos(uuid, uuid, text, text, text, text, integer, text, text, text, jsonb) to authenticated;

revoke all on function public.submit_logistics_label(uuid, uuid, jsonb) from public, anon;
grant execute on function public.submit_logistics_label(uuid, uuid, jsonb) to authenticated;

revoke all on function public.submit_packing_qc(uuid, uuid, jsonb) from public;
grant execute on function public.submit_packing_qc(uuid, uuid, jsonb) to authenticated;

revoke all on function public.transition_replacement(uuid, public.replacement_status, text) from public;
grant execute on function public.transition_replacement(uuid, public.replacement_status, text) to authenticated;

revoke all on function public.update_replacement_details(uuid, text, text, text, text, integer, text, text, text) from public;
grant execute on function public.update_replacement_details(uuid, text, text, text, text, integer, text, text, text) to authenticated;

revoke all on function public.admin_override_replacement(uuid, public.replacement_status, text) from public;
grant execute on function public.admin_override_replacement(uuid, public.replacement_status, text) to authenticated;

revoke all on function public.archive_completed_replacements() from public;
grant execute on function public.archive_completed_replacements() to authenticated;

revoke all on function public.add_replacement_comment(uuid, text) from public;
grant execute on function public.add_replacement_comment(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Realtime Configuration
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'replacements') then
    alter publication supabase_realtime add table public.replacements;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'qc_submissions') then
    alter publication supabase_realtime add table public.qc_submissions;
  end if;
end;
$$;

-- Refresh PostgREST schema cache
notify pgrst, 'reload schema';
-- Adds offline orders, customer delivery details, reusable dimensions, batch creation,
-- and Logistics-owned tracking links without changing the established QC workflow.

create sequence if not exists public.order_number_sequence start with 501;

alter table public.replacements
  add column if not exists order_number bigint,
  add column if not exists order_type text not null default 'REPLACEMENT'
    check (order_type in ('REPLACEMENT', 'OFFLINE')),
  add column if not exists order_group_id uuid,
  add column if not exists customer_address text
    check (customer_address is null or char_length(customer_address) <= 1000),
  add column if not exists customer_email text
    check (customer_email is null or char_length(customer_email) <= 254),
  add column if not exists customer_phone text
    check (customer_phone is null or char_length(customer_phone) <= 40),
  add column if not exists shipping_speed text not null default 'STANDARD'
    check (shipping_speed in ('STANDARD', 'EXPRESS')),
  add column if not exists length_cm numeric(10,2),
  add column if not exists breadth_cm numeric(10,2),
  add column if not exists height_cm numeric(10,2);

update public.replacements
set order_number = nextval('public.order_number_sequence')
where order_number is null;

alter table public.replacements
  alter column order_number set default nextval('public.order_number_sequence'),
  alter column order_number set not null;

create unique index if not exists replacements_order_number_idx
  on public.replacements(order_number);
create index if not exists replacements_order_group_idx
  on public.replacements(order_group_id) where order_group_id is not null;

create table if not exists public.dimension_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 100),
  length_cm numeric(10,2) not null check (length_cm > 0 and length_cm <= 10000),
  breadth_cm numeric(10,2) not null check (breadth_cm > 0 and breadth_cm <= 10000),
  height_cm numeric(10,2) not null check (height_cm > 0 and height_cm <= 10000),
  active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists dimension_presets_name_active_idx
  on public.dimension_presets(lower(name)) where active = true;

drop trigger if exists dimension_presets_set_updated_at on public.dimension_presets;
create trigger dimension_presets_set_updated_at
before update on public.dimension_presets
for each row execute function public.set_updated_at();

alter table public.replacements
  add column if not exists dimension_preset_id uuid references public.dimension_presets(id) on delete set null;

alter table public.dimension_presets enable row level security;
drop policy if exists "active users can view dimension presets" on public.dimension_presets;
create policy "active users can view dimension presets" on public.dimension_presets
for select to authenticated using (public.current_active_role() is not null);
drop policy if exists "support can create dimension presets" on public.dimension_presets;
create policy "support can create dimension presets" on public.dimension_presets
for insert to authenticated with check (
  public.current_active_role() in ('customer_support', 'ADMIN') and created_by = auth.uid()
);
drop policy if exists "support can update dimension presets" on public.dimension_presets;
create policy "support can update dimension presets" on public.dimension_presets
for update to authenticated using (public.current_active_role() in ('customer_support', 'ADMIN'))
with check (public.current_active_role() in ('customer_support', 'ADMIN'));

grant select, insert, update on public.dimension_presets to authenticated;
revoke delete on public.dimension_presets from authenticated;
grant usage, select on sequence public.order_number_sequence to authenticated;

create or replace function public.enforce_logistics_tracking_owner()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.tracking_url is distinct from old.tracking_url
    and new.tracking_url is not null
    and public.current_active_role() not in ('LOGISTICS', 'ADMIN') then
    raise exception 'Tracking links can only be added by Logistics';
  end if;
  return new;
end;
$$;
drop trigger if exists replacements_enforce_tracking_owner on public.replacements;
create trigger replacements_enforce_tracking_owner
before update of tracking_url on public.replacements
for each row execute function public.enforce_logistics_tracking_owner();

create or replace function public.enforce_logistics_tracking_insert()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.tracking_url is not null and public.current_active_role() not in ('LOGISTICS', 'ADMIN') then
    raise exception 'Tracking links can only be added by Logistics';
  end if;
  return new;
end;
$$;
drop trigger if exists replacements_enforce_tracking_insert on public.replacements;
create trigger replacements_enforce_tracking_insert
before insert on public.replacements
for each row execute function public.enforce_logistics_tracking_insert();

create or replace function public.create_order_batch(
  p_group_id uuid,
  p_orders jsonb,
  p_attachments jsonb
)
returns setof public.replacements
language plpgsql security definer set search_path = '' as $$
declare
  actor_role public.app_role;
  order_item jsonb;
  order_id uuid;
  order_type text;
  created_row public.replacements;
  attachment_count integer;
  expected_count integer;
begin
  select public.current_active_role() into actor_role;
  if actor_role is null or actor_role not in ('customer_support', 'ADMIN') then
    raise exception 'Only customer support can create orders';
  end if;
  if jsonb_typeof(p_orders) is distinct from 'array'
    or jsonb_array_length(p_orders) not between 1 and 20 then
    raise exception 'Create between one and twenty orders at a time';
  end if;
  if jsonb_typeof(p_attachments) is distinct from 'array' then
    raise exception 'Invalid product photo metadata';
  end if;

  for order_item in select value from jsonb_array_elements(p_orders)
  loop
    order_id := (order_item ->> 'id')::uuid;
    order_type := order_item ->> 'order_type';
    if order_type not in ('REPLACEMENT', 'OFFLINE') then raise exception 'Invalid order type'; end if;
    if nullif(trim(order_item ->> 'order_reference'), '') is null then raise exception 'Order reference is required'; end if;
    if nullif(trim(order_item ->> 'product_name'), '') is null then raise exception 'Product is required'; end if;
    if coalesce((order_item ->> 'quantity')::integer, 0) not between 1 and 999 then raise exception 'Invalid quantity'; end if;
    if order_type = 'REPLACEMENT' and (
      coalesce((order_item ->> 'length_cm')::numeric, 0) <= 0 or
      coalesce((order_item ->> 'breadth_cm')::numeric, 0) <= 0 or
      coalesce((order_item ->> 'height_cm')::numeric, 0) <= 0
    ) then raise exception 'Replacement dimensions are required'; end if;

    expected_count := (
      select count(*) from jsonb_array_elements(p_attachments) attachment
      where attachment ->> 'replacement_id' = order_id::text
    );
    if expected_count not between 1 and 12 then
      raise exception 'Between one and twelve product photos are required for every order';
    end if;
    if (
      select count(*)
      from jsonb_to_recordset(p_attachments) as item(replacement_id uuid, storage_path text)
      join storage.objects stored on stored.bucket_id = 'replacement-files'
        and stored.name = item.storage_path and stored.owner_id = auth.uid()::text
      where item.replacement_id = order_id
    ) <> expected_count then
      raise exception 'Product photo storage objects were not uploaded by the current user';
    end if;

    insert into public.replacements(
      id, replacement_number, order_type, order_group_id, order_reference,
      customer_name, customer_reference, customer_address, customer_email, customer_phone,
      product_name, quantity, reason, notes, shipping_speed, dimension_preset_id,
      length_cm, breadth_cm, height_cm, status, created_by
    ) values (
      order_id, 'assigned-by-trigger', order_type, p_group_id,
      trim(order_item ->> 'order_reference'), nullif(trim(order_item ->> 'customer_name'), ''),
      nullif(trim(order_item ->> 'customer_reference'), ''), nullif(trim(order_item ->> 'customer_address'), ''),
      lower(nullif(trim(order_item ->> 'customer_email'), '')), nullif(trim(order_item ->> 'customer_phone'), ''),
      trim(order_item ->> 'product_name'), (order_item ->> 'quantity')::integer,
      nullif(trim(order_item ->> 'reason'), ''), nullif(trim(order_item ->> 'notes'), ''),
      coalesce(nullif(order_item ->> 'shipping_speed', ''), 'STANDARD'),
      nullif(order_item ->> 'dimension_preset_id', '')::uuid,
      case when order_type = 'REPLACEMENT' then (order_item ->> 'length_cm')::numeric else null end,
      case when order_type = 'REPLACEMENT' then (order_item ->> 'breadth_cm')::numeric else null end,
      case when order_type = 'REPLACEMENT' then (order_item ->> 'height_cm')::numeric else null end,
      'NEW', auth.uid()
    ) returning * into created_row;

    insert into public.attachments(
      replacement_id, qc_submission_id, attachment_type, storage_path, file_name, mime_type, uploaded_by
    )
    select order_id, null, 'PROOF_PHOTO', item.storage_path, item.file_name, item.mime_type, auth.uid()
    from jsonb_to_recordset(p_attachments) as item(
      replacement_id uuid, storage_path text, file_name text, mime_type text
    )
    where item.replacement_id = order_id
      and item.mime_type in ('image/jpeg', 'image/png', 'image/webp')
      and item.storage_path like ('replacements/' || order_id || '/customer_support/%/photos/%');
    get diagnostics attachment_count = row_count;
    if attachment_count <> expected_count then raise exception 'Invalid product photo metadata'; end if;

    return next created_row;
  end loop;
end;
$$;

revoke all on function public.create_order_batch(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.create_order_batch(uuid, jsonb, jsonb) to authenticated;

-- Tracking is entered at the Logistics handoff, not by Customer Support.
create or replace function public.submit_logistics_label(
  p_replacement_id uuid,
  p_upload_id uuid,
  p_tracking_url text,
  p_attachments jsonb
)
returns public.replacements language plpgsql security definer set search_path = '' as $$
declare
  current_row public.replacements;
  actor_role public.app_role;
  attachment_count integer := 0;
  clean_tracking_url text := nullif(trim(p_tracking_url), '');
begin
  select * into current_row from public.replacements where id = p_replacement_id for update;
  if not found then raise exception 'Order not found'; end if;
  select public.current_active_role() into actor_role;
  if actor_role is null or actor_role not in ('LOGISTICS', 'ADMIN') then raise exception 'Only Logistics can upload the shipping label'; end if;
  if current_row.status <> 'NEW' then raise exception 'A label can only be uploaded for a new order'; end if;
  if clean_tracking_url is not null and clean_tracking_url !~* '^https?://[^[:space:]]+$' then raise exception 'Tracking link must begin with http:// or https://'; end if;
  if jsonb_typeof(p_attachments) is distinct from 'array' or jsonb_array_length(p_attachments) <> 1 then raise exception 'Exactly one shipping label is required'; end if;
  if (select count(*) from jsonb_to_recordset(p_attachments) item(storage_path text)
      join storage.objects stored on stored.bucket_id = 'replacement-files' and stored.name = item.storage_path and stored.owner_id = auth.uid()::text) <> 1
  then raise exception 'The label storage object was not uploaded by the current user'; end if;

  insert into public.attachments(replacement_id, qc_submission_id, attachment_type, storage_path, file_name, mime_type, uploaded_by)
  select p_replacement_id, null, 'LABEL', item.storage_path, item.file_name, item.mime_type, auth.uid()
  from jsonb_to_recordset(p_attachments) item(storage_path text, file_name text, mime_type text)
  where item.mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
    and item.storage_path like ('replacements/' || p_replacement_id || '/logistics/' || p_upload_id || '/labels/%');
  get diagnostics attachment_count = row_count;
  if attachment_count <> 1 then raise exception 'Invalid label metadata'; end if;

  update public.replacements set status = 'LABEL_UPLOADED', tracking_url = clean_tracking_url
  where id = p_replacement_id returning * into current_row;
  insert into public.activity_logs(replacement_id, actor_id, action, metadata)
  values (p_replacement_id, auth.uid(), 'LOGISTICS_SUBMITTED', jsonb_build_object(
    'upload_id', p_upload_id, 'attachment_count', attachment_count, 'has_tracking_link', clean_tracking_url is not null
  ));
  return current_row;
end;
$$;

revoke all on function public.submit_logistics_label(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.submit_logistics_label(uuid, uuid, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
