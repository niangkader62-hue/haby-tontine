-- A coller dans un nouvel onglet SQL Editor -> RUN
-- Sans danger : ajoute juste ce qui manque a la table messages existante

alter table messages add column if not exists groupe_id uuid references groupes(id) on delete cascade;
alter table messages add column if not exists auteur_user_id uuid references auth.users(id);
alter table messages add column if not exists auteur_nom text;
alter table messages add column if not exists texte text;
alter table messages add column if not exists created_at timestamptz default now();

alter table messages enable row level security;

drop policy if exists "messages_select" on messages;
create policy "messages_select" on messages for select using (
  is_owner_of(groupe_id) or is_admin() or is_membre_of(groupe_id)
);
drop policy if exists "messages_write" on messages;
create policy "messages_write" on messages for insert with check (
  auteur_user_id = auth.uid() and (is_owner_of(groupe_id) or is_admin() or is_membre_of(groupe_id))
);

-- Filet de securite : la table messages avait deja une colonne auteur obligatoire
alter table messages alter column auteur set default '';
