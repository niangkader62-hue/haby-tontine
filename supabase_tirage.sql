-- A coller dans un nouvel onglet SQL Editor -> RUN
-- Sans danger : cree juste une nouvelle table

create table if not exists tirages (
  id uuid primary key default gen_random_uuid(),
  groupe_id uuid references groupes(id) on delete cascade,
  membre_id uuid references membres(id) on delete cascade,
  cycle int not null,
  created_at timestamptz default now()
);

alter table tirages enable row level security;

drop policy if exists "tirages_select" on tirages;
create policy "tirages_select" on tirages for select using (
  is_owner_of(groupe_id) or is_admin() or is_membre_of(groupe_id)
);
drop policy if exists "tirages_write" on tirages;
create policy "tirages_write" on tirages for insert with check (is_owner_of(groupe_id) or is_admin());
