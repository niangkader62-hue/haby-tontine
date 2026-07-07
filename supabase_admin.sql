-- A coller dans Supabase -> SQL Editor -> RUN
-- Sans danger : n'efface rien, ajoute seulement ce qui manque

-- 1) Colonne role sur la table users (par defaut "user")
alter table users add column if not exists role text default 'user';

-- 2) Fonction securisee pour verifier si l'utilisateur connecte est admin
-- (evite les recursions RLS infinies)
create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce((select role from users where id = auth.uid()) = 'admin', false);
$$;

-- 3) Autoriser un admin a voir TOUS les utilisateurs (en plus de son propre profil)
alter table users enable row level security;
drop policy if exists "users_select_own_or_admin" on users;
create policy "users_select_own_or_admin" on users for select using (auth.uid() = id or is_admin());

-- 4) Table de logs d'activite (traçabilite, utile en cas de litige)
create table if not exists activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  action text not null,
  details jsonb,
  created_at timestamptz default now()
);
alter table activity_logs enable row level security;
drop policy if exists "logs_insert_own" on activity_logs;
create policy "logs_insert_own" on activity_logs for insert with check (auth.uid() = user_id);
drop policy if exists "logs_select_admin" on activity_logs;
create policy "logs_select_admin" on activity_logs for select using (is_admin());

-- 5) IMPORTANT : te donner le role admin a toi-meme
-- Remplace le numero ci-dessous par TON numero de telephone exact utilise a l'inscription
-- (celui que tu tapes pour te connecter, sans espaces)
update users set role = 'admin' where telephone = 'TON_NUMERO_ICI';
