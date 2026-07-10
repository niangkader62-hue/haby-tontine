-- A coller dans un nouvel onglet SQL Editor -> RUN
-- Sans danger : cree juste ce qui manque

-- Reglement interieur (un texte par tontine)
alter table groupes add column if not exists reglement text;

-- Rapports de reunion
create table if not exists rapports_reunion (
  id uuid primary key default gen_random_uuid(),
  groupe_id uuid references groupes(id) on delete cascade,
  titre text not null,
  contenu text,
  date_reunion date,
  created_at timestamptz default now()
);

alter table rapports_reunion enable row level security;

drop policy if exists "rapports_select" on rapports_reunion;
create policy "rapports_select" on rapports_reunion for select using (
  is_owner_of(groupe_id) or is_admin() or is_membre_of(groupe_id)
);
drop policy if exists "rapports_write" on rapports_reunion;
create policy "rapports_write" on rapports_reunion for insert with check (is_owner_of(groupe_id) or is_admin());
drop policy if exists "rapports_delete" on rapports_reunion;
create policy "rapports_delete" on rapports_reunion for delete using (is_owner_of(groupe_id) or is_admin());
