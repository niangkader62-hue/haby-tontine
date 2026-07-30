-- ============================================================
-- SCRIPT UNIQUE A LANCER -- 30 juillet 2026
-- A coller EN ENTIER dans un NOUVEL onglet Supabase -> SQL Editor -> RUN
-- Sans danger : n'efface aucune donnee, peut etre relance autant de fois que voulu.
-- ============================================================
-- Il contient les 2 choses encore en attente :
--   1) l'EXPIRATION DU PREMIUM  (le correctif important : sans lui, un paiement
--      de 1 000 FCFA donne encore l'abonnement a vie)
--   2) le QUOTA QUOTIDIEN DE HABY (protege la facture de l'IA)
--
-- A la fin, le script affiche des listes de controle : LIS-LES, elles te disent
-- quels comptes sont concernes avant que quoi que ce soit ne change.
-- ============================================================


-- ============================================================
-- 1) EXPIRATION DU PREMIUM
-- ============================================================
-- CE QUI A ETE TROUVE
-- La date de fin d'abonnement (`premium_expire_le`) etait bien inscrite au moment
-- du paiement. Le code renvoyait a "la tache quotidienne qui repasse les comptes
-- expires en gratuit"... mais cette tache n'avait jamais ete creee. Seules deux
-- taches existaient : les rappels d'echeance et le passage au cycle suivant.
-- La date etait donc ecrite sans jamais etre relue : le Premium ne finissait jamais.
--
-- C'est un bug qui ne se voit pas a l'usage -- rien ne casse, tout fonctionne --
-- il fait seulement perdre chaque renouvellement.

-- La fonction est volontairement PRUDENTE : elle ne touche QUE les comptes ayant
-- une date de fin depassee. Un compte Premium SANS date (accorde avant la mise en
-- place des dates) n'est PAS coupe : retirer sans prevenir l'acces a quelqu'un qui
-- a paye serait pire que le bug. Ces comptes sont listes plus bas, a toi de decider.
create or replace function expirer_premium()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  nb int;
begin
  update users
     set plan = 'free'
   where plan = 'premium'
     and premium_expire_le is not null
     and premium_expire_le < (now() at time zone 'utc')::date;
  get diagnostics nb = row_count;
  return nb;
end;
$$;

-- Planification : chaque nuit a 2 h (heure UTC).
-- On retire d'abord une eventuelle ancienne version, pour que relancer ce script
-- ne cree pas deux taches identiques qui tourneraient en double.
select cron.unschedule('expiration-premium-quotidienne')
where exists (select 1 from cron.job where jobname = 'expiration-premium-quotidienne');

select cron.schedule(
  'expiration-premium-quotidienne',
  '0 2 * * *',
  $$ select expirer_premium(); $$
);


-- ============================================================
-- 2) QUOTA QUOTIDIEN DE HABY
-- ============================================================
-- L'IA (Gemini) est le SEUL service facture a l'usage dans toute l'application.
-- Sans limite, une seule personne tres bavarde peut faire grimper la facture.
-- Le plan gratuit est donc plafonne a 10 questions/jour et le Premium reste
-- illimite -- ce qui donne au passage une vraie raison de s'abonner.
-- Le comptage est verifie DANS la fonction serveur haby-chat : une limite posee
-- seulement dans l'application serait contournable.
create table if not exists haby_usage (
  user_id uuid references auth.users(id) on delete cascade,
  jour date not null default (now() at time zone 'utc')::date,
  nb int not null default 0,
  primary key (user_id, jour)
);

alter table haby_usage enable row level security;

-- Chacune peut consulter sa propre consommation (affichee dans l'app).
-- L'ecriture est faite par la fonction serveur avec la cle de service.
drop policy if exists "haby_usage_select" on haby_usage;
create policy "haby_usage_select" on haby_usage for select using (
  user_id = auth.uid() or is_admin()
);

-- Purge des compteurs de plus de 30 jours (la table reste minuscule).
create or replace function purge_haby_usage()
returns void
language sql
security definer
set search_path = public
as $$
  delete from haby_usage where jour < (now() at time zone 'utc')::date - 30;
$$;


-- ============================================================
-- VERIFICATIONS -- REGARDE LES RESULTATS AFFICHES
-- ============================================================

-- (a) Tu dois maintenant voir TROIS taches planifiees :
--     rappels-tontine-quotidien / rollover-cycles-quotidien / expiration-premium-quotidienne
select jobname, schedule, active from cron.job order by jobname;

-- (b) La table du quota HABY doit apparaitre
select table_name from information_schema.tables
where table_name = 'haby_usage';

-- (c) IMPORTANT -- Comptes Premium SANS date de fin = Premium a vie involontaire.
--     Pour chacun, decide : soit tu poses une date depuis l'ecran Admin de l'app
--     (bouton "+ 1 mois" ou "+ 1 an"), soit tu le laisses en cadeau assume.
--     Ce script ne les coupe PAS.
select id, prenom, telephone, plan, premium_expire_le, created_at
from users
where plan = 'premium' and premium_expire_le is null
order by created_at;

-- (d) Comptes Premium dont la date est DEJA depassee : ils repasseront en gratuit
--     cette nuit a 2 h. Verifie que cette liste te parait juste.
select id, prenom, telephone, premium_expire_le
from users
where plan = 'premium'
  and premium_expire_le is not null
  and premium_expire_le < (now() at time zone 'utc')::date
order by premium_expire_le;

-- (e) Si la liste (d) te convient et que tu ne veux pas attendre la nuit, retire les
--     deux tirets devant la ligne suivante et relance. Le chiffre renvoye est le
--     nombre de comptes repasses en gratuit.
-- select expirer_premium() as comptes_repasses_en_gratuit;


select 'Termine : expiration Premium active + quota HABY en place. Lis les listes (c) et (d) ci-dessus.' as resultat;
