-- A coller dans un nouvel onglet SQL Editor -> RUN
-- ATTENTION : IRREVERSIBLE. Verifie bien les deux numeros gardes ci-dessous avant de lancer.
-- Garde uniquement : 0022376908031 et 0022390647106 (tes deux vrais numeros)

-- 1) Efface toutes les tontines et tout ce qui en depend (membres, transactions,
--    taches, tirages, elections, votes, prets, rapports, discussions)
delete from groupes;

-- 2) Efface toutes les cagnottes et leurs contributions
delete from cagnottes;

-- 3) Efface toute l'epargne (Ma Tirelire)
delete from objectifs;

-- 4) Nettoie les tables liees aux comptes qui vont etre supprimes
delete from push_subscriptions where user_id in (
  select id from users where not (telephone ilike '%76908031' or telephone ilike '%90647106')
);
delete from paiements where user_id in (
  select id from users where not (telephone ilike '%76908031' or telephone ilike '%90647106')
);
delete from parrainages where parrain_id in (
  select id from users where not (telephone ilike '%76908031' or telephone ilike '%90647106')
) or filleul_id in (
  select id from users where not (telephone ilike '%76908031' or telephone ilike '%90647106')
);
delete from activity_logs where user_id in (
  select id from users where not (telephone ilike '%76908031' or telephone ilike '%90647106')
);

-- 5) Efface tous les comptes de test (garde uniquement tes 2 vrais numeros)
delete from users where not (telephone ilike '%76908031' or telephone ilike '%90647106');

-- 6) Efface les comptes d'authentification correspondants (empeche toute reconnexion)
delete from auth.users where id not in (select id from users);

-- Verification finale : il ne doit rester que tes 2 comptes
select prenom, telephone, role, plan from users;
