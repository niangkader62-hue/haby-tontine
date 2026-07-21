-- ============================================================
-- PASSAGE AUTOMATIQUE AU CYCLE SUIVANT — sans danger
-- A coller dans un NOUVEL onglet Supabase SQL Editor -> RUN
-- ============================================================
-- Avant ce script, rien ne faisait jamais avancer groupes.cycle : les
-- versements/statut "paye" s'accumulaient pour toute la duree de la tontine
-- au lieu d'etre remis a zero a chaque nouveau cycle.
--
-- Desormais, une tache planifiee quotidienne (Edge Function rollover-cycles)
-- fait passer une tontine au cycle suivant 3 jours apres sa date d'echeance
-- (le temps que les rappels de retard fassent leur effet). A ce moment-la,
-- tout solde impaye du cycle qui se termine devient une DETTE cumulee par
-- membre (jamais effacee automatiquement), et versements/paye repartent a
-- zero pour le nouveau cycle.
-- ============================================================

alter table membres add column if not exists dette numeric not null default 0;

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('rollover-cycles-quotidien') where exists (
  select 1 from cron.job where jobname = 'rollover-cycles-quotidien'
);

-- Tourne juste apres les rappels (8h Bamako), a 9h
select cron.schedule(
  'rollover-cycles-quotidien',
  '0 9 * * *',
  $$
  select net.http_post(
    url := 'https://tgcltyibsorhotoiogeu.supabase.co/functions/v1/rollover-cycles',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "_T5KqLRWqR5DhgRArHaiGGcM1RPP67jKOnekB6wJSIk"}'::jsonb
  );
  $$
);

select 'rollover automatique programme' as resultat;
