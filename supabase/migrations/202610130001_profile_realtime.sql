-- Keep profile display-name and timezone changes synchronized for active sessions.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles') then
    execute 'alter publication supabase_realtime add table public.profiles';
  end if;
end $$;
