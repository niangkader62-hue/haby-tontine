-- A coller dans un nouvel onglet SQL Editor -> RUN
-- Corrige le verrou de securite pour qu'il n'empeche plus TES propres modifications
-- manuelles via l'editeur SQL (le trigger d'avant les bloquait par erreur)

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

-- Refait le changement de role, cette fois il va vraiment s'appliquer
update users set role = 'user' where telephone ilike '%90564473';
update users set role = 'admin' where telephone ilike '%76908031' or telephone ilike '%90647106';

-- Verification
select prenom, telephone, role from users where telephone ilike '%90564473' or telephone ilike '%76908031' or telephone ilike '%90647106';
