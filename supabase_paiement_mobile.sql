-- ============================================================
-- BOUTONS DE PAIEMENT MOBILE (Orange Money / Wave) + DECLARATIONS
-- A coller dans un NOUVEL onglet Supabase SQL Editor -> RUN
-- ============================================================

-- 1) Numeros de reception pour chaque tontine et chaque cagnotte.
--    Affiches comme boutons de paiement direct ; l'argent part directement
--    sur ces numeros, jamais sur un compte de l'app.
alter table groupes add column if not exists numero_orange_money text;
alter table groupes add column if not exists numero_wave text;
alter table cagnottes add column if not exists numero_orange_money text;
alter table cagnottes add column if not exists numero_wave text;

-- 2) Declarations de paiement (tontines uniquement) : un membre declare avoir
--    paye (avec le moyen utilise), la creatrice confirme ou rejette. La
--    confirmation cree la vraie transaction -- le calcul reste automatique,
--    exactement comme un versement enregistre manuellement aujourd'hui.
create table if not exists declarations_paiement (
  id uuid primary key default gen_random_uuid(),
  groupe_id uuid references groupes(id) on delete cascade,
  membre_id uuid references membres(id) on delete cascade,
  montant numeric not null,
  moyen text check (moyen in ('orange_money','wave')),
  cycle integer,
  statut text default 'en_attente' check (statut in ('en_attente','confirme','rejete')),
  confirme_par uuid references membres(id),
  confirme_at timestamptz,
  created_at timestamptz default now()
);

alter table declarations_paiement enable row level security;

-- Un membre ne peut declarer que pour lui-meme
drop policy if exists "declarations_insert_self" on declarations_paiement;
create policy "declarations_insert_self" on declarations_paiement for insert with check (
  exists(select 1 from membres m where m.id=declarations_paiement.membre_id and m.user_id=auth.uid())
);

-- Visible par la creatrice, l'admin, et tous les membres du groupe concerne
drop policy if exists "declarations_select" on declarations_paiement;
create policy "declarations_select" on declarations_paiement for select using (
  is_owner_of(groupe_id) or is_admin()
  or exists(select 1 from membres m where m.groupe_id=declarations_paiement.groupe_id and m.user_id=auth.uid())
);

-- Seuls creatrice/collecteur/admin peuvent confirmer ou rejeter
drop policy if exists "declarations_update" on declarations_paiement;
create policy "declarations_update" on declarations_paiement for update using (
  is_owner_of(groupe_id) or is_admin()
  or exists(select 1 from membres m where m.groupe_id=declarations_paiement.groupe_id and m.user_id=auth.uid() and m.role_collecteur=true)
);

select count(*) as colonnes_ajoutees from information_schema.columns
where table_name in ('groupes','cagnottes') and column_name in ('numero_orange_money','numero_wave');
