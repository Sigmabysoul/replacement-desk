-- Adds DELIVERED status to replacement_status enum for Logistics Head delivery tracking.
alter type public.replacement_status add value if not exists 'DELIVERED' after 'SHIPPED';

