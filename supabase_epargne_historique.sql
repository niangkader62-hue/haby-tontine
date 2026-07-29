-- ============================================================
-- EPARGNE (Ma Tirelire) : historique horodate des versements
-- A coller dans un NOUVEL onglet Supabase SQL Editor -> RUN
-- Sans danger : cree une nouvelle table, ne touche a aucune donnee existante.
-- ============================================================
-- PROBLEME : la table "objectifs" ne gardait qu'un TOTAL courant (colonne actuel).
-- Impossible donc d'afficher la date et l'heure de chaque versement : l'information
-- n'existait nulle part. Cette table garde la trace de chaque depot.
-- ============================================================

create table if not exists objectif_versements (
  id uuid primary key default gen_random_uuid(),
  objectif_id uuid references objectifs(id) on delete cascade,
  user_id uuid references auth.users(id),
  montant numeric not null,
  created_at timestamptz default now()
);

create index if not exists objectif_versements_objectif_idx on objectif_versements (objectif_id, created_at desc);

alter table objectif_versements enable row level security;

-- Chacune ne voit et n'ecrit que SES propres versements d'epargne.
drop policy if exists "objectif_versements_select" on objectif_versements;
create policy "objectif_versements_select" on objectif_versements for select using (
  user_id = auth.uid() or is_admin()
);

drop policy if exists "objectif_versements_insert" on objectif_versements;
create policy "objectif_versements_insert" on objectif_versements for insert with check (
  user_id = auth.uid()
);

drop policy if exists "objectif_versements_delete" on objectif_versements;
create policy "objectif_versements_delete" on objectif_versements for delete using (
  user_id = auth.uid() or is_admin()
);

select 'historique d epargne en place' as resultat;
