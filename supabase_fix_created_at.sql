-- A coller dans un nouvel onglet SQL Editor -> RUN
-- Corrige "column users.created_at does not exist" qui bloquait le chargement
-- du panneau admin (utilisatrices ET "Creee par ? ()")

alter table users add column if not exists created_at timestamptz default now();
update users set created_at = now() where created_at is null;
