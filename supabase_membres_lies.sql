-- A coller dans un nouvel onglet SQL Editor -> RUN
-- Sans danger : n'efface rien

-- 1) Un membre peut etre lie a un vrai compte utilisatrice
alter table membres add column if not exists user_id uuid references auth.users(id);

-- 2) On remplace les anciennes regles "tout ou rien" par des regles separees :
--    - LECTURE : proprietaire, admin, OU membre lie (lecture seule)
--    - ECRITURE (ajout/modif/suppr) : proprietaire ou admin uniquement

-- GROUPES
drop policy if exists "groupes_all_own_or_admin" on groupes;
drop policy if exists "groupes_select" on groupes;
drop policy if exists "groupes_write" on groupes;
create policy "groupes_select" on groupes for select using (
  auth.uid() = user_id or is_admin()
  or exists (select 1 from membres m where m.groupe_id = groupes.id and m.user_id = auth.uid())
);
create policy "groupes_write" on groupes for insert with check (auth.uid() = user_id or is_admin());
create policy "groupes_update" on groupes for update using (auth.uid() = user_id or is_admin()) with check (auth.uid() = user_id or is_admin());
create policy "groupes_delete" on groupes for delete using (auth.uid() = user_id or is_admin());

-- MEMBRES
drop policy if exists "membres_all_own_or_admin" on membres;
drop policy if exists "membres_select" on membres;
create policy "membres_select" on membres for select using (
  exists (select 1 from groupes g where g.id = membres.groupe_id and (g.user_id = auth.uid() or is_admin()))
  or user_id = auth.uid()
);
create policy "membres_write" on membres for insert with check (
  exists (select 1 from groupes g where g.id = membres.groupe_id and (g.user_id = auth.uid() or is_admin()))
);
create policy "membres_update" on membres for update using (
  exists (select 1 from groupes g where g.id = membres.groupe_id and (g.user_id = auth.uid() or is_admin()))
) with check (
  exists (select 1 from groupes g where g.id = membres.groupe_id and (g.user_id = auth.uid() or is_admin()))
);
create policy "membres_delete" on membres for delete using (
  exists (select 1 from groupes g where g.id = membres.groupe_id and (g.user_id = auth.uid() or is_admin()))
);

-- TRANSACTIONS (lecture ajoutee pour les membres lies)
drop policy if exists "transactions_all_own_or_admin" on transactions;
drop policy if exists "transactions_select" on transactions;
create policy "transactions_select" on transactions for select using (
  exists (select 1 from groupes g where g.id = transactions.groupe_id and (g.user_id = auth.uid() or is_admin()))
  or exists (select 1 from membres m where m.id = transactions.membre_id and m.user_id = auth.uid())
);
create policy "transactions_write" on transactions for insert with check (
  exists (select 1 from groupes g where g.id = transactions.groupe_id and (g.user_id = auth.uid() or is_admin()))
);
create policy "transactions_update" on transactions for update using (
  exists (select 1 from groupes g where g.id = transactions.groupe_id and (g.user_id = auth.uid() or is_admin()))
);
create policy "transactions_delete" on transactions for delete using (
  exists (select 1 from groupes g where g.id = transactions.groupe_id and (g.user_id = auth.uid() or is_admin()))
);

-- CHECKLIST (lecture ajoutee pour les membres lies)
drop policy if exists "checklist_all_own_or_admin" on checklist;
drop policy if exists "checklist_select" on checklist;
create policy "checklist_select" on checklist for select using (
  exists (select 1 from groupes g where g.id = checklist.groupe_id and (g.user_id = auth.uid() or is_admin()))
  or exists (select 1 from membres m where m.groupe_id = checklist.groupe_id and m.user_id = auth.uid())
);
create policy "checklist_write" on checklist for insert with check (
  exists (select 1 from groupes g where g.id = checklist.groupe_id and (g.user_id = auth.uid() or is_admin()))
);
create policy "checklist_update" on checklist for update using (
  exists (select 1 from groupes g where g.id = checklist.groupe_id and (g.user_id = auth.uid() or is_admin()))
);
create policy "checklist_delete" on checklist for delete using (
  exists (select 1 from groupes g where g.id = checklist.groupe_id and (g.user_id = auth.uid() or is_admin()))
);

-- 3) Fonction de liaison automatique par numero de telephone (compare les 8 derniers chiffres,
--    insensible au format +223/00223/espaces)
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

-- 4) Trigger : quand une nouvelle utilisatrice s'inscrit, on relie automatiquement
--    tous les membres existants qui ont son numero (liaison retroactive)
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
