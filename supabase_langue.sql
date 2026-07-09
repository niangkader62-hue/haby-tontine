-- A coller dans un nouvel onglet SQL Editor -> RUN
alter table users add column if not exists langue text default 'fr';
