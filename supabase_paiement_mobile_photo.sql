-- ============================================================
-- AJOUT : photo de preuve obligatoire sur les declarations de paiement
-- A executer APRES supabase_paiement_mobile.sql, dans un nouvel onglet
-- Supabase SQL Editor -> RUN
-- ============================================================

alter table declarations_paiement add column if not exists photo_url text;

-- Nettoyage : supprime les declarations de test faites avant l'ajout de la photo obligatoire
delete from declarations_paiement where statut='en_attente' and photo_url is null;

-- Empeche au niveau base de donnees qu'une declaration soit enregistree sans photo,
-- meme en cas de contournement de l'interface
alter table declarations_paiement alter column photo_url set not null;

select count(*) as colonne_ajoutee from information_schema.columns
where table_name='declarations_paiement' and column_name='photo_url';
