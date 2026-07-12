-- ============================================================
-- MONTANT PERSONNALISE PAR MEMBRE — script sans danger
-- A coller dans un NOUVEL onglet Supabase SQL Editor -> RUN
-- Permet a un membre de cotiser un montant different du montant
-- standard de la tontine (ex: 25000 pour certains, 50000 pour d'autres).
-- Si vide (NULL), le membre continue d'utiliser le montant standard
-- de la tontine, comme avant -- aucun impact sur les tontines existantes.
-- ============================================================

alter table membres add column if not exists montant_perso numeric;
alter table groupes add column if not exists montant_initial numeric default 0;

-- CORRECTIF : la table cagnottes n'avait jamais la colonne montant_collecte,
-- ce qui bloquait la creation de toute nouvelle cagnotte avec une erreur.
alter table cagnottes add column if not exists montant_collecte numeric default 0;
alter table cagnotte_contributions add column if not exists tel text;
alter table cagnotte_contributions add column if not exists preuve_url text;

-- Historique de la caisse sociale : garde une trace de chaque ajout/retrait avec motif et date
create table if not exists caisse_sociale_mouvements (
  id uuid primary key default gen_random_uuid(),
  groupe_id uuid references groupes(id) on delete cascade,
  sens text not null check (sens in ('ajout','retrait')),
  montant numeric not null,
  motif text,
  auteur_nom text,
  created_at timestamptz default now()
);
alter table caisse_sociale_mouvements enable row level security;
drop policy if exists "caisse_mvt_select" on caisse_sociale_mouvements;
create policy "caisse_mvt_select" on caisse_sociale_mouvements for select using (
  is_owner_of(groupe_id) or is_admin() or is_membre_of(groupe_id)
);
drop policy if exists "caisse_mvt_insert" on caisse_sociale_mouvements;
create policy "caisse_mvt_insert" on caisse_sociale_mouvements for insert with check (
  is_owner_of(groupe_id) or is_admin()
);

-- Active le "temps reel" sur les messages : necessaire pour que les notifications
-- s'affichent aussi quand la personne est deja en train d'utiliser l'application
alter publication supabase_realtime add table messages;

select count(*) as membres_avec_montant_perso from membres where montant_perso is not null;
