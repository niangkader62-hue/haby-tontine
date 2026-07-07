-- A coller dans Supabase -> SQL Editor -> RUN
-- Sans danger : n'efface rien, ajoute seulement ce qui manque

alter table objectifs add column if not exists user_id uuid references auth.users(id) default auth.uid();
alter table objectifs add column if not exists label text;
alter table objectifs add column if not exists emoji text default '🎯';
alter table objectifs add column if not exists actuel numeric default 0;
alter table objectifs add column if not exists cible numeric default 0;
alter table objectifs add column if not exists couleur text default '#D4A843';
alter table objectifs add column if not exists created_at timestamptz default now();

alter table objectifs enable row level security;

drop policy if exists "objectifs_select_own" on objectifs;
create policy "objectifs_select_own" on objectifs for select using (auth.uid() = user_id);

drop policy if exists "objectifs_insert_own" on objectifs;
create policy "objectifs_insert_own" on objectifs for insert with check (auth.uid() = user_id);

drop policy if exists "objectifs_update_own" on objectifs;
create policy "objectifs_update_own" on objectifs for update using (auth.uid() = user_id);

drop policy if exists "objectifs_delete_own" on objectifs;
create policy "objectifs_delete_own" on objectifs for delete using (auth.uid() = user_id);
