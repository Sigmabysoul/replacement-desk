--
-- PostgreSQL database dump
--

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

CREATE SCHEMA IF NOT EXISTS public;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'CUSTOMER_SUPPORT',
    'PRINTING',
    'PACKING',
    'LOGISTICS',
    'ADMIN',
    'BOSS',
    'HR',
    'CONSIGNMENT'
);


--
-- Name: attachment_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.attachment_type AS ENUM (
    'CUSTOMER_PHOTO',
    'LABEL',
    'PROOF_PHOTO',
    'QC_PHOTO',
    'OTHER'
);


--
-- Name: notification_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notification_status AS ENUM (
    'SENT',
    'FAILED'
);


--
-- Name: offline_order_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.offline_order_status AS ENUM (
    'CREATED',
    'PRINTING_ASSIGNED',
    'PACKING_CONFIRMED',
    'DISPATCH_PREPARED',
    'PRINTED',
    'DISPATCHED',
    'PICKED_UP',
    'DELIVERED',
    'ACKNOWLEDGED',
    'CANCELLED'
);


--
-- Name: qc_decision; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.qc_decision AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED'
);


--
-- Name: replacement_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.replacement_status AS ENUM (
    'NEW',
    'LABEL_UPLOADED',
    'LABEL_PRINTED',
    'QC_PENDING',
    'QC_REJECTED',
    'QC_APPROVED',
    'PACKED',
    'SHIPPED',
    'DELIVERED',
    'NEEDS_TOKEN',
    'CANCELLED'
);


--
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;


--
-- Name: order_number_sequence; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_number_sequence
    START WITH 501
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: offline_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offline_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    so_number text NOT NULL,
    order_number bigint DEFAULT nextval('public.order_number_sequence'::regclass) NOT NULL,
    brand text,
    product_name text NOT NULL,
    quantity integer NOT NULL,
    unit text DEFAULT 'Pieces'::text NOT NULL,
    logistics_partner text,
    dispatch_date date,
    notes text,
    status public.offline_order_status DEFAULT 'CREATED'::public.offline_order_status NOT NULL,
    carton_count integer,
    carton_dimensions text,
    carton_weight_kg numeric(10,2),
    lr_number text,
    tracking_url text,
    pod_notes text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    printing_confirmed_at timestamp with time zone,
    printing_confirmed_by uuid,
    packing_confirmed_at timestamp with time zone,
    packing_confirmed_by uuid,
    dispatched_at timestamp with time zone,
    dispatched_by uuid,
    picked_up_at timestamp with time zone,
    picked_up_by uuid,
    delivered_at timestamp with time zone,
    delivered_by uuid,
    acknowledged_at timestamp with time zone,
    acknowledged_by uuid,
    cancelled_at timestamp with time zone,
    cancelled_by uuid,
    delivery_status text,
    rta_reason text,
    rta_at timestamp with time zone,
    rta_by uuid,
    customer_name text,
    customer_address text,
    customer_phone text,
    customer_email text,
    customer_preset_id uuid,
    CONSTRAINT offline_orders_brand_check CHECK (((brand IS NULL) OR (char_length(brand) <= 200))),
    CONSTRAINT offline_orders_carton_count_check CHECK (((carton_count IS NULL) OR ((carton_count >= 1) AND (carton_count <= 9999)))),
    CONSTRAINT offline_orders_carton_dimensions_check CHECK (((carton_dimensions IS NULL) OR (char_length(carton_dimensions) <= 100))),
    CONSTRAINT offline_orders_carton_weight_kg_check CHECK (((carton_weight_kg IS NULL) OR (carton_weight_kg > (0)::numeric))),
    CONSTRAINT offline_orders_customer_address_check CHECK (((customer_address IS NULL) OR (char_length(customer_address) <= 2000))),
    CONSTRAINT offline_orders_customer_email_check CHECK (((customer_email IS NULL) OR (char_length(customer_email) <= 255))),
    CONSTRAINT offline_orders_customer_name_check CHECK (((customer_name IS NULL) OR (char_length(customer_name) <= 200))),
    CONSTRAINT offline_orders_customer_phone_check CHECK (((customer_phone IS NULL) OR (char_length(customer_phone) <= 50))),
    CONSTRAINT offline_orders_delivery_status_check CHECK (((delivery_status IS NULL) OR (delivery_status = ANY (ARRAY['SUCCESSFUL'::text, 'UNSUCCESSFUL'::text, 'RTA'::text, 'RTO'::text])))),
    CONSTRAINT offline_orders_logistics_partner_check CHECK (((logistics_partner IS NULL) OR (char_length(logistics_partner) <= 200))),
    CONSTRAINT offline_orders_lr_number_check CHECK (((lr_number IS NULL) OR (char_length(lr_number) <= 100))),
    CONSTRAINT offline_orders_notes_check CHECK (((notes IS NULL) OR (char_length(notes) <= 2000))),
    CONSTRAINT offline_orders_pod_notes_check CHECK (((pod_notes IS NULL) OR (char_length(pod_notes) <= 2000))),
    CONSTRAINT offline_orders_product_name_check CHECK (((char_length(product_name) >= 1) AND (char_length(product_name) <= 200))),
    CONSTRAINT offline_orders_quantity_check CHECK (((quantity >= 1) AND (quantity <= 999999))),
    CONSTRAINT offline_orders_rta_reason_check CHECK (((rta_reason IS NULL) OR (char_length(rta_reason) <= 2000))),
    CONSTRAINT offline_orders_so_number_check CHECK (((char_length(TRIM(BOTH FROM so_number)) >= 1) AND (char_length(TRIM(BOTH FROM so_number)) <= 50))),
    CONSTRAINT offline_orders_tracking_url_check CHECK (((tracking_url IS NULL) OR (tracking_url ~* '^https?://[^[:space:]]+$'::text))),
    CONSTRAINT offline_orders_unit_check CHECK (((char_length(unit) >= 1) AND (char_length(unit) <= 50)))
);


