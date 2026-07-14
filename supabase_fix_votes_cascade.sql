-- FIX : bug de la remise a zero admin (et potentiellement de la suppression
-- d'un membre depuis une tontine normale).
--
-- Cause exacte identifiee via le journal de diagnostic de admin-reset-data :
--   "update or delete on table 'membres' violates foreign key constraint
--    'votes_candidate_membre_id_fkey' on table 'votes'"
--
-- Explication : quand on supprime une tontine (table groupes), la suppression
-- se propage en cascade vers ses membres (membres.groupe_id ON DELETE CASCADE).
-- Mais la table votes (elections de bureau) a une colonne candidate_membre_id
-- qui reference membres(id) SANS "on delete cascade". Resultat : des qu'un
-- membre a deja ete candidat a une election, il est impossible de le
-- supprimer -- ni via la remise a zero, ni via le bouton normal "retirer un
-- membre" d'une tontine.
--
-- Toutes les AUTRES cles etrangeres du schema vers membres/groupes ont bien
-- "on delete cascade" (transactions, checklist, messages, etc.) -- c'est le
-- seul oubli. Ce script corrige uniquement cette contrainte.

alter table votes drop constraint if exists votes_candidate_membre_id_fkey;

alter table votes
  add constraint votes_candidate_membre_id_fkey
  foreign key (candidate_membre_id) references membres(id) on delete cascade;
