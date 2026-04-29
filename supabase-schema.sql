create table if not exists public.user_shortlists (
  user_id uuid primary key references auth.users(id) on delete cascade,
  shortlist jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_shortlists enable row level security;

create policy "Users can view own shortlist"
on public.user_shortlists
for select using (auth.uid() = user_id);

create policy "Users can upsert own shortlist"
on public.user_shortlists
for insert with check (auth.uid() = user_id);

create policy "Users can update own shortlist"
on public.user_shortlists
for update using (auth.uid() = user_id);
