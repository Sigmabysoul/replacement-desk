-- TBC_KART core schema. Apply with `supabase db push` or in the SQL editor.
create extension if not exists pgcrypto;

create type public.app_role as enum ('CUSTOMER_SUPPORT', 'PRINTING', 'PACKING', 'ADMIN');
create type public.replacement_status as enum ('NEW', 'LABEL_PRINTED', 'QC_PENDING', 'QC_REJECTED', 'QC_APPROVED', 'PACKED', 'SHIPPED', 'NEEDS_TOKEN', 'CANCELLED');
create type public.attachment_type as enum ('CUSTOMER_PHOTO', 'LABEL', 'QC_PHOTO', 'OTHER');
create type public.qc_decision as enum ('PENDING', 'APPROVED', 'REJECTED');
create type public.notification_status as enum ('SENT', 'FAILED');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 120),
  role public.app_role not null default 'PACKING',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.replacement_sequences (
  year integer primary key check (year between 2000 and 9999),
  last_value integer not null check (last_value between 1 and 9999)
);

create table public.replacements (
  id uuid primary key default gen_random_uuid(),
  replacement_number text not null unique,
  order_reference text not null check (char_length(order_reference) between 1 and 100),
  customer_name text check (customer_name is null or char_length(customer_name) <= 120),
  customer_reference text check (customer_reference is null or char_length(customer_reference) <= 100),
  product_name text not null check (char_length(product_name) between 1 and 200),
  quantity integer not null check (quantity between 1 and 999),
  reason text check (reason is null or char_length(reason) <= 200),
  notes text check (notes is null or char_length(notes) <= 2000),
  status public.replacement_status not null default 'NEW',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  label_printed_at timestamptz,
  qc_submitted_at timestamptz,
  qc_approved_at timestamptz,
  packed_at timestamptz,
  shipped_at timestamptz,
  needs_token_at timestamptz
);

create index replacements_status_created_idx on public.replacements(status, created_at desc);
create index replacements_order_reference_idx on public.replacements(order_reference);
create index replacements_product_name_idx on public.replacements(product_name);

