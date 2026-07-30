-- ============================================================
-- LE PREMIUM NE SE TERMINAIT TOUJOURS PAS -- CORRECTIF FINAL
-- A coller dans un NOUVEL onglet Supabase -> SQL Editor -> RUN
-- Sans danger : ne supprime aucune donnee, peut etre relance sans probleme.
-- ============================================================
-- CE QUI A ETE TROUVE
-- Le correctif precedent posait bien une date de fin d'abonnement
-- (`premium_expire_le`) au moment du paiement. Les commentaires du code parlaient
-- d'une "tache quotidienne qui repasse les comptes expires en gratuit"...
-- mais cette tache n'a jamais existe. Seules deux taches etaient planifiees :
-- les rappels d'echeance et le passage au cycle suivant.
--
-- Consequence : la date etait ecrite et jamais relue. Un paiement de 1 000 FCFA
-- donnait donc TOUJOURS le Premium a vie. C'est le bug le plus couteux du projet :
-- il ne se voit pas a l'usage (tout fonctionne), il ne casse rien, il fait
-- seulement perdre chaque renouvellement.
--
-- CE QUE FAIT CE SCRIPT
--   1) cree la fonction `expirer_premium()` qui repasse en gratuit les comptes echus
--   2) la planifie chaque nuit a 2 h (heure UTC)
--   3) affiche la liste des comptes Premium SANS date de fin, a corriger a la main
-- ============================================================


-- ------------------------------------------------------------
-- 1) LA FONCTION
-- ------------------------------------------------------------
-- Volontairement prudente : elle ne touche QUE les comptes qui ont une date de fin
-- depassee. Un compte Premium sans date (accorde avant la mise en place des dates)
-- n'est PAS coupe -- ce serait retirer sans prevenir l'acces d'une abonnee qui a paye.
-- Ceux-la sont listes a la fin de ce script pour etre traites a la main.
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


-- ------------------------------------------------------------
-- 2) LA PLANIFICATION (chaque nuit a 2 h UTC)
-- ------------------------------------------------------------
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
-- VERIFICATIONS (regarde les resultats affiches)
-- ============================================================

-- (a) Les 3 taches planifiees doivent apparaitre :
--     rappels-tontine-quotidien, rollover-cycles-quotidien, expiration-premium-quotidienne
select jobname, schedule, active from cron.job order by jobname;

-- (b) Comptes Premium SANS date de fin = Premium a vie involontaire.
--     Pour chacun, decide : soit tu poses une date de fin depuis l'ecran Admin
--     (bouton "+ 1 mois" / "+ 1 an"), soit tu le laisses en cadeau assume.
select id, prenom, telephone, plan, premium_expire_le, created_at
from users
where plan = 'premium' and premium_expire_le is null
order by created_at;

-- (c) Comptes Premium avec une date deja depassee : ils vont etre repasses en gratuit
--     cette nuit. Verifie que la liste te parait juste AVANT d'aller plus loin.
select id, prenom, telephone, premium_expire_le
from users
where plan = 'premium'
  and premium_expire_le is not null
  and premium_expire_le < (now() at time zone 'utc')::date
order by premium_expire_le;

-- (d) Si la liste (c) te convient, tu peux appliquer tout de suite sans attendre la nuit.
--     Le chiffre renvoye est le nombre de comptes repasses en gratuit.
-- select expirer_premium() as comptes_repasses_en_gratuit;

select 'expiration Premium reellement active -- verifie les listes (b) et (c) ci-dessus' as resultat;
