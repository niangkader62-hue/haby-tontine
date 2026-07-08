-- A coller dans Supabase -> SQL Editor -> RUN
-- Sans danger : n'efface rien, ajoute seulement ce qui manque

-- 1) GROUPES (tontines)
alter table groupes add column if not exists user_id uuid references auth.users(id) default auth.uid();
alter table groupes add column if not exists nom text;
alter table groupes add column if not exists montant numeric default 0;
alter table groupes add column if not exists frequence text default 'Mensuel';
alter table groupes add column if not exists couleur text default '#D4A843';
alter table groupes add column if not exists cycle int default 1;
alter table groupes add column if not exists total_cycles int default 12;
alter table groupes add column if not exists date_echeance date;
alter table groupes add column if not exists caisse_sociale numeric default 0;
alter table groupes add column if not exists created_at timestamptz default now();

-- 2) MEMBRES (participantes d'une tontine)
alter table membres add column if not exists groupe_id uuid references groupes(id) on delete cascade;
alter table membres add column if not exists prenom text;
alter table membres add column if not exists tel text;
alter table membres add column if not exists quartier text;
alter table membres add column if not exists photo_url text;
alter table membres add column if not exists paye boolean default false;
alter table membres add column if not exists evenement text;
alter table membres add column if not exists score int default 80;
alter table membres add column if not exists versements numeric default 0;
alter table membres add column if not exists cycles_paies int default 0;
alter table membres add column if not exists ordre int default 0;
alter table membres add column if not exists created_at timestamptz default now();

-- 3) TRANSACTIONS (historique reel des paiements, utilise aussi par le panneau admin)
alter table transactions add column if not exists groupe_id uuid references groupes(id) on delete cascade;
alter table transactions add column if not exists membre_id uuid references membres(id) on delete cascade;
alter table transactions add column if not exists montant numeric default 0;
alter table transactions add column if not exists cycle int default 1;
alter table transactions add column if not exists statut text default 'paye';
alter table transactions add column if not exists created_at timestamptz default now();

-- 4) CHECKLIST : on la relie desormais a un vrai groupe (au lieu de rester locale au navigateur)
alter table checklist add column if not exists groupe_id uuid references groupes(id) on delete cascade;
alter table checklist add column if not exists label text;
alter table checklist add column if not exists done boolean default false;
alter table checklist add column if not exists created_at timestamptz default now();

-- 5) Securite (RLS) : chaque utilisatrice ne voit que SES tontines, l'admin voit tout
alter table groupes enable row level security;
drop policy if exists "groupes_all_own_or_admin" on groupes;
create policy "groupes_all_own_or_admin" on groupes for all using (auth.uid() = user_id or is_admin()) with check (auth.uid() = user_id or is_admin());

alter table membres enable row level security;
drop policy if exists "membres_all_own_or_admin" on membres;
create policy "membres_all_own_or_admin" on membres for all using (
  exists (select 1 from groupes g where g.id = membres.groupe_id and (g.user_id = auth.uid() or is_admin()))
) with check (
  exists (select 1 from groupes g where g.id = membres.groupe_id and (g.user_id = auth.uid() or is_admin()))
);

alter table transactions enable row level security;
drop policy if exists "transactions_all_own_or_admin" on transactions;
create policy "transactions_all_own_or_admin" on transactions for all using (
  exists (select 1 from groupes g where g.id = transactions.groupe_id and (g.user_id = auth.uid() or is_admin()))
) with check (
  exists (select 1 from groupes g where g.id = transactions.groupe_id and (g.user_id = auth.uid() or is_admin()))
);

alter table checklist enable row level security;
drop policy if exists "checklist_all_own_or_admin" on checklist;
create policy "checklist_all_own_or_admin" on checklist for all using (
  exists (select 1 from groupes g where g.id = checklist.groupe_id and (g.user_id = auth.uid() or is_admin()))
) with check (
  exists (select 1 from groupes g where g.id = checklist.groupe_id and (g.user_id = auth.uid() or is_admin()))
);
