-- ============================================================
-- CHECKLIST DE SUIVI DES VERSEMENTS + ROLE COLLECTEUR — sans danger
-- A coller dans un NOUVEL onglet Supabase SQL Editor -> RUN
-- ============================================================
-- ATTENTION : NE PAS RELANCER CE FICHIER SEUL. La policy "membres_update"
-- ci-dessous fait une sous-requete directe sur la table membres, ce qui
-- provoque une boucle infinie RLS ("Versement impossible"). Elle est
-- corrigee pour de bon dans supabase_fix_collecteur_recursion.sql (fonction
-- is_collecteur_of) -- c'est ce fichier corrige (ou SCHEMA_COMPLET.sql en
-- entier) qu'il faut lancer.
-- ============================================================

-- 1) Chaque versement peut avoir une photo de preuve (argent recu en main propre,
--    depot Orange Money/Wave...) et un suivi "recu envoye au client"
alter table transactions add column if not exists photo_url text;
alter table transactions add column if not exists recu_envoye boolean default false;

-- 2) Role "collecteur" : un ou deux membres designes par l'administratrice pour
--    l'aider a enregistrer les versements (droits limites, pas admin complet)
alter table membres add column if not exists role_collecteur boolean default false;

-- 3) Un collecteur peut lui aussi enregistrer des versements et cocher la checklist,
--    mais ne peut pas faire les actions reservees a la creatrice (modifier/supprimer
--    la tontine, gerer les autres membres, etc.) -- seulement marquer les paiements.
drop policy if exists "membres_update" on membres;
create policy "membres_update" on membres for update using (
  is_owner_of(groupe_id) or is_admin()
  or exists(select 1 from membres m where m.groupe_id=membres.groupe_id and m.user_id=auth.uid() and m.role_collecteur=true)
) with check (
  is_owner_of(groupe_id) or is_admin()
  or exists(select 1 from membres m where m.groupe_id=membres.groupe_id and m.user_id=auth.uid() and m.role_collecteur=true)
);

drop policy if exists "transactions_write" on transactions;
create policy "transactions_write" on transactions for insert with check (
  is_owner_of(groupe_id) or is_admin()
  or exists(select 1 from membres m where m.groupe_id=transactions.groupe_id and m.user_id=auth.uid() and m.role_collecteur=true)
);

select count(*) as colonnes_ajoutees from information_schema.columns
where table_name='transactions' and column_name in ('photo_url','recu_envoye');
