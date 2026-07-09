-- A coller dans un nouvel onglet SQL Editor -> RUN
-- Programme l'envoi automatique des rappels chaque jour a 8h (heure de Bamako = UTC, donc 8h UTC = 8h Bamako)

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('rappels-tontine-quotidien') where exists (
  select 1 from cron.job where jobname = 'rappels-tontine-quotidien'
);

select cron.schedule(
  'rappels-tontine-quotidien',
  '0 8 * * *',
  $$
  select net.http_post(
    url := 'https://tgcltyibsorhotoiogeu.supabase.co/functions/v1/daily-reminders',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "_T5KqLRWqR5DhgRArHaiGGcM1RPP67jKOnekB6wJSIk"}'::jsonb
  );
  $$
);
