-- ============================================================
-- SCRIPT FINAL DE RATTRAPAGE — regroupe tout ce qui pourrait
-- ne pas avoir ete lance. Sans danger de le relancer, meme
-- si une partie a deja ete faite avant.
-- ============================================================

-- Montants personnalises, montant initial, cagnottes, caisse sociale
alter table membres add column if not exists montant_perso numeric;
alter table membres add column if not exists role_collecteur boolean default false;
alter table groupes add column if not exists montant_initial numeric default 0;
alter table cagnottes add column if not exists montant_collecte numeric default 0;
alter table cagnotte_contributions add column if not exists tel text;
alter table cagnotte_contributions add column if not exists preuve_url text;
alter table transactions add column if not exists photo_url text;
alter table transactions add column if not exists recu_envoye boolean default false;
alter table prets add column if not exists motif text;
alter table prets add column if not exists photo_url text;
alter table prets add column if not exists date_versement timestamptz;
alter table users add column if not exists code_secu_1 text;
alter table users add column if not exists code_secu_2 text;

create table if not exists caisse_sociale_mouvements (
  id uuid primary key default gen_random_uuid(),
  groupe_id uuid references groupes(id) on delete cascade,
  sens text not null check (sens in ('ajout','retrait')),
  montant numeric not null,
  motif text,
  auteur_nom text,
  created_at timestamptz default now()
);
alter table caisse_sociale_mouvements enable row level security;
drop policy if exists "caisse_mvt_select" on caisse_sociale_mouvements;
create policy "caisse_mvt_select" on caisse_sociale_mouvements for select using (
  is_owner_of(groupe_id) or is_admin() or is_membre_of(groupe_id)
);
drop policy if exists "caisse_mvt_insert" on caisse_sociale_mouvements;
create policy "caisse_mvt_insert" on caisse_sociale_mouvements for insert with check (
  is_owner_of(groupe_id) or is_admin()
);

alter publication supabase_realtime add table messages;

-- Fonction dediee pour le role collecteur (evite la boucle infinie)
create or replace function is_collecteur_of(p_groupe_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(select 1 from membres where groupe_id = p_groupe_id and user_id = auth.uid() and role_collecteur = true);
$$;

drop policy if exists "membres_update" on membres;
create policy "membres_update" on membres for update using (
  is_owner_of(groupe_id) or is_admin() or is_collecteur_of(groupe_id)
) with check (
  is_owner_of(groupe_id) or is_admin() or is_collecteur_of(groupe_id)
);

drop policy if exists "transactions_write" on transactions;
create policy "transactions_write" on transactions for insert with check (
  is_owner_of(groupe_id) or is_admin() or is_collecteur_of(groupe_id)
);

drop policy if exists "transactions_update" on transactions;
create policy "transactions_update" on transactions for update using (
  is_owner_of(groupe_id) or is_admin() or is_collecteur_of(groupe_id)
);

drop policy if exists "prets_write" on prets;
create policy "prets_write" on prets for insert with check (
  is_owner_of(groupe_id) or is_admin()
  or (is_membre_of(groupe_id) and membre_id = (select id from membres where groupe_id = prets.groupe_id and user_id = auth.uid()))
);

select 'tout est en place' as resultat;
