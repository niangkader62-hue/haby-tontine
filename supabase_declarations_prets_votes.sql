-- ============================================================
-- DECLARATIONS DE PAIEMENT (mobile money) + VOTE DES PRETS + LIENS DE PAIEMENT
-- Documente ce qui existe deja en production mais n'avait jamais ete
-- sauvegarde dans un fichier .sql du depot (ecart trouve lors d'un audit,
-- en comparant le code de src/App.jsx a la structure reelle de la base).
-- Sans danger a relancer : tout est IF NOT EXISTS / DROP+CREATE.
-- ============================================================

-- 1) Numeros/liens de paiement mobile money, affiches aux membres pour
--    qu'ils declarent eux-memes un versement (tontine) ou une contribution
--    (cagnotte) sans devoir passer par la creatrice.
alter table groupes add column if not exists numero_orange_money text;
alter table groupes add column if not exists numero_wave text;
alter table groupes add column if not exists numero_moov_money text;
alter table groupes add column if not exists lien_wave text;
alter table groupes add column if not exists lien_orange text;

alter table cagnottes add column if not exists numero_orange_money text;
alter table cagnottes add column if not exists numero_wave text;
alter table cagnottes add column if not exists numero_moov_money text;
alter table cagnottes add column if not exists lien_wave text;
alter table cagnottes add column if not exists lien_orange text;

-- 2) DECLARATIONS DE PAIEMENT : un membre declare avoir paye (avec photo
--    de preuve obligatoire), en attente de confirmation par la creatrice
--    ou un collecteur.
create table if not exists declarations_paiement (
  id uuid primary key default gen_random_uuid(),
  groupe_id uuid references groupes(id) on delete cascade,
  membre_id uuid references membres(id) on delete cascade,
  montant numeric not null,
  moyen text check (moyen in ('orange_money','wave','moov_money','mobile_money')),
  cycle int,
  statut text default 'en_attente' check (statut in ('en_attente','confirme','rejete')),
  confirme_par uuid references membres(id),
  confirme_at timestamptz,
  photo_url text not null,
  created_at timestamptz default now()
);
alter table declarations_paiement enable row level security;

drop policy if exists "declarations_insert_self" on declarations_paiement;
create policy "declarations_insert_self" on declarations_paiement for insert with check (
  exists(select 1 from membres m where m.id = declarations_paiement.membre_id and m.user_id = auth.uid())
);

drop policy if exists "declarations_select" on declarations_paiement;
create policy "declarations_select" on declarations_paiement for select using (
  is_owner_of(groupe_id) or is_admin() or is_membre_of(groupe_id)
);

drop policy if exists "declarations_update" on declarations_paiement;
create policy "declarations_update" on declarations_paiement for update using (
  is_owner_of(groupe_id) or is_admin() or is_collecteur_of(groupe_id)
);

-- 3) VOTE DES PRETS : les membres votent oui/non sur une demande de pret
--    d'un autre membre (un seul vote par membre et par pret).
create table if not exists prets_votes (
  id uuid primary key default gen_random_uuid(),
  pret_id uuid references prets(id) on delete cascade,
  groupe_id uuid references groupes(id) on delete cascade,
  voter_membre_id uuid references membres(id),
  valeur text check (valeur in ('oui','non')),
  vote_par_admin_id uuid references membres(id),
  created_at timestamptz default now(),
  unique(pret_id, voter_membre_id)
);
alter table prets_votes enable row level security;

drop policy if exists "prets_votes_insert" on prets_votes;
create policy "prets_votes_insert" on prets_votes for insert with check (
  voter_membre_id <> (select membre_id from prets where id = prets_votes.pret_id)
  and (
    exists(select 1 from membres m where m.id = prets_votes.voter_membre_id and m.user_id = auth.uid() and m.groupe_id = prets_votes.groupe_id)
    or is_owner_of(groupe_id) or is_admin()
  )
);

drop policy if exists "prets_votes_select" on prets_votes;
create policy "prets_votes_select" on prets_votes for select using (
  is_owner_of(groupe_id) or is_admin() or is_membre_of(groupe_id)
);

drop policy if exists "prets_votes_update" on prets_votes;
create policy "prets_votes_update" on prets_votes for update using (
  is_owner_of(groupe_id) or is_admin()
  or exists(select 1 from membres m where m.id = prets_votes.voter_membre_id and m.user_id = auth.uid())
);

select 'declarations et votes documentes' as resultat;
