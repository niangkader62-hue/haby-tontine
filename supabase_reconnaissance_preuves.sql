-- ============================================================
-- RECONNAISSANCE AUTOMATIQUE DES PREUVES DE PAIEMENT
-- A coller dans un NOUVEL onglet Supabase -> SQL Editor -> RUN
-- Sans danger : ajoute deux colonnes et une petite table, n'efface aucune donnee.
-- ============================================================
-- CE QUE CA APPORTE
-- Jusqu'ici n'importe quelle image passait comme preuve de paiement : un selfie, une
-- photo de chaussures, une capture au hasard. Desormais la photo est lue automatiquement
-- avant d'etre acceptee. L'application peut donc :
--   - refuser d'emblee une image qui n'a manifestement rien a voir avec un paiement
--   - afficher a la creatrice "Orange Money - 25 000 F - 30/07" a cote de la photo
--   - la prevenir quand le montant lu ne correspond pas a la cotisation attendue
--
-- CE QUE CA N'APPORTE PAS, ET IL FAUT LE SAVOIR
-- Cela ne prouve PAS qu'un paiement a eu lieu. Une capture peut etre fabriquee, ou etre
-- celle du paiement de quelqu'un d'autre. La lecture reconnait la FORME d'une preuve,
-- pas sa VERITE. La confirmation humaine de la creatrice reste ce qui fait foi.
--
-- REGLE RETENUE : LE DOUTE PROFITE A LA MEMBRE. Panne du service, quota atteint, photo
-- floue -> la photo est acceptee et simplement signalee. Bloquer un vrai paiement parce
-- qu'un service exterieur est en panne serait bien pire que laisser passer une image
-- douteuse, que la creatrice verra de toute facon avant de confirmer.
-- ============================================================


-- ------------------------------------------------------------
-- 1) OU RANGER CE QUI A ETE LU
-- ------------------------------------------------------------
-- Un seul champ souple (jsonb) plutot qu'une colonne par information : le detail de ce
-- que l'IA sait lire evoluera, et il ne faudra pas modifier la base a chaque fois.
alter table transactions           add column if not exists preuve_analyse jsonb;
alter table declarations_paiement  add column if not exists preuve_analyse jsonb;


-- ------------------------------------------------------------
-- 2) PLAFOND D'APPELS (protege la facture de l'IA)
-- ------------------------------------------------------------
-- Meme principe que pour HABY, mais compte a part : une membre depose une preuve par
-- cycle, le plafond de 40/jour ne gene personne et empeche seulement une boucle d'appels.
create table if not exists preuve_usage (
  user_id uuid references auth.users(id) on delete cascade,
  jour date not null default (now() at time zone 'utc')::date,
  nb int not null default 0,
  primary key (user_id, jour)
);

alter table preuve_usage enable row level security;

-- Lecture de sa propre consommation seulement. L'ecriture est faite par la fonction
-- serveur avec la cle de service, aucune policy d'insertion n'est donc necessaire.
drop policy if exists "preuve_usage_select" on preuve_usage;
create policy "preuve_usage_select" on preuve_usage for select using (
  user_id = auth.uid() or is_admin()
);

-- Purge des compteurs de plus de 30 jours (la table reste minuscule).
create or replace function purge_preuve_usage()
returns void
language sql
security definer
set search_path = public
as $$
  delete from preuve_usage where jour < (now() at time zone 'utc')::date - 30;
$$;


-- ------------------------------------------------------------
-- 3) FERMETURE D'UN ACCES TROP LARGE (corrige aussi l'existant)
-- ------------------------------------------------------------
-- En PostgreSQL, le droit d'executer une fonction est accorde par defaut au role PUBLIC,
-- dont anon (visiteur non connecte) et authenticated heritent. Combine a SECURITY DEFINER,
-- cela rendait ces fonctions d'entretien appelables par n'importe qui via l'API REST
-- (/rest/v1/rpc/purge_haby_usage). Concretement, un visiteur pouvait remettre a zero les
-- compteurs de quota, et donc rendre inoperante la protection qui empeche la facture de
-- l'IA de s'envoler. Idem pour l'expiration des abonnements.
--
-- A NOTER : retirer le droit a "anon, authenticated" seulement ne suffit PAS -- l'heritage
-- depuis PUBLIC le redonne aussitot. Il faut le retirer a PUBLIC lui-meme.
revoke execute on function purge_preuve_usage() from public, anon, authenticated;
revoke execute on function purge_haby_usage()   from public, anon, authenticated;
revoke execute on function expirer_premium()    from public, anon, authenticated;

-- Le planificateur (pg_cron, qui tourne en tant que postgres) et la cle de service
-- gardent l'acces : les taches nocturnes continuent de fonctionner normalement.
grant execute on function purge_preuve_usage() to postgres, service_role;
grant execute on function purge_haby_usage()   to postgres, service_role;
grant execute on function expirer_premium()    to postgres, service_role;


-- ============================================================
-- VERIFICATIONS (regarde les resultats affiches)
-- ============================================================

-- (a) Les 2 colonnes preuve_analyse doivent apparaitre
select table_name, column_name, data_type
from information_schema.columns
where column_name = 'preuve_analyse'
order by table_name;

-- (b) La table du plafond doit apparaitre
select table_name from information_schema.tables where table_name = 'preuve_usage';

-- (c) Les fonctions d'entretien ne doivent PLUS etre executables par anon/authenticated
select p.proname as fonction,
       has_function_privilege('anon', p.oid, 'execute')          as anon_peut_executer,
       has_function_privilege('authenticated', p.oid, 'execute') as connecte_peut_executer,
       has_function_privilege('postgres', p.oid, 'execute')      as cron_peut_executer
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('purge_preuve_usage', 'purge_haby_usage', 'expirer_premium')
order by 1;

select 'reconnaissance des preuves en place -- pense a deployer les 2 Edge Functions' as resultat;
