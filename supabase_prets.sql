-- A coller dans un nouvel onglet SQL Editor -> RUN
-- Sans danger : cree juste une nouvelle table

create table if not exists prets (
  id uuid primary key default gen_random_uuid(),
  groupe_id uuid references groupes(id) on delete cascade,
  membre_id uuid references membres(id) on delete cascade,
  montant numeric not null,
  taux_interet numeric default 0,
  montant_rembourse numeric default 0,
  statut text default 'en_cours',
  date_echeance date,
  created_at timestamptz default now()
);

alter table prets enable row level security;

drop policy if exists "prets_select" on prets;
create policy "prets_select" on prets for select using (
  is_owner_of(groupe_id) or is_admin() or is_membre_of(groupe_id)
);
drop policy if exists "prets_write" on prets;
create policy "prets_write" on prets for insert with check (is_owner_of(groupe_id) or is_admin());
drop policy if exists "prets_update" on prets;
create policy "prets_update" on prets for update using (is_owner_of(groupe_id) or is_admin());
