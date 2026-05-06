-- Enable RLS on all tables (already enabled by default on Supabase)
alter table sessions enable row level security;
alter table profile_dimensions enable row level security;
alter table agent_profiles enable row level security;
alter table questions enable row level security;
alter table responses enable row level security;
alter table insights enable row level security;

-- Sessions: anon can do everything (no auth in this app)
create policy "sessions_select" on sessions for select using (true);
create policy "sessions_insert" on sessions for insert with check (true);
create policy "sessions_update" on sessions for update using (true);
create policy "sessions_delete" on sessions for delete using (true);

-- Profile dimensions: anon can do everything
create policy "dimensions_select" on profile_dimensions for select using (true);
create policy "dimensions_insert" on profile_dimensions for insert with check (true);
create policy "dimensions_update" on profile_dimensions for update using (true);
create policy "dimensions_delete" on profile_dimensions for delete using (true);

-- Agent profiles: anon can do everything
create policy "profiles_select" on agent_profiles for select using (true);
create policy "profiles_insert" on agent_profiles for insert with check (true);
create policy "profiles_update" on agent_profiles for update using (true);
create policy "profiles_delete" on agent_profiles for delete using (true);

-- Questions: anon can do everything
create policy "questions_select" on questions for select using (true);
create policy "questions_insert" on questions for insert with check (true);
create policy "questions_update" on questions for update using (true);
create policy "questions_delete" on questions for delete using (true);

-- Responses: anon can do everything
create policy "responses_select" on responses for select using (true);
create policy "responses_insert" on responses for insert with check (true);
create policy "responses_update" on responses for update using (true);
create policy "responses_delete" on responses for delete using (true);

-- Insights: anon can do everything
create policy "insights_select" on insights for select using (true);
create policy "insights_insert" on insights for insert with check (true);
create policy "insights_update" on insights for update using (true);
create policy "insights_delete" on insights for delete using (true);
