-- A coller dans un nouvel onglet SQL Editor -> RUN
-- Sans danger : ajoute ce qui manque, ne touche a rien d'existant

-- 1) Code de parrainage unique + qui a parraine qui + date d'expiration Premium
alter table users add column if not exists parrain_code text unique;
alter table users add column if not exists parraine_par uuid references auth.users(id);
alter table users add column if not exists premium_expire_le date;

-- Genere un code de parrainage pour les comptes existants qui n'en ont pas encore
update users set parrain_code = upper(substr(replace(id::text,'-',''), 1, 8))
where parrain_code is null;

-- 2) Suivi des parrainages
create table if not exists parrainages (
  id uuid primary key default gen_random_uuid(),
  parrain_id uuid references auth.users(id),
  filleul_id uuid references auth.users(id),
  statut text default 'inscrit',
  recompense_appliquee boolean default false,
  created_at timestamptz default now()
);

alter table parrainages enable row level security;
drop policy if exists "parrainages_select" on parrainages;
create policy "parrainages_select" on parrainages for select using (
  parrain_id = auth.uid() or filleul_id = auth.uid() or is_admin()
);
drop policy if exists "parrainages_write" on parrainages;
create policy "parrainages_write" on parrainages for insert with check (
  filleul_id = auth.uid()
);

-- 3) Recompense automatique : des qu'un filleul devient Premium, son parrain recoit +30 jours
create or replace function apply_parrainage_reward()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parrain_id uuid;
begin
  if new.plan = 'premium' and (old.plan is distinct from 'premium') then
    select parraine_par into v_parrain_id from users where id = new.id;
    if v_parrain_id is not null then
      update users set plan = 'premium',
        premium_expire_le = greatest(coalesce(premium_expire_le, current_date), current_date) + 30
        where id = v_parrain_id;
      update parrainages set statut = 'premium', recompense_appliquee = true
        where filleul_id = new.id and recompense_appliquee = false;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_parrainage_reward on users;
create trigger trg_parrainage_reward
  after update of plan on users
  for each row execute function apply_parrainage_reward();
