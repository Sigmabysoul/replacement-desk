-- Enable Supabase Realtime publication on replacements and qc_submissions
-- This enables WebSocket live updates for workers without polling or manual page refreshing.
alter publication supabase_realtime add table public.replacements;
alter publication supabase_realtime add table public.qc_submissions;