create table public.qc_submissions (
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
create index qc_submissions_replacement_idx on public.qc_submissions(replacement_id, submission_number desc);

create table public.attachments (
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
create index attachments_replacement_idx on public.attachments(replacement_id, created_at);
create index attachments_qc_submission_idx on public.attachments(qc_submission_id) where qc_submission_id is not null;

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  replacement_id uuid not null references public.replacements(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  action text not null check (char_length(action) between 1 and 80),
  message text check (message is null or char_length(message) <= 1000),
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index activity_logs_replacement_idx on public.activity_logs(replacement_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  replacement_id uuid not null references public.replacements(id) on delete cascade,
  channel text not null check (channel = 'TELEGRAM'),
  type text not null check (char_length(type) between 1 and 80),
  status public.notification_status not null,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index notifications_replacement_idx on public.notifications(replacement_id, created_at desc);
create index notifications_failed_idx on public.notifications(status, created_at desc) where status = 'FAILED';

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger replacements_set_updated_at before update on public.replacements for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  requested_role public.app_role;
begin
  begin
    requested_role := coalesce(new.raw_user_meta_data ->> 'role', 'PACKING')::public.app_role;
  exception when invalid_text_representation then
    requested_role := 'PACKING';
  end;
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)), requested_role);
  return new;
end;
$$;
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
create trigger replacements_assign_number before insert on public.replacements for each row execute function public.assign_replacement_number();

create or replace function public.log_replacement_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.activity_logs(replacement_id, actor_id, action) values (new.id, new.created_by, 'REPLACEMENT_CREATED');
  return new;
end;
$$;
create trigger replacements_log_created after insert on public.replacements for each row execute function public.log_replacement_created();

create or replace function public.log_attachment_uploaded()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.activity_logs(replacement_id, actor_id, action, message, metadata)
  values (new.replacement_id, new.uploaded_by, 'FILE_UPLOADED', new.file_name, jsonb_build_object('attachment_id', new.id, 'attachment_type', new.attachment_type));
  return new;
end;
$$;
create trigger attachments_log_created after insert on public.attachments for each row execute function public.log_attachment_uploaded();

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

create policy "active users can view profiles" on public.profiles for select to authenticated using (public.current_active_role() is not null);
create policy "active users can view replacements" on public.replacements for select to authenticated using (public.current_active_role() is not null);
create policy "CUSTOMER_SUPPORT and admin can create replacements" on public.replacements for insert to authenticated with check (public.current_active_role() in ('CUSTOMER_SUPPORT', 'ADMIN') and created_by = auth.uid() and status = 'NEW');
create policy "active users can view qc" on public.qc_submissions for select to authenticated using (public.current_active_role() is not null);
create policy "active users can view attachments" on public.attachments for select to authenticated using (public.current_active_role() is not null);
create policy "authorized users can add request files" on public.attachments for insert to authenticated with check (
  uploaded_by = auth.uid() and qc_submission_id is null and
  ((public.current_active_role() in ('CUSTOMER_SUPPORT', 'ADMIN')) and attachment_type in ('CUSTOMER_PHOTO', 'LABEL', 'OTHER'))
);
create policy "active users can view activity" on public.activity_logs for select to authenticated using (public.current_active_role() is not null);
create policy "admins can view notifications" on public.notifications for select to authenticated using (public.current_active_role() = 'ADMIN');

revoke insert, update, delete on public.activity_logs from authenticated;
revoke insert, update, delete on public.qc_submissions from authenticated;
revoke update, delete on public.replacements from authenticated;
revoke all on public.replacement_sequences from authenticated;
revoke insert, update, delete on public.notifications from authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('replacement-files', 'replacement-files', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "active users can read replacement files" on storage.objects for select to authenticated using (bucket_id = 'replacement-files' and public.current_active_role() is not null);
create policy "authorized users can upload replacement files" on storage.objects for insert to authenticated with check (
  bucket_id = 'replacement-files' and name like 'replacements/%' and
  public.current_active_role() in ('CUSTOMER_SUPPORT', 'PACKING', 'ADMIN') and
  coalesce((metadata ->> 'size')::bigint, 0) <= 5242880
);
create policy "uploaders can remove failed uploads" on storage.objects for delete to authenticated using (bucket_id = 'replacement-files' and owner_id = auth.uid()::text);

create or replace function public.transition_replacement(p_replacement_id uuid, p_target_status public.replacement_status, p_message text default null)
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

  if p_target_status = 'LABEL_PRINTED' and not (current_row.status = 'NEW' and actor_role in ('PRINTING', 'ADMIN')) then raise exception 'Only Printing can print a new label';
  elsif p_target_status in ('QC_APPROVED', 'QC_REJECTED') and not (current_row.status = 'QC_PENDING' and actor_role in ('CUSTOMER_SUPPORT', 'ADMIN')) then raise exception 'Only CUSTOMER_SUPPORT can review pending QC';
  elsif p_target_status = 'PACKED' and not (current_row.status = 'QC_APPROVED' and actor_role in ('PACKING', 'ADMIN')) then raise exception 'QC must be approved before packing';
  elsif p_target_status = 'SHIPPED' and not (current_row.status in ('PACKED', 'NEEDS_TOKEN') and actor_role in ('CUSTOMER_SUPPORT', 'ADMIN')) then raise exception 'Only packed replacements can be shipped by CUSTOMER_SUPPORT';
  elsif p_target_status = 'NEEDS_TOKEN' and not (current_row.status = 'PACKED' and actor_role in ('CUSTOMER_SUPPORT', 'ADMIN')) then raise exception 'Only packed replacements can need a token';
  elsif p_target_status = 'CANCELLED' and not (current_row.status not in ('SHIPPED', 'CANCELLED') and actor_role = 'ADMIN') then raise exception 'Only Admin can cancel an open replacement';
  elsif p_target_status not in ('LABEL_PRINTED', 'QC_APPROVED', 'QC_REJECTED', 'PACKED', 'SHIPPED', 'NEEDS_TOKEN', 'CANCELLED') then raise exception 'Unsupported transition';
  end if;

  if p_target_status = 'QC_REJECTED' and nullif(trim(p_message), '') is null then raise exception 'A rejection reason is required'; end if;
  if p_target_status in ('QC_APPROVED', 'QC_REJECTED') then
    update public.qc_submissions set
      decision = case when p_target_status = 'QC_APPROVED' then 'APPROVED'::public.qc_decision else 'REJECTED'::public.qc_decision end,
      reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = case when p_target_status = 'QC_REJECTED' then trim(p_message) else null end
    where id = (select id from public.qc_submissions where replacement_id = p_replacement_id and decision = 'PENDING' order by submission_number desc limit 1);
    if not found then raise exception 'Pending QC submission not found'; end if;
  end if;

  update public.replacements set status = p_target_status,
    label_printed_at = case when p_target_status = 'LABEL_PRINTED' then now() else label_printed_at end,
    qc_approved_at = case when p_target_status = 'QC_APPROVED' then now() else qc_approved_at end,
    packed_at = case when p_target_status = 'PACKED' then now() else packed_at end,
    shipped_at = case when p_target_status = 'SHIPPED' then now() else shipped_at end,
    needs_token_at = case when p_target_status = 'NEEDS_TOKEN' then now() else needs_token_at end
  where id = p_replacement_id returning * into current_row;

  action_name := case p_target_status when 'CANCELLED' then 'CANCELLED' else p_target_status::text end;
  insert into public.activity_logs(replacement_id, actor_id, action, message, metadata)
  values (p_replacement_id, auth.uid(), action_name, nullif(trim(p_message), ''), jsonb_build_object('from_status', previous_status, 'to_status', p_target_status));
  return current_row;
end;
$$;

create or replace function public.submit_qc(p_replacement_id uuid, p_submission_id uuid, p_attachments jsonb)
returns public.replacements language plpgsql security definer set search_path = '' as $$
declare
  current_row public.replacements;
  actor_role public.app_role;
  next_submission integer;
  attachment_count integer;
begin
  select * into current_row from public.replacements where id = p_replacement_id for update;
  if not found then raise exception 'Replacement not found'; end if;
  select public.current_active_role() into actor_role;
  if actor_role not in ('PACKING', 'ADMIN') then raise exception 'Only Packing can submit QC'; end if;
  if current_row.status not in ('LABEL_PRINTED', 'QC_REJECTED') then raise exception 'QC cannot be submitted from this status'; end if;
  if jsonb_typeof(p_attachments) <> 'array' or jsonb_array_length(p_attachments) < 1 then raise exception 'At least one QC photo is required'; end if;
  if jsonb_array_length(p_attachments) > 12 then raise exception 'A maximum of 12 QC photos is allowed'; end if;

  select coalesce(max(submission_number), 0) + 1 into next_submission from public.qc_submissions where replacement_id = p_replacement_id;
  insert into public.qc_submissions(id, replacement_id, submission_number, submitted_by)
  values (p_submission_id, p_replacement_id, next_submission, auth.uid());

  insert into public.attachments(replacement_id, qc_submission_id, attachment_type, storage_path, file_name, mime_type, uploaded_by)
  select p_replacement_id, p_submission_id, 'QC_PHOTO', item.storage_path, item.file_name, item.mime_type, auth.uid()
  from jsonb_to_recordset(p_attachments) as item(storage_path text, file_name text, mime_type text)
  where item.mime_type in ('image/jpeg', 'image/png', 'image/webp') and item.storage_path like ('replacements/' || p_replacement_id || '/qc/' || p_submission_id || '/%');
  get diagnostics attachment_count = row_count;
  if attachment_count <> jsonb_array_length(p_attachments) then raise exception 'Invalid QC attachment metadata'; end if;

  update public.replacements set status = 'QC_PENDING', qc_submitted_at = now() where id = p_replacement_id returning * into current_row;
  insert into public.activity_logs(replacement_id, actor_id, action, metadata)
  values (p_replacement_id, auth.uid(), 'QC_SUBMITTED', jsonb_build_object('submission_id', p_submission_id, 'submission_number', next_submission, 'photo_count', attachment_count));
  return current_row;
end;
$$;

create or replace function public.add_replacement_comment(p_replacement_id uuid, p_message text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.current_active_role() is null then raise exception 'Active account required'; end if;
  if nullif(trim(p_message), '') is null or char_length(trim(p_message)) > 1000 then raise exception 'Comment must be between 1 and 1000 characters'; end if;
  if not exists (select 1 from public.replacements where id = p_replacement_id) then raise exception 'Replacement not found'; end if;
  insert into public.activity_logs(replacement_id, actor_id, action, message) values (p_replacement_id, auth.uid(), 'COMMENT_ADDED', trim(p_message));
end;
$$;

create or replace function public.update_replacement_details(
  p_replacement_id uuid, p_order_reference text, p_customer_name text, p_customer_reference text,
  p_product_name text, p_quantity integer, p_reason text, p_notes text
) returns void language plpgsql security definer set search_path = '' as $$
declare actor_role public.app_role;
begin
  select public.current_active_role() into actor_role;
  if actor_role not in ('CUSTOMER_SUPPORT', 'ADMIN') then raise exception 'Only CUSTOMER_SUPPORT can edit replacement details'; end if;
  if nullif(trim(p_order_reference), '') is null or nullif(trim(p_product_name), '') is null or p_quantity not between 1 and 999 then raise exception 'Invalid replacement details'; end if;
  update public.replacements set order_reference = trim(p_order_reference), customer_name = nullif(trim(p_customer_name), ''),
    customer_reference = nullif(trim(p_customer_reference), ''), product_name = trim(p_product_name), quantity = p_quantity,
    reason = nullif(trim(p_reason), ''), notes = nullif(trim(p_notes), '')
  where id = p_replacement_id and status not in ('SHIPPED', 'CANCELLED');
  if not found then raise exception 'Open replacement not found'; end if;
  insert into public.activity_logs(replacement_id, actor_id, action) values (p_replacement_id, auth.uid(), 'REPLACEMENT_UPDATED');
end;
$$;

revoke all on function public.transition_replacement(uuid, public.replacement_status, text) from public;
revoke all on function public.submit_qc(uuid, uuid, jsonb) from public;
revoke all on function public.add_replacement_comment(uuid, text) from public;
revoke all on function public.update_replacement_details(uuid, text, text, text, text, integer, text, text) from public;
grant execute on function public.transition_replacement(uuid, public.replacement_status, text) to authenticated;
grant execute on function public.submit_qc(uuid, uuid, jsonb) to authenticated;
grant execute on function public.add_replacement_comment(uuid, text) to authenticated;
grant execute on function public.update_replacement_details(uuid, text, text, text, text, integer, text, text) to authenticated;
