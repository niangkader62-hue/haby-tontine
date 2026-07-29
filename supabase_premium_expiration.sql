-- ============================================================
-- CORRECTIF PREMIUM : l'abonnement ne se terminait jamais
-- A coller dans un NOUVEL onglet Supabase SQL Editor -> RUN
-- Sans danger : ajoute une colonne, ne supprime aucune donnee.
-- ============================================================
-- PROBLEME TROUVE :
-- Quand un paiement etait accepte, la fonction cinetpay-webhook faisait seulement
-- `plan = 'premium'` SANS jamais renseigner de date de fin (`premium_expire_le`).
-- Or la tache quotidienne qui repasse les comptes expires en gratuit fait :
--     update users set plan='free' where premium_expire_le < aujourd'hui
-- et en SQL une valeur vide (NULL) ne correspond JAMAIS a une comparaison.
-- Consequence : un seul paiement de 1 000 FCFA donnait le Premium A VIE,
-- l'utilisatrice n'etait jamais recontactee pour renouveler.
--
-- CORRECTIF (deja fait cote code) : le webhook pose desormais une date de fin
-- calculee selon la formule payee. Il lui faut cette colonne pour savoir
-- combien de jours crediter (30 pour le mensuel, 365 pour l'annuel).
-- ============================================================

alter table paiements add column if not exists duree_jours int default 30;

-- Verification : doit afficher la colonne duree_jours
select column_name, data_type
from information_schema.columns
where table_name = 'paiements' and column_name = 'duree_jours';

select 'expiration Premium corrigee' as resultat;
