-- ============================================================
-- VOTE DEMOCRATIQUE DES PRETS — SANS DANGER (table isolee, ne touche a rien d'existant)
-- A executer dans Supabase SQL Editor. NON ENCORE EXECUTE a ce jour.
-- ============================================================

create table if not exists prets_votes (
  id uuid primary key default gen_random_uuid(),
  pret_id uuid references prets(id) on delete cascade,
  groupe_id uuid references groupes(id) on delete cascade,
  voter_membre_id uuid references membres(id) on delete cascade,
  valeur text check (valeur in ('oui','non')),
  vote_par_admin_id uuid references membres(id),   -- rempli si vote par procuration
  created_at timestamptz default now(),
  unique(pret_id, voter_membre_id)                 -- un seul vote par membre et par pret
);

alter table prets_votes enable row level security;

drop policy if exists "prets_votes_select" on prets_votes;
create policy "prets_votes_select" on prets_votes for select using (
  is_owner_of(groupe_id) or is_admin()
  or exists(select 1 from membres m where m.groupe_id=prets_votes.groupe_id and m.user_id=auth.uid())
);

-- Insert : le membre vote pour lui-meme, OU la creatrice/admin par procuration.
-- Exclusion absolue du demandeur : on ne peut jamais voter au nom de l'emprunteur.
drop policy if exists "prets_votes_insert" on prets_votes;
create policy "prets_votes_insert" on prets_votes for insert with check (
  voter_membre_id <> (select membre_id from prets where id = prets_votes.pret_id)
  and (
    exists(select 1 from membres m where m.id=prets_votes.voter_membre_id and m.user_id=auth.uid() and m.groupe_id=prets_votes.groupe_id)
    or is_owner_of(groupe_id) or is_admin()
  )
);

drop policy if exists "prets_votes_update" on prets_votes;
create policy "prets_votes_update" on prets_votes for update using (
  is_owner_of(groupe_id) or is_admin()
  or exists(select 1 from membres m where m.id=prets_votes.voter_membre_id and m.user_id=auth.uid())
);

select 'ok prets_votes' as test;
