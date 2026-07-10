-- A coller dans un nouvel onglet SQL Editor -> RUN
-- IMPORTANT : corrige une faille potentielle de securite

-- PROBLEME TROUVE : selon la configuration exacte des regles existantes sur la table "users",
-- il etait possible qu'une utilisatrice malveillante puisse modifier directement (via une requete API
-- fabriquee a la main, en contournant l'application) SON PROPRE role en "admin" ou son SON PROPRE
-- plan en "premium", sans jamais payer ni etre nommee par un vrai administrateur.

-- 1) On autorise chaque utilisatrice a modifier SA PROPRE ligne (necessaire pour la langue, la photo, etc.)
drop policy if exists "users_update_own" on users;
create policy "users_update_own" on users for update using (auth.uid() = id) with check (auth.uid() = id);

-- 2) MAIS un verrou technique (trigger) empeche absolument quiconque (sauf un vrai admin ou le serveur)
--    de changer son propre role ou son propre plan, meme en contournant l'interface de l'application.
create or replace function protect_sensitive_user_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or is_admin() then
    return new;
  end if;
  new.role := old.role;
  new.plan := old.plan;
  new.premium_expire_le := old.premium_expire_le;
  return new;
end;
$$;

drop trigger if exists trg_protect_sensitive_fields on users;
create trigger trg_protect_sensitive_fields
  before update on users
  for each row execute function protect_sensitive_user_fields();
