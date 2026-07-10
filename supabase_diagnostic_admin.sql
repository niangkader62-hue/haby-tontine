-- A coller dans un nouvel onglet SQL Editor -> RUN
-- DIAGNOSTIC + REPARATION COMPLETE de l'etat admin

-- 1) Confirme que tes 2 numeros sont bien admin (au cas ou)
update users set role = 'admin'
where telephone ilike '%76908031' or telephone ilike '%90647106';

-- 2) S'assure que le verrou de securite laisse bien passer les admins ET le service
create or replace function protect_sensitive_user_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_user in ('postgres','supabase_admin') or auth.role() = 'service_role' or is_admin() then
    return new;
  end if;
  new.role := old.role;
  new.plan := old.plan;
  new.premium_expire_le := old.premium_expire_le;
  return new;
end;
$$;

-- 3) S'assure qu'une policy autorise un admin a modifier n'importe quel utilisateur
drop policy if exists "users_update_admin" on users;
create policy "users_update_admin" on users for update using (is_admin()) with check (is_admin());

-- 4) VERIFICATION : affiche le role de tes comptes + teste is_admin
select prenom, telephone, role, plan from users where telephone ilike '%76908031' or telephone ilike '%90647106';
