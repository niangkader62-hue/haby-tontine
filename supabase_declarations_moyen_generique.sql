-- CORRECTIF : le composant de paiement simplifie envoie desormais moyen='mobile_money'
-- (un seul bouton generique au lieu du choix Orange Money / Wave). La contrainte posee
-- lors de la creation de declarations_paiement n'autorisait que 'orange_money'/'wave' et
-- aurait bloque TOUTE nouvelle declaration avec une erreur de contrainte. On elargit la
-- contrainte pour accepter les trois valeurs (les anciennes lignes restent valides).
-- A executer dans Supabase SQL Editor -> RUN, avant ou juste apres le deploiement du code.

alter table declarations_paiement drop constraint if exists declarations_paiement_moyen_check;
alter table declarations_paiement add constraint declarations_paiement_moyen_check
  check (moyen in ('orange_money','wave','mobile_money'));

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'declarations_paiement'::regclass and contype = 'c';
