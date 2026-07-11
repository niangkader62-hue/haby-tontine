-- ============================================================
-- FIX LIAISON MEMBRES v2 — script consolide et sans danger
-- A coller dans un NOUVEL onglet Supabase SQL Editor -> RUN (le vrai bouton "Run", pas "Run selected")
-- N'efface aucune donnee. Peut etre relance plusieurs fois sans probleme.
-- Objectif : garantir que chaque membre ajoute a une tontine se relie
-- automatiquement au compte de la personne des qu'elle a un compte HABY
-- (que ce soit avant ou apres son inscription), et que les regles de
-- lecture (RLS) sont bien a jour partout.
-- ============================================================

-- 1) Colonne de liaison (si jamais manquante)
alter table membres add column if not exists user_id uuid references auth.users(id);

-- 2) Fonctions de verification d'appartenance (source unique de verite)
create or replace function is_owner_of(p_groupe_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(select 1 from groupes where id = p_groupe_id and user_id = auth.uid());
$$;

create or replace function is_membre_of(p_groupe_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(select 1 from membres where groupe_id = p_groupe_id and user_id = auth.uid());
$$;

-- 3) Fonction de liaison manuelle (appelee par l'app juste apres l'ajout d'un membre)
create or replace function link_membre(p_membre_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tel text;
  v_user_id uuid;
begin
  select regexp_replace(tel, '[^0-9]', '', 'g') into v_tel from membres where id = p_membre_id;
  if v_tel is null or length(v_tel) < 8 then return; end if;
  select id into v_user_id from users
    where right(regexp_replace(telephone, '[^0-9]', '', 'g'), 8) = right(v_tel, 8)
    limit 1;
  if v_user_id is not null then
    update membres set user_id = v_user_id where id = p_membre_id;
  end if;
end;
$$;

-- 4) Trigger de liaison retroactive (des qu'une nouvelle personne cree son compte,
--    on relie tous les membres existants qui portent son numero)
create or replace function link_membres_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update membres set user_id = new.id
    where user_id is null
    and right(regexp_replace(tel, '[^0-9]', '', 'g'), 8) = right(regexp_replace(new.telephone, '[^0-9]', '', 'g'), 8);
  return new;
end;
$$;

drop trigger if exists trg_link_membres_on_signup on users;
create trigger trg_link_membres_on_signup
  after insert on users
  for each row execute function link_membres_on_signup();

-- 5) RATTRAPAGE GENERAL : relie MAINTENANT tous les membres non lies existants
--    (couvre le cas ou le trigger n'existait pas encore quand des comptes ont ete crees)
update membres m
set user_id = u.id
from users u
where m.user_id is null
  and length(regexp_replace(m.tel, '[^0-9]', '', 'g')) >= 8
  and right(regexp_replace(u.telephone, '[^0-9]', '', 'g'), 8) = right(regexp_replace(m.tel, '[^0-9]', '', 'g'), 8);

-- 6) RLS a jour partout (lecture pour proprietaire + admin + membre lie)
drop policy if exists "groupes_select" on groupes;
create policy "groupes_select" on groupes for select using (
  auth.uid() = user_id or is_admin() or is_membre_of(id)
);

drop policy if exists "membres_select" on membres;
create policy "membres_select" on membres for select using (
  is_owner_of(groupe_id) or is_admin() or user_id = auth.uid()
);
drop policy if exists "membres_write" on membres;
create policy "membres_write" on membres for insert with check (is_owner_of(groupe_id) or is_admin());
drop policy if exists "membres_update" on membres;
create policy "membres_update" on membres for update using (is_owner_of(groupe_id) or is_admin()) with check (is_owner_of(groupe_id) or is_admin());
drop policy if exists "membres_delete" on membres;
create policy "membres_delete" on membres for delete using (is_owner_of(groupe_id) or is_admin());

drop policy if exists "transactions_select" on transactions;
create policy "transactions_select" on transactions for select using (
  is_owner_of(groupe_id) or is_admin()
  or exists (select 1 from membres m where m.id = transactions.membre_id and m.user_id = auth.uid())
);

drop policy if exists "checklist_select" on checklist;
create policy "checklist_select" on checklist for select using (
  is_owner_of(groupe_id) or is_admin() or is_membre_of(groupe_id)
);

drop policy if exists "messages_select" on messages;
create policy "messages_select" on messages for select using (
  is_owner_of(groupe_id) or is_admin() or is_membre_of(groupe_id)
);
drop policy if exists "messages_write" on messages;
create policy "messages_write" on messages for insert with check (
  auteur_user_id = auth.uid() and (is_owner_of(groupe_id) or is_admin() or is_membre_of(groupe_id))
);

-- 7) VERIFICATION — regarde le resultat de ces 2 requetes apres avoir lance le script
-- (a) combien de membres sont maintenant lies vs pas encore lies
select
  count(*) filter (where user_id is not null) as membres_lies,
  count(*) filter (where user_id is null) as membres_pas_encore_lies
from membres;

-- (b) liste des membres NON lies avec un compte qui existe pourtant (probleme de numero different)
select m.id, m.prenom, m.tel as tel_membre, g.nom as tontine
from membres m
join groupes g on g.id = m.groupe_id
where m.user_id is null
order by m.prenom;
