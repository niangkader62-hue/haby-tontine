-- ============================================================
-- Moov Money + liens de paiement (Wave / Orange Money) — SANS DANGER
-- Ajoute juste de nouvelles colonnes optionnelles. Aucune donnee existante touchee.
-- A coller dans un NOUVEL onglet Supabase SQL Editor -> RUN
-- ============================================================

-- 1) Nouveau numero Moov Money (a copier, comme Orange Money / Wave)
alter table groupes   add column if not exists numero_moov_money text;
alter table cagnottes add column if not exists numero_moov_money text;

-- 2) Liens de paiement generes par la beneficiaire depuis SON appli
--    (lien de paiement Wave / lien OM Business). Quand on tape dessus,
--    ca ouvre l'application Wave / Orange Money, comme un lien YouTube ouvre YouTube.
alter table groupes   add column if not exists lien_wave text;
alter table groupes   add column if not exists lien_orange text;
alter table cagnottes add column if not exists lien_wave text;
alter table cagnottes add column if not exists lien_orange text;

-- 3) On elargit la contrainte du moyen de declaration pour accepter moov_money
--    (les declarations continuent d'utiliser 'mobile_money' de maniere generique,
--     ceci est juste pour ne rien bloquer a l'avenir).
alter table declarations_paiement drop constraint if exists declarations_paiement_moyen_check;
alter table declarations_paiement add constraint declarations_paiement_moyen_check
  check (moyen in ('orange_money','wave','moov_money','mobile_money'));

-- Verification
select table_name, column_name
from information_schema.columns
where table_name in ('groupes','cagnottes')
  and column_name in ('numero_moov_money','lien_wave','lien_orange')
order by table_name, column_name;
