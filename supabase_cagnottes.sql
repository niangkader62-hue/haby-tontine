-- A coller dans un nouvel onglet SQL Editor -> RUN
-- Sans danger : cree deux nouvelles tables

create table if not exists cagnottes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) default auth.uid(),
  titre text not null,
  description text,
  objectif numeric not null,
  beneficiaire text,
  statut text default 'ouverte',
  date_limite date,
  created_at timestamptz default now()
);

create table if not exists cagnotte_contributions (
  id uuid primary key default gen_random_uuid(),
  cagnotte_id uuid references cagnottes(id) on delete cascade,
  contributeur text not null,
  montant numeric not null,
  created_at timestamptz default now()
);

alter table cagnottes enable row level security;
drop policy if exists "cagnottes_select" on cagnottes;
create policy "cagnottes_select" on cagnottes for select using (auth.uid() = user_id or is_admin());
drop policy if exists "cagnottes_write" on cagnottes;
create policy "cagnottes_write" on cagnottes for insert with check (auth.uid() = user_id or is_admin());
drop policy if exists "cagnottes_update" on cagnottes;
create policy "cagnottes_update" on cagnottes for update using (auth.uid() = user_id or is_admin());
drop policy if exists "cagnottes_delete" on cagnottes;
create policy "cagnottes_delete" on cagnottes for delete using (auth.uid() = user_id or is_admin());

alter table cagnotte_contributions enable row level security;
drop policy if exists "cagnotte_contrib_select" on cagnotte_contributions;
create policy "cagnotte_contrib_select" on cagnotte_contributions for select using (
  exists(select 1 from cagnottes c where c.id = cagnotte_contributions.cagnotte_id and (c.user_id = auth.uid() or is_admin()))
);
drop policy if exists "cagnotte_contrib_write" on cagnotte_contributions;
create policy "cagnotte_contrib_write" on cagnotte_contributions for insert with check (
  exists(select 1 from cagnottes c where c.id = cagnotte_contributions.cagnotte_id and (c.user_id = auth.uid() or is_admin()))
);
