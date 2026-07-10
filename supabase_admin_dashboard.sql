-- A coller dans un nouvel onglet SQL Editor -> RUN
-- Sans danger : ajoute juste une colonne de suivi

alter table users add column if not exists derniere_connexion timestamptz;
