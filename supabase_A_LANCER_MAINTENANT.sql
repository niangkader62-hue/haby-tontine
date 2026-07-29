-- ============================================================
-- SCRIPT A LANCER APRES CETTE MISE A JOUR (une seule fois)
-- A coller EN ENTIER dans un NOUVEL onglet Supabase -> SQL Editor -> RUN
-- Sans danger : n'efface aucune donnee, peut etre relance sans probleme.
-- ============================================================
-- Il regroupe les 3 scripts necessaires aux corrections livrees :
--   1) les membres se voient enfin entre eux (messages prives, trombinoscope)
--   2) verrou anti double-tirage
--   3) historique horodate de l'epargne (Ma Tirelire)
-- ============================================================


-- ============================================================
-- 1) LES MEMBRES SE VOIENT ENTRE EUX
-- ============================================================
-- PROBLEME TROUVE : la regle de lecture "membres_select" autorisait seulement
-- la creatrice, les admins, ou sa PROPRE ligne. Consequence : une participante
-- ouvrant sa tontine ne voyait qu'elle-meme. C'est la cause reelle de la liste
-- de destinataires incomplete pour les messages prives.
drop policy if exists "membres_select" on membres;
create policy "membres_select" on membres for select using (
  is_owner_of(groupe_id) or is_admin() or is_membre_of(groupe_id) or user_id = auth.uid()
);


-- ============================================================
-- 2) VERROU ANTI DOUBLE-TIRAGE
-- ============================================================
-- Un seul gagnant par cycle et par tontine, meme si deux personnes lancent le
-- tirage en meme temps depuis deux telephones. On nettoie d'abord d'eventuels
-- doublons existants (on garde le plus ancien).
delete from tirages t using tirages plus_ancien
where t.groupe_id = plus_ancien.groupe_id
  and t.cycle = plus_ancien.cycle
  and t.created_at > plus_ancien.created_at;

create unique index if not exists tirages_groupe_cycle_unique on tirages (groupe_id, cycle);


-- ============================================================
-- 3) HISTORIQUE HORODATE DE L'EPARGNE (Ma Tirelire)
-- ============================================================
-- La table "objectifs" ne gardait qu'un TOTAL courant : la date et l'heure de
-- chaque depot n'existaient nulle part. Cette table garde la trace de chacun.
create table if not exists objectif_versements (
  id uuid primary key default gen_random_uuid(),
  objectif_id uuid references objectifs(id) on delete cascade,
  user_id uuid references auth.users(id),
  montant numeric not null,
  created_at timestamptz default now()
);

create index if not exists objectif_versements_objectif_idx on objectif_versements (objectif_id, created_at desc);

alter table objectif_versements enable row level security;

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


select 'tout est en place' as resultat;
