-- Enable Supabase Realtime publication on replacements and qc_submissions
-- This enables WebSocket live updates for workers without polling or manual page refreshing.
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
