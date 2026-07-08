-- A coller dans un nouvel onglet SQL Editor -> RUN
-- Sans danger : cree juste une nouvelle table

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  subscription jsonb not null,
  created_at timestamptz default now(),
  unique(user_id)
);

alter table push_subscriptions enable row level security;

drop policy if exists "push_subs_own" on push_subscriptions;
create policy "push_subs_own" on push_subscriptions for all using (
  auth.uid() = user_id or is_admin()
) with check (
  auth.uid() = user_id or is_admin()
);
