-- ============================================================
-- PRETS : demande par le membre + acceptation/versement par l'admin — sans danger
-- A coller dans un NOUVEL onglet Supabase SQL Editor -> RUN
-- ============================================================

alter table prets add column if not exists motif text;
alter table prets add column if not exists photo_url text;
alter table prets add column if not exists date_versement timestamptz;

-- Un membre peut desormais demander un pret, mais UNIQUEMENT en son propre nom,
-- et UNIQUEMENT dans une tontine dont il fait vraiment partie (jamais pour un autre,
-- jamais dans une tontine ou il n'est pas membre).
drop policy if exists "prets_write" on prets;
create policy "prets_write" on prets for insert with check (
  is_owner_of(groupe_id) or is_admin()
  or (is_membre_of(groupe_id) and membre_id = (select id from membres where groupe_id = prets.groupe_id and user_id = auth.uid()))
);

select 'ok' as test;
