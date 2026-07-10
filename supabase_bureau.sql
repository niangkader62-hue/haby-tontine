-- A coller dans un nouvel onglet SQL Editor -> RUN
-- Sans danger : cree juste ce qui manque

-- 1) Role au bureau sur chaque membre
alter table membres add column if not exists role_bureau text;

-- 2) Elections (une election par role, avec une liste de candidates)
create table if not exists elections (
  id uuid primary key default gen_random_uuid(),
  groupe_id uuid references groupes(id) on delete cascade,
  role text not null,
  candidats jsonb not null default '[]'::jsonb,
  statut text not null default 'ouverte',
  created_at timestamptz default now()
);

-- 3) Votes (un vote par utilisatrice liee, par election)
create table if not exists votes (
  id uuid primary key default gen_random_uuid(),
  election_id uuid references elections(id) on delete cascade,
  voter_user_id uuid references auth.users(id),
  candidate_membre_id uuid references membres(id),
  created_at timestamptz default now(),
  unique(election_id, voter_user_id)
);

-- 4) Fonction securisee : l'election appartient-elle a un groupe ou je suis membre lie ?
create or replace function can_vote_on(p_election_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(
    select 1 from elections e
    where e.id = p_election_id
    and is_membre_of(e.groupe_id)
  );
$$;

-- 5) Securite (RLS)
alter table elections enable row level security;
drop policy if exists "elections_select" on elections;
create policy "elections_select" on elections for select using (
  is_owner_of(groupe_id) or is_admin() or is_membre_of(groupe_id)
);
drop policy if exists "elections_write" on elections;
create policy "elections_write" on elections for insert with check (is_owner_of(groupe_id) or is_admin());
drop policy if exists "elections_update" on elections;
create policy "elections_update" on elections for update using (is_owner_of(groupe_id) or is_admin());

alter table votes enable row level security;
drop policy if exists "votes_select" on votes;
create policy "votes_select" on votes for select using (
  exists (select 1 from elections e where e.id = votes.election_id and (is_owner_of(e.groupe_id) or is_admin() or is_membre_of(e.groupe_id)))
);
drop policy if exists "votes_write" on votes;
create policy "votes_write" on votes for insert with check (
  voter_user_id = auth.uid() and can_vote_on(election_id)
);
