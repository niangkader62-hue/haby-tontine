-- A coller dans un nouvel onglet SQL Editor -> RUN
-- Corrige l'erreur "infinite recursion detected in policy for relation groupes"

-- Fonctions securisees qui verifient l'appartenance sans re-declencher les regles de securite
-- (evite la boucle infinie groupes <-> membres)
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

-- GROUPES : on remplace la lecture pour utiliser les fonctions au lieu d'une requete directe
drop policy if exists "groupes_select" on groupes;
create policy "groupes_select" on groupes for select using (
  auth.uid() = user_id or is_admin() or is_membre_of(id)
);

-- MEMBRES : idem
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

-- TRANSACTIONS : idem
drop policy if exists "transactions_select" on transactions;
create policy "transactions_select" on transactions for select using (
  is_owner_of(groupe_id) or is_admin()
  or exists (select 1 from membres m where m.id = transactions.membre_id and m.user_id = auth.uid())
);
drop policy if exists "transactions_write" on transactions;
create policy "transactions_write" on transactions for insert with check (is_owner_of(groupe_id) or is_admin());
drop policy if exists "transactions_update" on transactions;
create policy "transactions_update" on transactions for update using (is_owner_of(groupe_id) or is_admin());
drop policy if exists "transactions_delete" on transactions;
create policy "transactions_delete" on transactions for delete using (is_owner_of(groupe_id) or is_admin());

-- CHECKLIST : idem
drop policy if exists "checklist_select" on checklist;
create policy "checklist_select" on checklist for select using (
  is_owner_of(groupe_id) or is_admin() or is_membre_of(groupe_id)
);
drop policy if exists "checklist_write" on checklist;
create policy "checklist_write" on checklist for insert with check (is_owner_of(groupe_id) or is_admin());
drop policy if exists "checklist_update" on checklist;
create policy "checklist_update" on checklist for update using (is_owner_of(groupe_id) or is_admin());
drop policy if exists "checklist_delete" on checklist;
create policy "checklist_delete" on checklist for delete using (is_owner_of(groupe_id) or is_admin());
