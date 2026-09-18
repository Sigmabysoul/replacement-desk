-- =============================================================================
-- Add revised offline order status enum values
-- Must be committed before functions referencing them can compile.
-- =============================================================================

alter type public.offline_order_status add value if not exists 'DISPATCH_PREPARED' after 'PACKING_CONFIRMED';
alter type public.offline_order_status add value if not exists 'PRINTED' after 'DISPATCH_PREPARED';

