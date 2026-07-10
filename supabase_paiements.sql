-- A coller dans un nouvel onglet SQL Editor -> RUN
-- Sans danger : cree juste une nouvelle table

create table if not exists paiements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  transaction_id text unique not null,
  montant numeric not null,
  statut text default 'pending',
  created_at timestamptz default now()
);

alter table paiements enable row level security;

drop policy if exists "paiements_select" on paiements;
create policy "paiements_select" on paiements for select using (
  user_id = auth.uid() or is_admin()
);