--
-- Name: acknowledge_offline_order(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.acknowledge_offline_order(p_order_id uuid) RETURNS public.offline_orders
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  current_row public.offline_orders;
begin
  select * into current_row from public.offline_orders where id = p_order_id for update;
  if not found then raise exception 'Offline order not found'; end if;

  if not public.has_any_role('BOSS') then
    raise exception 'Only Boss or Admin can acknowledge delivery';
  end if;
  if current_row.status <> 'DELIVERED' then
    raise exception 'Only delivered orders can be acknowledged';
  end if;

  update public.offline_orders set
    status = 'ACKNOWLEDGED',
    acknowledged_at = now(),
    acknowledged_by = auth.uid()
  where id = p_order_id
  returning * into current_row;

  insert into public.offline_order_activity_logs(offline_order_id, actor_id, action)
  values (p_order_id, auth.uid(), 'ORDER_ACKNOWLEDGED');

  return current_row;
end;
$$;


--
-- Name: add_offline_order_comment(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_offline_order_comment(p_order_id uuid, p_message text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if public.current_active_role() is null then
    raise exception 'Active account required';
  end if;
  if nullif(trim(p_message), '') is null or char_length(trim(p_message)) > 1000 then
    raise exception 'Comment must be between 1 and 1000 characters';
  end if;
  if not exists (select 1 from public.offline_orders where id = p_order_id) then
    raise exception 'Offline order not found';
  end if;

  insert into public.offline_order_activity_logs(offline_order_id, actor_id, action, message)
  values (p_order_id, auth.uid(), 'COMMENT_ADDED', trim(p_message));
end;
$$;


--
-- Name: add_replacement_comment(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_replacement_comment(p_replacement_id uuid, p_message text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if public.current_active_role() is null then raise exception 'Active account required'; end if;
  if nullif(trim(p_message), '') is null or char_length(trim(p_message)) > 1000 then raise exception 'Comment must be between 1 and 1000 characters'; end if;
  if not exists (select 1 from public.replacements where id = p_replacement_id) then raise exception 'Replacement not found'; end if;
  insert into public.activity_logs(replacement_id, actor_id, action, message) values (p_replacement_id, auth.uid(), 'COMMENT_ADDED', trim(p_message));
end;
$$;


--
-- Name: replacements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.replacements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    replacement_number text NOT NULL,
    order_reference text,
    customer_name text,
    customer_reference text,
    product_name text NOT NULL,
    quantity integer NOT NULL,
    reason text,
    notes text,
    status public.replacement_status DEFAULT 'NEW'::public.replacement_status NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    label_printed_at timestamp with time zone,
    qc_submitted_at timestamp with time zone,
    qc_approved_at timestamp with time zone,
    packed_at timestamp with time zone,
    shipped_at timestamp with time zone,
    needs_token_at timestamp with time zone,
    tracking_url text,
    archived_at timestamp with time zone,
    archived_by uuid,
    order_number bigint DEFAULT nextval('public.order_number_sequence'::regclass) NOT NULL,
    order_type text DEFAULT 'REPLACEMENT'::text NOT NULL,
    order_group_id uuid,
    customer_address text,
    customer_email text,
    customer_phone text,
    shipping_speed text DEFAULT 'STANDARD'::text NOT NULL,
    length_cm numeric(10,2),
    breadth_cm numeric(10,2),
    height_cm numeric(10,2),
    dimension_preset_id uuid,
    courier_partner text,
    tracking_id text,
    delivered_at timestamp with time zone,
    delivered_by uuid,
    delivery_notes text,
    delivery_status text,
    rta_reason text,
    rta_at timestamp with time zone,
    rta_by uuid,
    CONSTRAINT replacements_customer_address_check CHECK (((customer_address IS NULL) OR (char_length(customer_address) <= 1000))),
    CONSTRAINT replacements_customer_email_check CHECK (((customer_email IS NULL) OR (char_length(customer_email) <= 254))),
    CONSTRAINT replacements_customer_name_check CHECK (((customer_name IS NULL) OR (char_length(customer_name) <= 120))),
    CONSTRAINT replacements_customer_phone_check CHECK (((customer_phone IS NULL) OR (char_length(customer_phone) <= 40))),
    CONSTRAINT replacements_customer_reference_check CHECK (((customer_reference IS NULL) OR (char_length(customer_reference) <= 100))),
    CONSTRAINT replacements_delivery_status_check CHECK (((delivery_status IS NULL) OR (delivery_status = ANY (ARRAY['SUCCESSFUL'::text, 'UNSUCCESSFUL'::text, 'RTA'::text, 'RTO'::text])))),
    CONSTRAINT replacements_notes_check CHECK (((notes IS NULL) OR (char_length(notes) <= 2000))),
    CONSTRAINT replacements_order_reference_check CHECK (((order_reference IS NULL) OR (char_length(order_reference) <= 100))),
    CONSTRAINT replacements_order_type_check CHECK ((order_type = ANY (ARRAY['REPLACEMENT'::text, 'OFFLINE'::text]))),
    CONSTRAINT replacements_product_name_check CHECK (((char_length(product_name) >= 1) AND (char_length(product_name) <= 200))),
    CONSTRAINT replacements_quantity_check CHECK (((quantity >= 1) AND (quantity <= 999))),
    CONSTRAINT replacements_reason_check CHECK (((reason IS NULL) OR (char_length(reason) <= 200))),
    CONSTRAINT replacements_rta_reason_check CHECK (((rta_reason IS NULL) OR (char_length(rta_reason) <= 2000))),
    CONSTRAINT replacements_shipping_speed_check CHECK ((shipping_speed = ANY (ARRAY['STANDARD'::text, 'EXPRESS'::text]))),
    CONSTRAINT replacements_tracking_url_check CHECK (((tracking_url IS NULL) OR (tracking_url ~* '^https?://[^[:space:]]+$'::text)))
);


--
-- Name: admin_override_replacement(uuid, public.replacement_status, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_override_replacement(p_replacement_id uuid, p_target_status public.replacement_status, p_reason text) RETURNS public.replacements
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  current_row public.replacements;
  previous_status public.replacement_status;
  actor_role public.app_role;
  trimmed_reason text := trim(p_reason);
begin
  select public.current_active_role() into actor_role;
  if actor_role is null or (actor_role is distinct from 'ADMIN'::public.app_role and not public.has_role('ADMIN')) then
    raise exception 'Admin access required';
  end if;
  if nullif(trimmed_reason, '') is null then
    raise exception 'An override reason is required';
  end if;

  select * into current_row from public.replacements where id = p_replacement_id for update;
  if not found then raise exception 'Replacement not found'; end if;
  previous_status := current_row.status;

  update public.replacements set
    status = p_target_status,
    label_printed_at = case when p_target_status = 'LABEL_PRINTED' and label_printed_at is null then now() else label_printed_at end,
    qc_approved_at = case when p_target_status = 'QC_APPROVED' and qc_approved_at is null then now() else qc_approved_at end,
    packed_at = case when p_target_status = 'PACKED' and packed_at is null then now() else packed_at end,
    shipped_at = case when p_target_status = 'SHIPPED' and shipped_at is null then now() else shipped_at end,
    delivered_at = case when p_target_status = 'DELIVERED' and delivered_at is null then now() else delivered_at end,
    delivered_by = case when p_target_status = 'DELIVERED' and delivered_by is null then auth.uid() else delivered_by end
  where id = p_replacement_id
  returning * into current_row;

  insert into public.activity_logs(replacement_id, actor_id, action, message, metadata)
  values (
    p_replacement_id,
    auth.uid(),
    'ADMIN_OVERRIDE',
    trimmed_reason,
    jsonb_build_object('from_status', previous_status, 'to_status', p_target_status)
  );

  return current_row;
end;
$$;


--
-- Name: admin_update_order_number(uuid, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_update_order_number(p_replacement_id uuid, p_order_number bigint) RETURNS public.replacements
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  current_row public.replacements;
  previous_number bigint;
begin
  if not (public.has_any_role('CUSTOMER_SUPPORT', 'HR', 'BOSS', 'ADMIN')) then
    raise exception 'Unauthorized to change Order ID';
  end if;
  if p_order_number < 1 then
    raise exception 'Order ID must be a positive whole number';
  end if;

  select * into current_row from public.replacements where id = p_replacement_id for update;
  if not found then raise exception 'Order not found'; end if;
  previous_number := current_row.order_number;

  if exists (select 1 from public.replacements where order_number = p_order_number and id <> p_replacement_id) then
    raise exception 'Order ID % is already in use by another replacement order', p_order_number using errcode = '23505';
  end if;

  update public.replacements set order_number = p_order_number
  where id = p_replacement_id returning * into current_row;

  if previous_number is distinct from p_order_number then
    insert into public.activity_logs(replacement_id, actor_id, action, metadata)
    values (
      p_replacement_id,
      auth.uid(),
      'ORDER_NUMBER_CHANGED',
      jsonb_build_object('from_order_number', previous_number, 'to_order_number', p_order_number)
    );
    perform setval('public.order_number_sequence', p_order_number, true);
  end if;
  return current_row;
end;
$$;


--
-- Name: archive_completed_replacements(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.archive_completed_replacements() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  archived_count integer;
  actor_role public.app_role;
begin
  select public.current_active_role() into actor_role;
  if actor_role is null or (actor_role is distinct from 'ADMIN'::public.app_role and not public.has_role('ADMIN')) then
    raise exception 'Administrator access required';
  end if;

  with archived as (
    update public.replacements
    set archived_at = now(), archived_by = auth.uid()
    where archived_at is null
      and status in ('SHIPPED', 'DELIVERED', 'CANCELLED')
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


--
-- Name: assign_replacement_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_replacement_number() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: cancel_offline_order(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_offline_order(p_order_id uuid, p_reason text) RETURNS public.offline_orders
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  current_row public.offline_orders;
  previous_status public.offline_order_status;
begin
  select * into current_row from public.offline_orders where id = p_order_id for update;
  if not found then raise exception 'Offline order not found'; end if;

  if not public.has_any_role('BOSS') then
    raise exception 'Only Boss or Admin can cancel offline orders';
  end if;
  if current_row.status in ('ACKNOWLEDGED', 'CANCELLED') then
    raise exception 'This order cannot be cancelled';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'A cancellation reason is required';
  end if;

  previous_status := current_row.status;

  update public.offline_orders set
    status = 'CANCELLED',
    cancelled_at = now(),
    cancelled_by = auth.uid()
  where id = p_order_id
  returning * into current_row;

  insert into public.offline_order_activity_logs(offline_order_id, actor_id, action, message, metadata)
  values (
    p_order_id, auth.uid(), 'ORDER_CANCELLED', trim(p_reason),
    jsonb_build_object('from_status', previous_status::text)
  );

  return current_row;
end;
$$;


--
-- Name: cancel_replacement_order(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_replacement_order(p_replacement_id uuid, p_reason text) RETURNS public.replacements
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  current_row public.replacements;
  previous_status public.replacement_status;
begin
  select * into current_row from public.replacements where id = p_replacement_id for update;
  if not found then raise exception 'Replacement order not found'; end if;

  if not public.has_any_role('ADMIN') then
    raise exception 'Only Admin can cancel replacement orders';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'A cancellation reason is required';
  end if;
  if char_length(trim(p_reason)) > 1000 then
    raise exception 'Cancellation reason is too long';
  end if;
  if current_row.status in ('SHIPPED', 'DELIVERED', 'CANCELLED') then
    raise exception 'This replacement order cannot be cancelled';
  end if;

  previous_status := current_row.status;

  update public.replacements set
    status = 'CANCELLED'
  where id = p_replacement_id
  returning * into current_row;

  insert into public.activity_logs(replacement_id, actor_id, action, message, metadata)
  values (
    p_replacement_id,
    auth.uid(),
    'ORDER_CANCELLED',
    trim(p_reason),
    jsonb_build_object('from_status', previous_status, 'to_status', 'CANCELLED')
  );

  return current_row;
end;
$$;


--
-- Name: confirm_offline_delivery(uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_offline_delivery(p_order_id uuid, p_pod_notes text, p_attachments jsonb DEFAULT '[]'::jsonb) RETURNS public.offline_orders
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
      p_order_id,
      coalesce((elem->>'attachment_type')::public.offline_attachment_type, 'POD'::public.offline_attachment_type),
      elem->>'storage_path',
      elem->>'file_name',
      elem->>'mime_type',
      auth.uid()
    from jsonb_array_elements(p_attachments) as elem
    where elem->>'storage_path' is not null;

    get diagnostics attachment_count = row_count;
  end if;

  update public.offline_orders set
    status = 'DELIVERED',
    delivery_status = 'SUCCESSFUL',
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


--
-- Name: confirm_offline_packing(uuid, integer, text, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_offline_packing(p_order_id uuid, p_carton_count integer, p_carton_dimensions text, p_carton_weight_kg numeric) RETURNS public.offline_orders
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  current_row public.offline_orders;
begin
  select * into current_row from public.offline_orders where id = p_order_id for update;
  if not found then raise exception 'Offline order not found'; end if;

  if not public.has_any_role('CONSIGNMENT') then
    raise exception 'Only Consignment or Admin can confirm packing';
  end if;
  if current_row.status <> 'CREATED' then
    raise exception 'Packing can only be confirmed for newly created orders';
  end if;
  if p_carton_count is null or p_carton_count < 1 then
    raise exception 'Carton count is required';
  end if;

  update public.offline_orders set
    status = 'PACKING_CONFIRMED',
    carton_count = p_carton_count,
    carton_dimensions = nullif(trim(p_carton_dimensions), ''),
    carton_weight_kg = p_carton_weight_kg,
    packing_confirmed_at = now(),
    packing_confirmed_by = auth.uid()
  where id = p_order_id
  returning * into current_row;

  insert into public.offline_order_activity_logs(offline_order_id, actor_id, action, metadata)
  values (
    p_order_id, auth.uid(), 'PACKING_CONFIRMED',
    jsonb_build_object(
      'carton_count', p_carton_count,
      'carton_dimensions', nullif(trim(p_carton_dimensions), ''),
      'carton_weight_kg', p_carton_weight_kg
    )
  );

  return current_row;
end;
$$;


--
-- Name: confirm_offline_pickup(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_offline_pickup(p_order_id uuid) RETURNS public.offline_orders
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  current_row public.offline_orders;
begin
  select * into current_row from public.offline_orders where id = p_order_id for update;
  if not found then raise exception 'Offline order not found'; end if;

  if not public.has_any_role('CONSIGNMENT') then
    raise exception 'Only Consignment or Admin can confirm pickup';
  end if;
  if current_row.status <> 'PRINTED' then
    raise exception 'Pickup can only be confirmed after labels/materials are printed';
  end if;

  update public.offline_orders set
    status = 'PICKED_UP',
    picked_up_at = now(),
    picked_up_by = auth.uid()
  where id = p_order_id
  returning * into current_row;

  insert into public.offline_order_activity_logs(offline_order_id, actor_id, action)
  values (p_order_id, auth.uid(), 'PICKUP_CONFIRMED');

  return current_row;
end;
$$;


--
-- Name: confirm_offline_printed(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_offline_printed(p_order_id uuid) RETURNS public.offline_orders
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  current_row public.offline_orders;
begin
  select * into current_row from public.offline_orders where id = p_order_id for update;
  if not found then raise exception 'Offline order not found'; end if;

  if not public.has_any_role('PRINTING') then
    raise exception 'Only Printing or Admin can confirm printing';
  end if;
  if current_row.status <> 'DISPATCH_PREPARED' then
    raise exception 'Printing can only be confirmed after HR adds dispatch details and photos';
  end if;

  update public.offline_orders set
    status = 'PRINTED',
    printing_confirmed_at = now(),
    printing_confirmed_by = auth.uid()
  where id = p_order_id
  returning * into current_row;

  insert into public.offline_order_activity_logs(offline_order_id, actor_id, action)
  values (p_order_id, auth.uid(), 'PRINTING_CONFIRMED');

  return current_row;
end;
$$;


--
-- Name: confirm_offline_printing(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_offline_printing(p_order_id uuid) RETURNS public.offline_orders
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  current_row public.offline_orders;
  actor_role public.app_role;
begin
  select * into current_row from public.offline_orders where id = p_order_id for update;
  if not found then raise exception 'Offline order not found'; end if;

  select public.current_active_role() into actor_role;
  if actor_role is null or actor_role not in ('PRINTING', 'ADMIN') then
    raise exception 'Only Printing or Admin can confirm printing';
  end if;
  if current_row.status <> 'CREATED' then
    raise exception 'Printing can only be confirmed for newly created orders';
  end if;

  update public.offline_orders set
    status = 'PRINTING_ASSIGNED',
    printing_confirmed_at = now(),
    printing_confirmed_by = auth.uid()
  where id = p_order_id
  returning * into current_row;

  insert into public.offline_order_activity_logs(offline_order_id, actor_id, action)
  values (p_order_id, auth.uid(), 'PRINTING_CONFIRMED');

  return current_row;
end;
$$;


--
-- Name: create_offline_order(uuid, text, text, text, integer, text, text, date, text, bigint, text, text, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_offline_order(p_id uuid, p_so_number text, p_brand text, p_product_name text, p_quantity integer, p_unit text, p_logistics_partner text, p_dispatch_date date, p_notes text, p_order_number bigint DEFAULT NULL::bigint, p_customer_name text DEFAULT NULL::text, p_customer_address text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text, p_customer_email text DEFAULT NULL::text, p_customer_preset_id uuid DEFAULT NULL::uuid) RETURNS public.offline_orders
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  created_row public.offline_orders;
begin
  if not public.has_any_role('HR', 'BOSS') then
    raise exception 'Only HR, Boss, or Admin can create offline orders';
  end if;

  if nullif(trim(p_so_number), '') is null then
    raise exception 'SO number is required';
  end if;
  if nullif(trim(p_product_name), '') is null then
    raise exception 'Product name is required';
  end if;
  if p_quantity not between 1 and 999999 then
    raise exception 'Invalid quantity';
  end if;

  if p_order_number is not null then
    if p_order_number < 1 then
      raise exception 'Order ID must be a positive whole number';
    end if;
    if exists (select 1 from public.offline_orders where order_number = p_order_number) then
      raise exception 'Order ID % is already in use by another offline order', p_order_number using errcode = '23505';
    end if;
  end if;

  insert into public.offline_orders(
    id, so_number, order_number, brand, product_name, quantity, unit,
    logistics_partner, dispatch_date, notes, status, created_by,
    customer_name, customer_address, customer_phone, customer_email, customer_preset_id
  ) values (
    p_id,
    trim(p_so_number),
    coalesce(p_order_number, nextval('public.order_number_sequence')),
    nullif(trim(p_brand), ''),
    trim(p_product_name),
    p_quantity,
    coalesce(nullif(trim(p_unit), ''), 'Pieces'),
    nullif(trim(p_logistics_partner), ''),
    p_dispatch_date,
    nullif(trim(p_notes), ''),
    'CREATED',
    auth.uid(),
    nullif(trim(p_customer_name), ''),
    nullif(trim(p_customer_address), ''),
    nullif(trim(p_customer_phone), ''),
    nullif(trim(p_customer_email), ''),
    p_customer_preset_id
  ) returning * into created_row;

  if p_order_number is not null then
    perform setval('public.order_number_sequence', p_order_number, true);
  end if;

  insert into public.offline_order_activity_logs(offline_order_id, actor_id, action, metadata)
  values (
    p_id, auth.uid(), 'ORDER_CREATED',
    jsonb_build_object(
      'so_number', trim(p_so_number),
      'order_number', created_row.order_number,
      'product', trim(p_product_name),
      'quantity', p_quantity,
      'customer_name', nullif(trim(p_customer_name), '')
    )
  );

  return created_row;
end;
$$;


--
-- Name: create_offline_order_with_items(uuid, text, text, text, integer, text, text, date, text, bigint, jsonb, text, text, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_offline_order_with_items(p_id uuid, p_so_number text, p_brand text, p_product_name text, p_quantity integer, p_unit text, p_logistics_partner text, p_dispatch_date date, p_notes text, p_order_number bigint, p_items jsonb, p_customer_name text DEFAULT NULL::text, p_customer_address text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text, p_customer_email text DEFAULT NULL::text, p_customer_preset_id uuid DEFAULT NULL::uuid) RETURNS public.offline_orders
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  created_row public.offline_orders;
  first_item jsonb;
  item jsonb;
  item_position integer := 0;
begin
  if jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items) not between 1 and 20 then
    raise exception 'Add between one and twenty items';
  end if;

  first_item := p_items -> 0;
  select * into created_row
  from public.create_offline_order(
    p_id, p_so_number, p_brand,
    trim(first_item ->> 'product_name'), (first_item ->> 'quantity')::integer,
    p_unit, p_logistics_partner, p_dispatch_date, p_notes, p_order_number,
    p_customer_name, p_customer_address, p_customer_phone, p_customer_email, p_customer_preset_id
  );

  for item in select value from jsonb_array_elements(p_items)
  loop
    item_position := item_position + 1;
    if nullif(trim(item ->> 'product_name'), '') is null
      or char_length(trim(item ->> 'product_name')) > 200 then
      raise exception 'Invalid product name for item %', item_position;
    end if;
    if coalesce((item ->> 'quantity')::integer, 0) not between 1 and 999999 then
      raise exception 'Invalid quantity for item %', item_position;
    end if;
    insert into public.offline_order_items(offline_order_id, product_name, quantity, position)
    values (created_row.id, trim(item ->> 'product_name'), (item ->> 'quantity')::integer, item_position);
  end loop;

  update public.offline_order_activity_logs
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('item_count', item_position)
  where id = (
    select id from public.offline_order_activity_logs
    where offline_order_id = created_row.id and action = 'ORDER_CREATED'
    order by created_at desc limit 1
  );

  return created_row;
end;
$$;


--
-- Name: create_order_batch(uuid, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_order_batch(p_group_id uuid, p_orders jsonb, p_attachments jsonb) RETURNS SETOF public.replacements
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  actor_role public.app_role;
  order_item jsonb;
  order_id uuid;
  order_type text;
  requested_order_number bigint;
  created_row public.replacements;
  attachment_count integer;
  expected_count integer;
  assigned_ref text;
begin
  select public.current_active_role() into actor_role;
  if actor_role is null or not (actor_role in ('CUSTOMER_SUPPORT', 'ADMIN') or public.has_any_role('CUSTOMER_SUPPORT', 'ADMIN')) then
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
    order_type := coalesce(order_item ->> 'order_type', 'REPLACEMENT');
    requested_order_number := null;

    -- Any authorized order creator can specify or override the Order ID
    if nullif(order_item ->> 'requested_order_number', '') is not null then
      requested_order_number := (order_item ->> 'requested_order_number')::bigint;
      if requested_order_number < 1 then
        raise exception 'Order ID must be a positive whole number';
      end if;
      if exists (select 1 from public.replacements where order_number = requested_order_number) then
        raise exception 'Order ID % is already in use by another replacement order', requested_order_number using errcode = '23505';
      end if;
    end if;

    if order_type not in ('REPLACEMENT', 'OFFLINE') then raise exception 'Invalid order type'; end if;
    if nullif(trim(order_item ->> 'product_name'), '') is null then raise exception 'Product is required'; end if;
    if coalesce((order_item ->> 'quantity')::integer, 0) not between 1 and 999 then raise exception 'Invalid quantity'; end if;
    if order_type = 'REPLACEMENT' and (
      coalesce((order_item ->> 'length_cm')::numeric, 0) <= 0 or
      coalesce((order_item ->> 'breadth_cm')::numeric, 0) <= 0 or
      coalesce((order_item ->> 'height_cm')::numeric, 0) <= 0
    ) then raise exception 'Replacement dimensions are required'; end if;

    assigned_ref := coalesce(nullif(trim(order_item ->> 'order_reference'), ''), 'REF-AUTO');

    expected_count := (
      select count(*) from jsonb_array_elements(p_attachments) attachment
      where attachment ->> 'replacement_id' = order_id::text
    );
    if expected_count not between 1 and 12 then
      raise exception 'Between one and twelve product photos are required for every order';
    end if;
    if (
      select count(*) from jsonb_to_recordset(p_attachments) item(replacement_id uuid, storage_path text)
      join storage.objects stored on stored.bucket_id = 'replacement-files' and stored.name = item.storage_path and stored.owner_id = auth.uid()::text
      where item.replacement_id = order_id
    ) <> expected_count then
      raise exception 'One or more photo storage objects are missing or not owned by the current user';
    end if;

    insert into public.replacements (
      id,
      replacement_number,
      order_number,
      order_type,
      order_group_id,
      order_reference,
      customer_name,
      customer_reference,
      customer_address,
      customer_email,
      customer_phone,
      product_name,
      quantity,
      reason,
      notes,
      shipping_speed,
      dimension_preset_id,
      length_cm,
      breadth_cm,
      height_cm,
      status,
      created_by
    ) values (
      order_id,
      'assigned-by-trigger',
      coalesce(requested_order_number, nextval('public.order_number_sequence')),
      order_type,
      p_group_id,
      assigned_ref,
      nullif(trim(order_item ->> 'customer_name'), ''),
      nullif(trim(order_item ->> 'customer_reference'), ''),
      nullif(trim(order_item ->> 'customer_address'), ''),
      lower(nullif(trim(order_item ->> 'customer_email'), '')),
      nullif(trim(order_item ->> 'customer_phone'), ''),
      trim(order_item ->> 'product_name'),
      (order_item ->> 'quantity')::integer,
      nullif(trim(order_item ->> 'reason'), ''),
      nullif(trim(order_item ->> 'notes'), ''),
      coalesce(nullif(order_item ->> 'shipping_speed', ''), 'STANDARD'),
      nullif(order_item ->> 'dimension_preset_id', '')::uuid,
      case when order_type = 'REPLACEMENT' then (order_item ->> 'length_cm')::numeric else null end,
      case when order_type = 'REPLACEMENT' then (order_item ->> 'breadth_cm')::numeric else null end,
      case when order_type = 'REPLACEMENT' then (order_item ->> 'height_cm')::numeric else null end,
      'NEW',
      auth.uid()
    )
    returning * into created_row;

    -- Synchronize sequence directly to the requested order number so next order increments from it
    if requested_order_number is not null then
      perform setval('public.order_number_sequence', requested_order_number, true);
    end if;

    insert into public.attachments(replacement_id, qc_submission_id, attachment_type, storage_path, file_name, mime_type, uploaded_by)
    select order_id, null, 'PROOF_PHOTO', item.storage_path, item.file_name, item.mime_type, auth.uid()
    from jsonb_to_recordset(p_attachments) as item(replacement_id uuid, storage_path text, file_name text, mime_type text)
    where item.replacement_id = order_id
      and item.mime_type in ('image/jpeg', 'image/png', 'image/webp')
      and (
        item.storage_path ilike ('replacements/' || order_id || '/customer_support/%/photos/%')
        or item.storage_path like ('replacements/' || order_id || '/products/%')
      );
    get diagnostics attachment_count = row_count;
    if attachment_count <> expected_count then
      raise exception 'Invalid product photo metadata';
    end if;

    insert into public.activity_logs(replacement_id, actor_id, action, metadata)
    values (order_id, auth.uid(), 'ORDER_CREATED', jsonb_build_object('attachment_count', attachment_count, 'order_type', order_type));

    return next created_row;
  end loop;
end;
$$;


--
-- Name: create_replacement_order_with_items(jsonb, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_replacement_order_with_items(p_order jsonb, p_attachments jsonb, p_items jsonb) RETURNS public.replacements
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  created_row public.replacements;
  normalized_order jsonb;
  first_item jsonb;
  item jsonb;
  item_position integer := 0;
begin
  if jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items) not between 1 and 20 then
    raise exception 'Add between one and twenty items';
  end if;

  first_item := p_items -> 0;
  normalized_order := jsonb_set(
    jsonb_set(p_order, '{product_name}', to_jsonb(trim(first_item ->> 'product_name'))),
    '{quantity}', to_jsonb((first_item ->> 'quantity')::integer)
  );

  select * into created_row
  from public.create_order_batch(null, jsonb_build_array(normalized_order), p_attachments)
  limit 1;

  for item in select value from jsonb_array_elements(p_items)
  loop
    item_position := item_position + 1;
    if nullif(trim(item ->> 'product_name'), '') is null
      or char_length(trim(item ->> 'product_name')) > 200 then
      raise exception 'Invalid product name for item %', item_position;
    end if;
    if coalesce((item ->> 'quantity')::integer, 0) not between 1 and 999 then
      raise exception 'Invalid quantity for item %', item_position;
    end if;
    insert into public.replacement_items(replacement_id, product_name, quantity, position)
    values (created_row.id, trim(item ->> 'product_name'), (item ->> 'quantity')::integer, item_position);
  end loop;

  update public.activity_logs
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('item_count', item_position)
  where id = (
    select id from public.activity_logs
    where replacement_id = created_row.id and action = 'ORDER_CREATED'
    order by created_at desc limit 1
  );

  return created_row;
end;
$$;


--
-- Name: create_replacement_with_photos(uuid, uuid, text, text, text, text, integer, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_replacement_with_photos(p_replacement_id uuid, p_upload_id uuid, p_order_reference text, p_customer_name text, p_customer_reference text, p_product_name text, p_quantity integer, p_reason text, p_notes text, p_tracking_url text, p_attachments jsonb) RETURNS public.replacements
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  created_row public.replacements;
  actor_role public.app_role;
  attachment_count integer := 0;
begin
  select public.current_active_role() into actor_role;
  if actor_role is null or actor_role not in ('CUSTOMER_SUPPORT', 'ADMIN') then
    raise exception 'Only CUSTOMER_SUPPORT can create replacement orders';
  end if;
  if jsonb_typeof(p_attachments) is distinct from 'array'
    or jsonb_array_length(p_attachments) not between 1 and 12 then
    raise exception 'Between one and twelve product photos are required';
  end if;
  if (
    select count(*)
    from jsonb_to_recordset(p_attachments) as item(storage_path text)
    join storage.objects as stored
      on stored.bucket_id = 'replacement-files'
      and stored.name = item.storage_path
      and stored.owner_id = auth.uid()::text
  ) <> jsonb_array_length(p_attachments) then
    raise exception 'Product photo storage objects were not uploaded by the current user';
  end if;

  insert into public.replacements(
    id,
    replacement_number,
    order_reference,
    customer_name,
    customer_reference,
    product_name,
    quantity,
    reason,
    notes,
    tracking_url,
    status,
    created_by
  ) values (
    p_replacement_id,
    'assigned-by-trigger',
    p_order_reference,
    p_customer_name,
    p_customer_reference,
    p_product_name,
    p_quantity,
    p_reason,
    p_notes,
    p_tracking_url,
    'NEW',
    auth.uid()
  ) returning * into created_row;

  insert into public.attachments(
    replacement_id, qc_submission_id, attachment_type, storage_path, file_name, mime_type, uploaded_by
  )
  select
    p_replacement_id, null, 'PROOF_PHOTO', item.storage_path, item.file_name, item.mime_type, auth.uid()
  from jsonb_to_recordset(p_attachments) as item(storage_path text, file_name text, mime_type text)
  where item.mime_type in ('image/jpeg', 'image/png', 'image/webp')
    and item.storage_path like (
      'replacements/' || p_replacement_id || '/CUSTOMER_SUPPORT/' || p_upload_id || '/photos/%'
    );
  get diagnostics attachment_count = row_count;
  if attachment_count <> jsonb_array_length(p_attachments) then
    raise exception 'Invalid product photo metadata';
  end if;

  return created_row;
end;
$$;


--
-- Name: current_active_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_active_role() RETURNS public.app_role
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select role from public.profiles where id = auth.uid() and active = true
$$;


--
-- Name: current_active_roles(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_active_roles() RETURNS public.app_role[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(roles, array[role]) from public.profiles where id = auth.uid() and active = true;
$$;


--
-- Name: dispatch_offline_order(uuid, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dispatch_offline_order(p_order_id uuid, p_lr_number text, p_tracking_url text, p_logistics_partner text, p_attachments jsonb DEFAULT '[]'::jsonb) RETURNS public.offline_orders
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  current_row public.offline_orders;
  actor_role public.app_role;
  attachment_count integer := 0;
  clean_tracking_url text := nullif(trim(p_tracking_url), '');
begin
  select * into current_row from public.offline_orders where id = p_order_id for update;
  if not found then raise exception 'Offline order not found'; end if;

  select public.current_active_role() into actor_role;
  if actor_role is null or actor_role not in ('HR', 'ADMIN') then
    raise exception 'Only HR or Admin can dispatch offline orders';
  end if;
  if current_row.status <> 'PACKING_CONFIRMED' then
    raise exception 'Order can only be dispatched after packing is confirmed';
  end if;
  if clean_tracking_url is not null and clean_tracking_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'Tracking link must begin with http:// or https://';
  end if;

  -- Insert dispatch document attachments if provided
  if jsonb_typeof(p_attachments) = 'array' and jsonb_array_length(p_attachments) > 0 then
    if jsonb_array_length(p_attachments) > 10 then
      raise exception 'Maximum 10 dispatch documents allowed';
    end if;

    insert into public.offline_order_attachments(
      offline_order_id, attachment_type, storage_path, file_name, mime_type, uploaded_by
    )
    select
      p_order_id, 'DISPATCH_DOC', item.storage_path, item.file_name, item.mime_type, auth.uid()
    from jsonb_to_recordset(p_attachments) as item(storage_path text, file_name text, mime_type text)
    where item.mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
      and item.storage_path like ('offline-orders/' || p_order_id || '/dispatch/%');
    get diagnostics attachment_count = row_count;
    if attachment_count <> jsonb_array_length(p_attachments) then
      raise exception 'Invalid dispatch document metadata';
    end if;
  end if;

  update public.offline_orders set
    status = 'DISPATCHED',
    lr_number = nullif(trim(p_lr_number), ''),
    tracking_url = clean_tracking_url,
    logistics_partner = coalesce(nullif(trim(p_logistics_partner), ''), logistics_partner),
    dispatched_at = now(),
    dispatched_by = auth.uid()
  where id = p_order_id
  returning * into current_row;

  insert into public.offline_order_activity_logs(offline_order_id, actor_id, action, metadata)
  values (
    p_order_id, auth.uid(), 'ORDER_DISPATCHED',
    jsonb_build_object(
      'lr_number', nullif(trim(p_lr_number), ''),
      'has_tracking_link', clean_tracking_url is not null,
      'attachment_count', attachment_count
    )
  );

  return current_row;
end;
$_$;


--
-- Name: dispatch_prepare_offline_order(uuid, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dispatch_prepare_offline_order(p_order_id uuid, p_lr_number text, p_tracking_url text, p_logistics_partner text, p_attachments jsonb DEFAULT '[]'::jsonb) RETURNS public.offline_orders
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  current_row public.offline_orders;
  attachment_count integer := 0;
  clean_tracking_url text := nullif(trim(p_tracking_url), '');
begin
  select * into current_row from public.offline_orders where id = p_order_id for update;
  if not found then raise exception 'Offline order not found'; end if;

  if not public.has_any_role('LOGISTICS') then
    raise exception 'Only Logistics or Admin can prepare dispatch details and photos';
  end if;
  if current_row.status <> 'PACKING_CONFIRMED' then
    raise exception 'Dispatch details can only be added after packing is confirmed';
  end if;
  if clean_tracking_url is not null and clean_tracking_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'Tracking link must begin with http:// or https://';
  end if;

  -- Insert document / photo attachments
  if jsonb_typeof(p_attachments) = 'array' and jsonb_array_length(p_attachments) > 0 then
    if jsonb_array_length(p_attachments) > 20 then
      raise exception 'Maximum 20 photos / documents allowed';
    end if;

    insert into public.offline_order_attachments(
      offline_order_id, attachment_type, storage_path, file_name, mime_type, uploaded_by
    )
    select
      p_order_id, 'DISPATCH_DOC', item.storage_path, item.file_name, item.mime_type, auth.uid()
    from jsonb_to_recordset(p_attachments) as item(storage_path text, file_name text, mime_type text)
    where item.mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
      and item.storage_path like ('offline-orders/' || p_order_id || '/dispatch/%');
    get diagnostics attachment_count = row_count;
    if attachment_count <> jsonb_array_length(p_attachments) then
      raise exception 'Invalid photo / document metadata';
    end if;
  end if;

  update public.offline_orders set
    status = 'DISPATCH_PREPARED',
    lr_number = nullif(trim(p_lr_number), ''),
    tracking_url = clean_tracking_url,
    logistics_partner = coalesce(nullif(trim(p_logistics_partner), ''), logistics_partner),
    dispatched_at = now(),
    dispatched_by = auth.uid()
  where id = p_order_id
  returning * into current_row;

  insert into public.offline_order_activity_logs(offline_order_id, actor_id, action, metadata)
  values (
    p_order_id, auth.uid(), 'DISPATCH_PREPARED',
    jsonb_build_object(
      'lr_number', nullif(trim(p_lr_number), ''),
      'logistics_partner', current_row.logistics_partner,
      'has_tracking_link', clean_tracking_url is not null,
      'attachment_count', attachment_count
    )
  );

  return current_row;
end;
$_$;


--
-- Name: enforce_logistics_tracking_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_logistics_tracking_insert() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if new.tracking_url is not null and public.current_active_role() not in ('LOGISTICS', 'ADMIN') then
    raise exception 'Tracking links can only be added by Logistics';
  end if;
  return new;
end;
$$;


--
-- Name: enforce_logistics_tracking_owner(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_logistics_tracking_owner() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if new.tracking_url is distinct from old.tracking_url
    and new.tracking_url is not null
    and public.current_active_role() not in ('LOGISTICS', 'ADMIN') then
    raise exception 'Tracking links can only be added by Logistics';
  end if;
  return new;
end;
$$;


--
-- Name: get_next_order_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_next_order_number() RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_seq bigint;
  v_called boolean;
begin
  select last_value, is_called into v_seq, v_called from public.order_number_sequence;
  if not v_called then
    return v_seq;
  end if;
  return v_seq + 1;
end;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: has_any_role(public.app_role[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_any_role(VARIADIC p_roles public.app_role[]) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active = true
      and (
        'ADMIN' = any(coalesce(roles, array[role]))
        or coalesce(roles, array[role]) && p_roles
      )
  );
$$;


--
-- Name: has_role(public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(p_role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active = true
      and ('ADMIN' = any(coalesce(roles, array[role])) or p_role = any(coalesce(roles, array[role])))
  );
$$;


--
-- Name: log_attachment_uploaded(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_attachment_uploaded() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  insert into public.activity_logs(replacement_id, actor_id, action, message, metadata)
  values (new.replacement_id, new.uploaded_by, 'FILE_UPLOADED', new.file_name, jsonb_build_object('attachment_id', new.id, 'attachment_type', new.attachment_type));
  return new;
end;
$$;


--
-- Name: log_replacement_created(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_replacement_created() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  insert into public.activity_logs(replacement_id, actor_id, action) values (new.id, new.created_by, 'REPLACEMENT_CREATED');
  return new;
end;
$$;


--
-- Name: mark_offline_delivery_unsuccessful(uuid, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_offline_delivery_unsuccessful(p_order_id uuid, p_reason text DEFAULT NULL::text, p_new_logistics_partner text DEFAULT NULL::text, p_new_lr_number text DEFAULT NULL::text, p_new_tracking_url text DEFAULT NULL::text, p_outcome text DEFAULT NULL::text) RETURNS public.offline_orders
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  current_row public.offline_orders;
  clean_reason text := nullif(trim(p_reason), '');
  clean_partner text := nullif(trim(p_new_logistics_partner), '');
  clean_lr text := nullif(trim(p_new_lr_number), '');
  clean_tracking_url text := nullif(trim(p_new_tracking_url), '');
  clean_outcome text := upper(trim(coalesce(p_outcome, '')));
  has_new_tracking boolean;
  final_delivery_status text;
  action_name text;
begin
  if not public.has_any_role('LOGISTICS') then
    raise exception 'Only Logistics or Admin can update delivery status';
  end if;

  select * into current_row from public.offline_orders where id = p_order_id for update;
  if not found then raise exception 'Offline order not found'; end if;

  if clean_reason is null and current_row.rta_reason is not null then
    clean_reason := current_row.rta_reason;
  end if;

  if clean_reason is null then
    raise exception 'Reason for unsuccessful delivery is required';
  end if;

  if current_row.status not in ('PICKED_UP', 'DELIVERED', 'ACKNOWLEDGED') then
    raise exception 'Can only update delivery status for picked up or delivered orders';
  end if;

  if clean_tracking_url is not null and clean_tracking_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'Tracking link must begin with http:// or https://';
  end if;

  has_new_tracking := (clean_partner is not null and clean_lr is not null);

  if clean_outcome = 'RTO' then
    final_delivery_status := 'RTO';
    action_name := 'RTO_MARKED';
  elsif has_new_tracking or clean_outcome = 'RTA' then
    final_delivery_status := 'RTA';
    action_name := 'RTA_REASSIGNED';
  else
    final_delivery_status := 'UNSUCCESSFUL';
    action_name := 'DELIVERY_UNSUCCESSFUL';
  end if;

  update public.offline_orders set
    status = 'PICKED_UP',
    delivery_status = final_delivery_status,
    rta_reason = clean_reason,
    rta_at = now(),
    rta_by = auth.uid(),
    logistics_partner = coalesce(clean_partner, logistics_partner),
    lr_number = coalesce(clean_lr, lr_number),
    tracking_url = coalesce(clean_tracking_url, tracking_url),
    picked_up_at = case when has_new_tracking then now() else picked_up_at end,
    delivered_at = null,
    delivered_by = null,
    pod_notes = null
  where id = p_order_id
  returning * into current_row;

  insert into public.offline_order_activity_logs(offline_order_id, actor_id, action, message, metadata)
  values (
    p_order_id,
    auth.uid(),
    action_name,
    clean_reason,
    jsonb_build_object(
      'outcome', final_delivery_status,
      'new_partner', clean_partner,
      'new_lr_number', clean_lr,
      'new_tracking_url', clean_tracking_url
    )
  );

  return current_row;
end;
$_$;


--
-- Name: mark_replacement_unsuccessful(uuid, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_replacement_unsuccessful(p_replacement_id uuid, p_reason text DEFAULT NULL::text, p_new_courier text DEFAULT NULL::text, p_new_tracking_id text DEFAULT NULL::text, p_new_tracking_url text DEFAULT NULL::text, p_outcome text DEFAULT NULL::text) RETURNS public.replacements
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  current_row public.replacements;
  clean_reason text := nullif(trim(p_reason), '');
  clean_courier text := nullif(trim(p_new_courier), '');
  clean_tracking_id text := nullif(trim(p_new_tracking_id), '');
  clean_tracking_url text := nullif(trim(p_new_tracking_url), '');
  clean_outcome text := upper(trim(coalesce(p_outcome, '')));
  has_new_tracking boolean;
  final_delivery_status text;
  action_name text;
begin
  if not public.has_any_role('LOGISTICS') then
    raise exception 'Only Logistics or Admin can update delivery status';
  end if;

  select * into current_row from public.replacements where id = p_replacement_id for update;
  if not found then raise exception 'Replacement order not found'; end if;

  if clean_reason is null and current_row.rta_reason is not null then
    clean_reason := current_row.rta_reason;
  end if;

  if clean_reason is null then
    raise exception 'Reason for unsuccessful delivery is required';
  end if;

  if current_row.status not in ('SHIPPED', 'DELIVERED') then
    raise exception 'Can only mark shipped or delivered orders as unsuccessful';
  end if;

  if clean_tracking_url is not null and clean_tracking_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'Tracking link must begin with http:// or https://';
  end if;

  has_new_tracking := (clean_courier is not null and clean_tracking_id is not null);

  if clean_outcome = 'RTO' then
    final_delivery_status := 'RTO';
    action_name := 'RTO_MARKED';
  elsif has_new_tracking or clean_outcome = 'RTA' then
    final_delivery_status := 'RTA';
    action_name := 'RTA_REASSIGNED';
  else
    final_delivery_status := 'UNSUCCESSFUL';
    action_name := 'DELIVERY_UNSUCCESSFUL';
  end if;

  update public.replacements set
    status = 'SHIPPED',
    delivery_status = final_delivery_status,
    rta_reason = clean_reason,
    rta_at = now(),
    rta_by = auth.uid(),
    courier_partner = coalesce(clean_courier, courier_partner),
    tracking_id = coalesce(clean_tracking_id, tracking_id),
    tracking_url = coalesce(clean_tracking_url, tracking_url),
    shipped_at = case when has_new_tracking then now() else shipped_at end,
    delivered_at = null,
    delivered_by = null,
    delivery_notes = null
  where id = p_replacement_id
  returning * into current_row;

  insert into public.activity_logs(replacement_id, actor_id, action, message, metadata)
  values (
    p_replacement_id,
    auth.uid(),
    action_name,
    clean_reason,
    jsonb_build_object(
      'outcome', final_delivery_status,
      'new_courier', clean_courier,
      'new_tracking_id', clean_tracking_id,
      'new_tracking_url', clean_tracking_url
    )
  );

  return current_row;
end;
$_$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: submit_logistics_label(uuid, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_logistics_label(p_replacement_id uuid, p_upload_id uuid, p_attachments jsonb) RETURNS public.replacements
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select public.submit_logistics_label(p_replacement_id, p_upload_id, null, p_attachments, null, null);
$$;


--
-- Name: submit_logistics_label(uuid, uuid, text, jsonb, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_logistics_label(p_replacement_id uuid, p_upload_id uuid, p_tracking_url text, p_attachments jsonb, p_courier_partner text DEFAULT NULL::text, p_tracking_id text DEFAULT NULL::text) RETURNS public.replacements
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  current_row public.replacements;
  actor_role public.app_role;
  attachment_count integer := 0;
  clean_tracking_url text := nullif(trim(p_tracking_url), '');
  clean_courier text := nullif(trim(p_courier_partner), '');
  clean_tracking_id text := nullif(trim(p_tracking_id), '');
begin
  select * into current_row from public.replacements where id = p_replacement_id for update;
  if not found then raise exception 'Order not found'; end if;
  select public.current_active_role() into actor_role;
  if actor_role is null or not (actor_role in ('LOGISTICS', 'ADMIN') or public.has_any_role('LOGISTICS', 'ADMIN')) then
    raise exception 'Only Logistics can upload the shipping label';
  end if;
  if current_row.status <> 'NEW' then raise exception 'A label can only be uploaded for a new order'; end if;
  if clean_tracking_url is not null and clean_tracking_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'Tracking link must begin with http:// or https://';
  end if;
  if jsonb_typeof(p_attachments) is distinct from 'array' or jsonb_array_length(p_attachments) <> 1 then
    raise exception 'Exactly one shipping label is required';
  end if;
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

  update public.replacements set
    status = 'LABEL_UPLOADED',
    tracking_url = clean_tracking_url,
    courier_partner = clean_courier,
    tracking_id = clean_tracking_id,
    order_reference = coalesce(clean_courier, order_reference)
  where id = p_replacement_id returning * into current_row;

  insert into public.activity_logs(replacement_id, actor_id, action, metadata)
  values (p_replacement_id, auth.uid(), 'LOGISTICS_SUBMITTED', jsonb_build_object(
    'upload_id', p_upload_id,
    'attachment_count', attachment_count,
    'has_tracking_link', clean_tracking_url is not null,
    'courier_partner', clean_courier,
    'tracking_id', clean_tracking_id
  ));
  return current_row;
end;
$_$;


--
-- Name: submit_packing_qc(uuid, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_packing_qc(p_replacement_id uuid, p_submission_id uuid, p_attachments jsonb) RETURNS public.replacements
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
  if jsonb_typeof(p_attachments) is distinct from 'array'
    or jsonb_array_length(p_attachments) not between 1 and 12 then
    raise exception 'Between one and twelve QC photos are required';
  end if;
  if not exists (
    select 1
    from public.attachments attachment
    join storage.objects stored
      on stored.bucket_id = 'replacement-files'
      and stored.name = attachment.storage_path
    where attachment.replacement_id = p_replacement_id
      and attachment.attachment_type = 'LABEL'
  ) then
    raise exception 'A stored shipping label is required before QC';
  end if;
  if (
    select count(*)
    from jsonb_to_recordset(p_attachments) as item(storage_path text)
    join storage.objects as stored
      on stored.bucket_id = 'replacement-files'
      and stored.name = item.storage_path
      and stored.owner_id = auth.uid()::text
  ) <> jsonb_array_length(p_attachments) then
    raise exception 'QC photo storage objects were not uploaded by the current user';
  end if;

  select coalesce(max(submission_number), 0) + 1
  into next_submission
  from public.qc_submissions
  where replacement_id = p_replacement_id;

  insert into public.qc_submissions(id, replacement_id, submission_number, submitted_by)
  values (p_submission_id, p_replacement_id, next_submission, auth.uid());

  insert into public.attachments(
    replacement_id, qc_submission_id, attachment_type, storage_path, file_name, mime_type, uploaded_by
  )
  select
    p_replacement_id, p_submission_id, 'QC_PHOTO', item.storage_path, item.file_name, item.mime_type, auth.uid()
  from jsonb_to_recordset(p_attachments) as item(storage_path text, file_name text, mime_type text)
  where item.mime_type in ('image/jpeg', 'image/png', 'image/webp')
    and item.storage_path like (
      'replacements/' || p_replacement_id || '/packing/' || p_submission_id || '/photos/%'
    );
  get diagnostics attachment_count = row_count;
  if attachment_count <> jsonb_array_length(p_attachments) then raise exception 'Invalid QC photo metadata'; end if;

  update public.replacements set
    status = 'QC_PENDING',
    qc_submitted_at = now()
  where id = p_replacement_id
  returning * into current_row;

  insert into public.activity_logs(replacement_id, actor_id, action, metadata)
  values (
    p_replacement_id,
    auth.uid(),
    'QC_SUBMITTED',
    jsonb_build_object(
      'submission_id', p_submission_id,
      'submission_number', next_submission,
      'attachment_count', attachment_count
    )
  );
  return current_row;
end;
$$;


--
-- Name: sync_changed_order_number_sequence(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_changed_order_number_sequence() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform setval('public.order_number_sequence', new.order_number, true);
  return new;
end;
$$;


--
-- Name: sync_offline_primary_item(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_offline_primary_item() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  update public.offline_order_items
  set product_name = new.product_name, quantity = new.quantity
  where offline_order_id = new.id and position = 1;
  return new;
end;
$$;


--
-- Name: sync_profile_roles(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_profile_roles() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: sync_replacement_primary_item(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_replacement_primary_item() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  update public.replacement_items
  set product_name = new.product_name, quantity = new.quantity
  where replacement_id = new.id and position = 1;
  return new;
end;
$$;


--
-- Name: transition_replacement(uuid, public.replacement_status, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.transition_replacement(p_replacement_id uuid, p_target_status public.replacement_status, p_message text DEFAULT NULL::text) RETURNS public.replacements
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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

  if p_target_status = 'LABEL_PRINTED' then
    if not (current_row.status = 'LABEL_UPLOADED' and (actor_role in ('PRINTING', 'ADMIN') or public.has_any_role('PRINTING', 'ADMIN'))) then
      raise exception 'Only Printing can mark an uploaded label as printed';
    end if;
  elsif p_target_status in ('QC_APPROVED', 'QC_REJECTED') then
    if not (current_row.status = 'QC_PENDING' and (actor_role in ('CUSTOMER_SUPPORT', 'ADMIN') or public.has_any_role('CUSTOMER_SUPPORT', 'ADMIN'))) then
      raise exception 'Only CUSTOMER_SUPPORT can review pending QC';
    end if;
  elsif p_target_status = 'PACKED' then
    if not (current_row.status = 'QC_APPROVED' and (actor_role in ('PACKING', 'ADMIN') or public.has_any_role('PACKING', 'ADMIN'))) then
      raise exception 'QC must be approved before Packing packs the order';
    end if;
  elsif p_target_status = 'SHIPPED' then
    if not (current_row.status in ('PACKED', 'NEEDS_TOKEN') and (actor_role in ('PACKING', 'ADMIN') or public.has_any_role('PACKING', 'ADMIN'))) then
      raise exception 'Only Packing can mark a packed replacement as shipped';
    end if;
  elsif p_target_status = 'NEEDS_TOKEN' then
    if not (current_row.status = 'PACKED' and (actor_role in ('PACKING', 'ADMIN') or public.has_any_role('PACKING', 'ADMIN'))) then
      raise exception 'Only Packing can mark a packed replacement as needing a token';
    end if;
  elsif p_target_status = 'DELIVERED' then
    if not (current_row.status = 'SHIPPED' and (actor_role in ('LOGISTICS', 'ADMIN') or public.has_any_role('LOGISTICS', 'ADMIN'))) then
      raise exception 'Only Logistics can mark a shipped replacement as delivered';
    end if;
  elsif p_target_status = 'CANCELLED' then
    if not (current_row.status not in ('SHIPPED', 'DELIVERED', 'CANCELLED') and (actor_role = 'ADMIN' or public.has_role('ADMIN'))) then
      raise exception 'Only Admin can cancel an open replacement';
    end if;
  else
    raise exception 'Unsupported transition';
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
    needs_token_at = case when p_target_status = 'NEEDS_TOKEN' then now() else needs_token_at end,
    delivered_at = case when p_target_status = 'DELIVERED' then now() else delivered_at end,
    delivered_by = case when p_target_status = 'DELIVERED' then auth.uid() else delivered_by end,
    delivery_notes = case when p_target_status = 'DELIVERED' and nullif(trim(p_message), '') is not null then trim(p_message) else delivery_notes end
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


--
-- Name: update_offline_order_number(uuid, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_offline_order_number(p_order_id uuid, p_order_number bigint) RETURNS public.offline_orders
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  current_row public.offline_orders;
  previous_number bigint;
begin
  if not (public.has_any_role('BOSS', 'HR', 'CUSTOMER_SUPPORT', 'ADMIN')) then
    raise exception 'Unauthorized to change Order ID';
  end if;
  if p_order_number < 1 then
    raise exception 'Order ID must be a positive whole number';
  end if;

  select * into current_row from public.offline_orders where id = p_order_id for update;
  if not found then raise exception 'Offline order not found'; end if;
  previous_number := current_row.order_number;

  if exists (select 1 from public.offline_orders where order_number = p_order_number and id <> p_order_id) then
    raise exception 'Order ID % is already in use by another offline order', p_order_number using errcode = '23505';
  end if;

  update public.offline_orders set order_number = p_order_number
  where id = p_order_id returning * into current_row;

  if previous_number is distinct from p_order_number then
    insert into public.offline_order_activity_logs(offline_order_id, actor_id, action, metadata)
    values (
      p_order_id,
      auth.uid(),
      'ORDER_NUMBER_CHANGED',
      jsonb_build_object('from_order_number', previous_number, 'to_order_number', p_order_number)
    );

    perform setval('public.order_number_sequence', p_order_number, true);
  end if;

  return current_row;
end;
$$;


--
-- Name: update_replacement_details(uuid, text, text, text, text, integer, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_replacement_details(p_replacement_id uuid, p_order_reference text, p_customer_name text, p_customer_reference text, p_product_name text, p_quantity integer, p_reason text, p_notes text, p_tracking_url text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  actor_role public.app_role;
  clean_tracking_url text := nullif(trim(p_tracking_url), '');
begin
  select public.current_active_role() into actor_role;
  if actor_role is null or actor_role not in ('CUSTOMER_SUPPORT', 'ADMIN') then
    raise exception 'Only CUSTOMER_SUPPORT can edit replacement details';
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
$_$;


--
-- Name: update_replacement_details_with_order_number(uuid, bigint, text, text, text, text, integer, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_replacement_details_with_order_number(p_replacement_id uuid, p_order_number bigint, p_order_reference text, p_customer_name text, p_customer_reference text, p_product_name text, p_quantity integer, p_reason text, p_notes text, p_tracking_url text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  actor_role public.app_role;
  clean_tracking_url text := nullif(trim(p_tracking_url), '');
  previous_number bigint;
begin
  select public.current_active_role() into actor_role;
  if actor_role is null or not (actor_role in ('CUSTOMER_SUPPORT', 'HR', 'BOSS', 'ADMIN') or public.has_any_role('CUSTOMER_SUPPORT', 'HR', 'BOSS', 'ADMIN')) then
    raise exception 'Unauthorized to edit replacement details';
  end if;
  if p_order_number is not null and p_order_number < 1 then
    raise exception 'Order ID must be a positive whole number';
  end if;
  if nullif(trim(p_order_reference), '') is null
    or nullif(trim(p_product_name), '') is null
    or p_quantity not between 1 and 999 then
    raise exception 'Invalid replacement details';
  end if;
  if clean_tracking_url is not null and clean_tracking_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'Tracking link must begin with http:// or https://';
  end if;

  select order_number into previous_number
  from public.replacements
  where id = p_replacement_id and status not in ('SHIPPED', 'CANCELLED')
  for update;
  if not found then raise exception 'Open replacement not found'; end if;

  if p_order_number is not null and exists (
    select 1 from public.replacements where order_number = p_order_number and id <> p_replacement_id
  ) then
    raise exception 'Order ID % is already in use by another replacement order', p_order_number using errcode = '23505';
  end if;

  update public.replacements
  set order_number = coalesce(p_order_number, order_number),
      order_reference = trim(p_order_reference),
      customer_name = nullif(trim(p_customer_name), ''),
      customer_reference = null,
      product_name = trim(p_product_name),
      quantity = p_quantity,
      reason = nullif(trim(p_reason), ''),
      notes = nullif(trim(p_notes), ''),
      tracking_url = clean_tracking_url
  where id = p_replacement_id;

  insert into public.activity_logs(replacement_id, actor_id, action, metadata)
  values (
    p_replacement_id,
    auth.uid(),
    'REPLACEMENT_UPDATED',
    jsonb_build_object(
      'has_tracking_link', clean_tracking_url is not null,
      'from_order_number', previous_number,
      'to_order_number', coalesce(p_order_number, previous_number)
    )
  );

  -- Update sequence directly so the next new order increments from this updated number
  if p_order_number is not null and p_order_number is distinct from previous_number then
    perform setval('public.order_number_sequence', p_order_number, true);
  end if;
end;
$_$;


--
-- Name: users; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.users (
    instance_id uuid,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    aud text,
    role text,
    email text,
    encrypted_password text,
    email_confirmed_at timestamp with time zone,
    invited_at timestamp with time zone,
    confirmation_token text,
    confirmation_sent_at timestamp with time zone,
    recovery_token text,
    recovery_sent_at timestamp with time zone,
    email_change_token_new text,
    email_change text,
    email_change_sent_at timestamp with time zone,
    last_sign_in_at timestamp with time zone,
    raw_app_meta_data jsonb DEFAULT '{}'::jsonb,
    raw_user_meta_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_super_admin boolean,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    phone text,
    phone_confirmed_at timestamp with time zone,
    phone_change text,
    phone_change_token text,
    phone_change_sent_at timestamp with time zone,
    email_change_token_current text,
    email_change_confirm_status smallint DEFAULT 0,
    banned_until timestamp with time zone,
    reauthentication_token text,
    reauthentication_sent_at timestamp with time zone,
    is_sso_user boolean DEFAULT false,
    deleted_at timestamp with time zone,
    is_anonymous boolean DEFAULT false
);


--
-- Name: activity_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    replacement_id uuid NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    message text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT activity_logs_action_check CHECK (((char_length(action) >= 1) AND (char_length(action) <= 80))),
    CONSTRAINT activity_logs_message_check CHECK (((message IS NULL) OR (char_length(message) <= 1000)))
);


--
-- Name: attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    replacement_id uuid NOT NULL,
    qc_submission_id uuid,
    attachment_type public.attachment_type NOT NULL,
    storage_path text NOT NULL,
    file_name text NOT NULL,
    mime_type text NOT NULL,
    uploaded_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT attachments_check CHECK ((((attachment_type = 'QC_PHOTO'::public.attachment_type) AND (qc_submission_id IS NOT NULL) AND (mime_type <> 'application/pdf'::text)) OR ((attachment_type <> 'QC_PHOTO'::public.attachment_type) AND (qc_submission_id IS NULL)))),
    CONSTRAINT attachments_file_name_check CHECK (((char_length(file_name) >= 1) AND (char_length(file_name) <= 100))),
    CONSTRAINT attachments_mime_type_check CHECK ((mime_type = ANY (ARRAY['image/jpeg'::text, 'image/png'::text, 'image/webp'::text, 'application/pdf'::text]))),
    CONSTRAINT attachments_storage_path_check CHECK ((storage_path ~~ 'replacements/%'::text))
);


--
-- Name: customer_presets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_presets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    address text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT customer_presets_address_check CHECK (((char_length(TRIM(BOTH FROM address)) >= 1) AND (char_length(TRIM(BOTH FROM address)) <= 2000))),
    CONSTRAINT customer_presets_email_check CHECK (((email IS NULL) OR (char_length(email) <= 255))),
    CONSTRAINT customer_presets_name_check CHECK (((char_length(TRIM(BOTH FROM name)) >= 1) AND (char_length(TRIM(BOTH FROM name)) <= 200))),
    CONSTRAINT customer_presets_phone_check CHECK (((phone IS NULL) OR (char_length(phone) <= 50)))
);


--
-- Name: dimension_presets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dimension_presets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    length_cm numeric(10,2) NOT NULL,
    breadth_cm numeric(10,2) NOT NULL,
    height_cm numeric(10,2) NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dimension_presets_breadth_cm_check CHECK (((breadth_cm > (0)::numeric) AND (breadth_cm <= (10000)::numeric))),
    CONSTRAINT dimension_presets_height_cm_check CHECK (((height_cm > (0)::numeric) AND (height_cm <= (10000)::numeric))),
    CONSTRAINT dimension_presets_length_cm_check CHECK (((length_cm > (0)::numeric) AND (length_cm <= (10000)::numeric))),
    CONSTRAINT dimension_presets_name_check CHECK (((char_length(TRIM(BOTH FROM name)) >= 1) AND (char_length(TRIM(BOTH FROM name)) <= 100)))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    replacement_id uuid NOT NULL,
    channel text NOT NULL,
    type text NOT NULL,
    status public.notification_status NOT NULL,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    CONSTRAINT notifications_channel_check CHECK ((channel = 'TELEGRAM'::text)),
    CONSTRAINT notifications_type_check CHECK (((char_length(type) >= 1) AND (char_length(type) <= 80)))
);


--
-- Name: offline_order_activity_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offline_order_activity_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    offline_order_id uuid NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    message text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT offline_order_activity_logs_action_check CHECK (((char_length(action) >= 1) AND (char_length(action) <= 80))),
    CONSTRAINT offline_order_activity_logs_message_check CHECK (((message IS NULL) OR (char_length(message) <= 1000)))
);


--
-- Name: offline_order_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offline_order_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    offline_order_id uuid NOT NULL,
    attachment_type text NOT NULL,
    storage_path text NOT NULL,
    file_name text NOT NULL,
    mime_type text NOT NULL,
    uploaded_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT offline_order_attachments_attachment_type_check CHECK ((attachment_type = ANY (ARRAY['DISPATCH_DOC'::text, 'POD'::text, 'OTHER'::text]))),
    CONSTRAINT offline_order_attachments_file_name_check CHECK (((char_length(file_name) >= 1) AND (char_length(file_name) <= 100))),
    CONSTRAINT offline_order_attachments_mime_type_check CHECK ((mime_type = ANY (ARRAY['image/jpeg'::text, 'image/png'::text, 'image/webp'::text, 'application/pdf'::text]))),
    CONSTRAINT offline_order_attachments_storage_path_check CHECK ((storage_path ~~ 'offline-orders/%'::text))
);


--
-- Name: offline_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offline_order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    offline_order_id uuid NOT NULL,
    product_name text NOT NULL,
    quantity integer NOT NULL,
    "position" smallint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT offline_order_items_position_check CHECK ((("position" >= 1) AND ("position" <= 20))),
    CONSTRAINT offline_order_items_product_name_check CHECK (((char_length(TRIM(BOTH FROM product_name)) >= 1) AND (char_length(TRIM(BOTH FROM product_name)) <= 200))),
    CONSTRAINT offline_order_items_quantity_check CHECK (((quantity >= 1) AND (quantity <= 999999)))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text NOT NULL,
    role public.app_role DEFAULT 'PRINTING'::public.app_role NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    roles public.app_role[] DEFAULT ARRAY['PRINTING'::public.app_role] NOT NULL,
    CONSTRAINT profiles_full_name_check CHECK (((char_length(full_name) >= 1) AND (char_length(full_name) <= 120)))
);


--
-- Name: qc_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qc_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    replacement_id uuid NOT NULL,
    submission_number integer NOT NULL,
    submitted_by uuid NOT NULL,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    decision public.qc_decision DEFAULT 'PENDING'::public.qc_decision NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    rejection_reason text,
    CONSTRAINT qc_submissions_rejection_reason_check CHECK (((rejection_reason IS NULL) OR (char_length(rejection_reason) <= 1000))),
    CONSTRAINT qc_submissions_submission_number_check CHECK ((submission_number > 0))
);


--
-- Name: replacement_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.replacement_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    replacement_id uuid NOT NULL,
    product_name text NOT NULL,
    quantity integer NOT NULL,
    "position" smallint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT replacement_items_position_check CHECK ((("position" >= 1) AND ("position" <= 20))),
    CONSTRAINT replacement_items_product_name_check CHECK (((char_length(TRIM(BOTH FROM product_name)) >= 1) AND (char_length(TRIM(BOTH FROM product_name)) <= 200))),
    CONSTRAINT replacement_items_quantity_check CHECK (((quantity >= 1) AND (quantity <= 999)))
);


--
-- Name: replacement_sequences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.replacement_sequences (
    year integer NOT NULL,
    last_value integer NOT NULL,
    CONSTRAINT replacement_sequences_last_value_check CHECK (((last_value >= 1) AND (last_value <= 9999))),
    CONSTRAINT replacement_sequences_year_check CHECK (((year >= 2000) AND (year <= 9999)))
);


--
-- Name: workspace_bootstrap; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_bootstrap (
    singleton boolean DEFAULT true NOT NULL,
    first_admin_user_id uuid,
    bootstrapped_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workspace_bootstrap_singleton_check CHECK (singleton)
);


--
-- Name: buckets; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets (
    id text NOT NULL,
    name text NOT NULL,
    owner text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    public boolean DEFAULT false NOT NULL,
    avif_autodetection boolean DEFAULT false,
    file_size_limit bigint,
    allowed_mime_types text[],
    owner_id text,
    type text,
    versioning_status text,
    lifecycle_configuration jsonb,
    lifecycle_configuration_generation bigint
);


--
-- Name: objects; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket_id text NOT NULL,
    name text NOT NULL,
    owner text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_accessed_at timestamp with time zone,
    metadata jsonb,
    version text,
    owner_id text,
    user_metadata jsonb,
    archived_at timestamp with time zone,
    is_delete_marker boolean DEFAULT false,
    is_versioned boolean DEFAULT false
);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: activity_logs activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_pkey PRIMARY KEY (id);


--
-- Name: attachments attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_pkey PRIMARY KEY (id);


--
-- Name: attachments attachments_storage_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_storage_path_key UNIQUE (storage_path);


--
-- Name: customer_presets customer_presets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_presets
    ADD CONSTRAINT customer_presets_pkey PRIMARY KEY (id);


--
-- Name: dimension_presets dimension_presets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dimension_presets
    ADD CONSTRAINT dimension_presets_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: offline_order_activity_logs offline_order_activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_order_activity_logs
    ADD CONSTRAINT offline_order_activity_logs_pkey PRIMARY KEY (id);


--
-- Name: offline_order_attachments offline_order_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_order_attachments
    ADD CONSTRAINT offline_order_attachments_pkey PRIMARY KEY (id);


--
-- Name: offline_order_attachments offline_order_attachments_storage_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_order_attachments
    ADD CONSTRAINT offline_order_attachments_storage_path_key UNIQUE (storage_path);


--
-- Name: offline_order_items offline_order_items_offline_order_id_position_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_order_items
    ADD CONSTRAINT offline_order_items_offline_order_id_position_key UNIQUE (offline_order_id, "position");


--
-- Name: offline_order_items offline_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_order_items
    ADD CONSTRAINT offline_order_items_pkey PRIMARY KEY (id);


--
-- Name: offline_orders offline_orders_order_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_orders
    ADD CONSTRAINT offline_orders_order_number_key UNIQUE (order_number);


--
-- Name: offline_orders offline_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_orders
    ADD CONSTRAINT offline_orders_pkey PRIMARY KEY (id);


--
-- Name: offline_orders offline_orders_so_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_orders
    ADD CONSTRAINT offline_orders_so_number_key UNIQUE (so_number);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: qc_submissions qc_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qc_submissions
    ADD CONSTRAINT qc_submissions_pkey PRIMARY KEY (id);


--
-- Name: qc_submissions qc_submissions_replacement_id_submission_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qc_submissions
    ADD CONSTRAINT qc_submissions_replacement_id_submission_number_key UNIQUE (replacement_id, submission_number);


--
-- Name: replacement_items replacement_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.replacement_items
    ADD CONSTRAINT replacement_items_pkey PRIMARY KEY (id);


--
-- Name: replacement_items replacement_items_replacement_id_position_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.replacement_items
    ADD CONSTRAINT replacement_items_replacement_id_position_key UNIQUE (replacement_id, "position");


--
-- Name: replacement_sequences replacement_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.replacement_sequences
    ADD CONSTRAINT replacement_sequences_pkey PRIMARY KEY (year);


--
-- Name: replacements replacements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.replacements
    ADD CONSTRAINT replacements_pkey PRIMARY KEY (id);


--
-- Name: replacements replacements_replacement_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.replacements
    ADD CONSTRAINT replacements_replacement_number_key UNIQUE (replacement_number);


--
-- Name: workspace_bootstrap workspace_bootstrap_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_bootstrap
    ADD CONSTRAINT workspace_bootstrap_pkey PRIMARY KEY (singleton);


--
-- Name: buckets buckets_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets
    ADD CONSTRAINT buckets_pkey PRIMARY KEY (id);


--
-- Name: objects objects_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT objects_pkey PRIMARY KEY (id);


--
-- Name: activity_logs_replacement_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_logs_replacement_idx ON public.activity_logs USING btree (replacement_id, created_at DESC);


--
-- Name: attachments_qc_submission_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attachments_qc_submission_idx ON public.attachments USING btree (qc_submission_id) WHERE (qc_submission_id IS NOT NULL);


--
-- Name: attachments_replacement_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attachments_replacement_idx ON public.attachments USING btree (replacement_id, created_at);


--
-- Name: customer_presets_name_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX customer_presets_name_active_idx ON public.customer_presets USING btree (lower(name)) WHERE (active = true);


--
-- Name: dimension_presets_name_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX dimension_presets_name_active_idx ON public.dimension_presets USING btree (lower(name)) WHERE (active = true);


--
-- Name: notifications_failed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_failed_idx ON public.notifications USING btree (status, created_at DESC) WHERE (status = 'FAILED'::public.notification_status);


--
-- Name: notifications_replacement_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_replacement_idx ON public.notifications USING btree (replacement_id, created_at DESC);


--
-- Name: offline_order_activity_logs_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX offline_order_activity_logs_order_idx ON public.offline_order_activity_logs USING btree (offline_order_id, created_at DESC);


--
-- Name: offline_order_attachments_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX offline_order_attachments_order_idx ON public.offline_order_attachments USING btree (offline_order_id, created_at);


--
-- Name: offline_order_items_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX offline_order_items_parent_idx ON public.offline_order_items USING btree (offline_order_id, "position");


--
-- Name: offline_order_items_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX offline_order_items_product_idx ON public.offline_order_items USING btree (product_name);


--
-- Name: offline_orders_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX offline_orders_created_at_idx ON public.offline_orders USING btree (created_at DESC);


--
-- Name: offline_orders_customer_preset_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX offline_orders_customer_preset_id_idx ON public.offline_orders USING btree (customer_preset_id) WHERE (customer_preset_id IS NOT NULL);


--
-- Name: offline_orders_delivery_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX offline_orders_delivery_status_idx ON public.offline_orders USING btree (delivery_status) WHERE (delivery_status IS NOT NULL);


--
-- Name: offline_orders_so_number_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX offline_orders_so_number_idx ON public.offline_orders USING btree (so_number);


--
-- Name: offline_orders_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX offline_orders_status_idx ON public.offline_orders USING btree (status, created_at DESC);


--
-- Name: qc_submissions_replacement_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX qc_submissions_replacement_idx ON public.qc_submissions USING btree (replacement_id, submission_number DESC);


--
-- Name: replacement_items_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX replacement_items_parent_idx ON public.replacement_items USING btree (replacement_id, "position");


--
-- Name: replacement_items_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX replacement_items_product_idx ON public.replacement_items USING btree (product_name);


--
-- Name: replacements_archived_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX replacements_archived_created_idx ON public.replacements USING btree (archived_at, created_at DESC);


--
-- Name: replacements_delivery_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX replacements_delivery_status_idx ON public.replacements USING btree (delivery_status) WHERE (delivery_status IS NOT NULL);


--
-- Name: replacements_order_group_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX replacements_order_group_idx ON public.replacements USING btree (order_group_id) WHERE (order_group_id IS NOT NULL);


--
-- Name: replacements_order_number_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX replacements_order_number_idx ON public.replacements USING btree (order_number);


--
-- Name: replacements_order_reference_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX replacements_order_reference_idx ON public.replacements USING btree (order_reference);


--
-- Name: replacements_product_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX replacements_product_name_idx ON public.replacements USING btree (product_name);


--
-- Name: replacements_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX replacements_status_created_idx ON public.replacements USING btree (status, created_at DESC);


--
-- Name: users on_auth_user_created; Type: TRIGGER; Schema: auth; Owner: -
--

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


--
-- Name: attachments attachments_log_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER attachments_log_created AFTER INSERT ON public.attachments FOR EACH ROW EXECUTE FUNCTION public.log_attachment_uploaded();


--
-- Name: customer_presets customer_presets_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER customer_presets_set_updated_at BEFORE UPDATE ON public.customer_presets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: dimension_presets dimension_presets_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dimension_presets_set_updated_at BEFORE UPDATE ON public.dimension_presets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: offline_orders offline_orders_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER offline_orders_set_updated_at BEFORE UPDATE ON public.offline_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: offline_orders offline_orders_sync_changed_order_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER offline_orders_sync_changed_order_number AFTER UPDATE OF order_number ON public.offline_orders FOR EACH ROW WHEN ((old.order_number IS DISTINCT FROM new.order_number)) EXECUTE FUNCTION public.sync_changed_order_number_sequence();


--
-- Name: offline_orders offline_orders_sync_primary_item; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER offline_orders_sync_primary_item AFTER UPDATE OF product_name, quantity ON public.offline_orders FOR EACH ROW EXECUTE FUNCTION public.sync_offline_primary_item();


--
-- Name: profiles profiles_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: replacements replacements_assign_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER replacements_assign_number BEFORE INSERT ON public.replacements FOR EACH ROW EXECUTE FUNCTION public.assign_replacement_number();


--
-- Name: replacements replacements_enforce_tracking_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER replacements_enforce_tracking_insert BEFORE INSERT ON public.replacements FOR EACH ROW EXECUTE FUNCTION public.enforce_logistics_tracking_insert();


--
-- Name: replacements replacements_enforce_tracking_owner; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER replacements_enforce_tracking_owner BEFORE UPDATE OF tracking_url ON public.replacements FOR EACH ROW EXECUTE FUNCTION public.enforce_logistics_tracking_owner();


--
-- Name: replacements replacements_log_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER replacements_log_created AFTER INSERT ON public.replacements FOR EACH ROW EXECUTE FUNCTION public.log_replacement_created();


--
-- Name: replacements replacements_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER replacements_set_updated_at BEFORE UPDATE ON public.replacements FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: replacements replacements_sync_changed_order_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER replacements_sync_changed_order_number AFTER UPDATE OF order_number ON public.replacements FOR EACH ROW WHEN ((old.order_number IS DISTINCT FROM new.order_number)) EXECUTE FUNCTION public.sync_changed_order_number_sequence();


--
-- Name: replacements replacements_sync_primary_item; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER replacements_sync_primary_item AFTER UPDATE OF product_name, quantity ON public.replacements FOR EACH ROW EXECUTE FUNCTION public.sync_replacement_primary_item();


--
-- Name: profiles sync_profile_roles_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_profile_roles_trigger BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.sync_profile_roles();


--
-- Name: activity_logs activity_logs_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id);


--
-- Name: activity_logs activity_logs_replacement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_replacement_id_fkey FOREIGN KEY (replacement_id) REFERENCES public.replacements(id) ON DELETE CASCADE;


--
-- Name: attachments attachments_qc_submission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_qc_submission_id_fkey FOREIGN KEY (qc_submission_id) REFERENCES public.qc_submissions(id) ON DELETE CASCADE;


--
-- Name: attachments attachments_replacement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_replacement_id_fkey FOREIGN KEY (replacement_id) REFERENCES public.replacements(id) ON DELETE CASCADE;


--
-- Name: attachments attachments_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id);


--
-- Name: customer_presets customer_presets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_presets
    ADD CONSTRAINT customer_presets_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: dimension_presets dimension_presets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dimension_presets
    ADD CONSTRAINT dimension_presets_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: notifications notifications_replacement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_replacement_id_fkey FOREIGN KEY (replacement_id) REFERENCES public.replacements(id) ON DELETE CASCADE;


--
-- Name: offline_order_activity_logs offline_order_activity_logs_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_order_activity_logs
    ADD CONSTRAINT offline_order_activity_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id);


--
-- Name: offline_order_activity_logs offline_order_activity_logs_offline_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_order_activity_logs
    ADD CONSTRAINT offline_order_activity_logs_offline_order_id_fkey FOREIGN KEY (offline_order_id) REFERENCES public.offline_orders(id) ON DELETE CASCADE;


--
-- Name: offline_order_attachments offline_order_attachments_offline_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_order_attachments
    ADD CONSTRAINT offline_order_attachments_offline_order_id_fkey FOREIGN KEY (offline_order_id) REFERENCES public.offline_orders(id) ON DELETE CASCADE;


--
-- Name: offline_order_attachments offline_order_attachments_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_order_attachments
    ADD CONSTRAINT offline_order_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id);


--
-- Name: offline_order_items offline_order_items_offline_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_order_items
    ADD CONSTRAINT offline_order_items_offline_order_id_fkey FOREIGN KEY (offline_order_id) REFERENCES public.offline_orders(id) ON DELETE CASCADE;


--
-- Name: offline_orders offline_orders_acknowledged_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_orders
    ADD CONSTRAINT offline_orders_acknowledged_by_fkey FOREIGN KEY (acknowledged_by) REFERENCES public.profiles(id);


--
-- Name: offline_orders offline_orders_cancelled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_orders
    ADD CONSTRAINT offline_orders_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES public.profiles(id);


--
-- Name: offline_orders offline_orders_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_orders
    ADD CONSTRAINT offline_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: offline_orders offline_orders_customer_preset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_orders
    ADD CONSTRAINT offline_orders_customer_preset_id_fkey FOREIGN KEY (customer_preset_id) REFERENCES public.customer_presets(id) ON DELETE SET NULL;


--
-- Name: offline_orders offline_orders_delivered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_orders
    ADD CONSTRAINT offline_orders_delivered_by_fkey FOREIGN KEY (delivered_by) REFERENCES public.profiles(id);


--
-- Name: offline_orders offline_orders_dispatched_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_orders
    ADD CONSTRAINT offline_orders_dispatched_by_fkey FOREIGN KEY (dispatched_by) REFERENCES public.profiles(id);


--
-- Name: offline_orders offline_orders_packing_confirmed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_orders
    ADD CONSTRAINT offline_orders_packing_confirmed_by_fkey FOREIGN KEY (packing_confirmed_by) REFERENCES public.profiles(id);


--
-- Name: offline_orders offline_orders_picked_up_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_orders
    ADD CONSTRAINT offline_orders_picked_up_by_fkey FOREIGN KEY (picked_up_by) REFERENCES public.profiles(id);


--
-- Name: offline_orders offline_orders_printing_confirmed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_orders
    ADD CONSTRAINT offline_orders_printing_confirmed_by_fkey FOREIGN KEY (printing_confirmed_by) REFERENCES public.profiles(id);


--
-- Name: offline_orders offline_orders_rta_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_orders
    ADD CONSTRAINT offline_orders_rta_by_fkey FOREIGN KEY (rta_by) REFERENCES public.profiles(id);


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: qc_submissions qc_submissions_replacement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qc_submissions
    ADD CONSTRAINT qc_submissions_replacement_id_fkey FOREIGN KEY (replacement_id) REFERENCES public.replacements(id) ON DELETE CASCADE;


--
-- Name: qc_submissions qc_submissions_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qc_submissions
    ADD CONSTRAINT qc_submissions_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id);


--
-- Name: qc_submissions qc_submissions_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qc_submissions
    ADD CONSTRAINT qc_submissions_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES public.profiles(id);


--
-- Name: replacement_items replacement_items_replacement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.replacement_items
    ADD CONSTRAINT replacement_items_replacement_id_fkey FOREIGN KEY (replacement_id) REFERENCES public.replacements(id) ON DELETE CASCADE;


--
-- Name: replacements replacements_archived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.replacements
    ADD CONSTRAINT replacements_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.profiles(id);


--
-- Name: replacements replacements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.replacements
    ADD CONSTRAINT replacements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: replacements replacements_delivered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.replacements
    ADD CONSTRAINT replacements_delivered_by_fkey FOREIGN KEY (delivered_by) REFERENCES public.profiles(id);


--
-- Name: replacements replacements_dimension_preset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.replacements
    ADD CONSTRAINT replacements_dimension_preset_id_fkey FOREIGN KEY (dimension_preset_id) REFERENCES public.dimension_presets(id) ON DELETE SET NULL;


--
-- Name: replacements replacements_rta_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.replacements
    ADD CONSTRAINT replacements_rta_by_fkey FOREIGN KEY (rta_by) REFERENCES public.profiles(id);


--
-- Name: workspace_bootstrap workspace_bootstrap_first_admin_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_bootstrap
    ADD CONSTRAINT workspace_bootstrap_first_admin_user_id_fkey FOREIGN KEY (first_admin_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: replacements CUSTOMER_SUPPORT and admin can create replacements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "CUSTOMER_SUPPORT and admin can create replacements" ON public.replacements FOR INSERT TO authenticated WITH CHECK (((public.current_active_role() = ANY (ARRAY['CUSTOMER_SUPPORT'::public.app_role, 'ADMIN'::public.app_role])) AND (created_by = auth.uid()) AND (status = 'NEW'::public.replacement_status)));


--
-- Name: activity_logs active users can view activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "active users can view activity" ON public.activity_logs FOR SELECT TO authenticated USING ((public.current_active_role() IS NOT NULL));


--
-- Name: attachments active users can view attachments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "active users can view attachments" ON public.attachments FOR SELECT TO authenticated USING ((public.current_active_role() IS NOT NULL));


--
-- Name: customer_presets active users can view customer presets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "active users can view customer presets" ON public.customer_presets FOR SELECT TO authenticated USING ((public.current_active_role() IS NOT NULL));


--
-- Name: dimension_presets active users can view dimension presets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "active users can view dimension presets" ON public.dimension_presets FOR SELECT TO authenticated USING ((public.current_active_role() IS NOT NULL));


--
-- Name: offline_order_activity_logs active users can view offline order activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "active users can view offline order activity" ON public.offline_order_activity_logs FOR SELECT TO authenticated USING ((public.current_active_role() IS NOT NULL));


--
-- Name: offline_order_attachments active users can view offline order attachments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "active users can view offline order attachments" ON public.offline_order_attachments FOR SELECT TO authenticated USING ((public.current_active_role() IS NOT NULL));


--
-- Name: offline_order_items active users can view offline order items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "active users can view offline order items" ON public.offline_order_items FOR SELECT TO authenticated USING ((public.current_active_role() IS NOT NULL));


--
-- Name: offline_orders active users can view offline orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "active users can view offline orders" ON public.offline_orders FOR SELECT TO authenticated USING ((public.current_active_role() IS NOT NULL));


--
-- Name: profiles active users can view profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "active users can view profiles" ON public.profiles FOR SELECT TO authenticated USING ((public.current_active_role() IS NOT NULL));


--
-- Name: qc_submissions active users can view qc; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "active users can view qc" ON public.qc_submissions FOR SELECT TO authenticated USING ((public.current_active_role() IS NOT NULL));


--
-- Name: replacement_items active users can view replacement items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "active users can view replacement items" ON public.replacement_items FOR SELECT TO authenticated USING ((public.current_active_role() IS NOT NULL));


--
-- Name: replacements active users can view replacements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "active users can view replacements" ON public.replacements FOR SELECT TO authenticated USING ((public.current_active_role() IS NOT NULL));


--
-- Name: activity_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications admins can view notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins can view notifications" ON public.notifications FOR SELECT TO authenticated USING ((public.current_active_role() = 'ADMIN'::public.app_role));


--
-- Name: attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

--
-- Name: offline_orders boss and admin can create offline orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "boss and admin can create offline orders" ON public.offline_orders FOR INSERT TO authenticated WITH CHECK (((public.current_active_role() = ANY (ARRAY['BOSS'::public.app_role, 'ADMIN'::public.app_role])) AND (created_by = auth.uid())));


--
-- Name: customer_presets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_presets ENABLE ROW LEVEL SECURITY;

--
-- Name: dimension_presets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dimension_presets ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: offline_order_activity_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.offline_order_activity_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: offline_order_attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.offline_order_attachments ENABLE ROW LEVEL SECURITY;

--
-- Name: offline_order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.offline_order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: offline_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.offline_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: qc_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.qc_submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: replacement_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.replacement_items ENABLE ROW LEVEL SECURITY;

--
-- Name: replacements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.replacements ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_presets staff can insert customer presets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff can insert customer presets" ON public.customer_presets FOR INSERT TO authenticated WITH CHECK ((public.has_any_role(VARIADIC ARRAY['BOSS'::public.app_role, 'HR'::public.app_role, 'CUSTOMER_SUPPORT'::public.app_role]) AND (created_by = auth.uid())));


--
-- Name: customer_presets staff can update customer presets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff can update customer presets" ON public.customer_presets FOR UPDATE TO authenticated USING (public.has_any_role(VARIADIC ARRAY['BOSS'::public.app_role, 'HR'::public.app_role, 'CUSTOMER_SUPPORT'::public.app_role])) WITH CHECK (public.has_any_role(VARIADIC ARRAY['BOSS'::public.app_role, 'HR'::public.app_role, 'CUSTOMER_SUPPORT'::public.app_role]));


--
-- Name: dimension_presets support can create dimension presets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "support can create dimension presets" ON public.dimension_presets FOR INSERT TO authenticated WITH CHECK (((public.current_active_role() = ANY (ARRAY['CUSTOMER_SUPPORT'::public.app_role, 'ADMIN'::public.app_role])) AND (created_by = auth.uid())));


--
-- Name: dimension_presets support can update dimension presets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "support can update dimension presets" ON public.dimension_presets FOR UPDATE TO authenticated USING ((public.current_active_role() = ANY (ARRAY['CUSTOMER_SUPPORT'::public.app_role, 'ADMIN'::public.app_role]))) WITH CHECK ((public.current_active_role() = ANY (ARRAY['CUSTOMER_SUPPORT'::public.app_role, 'ADMIN'::public.app_role])));


--
-- Name: workspace_bootstrap; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_bootstrap ENABLE ROW LEVEL SECURITY;

--
-- Name: objects active users can read offline order files; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "active users can read offline order files" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'offline-order-files'::text) AND (public.current_active_role() IS NOT NULL)));


--
-- Name: objects active users can read replacement files; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "active users can read replacement files" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'replacement-files'::text) AND (public.current_active_role() IS NOT NULL)));


--
-- Name: objects authorized users can upload offline order files; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "authorized users can upload offline order files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'offline-order-files'::text) AND (name ~~ 'offline-orders/%'::text) AND public.has_any_role(VARIADIC ARRAY['HR'::public.app_role]) AND (COALESCE(((metadata ->> 'size'::text))::bigint, (0)::bigint) <= 26214400)));


--
-- Name: objects authorized users can upload replacement files; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "authorized users can upload replacement files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'replacement-files'::text) AND (name ~~ 'replacements/%'::text) AND (public.current_active_role() = ANY (ARRAY['CUSTOMER_SUPPORT'::public.app_role, 'LOGISTICS'::public.app_role, 'PACKING'::public.app_role, 'ADMIN'::public.app_role])) AND (COALESCE(((metadata ->> 'size'::text))::bigint, (0)::bigint) <= 26214400)));


--
-- Name: objects uploaders can remove failed offline order uploads; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "uploaders can remove failed offline order uploads" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'offline-order-files'::text) AND (owner_id = (auth.uid())::text)));


--
-- Name: objects uploaders can remove failed uploads; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "uploaders can remove failed uploads" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'replacement-files'::text) AND (owner_id = (auth.uid())::text)));


--
-- PostgreSQL database dump complete
--

