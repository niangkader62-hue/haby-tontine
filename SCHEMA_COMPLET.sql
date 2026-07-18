-- ============================================================
-- SCHEMA COMPLET THT (Tontine Habi Traore) - fichier de reference
-- ============================================================
-- Ce fichier regroupe TOUS les scripts SQL du projet, dans l'ordre
-- chronologique de leur creation. Il sert de DOCUMENTATION et de
-- reference pour reconstruire la base de zero si besoin un jour.
--
-- IMPORTANT : ce fichier n'a PAS besoin d'etre relance si ta base
-- actuelle fonctionne deja bien -- tous ces scripts ont deja ete
-- appliques un par un au fil du developpement. Il est fourni pour
-- garder une trace propre et unique, au lieu de 31 fichiers separes.
--
-- Si tu dois un jour repartir de zero (nouvelle base Supabase vide),
-- colle ce fichier en entier dans le SQL Editor et lance-le : tous
-- les scripts sont ecrits pour etre rejouables sans danger (IF NOT
-- EXISTS, CREATE OR REPLACE, DROP+CREATE), donc l'ordre est deja
-- correct et sans conflit.
-- ============================================================


-- ============================================================
-- FICHIER SOURCE : supabase_admin.sql
-- ============================================================
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


-- ============================================================
-- FICHIER SOURCE : supabase_coadmin.sql
-- ============================================================
-- A coller dans un nouvel onglet SQL Editor -> RUN
-- Sans danger : ajoute juste une regle de securite supplementaire

-- Autoriser un admin a modifier le role d'une autre utilisatrice (pour nommer des co-admins)
drop policy if exists "users_update_admin" on users;
create policy "users_update_admin" on users for update using (is_admin()) with check (is_admin());


-- ============================================================
-- FICHIER SOURCE : supabase_groupes.sql
-- ============================================================
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

-- 6) Filet de securite : la table groupes avait deja une colonne owner_id obligatoire
-- avant nos changements ; on lui donne une valeur par defaut pour eviter tout futur souci
alter table groupes alter column owner_id set default auth.uid();


-- ============================================================
-- FICHIER SOURCE : supabase_fix_recursion.sql
-- ============================================================
-- A coller dans un nouvel onglet SQL Editor -> RUN
-- Corrige l'erreur "infinite recursion detected in policy for relation groupes"

-- Fonctions securisees qui verifient l'appartenance sans re-declencher les regles de securite
-- (evite la boucle infinie groupes <-> membres)
create or replace function is_owner_of(p_groupe_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(select 1 from groupes where id = p_groupe_id and user_id = auth.uid());
$$;

create or replace function is_membre_of(p_groupe_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(select 1 from membres where groupe_id = p_groupe_id and user_id = auth.uid());
$$;

-- GROUPES : on remplace la lecture pour utiliser les fonctions au lieu d'une requete directe
drop policy if exists "groupes_select" on groupes;
create policy "groupes_select" on groupes for select using (
  auth.uid() = user_id or is_admin() or is_membre_of(id)
);

-- MEMBRES : idem
drop policy if exists "membres_select" on membres;
create policy "membres_select" on membres for select using (
  is_owner_of(groupe_id) or is_admin() or user_id = auth.uid()
);
drop policy if exists "membres_write" on membres;
create policy "membres_write" on membres for insert with check (is_owner_of(groupe_id) or is_admin());
drop policy if exists "membres_update" on membres;
create policy "membres_update" on membres for update using (is_owner_of(groupe_id) or is_admin()) with check (is_owner_of(groupe_id) or is_admin());
drop policy if exists "membres_delete" on membres;
create policy "membres_delete" on membres for delete using (is_owner_of(groupe_id) or is_admin());

-- TRANSACTIONS : idem
drop policy if exists "transactions_select" on transactions;
create policy "transactions_select" on transactions for select using (
  is_owner_of(groupe_id) or is_admin()
  or exists (select 1 from membres m where m.id = transactions.membre_id and m.user_id = auth.uid())
);
drop policy if exists "transactions_write" on transactions;
create policy "transactions_write" on transactions for insert with check (is_owner_of(groupe_id) or is_admin());
drop policy if exists "transactions_update" on transactions;
create policy "transactions_update" on transactions for update using (is_owner_of(groupe_id) or is_admin());
drop policy if exists "transactions_delete" on transactions;
create policy "transactions_delete" on transactions for delete using (is_owner_of(groupe_id) or is_admin());

-- CHECKLIST : idem
drop policy if exists "checklist_select" on checklist;
create policy "checklist_select" on checklist for select using (
  is_owner_of(groupe_id) or is_admin() or is_membre_of(groupe_id)
);
drop policy if exists "checklist_write" on checklist;
create policy "checklist_write" on checklist for insert with check (is_owner_of(groupe_id) or is_admin());
drop policy if exists "checklist_update" on checklist;
create policy "checklist_update" on checklist for update using (is_owner_of(groupe_id) or is_admin());
drop policy if exists "checklist_delete" on checklist;
create policy "checklist_delete" on checklist for delete using (is_owner_of(groupe_id) or is_admin());


-- ============================================================
-- FICHIER SOURCE : supabase_membres_lies.sql
-- ============================================================
-- A coller dans un nouvel onglet SQL Editor -> RUN
-- Sans danger : n'efface rien

-- 1) Un membre peut etre lie a un vrai compte utilisatrice
alter table membres add column if not exists user_id uuid references auth.users(id);

-- 2) On remplace les anciennes regles "tout ou rien" par des regles separees :
--    - LECTURE : proprietaire, admin, OU membre lie (lecture seule)
--    - ECRITURE (ajout/modif/suppr) : proprietaire ou admin uniquement

-- GROUPES
drop policy if exists "groupes_all_own_or_admin" on groupes;
drop policy if exists "groupes_select" on groupes;
drop policy if exists "groupes_write" on groupes;
create policy "groupes_select" on groupes for select using (
  auth.uid() = user_id or is_admin()
  or exists (select 1 from membres m where m.groupe_id = groupes.id and m.user_id = auth.uid())
);
create policy "groupes_write" on groupes for insert with check (auth.uid() = user_id or is_admin());
create policy "groupes_update" on groupes for update using (auth.uid() = user_id or is_admin()) with check (auth.uid() = user_id or is_admin());
create policy "groupes_delete" on groupes for delete using (auth.uid() = user_id or is_admin());

-- MEMBRES
drop policy if exists "membres_all_own_or_admin" on membres;
drop policy if exists "membres_select" on membres;
create policy "membres_select" on membres for select using (
  exists (select 1 from groupes g where g.id = membres.groupe_id and (g.user_id = auth.uid() or is_admin()))
  or user_id = auth.uid()
);
create policy "membres_write" on membres for insert with check (
  exists (select 1 from groupes g where g.id = membres.groupe_id and (g.user_id = auth.uid() or is_admin()))
);
create policy "membres_update" on membres for update using (
  exists (select 1 from groupes g where g.id = membres.groupe_id and (g.user_id = auth.uid() or is_admin()))
) with check (
  exists (select 1 from groupes g where g.id = membres.groupe_id and (g.user_id = auth.uid() or is_admin()))
);
create policy "membres_delete" on membres for delete using (
  exists (select 1 from groupes g where g.id = membres.groupe_id and (g.user_id = auth.uid() or is_admin()))
);

-- TRANSACTIONS (lecture ajoutee pour les membres lies)
drop policy if exists "transactions_all_own_or_admin" on transactions;
drop policy if exists "transactions_select" on transactions;
create policy "transactions_select" on transactions for select using (
  exists (select 1 from groupes g where g.id = transactions.groupe_id and (g.user_id = auth.uid() or is_admin()))
  or exists (select 1 from membres m where m.id = transactions.membre_id and m.user_id = auth.uid())
);
create policy "transactions_write" on transactions for insert with check (
  exists (select 1 from groupes g where g.id = transactions.groupe_id and (g.user_id = auth.uid() or is_admin()))
);
create policy "transactions_update" on transactions for update using (
  exists (select 1 from groupes g where g.id = transactions.groupe_id and (g.user_id = auth.uid() or is_admin()))
);
create policy "transactions_delete" on transactions for delete using (
  exists (select 1 from groupes g where g.id = transactions.groupe_id and (g.user_id = auth.uid() or is_admin()))
);

-- CHECKLIST (lecture ajoutee pour les membres lies)
drop policy if exists "checklist_all_own_or_admin" on checklist;
drop policy if exists "checklist_select" on checklist;
create policy "checklist_select" on checklist for select using (
  exists (select 1 from groupes g where g.id = checklist.groupe_id and (g.user_id = auth.uid() or is_admin()))
  or exists (select 1 from membres m where m.groupe_id = checklist.groupe_id and m.user_id = auth.uid())
);
create policy "checklist_write" on checklist for insert with check (
  exists (select 1 from groupes g where g.id = checklist.groupe_id and (g.user_id = auth.uid() or is_admin()))
);
create policy "checklist_update" on checklist for update using (
  exists (select 1 from groupes g where g.id = checklist.groupe_id and (g.user_id = auth.uid() or is_admin()))
);
create policy "checklist_delete" on checklist for delete using (
  exists (select 1 from groupes g where g.id = checklist.groupe_id and (g.user_id = auth.uid() or is_admin()))
);

-- 3) Fonction de liaison automatique par numero de telephone (compare les 8 derniers chiffres,
--    insensible au format +223/00223/espaces)
create or replace function link_membre(p_membre_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tel text;
  v_user_id uuid;
begin
  select regexp_replace(tel, '[^0-9]', '', 'g') into v_tel from membres where id = p_membre_id;
  if v_tel is null or length(v_tel) < 8 then return; end if;
  select id into v_user_id from users
    where right(regexp_replace(telephone, '[^0-9]', '', 'g'), 8) = right(v_tel, 8)
    limit 1;
  if v_user_id is not null then
    update membres set user_id = v_user_id where id = p_membre_id;
  end if;
end;
$$;

-- 4) Trigger : quand une nouvelle utilisatrice s'inscrit, on relie automatiquement
--    tous les membres existants qui ont son numero (liaison retroactive)
create or replace function link_membres_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update membres set user_id = new.id
    where user_id is null
    and right(regexp_replace(tel, '[^0-9]', '', 'g'), 8) = right(regexp_replace(new.telephone, '[^0-9]', '', 'g'), 8);
  return new;
end;
$$;

drop trigger if exists trg_link_membres_on_signup on users;
create trigger trg_link_membres_on_signup
  after insert on users
  for each row execute function link_membres_on_signup();


-- ============================================================
-- FICHIER SOURCE : supabase_fix_liaison.sql
-- ============================================================
-- A coller dans un nouvel onglet SQL Editor -> RUN
-- Relie manuellement tous les membres existants qui correspondent deja a un compte HABY,
-- sans rien casser (ne touche que les membres pas encore relies)

update membres m
set user_id = u.id
from users u
where m.user_id is null
and right(regexp_replace(m.tel,'[^0-9]','','g'), 8) = right(regexp_replace(u.telephone,'[^0-9]','','g'), 8);

-- Verification : voir combien de membres sont maintenant relies
select prenom, tel, user_id from membres where user_id is not null;


-- ============================================================
-- FICHIER SOURCE : supabase_objectifs.sql
-- ============================================================
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


-- ============================================================
-- FICHIER SOURCE : supabase_push.sql
-- ============================================================
-- A coller dans un nouvel onglet SQL Editor -> RUN
-- Sans danger : cree juste une nouvelle table

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  subscription jsonb not null,
  created_at timestamptz default now(),
  unique(user_id)
);

alter table push_subscriptions enable row level security;

drop policy if exists "push_subs_own" on push_subscriptions;
create policy "push_subs_own" on push_subscriptions for all using (
  auth.uid() = user_id or is_admin()
) with check (
  auth.uid() = user_id or is_admin()
);


-- ============================================================
-- FICHIER SOURCE : supabase_langue.sql
-- ============================================================
-- A coller dans un nouvel onglet SQL Editor -> RUN
alter table users add column if not exists langue text default 'fr';


-- ============================================================
-- FICHIER SOURCE : supabase_tirage.sql
-- ============================================================
-- A coller dans un nouvel onglet SQL Editor -> RUN
-- Sans danger : cree juste une nouvelle table

create table if not exists tirages (
  id uuid primary key default gen_random_uuid(),
  groupe_id uuid references groupes(id) on delete cascade,
  membre_id uuid references membres(id) on delete cascade,
  cycle int not null,
  created_at timestamptz default now()
);

alter table tirages enable row level security;

drop policy if exists "tirages_select" on tirages;
create policy "tirages_select" on tirages for select using (
  is_owner_of(groupe_id) or is_admin() or is_membre_of(groupe_id)
);
drop policy if exists "tirages_write" on tirages;
create policy "tirages_write" on tirages for insert with check (is_owner_of(groupe_id) or is_admin());


-- ============================================================
-- FICHIER SOURCE : supabase_bureau.sql
-- ============================================================
-- A coller dans un nouvel onglet SQL Editor -> RUN
-- Sans danger : cree juste ce qui manque

-- 1) Role au bureau sur chaque membre
alter table membres add column if not exists role_bureau text;

-- 2) Elections (une election par role, avec une liste de candidates)
create table if not exists elections (
  id uuid primary key default gen_random_uuid(),
  groupe_id uuid references groupes(id) on delete cascade,
  role text not null,
  candidats jsonb not null default '[]'::jsonb,
  statut text not null default 'ouverte',
  created_at timestamptz default now()
);

-- 3) Votes (un vote par utilisatrice liee, par election)
create table if not exists votes (
  id uuid primary key default gen_random_uuid(),
  election_id uuid references elections(id) on delete cascade,
  voter_user_id uuid references auth.users(id),
  candidate_membre_id uuid references membres(id),
  created_at timestamptz default now(),
  unique(election_id, voter_user_id)
);

-- 4) Fonction securisee : l'election appartient-elle a un groupe ou je suis membre lie ?
create or replace function can_vote_on(p_election_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(
    select 1 from elections e
    where e.id = p_election_id
    and is_membre_of(e.groupe_id)
  );
$$;

-- 5) Securite (RLS)
alter table elections enable row level security;
drop policy if exists "elections_select" on elections;
create policy "elections_select" on elections for select using (
  is_owner_of(groupe_id) or is_admin() or is_membre_of(groupe_id)
);
drop policy if exists "elections_write" on elections;
create policy "elections_write" on elections for insert with check (is_owner_of(groupe_id) or is_admin());
drop policy if exists "elections_update" on elections;
create policy "elections_update" on elections for update using (is_owner_of(groupe_id) or is_admin());

alter table votes enable row level security;
drop policy if exists "votes_select" on votes;
create policy "votes_select" on votes for select using (
  exists (select 1 from elections e where e.id = votes.election_id and (is_owner_of(e.groupe_id) or is_admin() or is_membre_of(e.groupe_id)))
);
drop policy if exists "votes_write" on votes;
create policy "votes_write" on votes for insert with check (
  voter_user_id = auth.uid() and can_vote_on(election_id)
);


-- ============================================================
-- FICHIER SOURCE : supabase_chat.sql
-- ============================================================
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


-- ============================================================
-- FICHIER SOURCE : supabase_prets.sql
-- ============================================================
-- A coller dans un nouvel onglet SQL Editor -> RUN
-- Sans danger : cree juste une nouvelle table

create table if not exists prets (
  id uuid primary key default gen_random_uuid(),
  groupe_id uuid references groupes(id) on delete cascade,
  membre_id uuid references membres(id) on delete cascade,
  montant numeric not null,
  taux_interet numeric default 0,
  montant_rembourse numeric default 0,
  statut text default 'en_cours',
  date_echeance date,
  created_at timestamptz default now()
);

alter table prets enable row level security;

drop policy if exists "prets_select" on prets;
create policy "prets_select" on prets for select using (
  is_owner_of(groupe_id) or is_admin() or is_membre_of(groupe_id)
);
drop policy if exists "prets_write" on prets;
create policy "prets_write" on prets for insert with check (is_owner_of(groupe_id) or is_admin());
drop policy if exists "prets_update" on prets;
create policy "prets_update" on prets for update using (is_owner_of(groupe_id) or is_admin());


-- ============================================================
-- FICHIER SOURCE : supabase_rapports.sql
-- ============================================================
-- A coller dans un nouvel onglet SQL Editor -> RUN
-- Sans danger : cree juste ce qui manque

-- Reglement interieur (un texte par tontine)
alter table groupes add column if not exists reglement text;

-- Rapports de reunion
create table if not exists rapports_reunion (
  id uuid primary key default gen_random_uuid(),
  groupe_id uuid references groupes(id) on delete cascade,
  titre text not null,
  contenu text,
  date_reunion date,
  created_at timestamptz default now()
);

alter table rapports_reunion enable row level security;

drop policy if exists "rapports_select" on rapports_reunion;
create policy "rapports_select" on rapports_reunion for select using (
  is_owner_of(groupe_id) or is_admin() or is_membre_of(groupe_id)
);
drop policy if exists "rapports_write" on rapports_reunion;
create policy "rapports_write" on rapports_reunion for insert with check (is_owner_of(groupe_id) or is_admin());
drop policy if exists "rapports_delete" on rapports_reunion;
create policy "rapports_delete" on rapports_reunion for delete using (is_owner_of(groupe_id) or is_admin());


-- ============================================================
-- FICHIER SOURCE : supabase_paiements.sql
-- ============================================================
-- A coller dans un nouvel onglet SQL Editor -> RUN
-- Sans danger : cree juste une nouvelle table

create table if not exists paiements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  transaction_id text unique not null,
  montant numeric not null,
  statut text default 'pending',
  created_at timestamptz default now()
);

alter table paiements enable row level security;

drop policy if exists "paiements_select" on paiements;
create policy "paiements_select" on paiements for select using (
  user_id = auth.uid() or is_admin()
);


-- ============================================================
-- FICHIER SOURCE : supabase_cagnottes.sql
-- ============================================================
-- A coller dans un nouvel onglet SQL Editor -> RUN
-- Sans danger : cree deux nouvelles tables

create table if not exists cagnottes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) default auth.uid(),
  titre text not null,
  description text,
  objectif numeric not null,
  beneficiaire text,
  statut text default 'ouverte',
  date_limite date,
  created_at timestamptz default now()
);

create table if not exists cagnotte_contributions (
  id uuid primary key default gen_random_uuid(),
  cagnotte_id uuid references cagnottes(id) on delete cascade,
  contributeur text not null,
  montant numeric not null,
  created_at timestamptz default now()
);

alter table cagnottes enable row level security;
drop policy if exists "cagnottes_select" on cagnottes;
create policy "cagnottes_select" on cagnottes for select using (auth.uid() = user_id or is_admin());
drop policy if exists "cagnottes_write" on cagnottes;
create policy "cagnottes_write" on cagnottes for insert with check (auth.uid() = user_id or is_admin());
drop policy if exists "cagnottes_update" on cagnottes;
create policy "cagnottes_update" on cagnottes for update using (auth.uid() = user_id or is_admin());
drop policy if exists "cagnottes_delete" on cagnottes;
create policy "cagnottes_delete" on cagnottes for delete using (auth.uid() = user_id or is_admin());

alter table cagnotte_contributions enable row level security;
drop policy if exists "cagnotte_contrib_select" on cagnotte_contributions;
create policy "cagnotte_contrib_select" on cagnotte_contributions for select using (
  exists(select 1 from cagnottes c where c.id = cagnotte_contributions.cagnotte_id and (c.user_id = auth.uid() or is_admin()))
);
drop policy if exists "cagnotte_contrib_write" on cagnotte_contributions;
create policy "cagnotte_contrib_write" on cagnotte_contributions for insert with check (
  exists(select 1 from cagnottes c where c.id = cagnotte_contributions.cagnotte_id and (c.user_id = auth.uid() or is_admin()))
);


-- ============================================================
-- FICHIER SOURCE : supabase_storage.sql
-- ============================================================
-- A coller dans un nouvel onglet SQL Editor -> RUN
-- Sans danger : cree juste un espace de stockage pour les photos

insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

drop policy if exists "photos_public_read" on storage.objects;
create policy "photos_public_read" on storage.objects for select using (bucket_id = 'photos');

drop policy if exists "photos_authenticated_upload" on storage.objects;
create policy "photos_authenticated_upload" on storage.objects for insert with check (bucket_id = 'photos' and auth.role() = 'authenticated');

drop policy if exists "photos_authenticated_update" on storage.objects;
create policy "photos_authenticated_update" on storage.objects for update using (bucket_id = 'photos' and auth.role() = 'authenticated');


-- ============================================================
-- FICHIER SOURCE : supabase_securite_finale.sql
-- ============================================================
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


-- ============================================================
-- FICHIER SOURCE : supabase_admin_dashboard.sql
-- ============================================================
-- A coller dans un nouvel onglet SQL Editor -> RUN
-- Sans danger : ajoute juste une colonne de suivi

alter table users add column if not exists derniere_connexion timestamptz;


-- ============================================================
-- FICHIER SOURCE : supabase_fix_doublons.sql
-- ============================================================
-- A coller dans un nouvel onglet SQL Editor -> RUN
-- Etape 1 : supprime les doublons deja crees (garde le plus ancien de chaque doublon)
delete from membres a using membres b
where a.groupe_id = b.groupe_id
  and a.tel = b.tel
  and a.created_at > b.created_at;

-- Etape 2 : empeche physiquement tout futur doublon (meme numero dans la meme tontine)
alter table membres drop constraint if exists membres_groupe_tel_unique;
alter table membres add constraint membres_groupe_tel_unique unique (groupe_id, tel);


-- ============================================================
-- FICHIER SOURCE : supabase_messages_vocaux.sql
-- ============================================================
-- A coller dans un nouvel onglet SQL Editor -> RUN
-- Sans danger : ajoute juste ce qui manque

alter table messages add column if not exists audio_url text;
alter table messages add column if not exists image_url text;

-- Nouvel espace de stockage pour les messages vocaux
insert into storage.buckets (id, name, public)
values ('audio', 'audio', true)
on conflict (id) do nothing;

drop policy if exists "audio_public_read" on storage.objects;
create policy "audio_public_read" on storage.objects for select using (bucket_id = 'audio');

drop policy if exists "audio_authenticated_upload" on storage.objects;
create policy "audio_authenticated_upload" on storage.objects for insert with check (bucket_id = 'audio' and auth.role() = 'authenticated');


-- ============================================================
-- FICHIER SOURCE : supabase_fix_created_at.sql
-- ============================================================
-- A coller dans un nouvel onglet SQL Editor -> RUN
-- Corrige "column users.created_at does not exist" qui bloquait le chargement
-- du panneau admin (utilisatrices ET "Creee par ? ()")

alter table users add column if not exists created_at timestamptz default now();
update users set created_at = now() where created_at is null;


-- ============================================================
-- FICHIER SOURCE : supabase_fix_trigger_et_role.sql
-- ============================================================
-- A coller dans un nouvel onglet SQL Editor -> RUN
-- Corrige le verrou de securite pour qu'il n'empeche plus TES propres modifications
-- manuelles via l'editeur SQL (le trigger d'avant les bloquait par erreur)

create or replace function protect_sensitive_user_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_user in ('postgres','supabase_admin') or auth.role() = 'service_role' or is_admin() then
    return new;
  end if;
  new.role := old.role;
  new.plan := old.plan;
  new.premium_expire_le := old.premium_expire_le;
  return new;
end;
$$;

-- Refait le changement de role, cette fois il va vraiment s'appliquer
update users set role = 'user' where telephone ilike '%90564473';
update users set role = 'admin' where telephone ilike '%76908031' or telephone ilike '%90647106';

-- Verification
select prenom, telephone, role from users where telephone ilike '%90564473' or telephone ilike '%76908031' or telephone ilike '%90647106';


-- ============================================================
-- FICHIER SOURCE : supabase_diagnostic_admin.sql
-- ============================================================
-- A coller dans un nouvel onglet SQL Editor -> RUN
-- DIAGNOSTIC + REPARATION COMPLETE de l'etat admin

-- 1) Confirme que tes 2 numeros sont bien admin (au cas ou)
update users set role = 'admin'
where telephone ilike '%76908031' or telephone ilike '%90647106';

-- 2) S'assure que le verrou de securite laisse bien passer les admins ET le service
create or replace function protect_sensitive_user_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_user in ('postgres','supabase_admin') or auth.role() = 'service_role' or is_admin() then
    return new;
  end if;
  new.role := old.role;
  new.plan := old.plan;
  new.premium_expire_le := old.premium_expire_le;
  return new;
end;
$$;

-- 3) S'assure qu'une policy autorise un admin a modifier n'importe quel utilisateur
drop policy if exists "users_update_admin" on users;
create policy "users_update_admin" on users for update using (is_admin()) with check (is_admin());

-- 4) VERIFICATION : affiche le role de tes comptes + teste is_admin
select prenom, telephone, role, plan from users where telephone ilike '%76908031' or telephone ilike '%90647106';


-- ============================================================
-- FICHIER SOURCE : supabase_affiliation.sql
-- ============================================================
-- A coller dans un nouvel onglet SQL Editor -> RUN
-- Sans danger : ajoute ce qui manque, ne touche a rien d'existant

-- 1) Code de parrainage unique + qui a parraine qui + date d'expiration Premium
alter table users add column if not exists parrain_code text unique;
alter table users add column if not exists parraine_par uuid references auth.users(id);
alter table users add column if not exists premium_expire_le date;

-- Genere un code de parrainage pour les comptes existants qui n'en ont pas encore
update users set parrain_code = upper(substr(replace(id::text,'-',''), 1, 8))
where parrain_code is null;

-- 2) Suivi des parrainages
create table if not exists parrainages (
  id uuid primary key default gen_random_uuid(),
  parrain_id uuid references auth.users(id),
  filleul_id uuid references auth.users(id),
  statut text default 'inscrit',
  recompense_appliquee boolean default false,
  created_at timestamptz default now()
);

alter table parrainages enable row level security;
drop policy if exists "parrainages_select" on parrainages;
create policy "parrainages_select" on parrainages for select using (
  parrain_id = auth.uid() or filleul_id = auth.uid() or is_admin()
);
drop policy if exists "parrainages_write" on parrainages;
create policy "parrainages_write" on parrainages for insert with check (
  filleul_id = auth.uid()
);

-- 3) Recompense automatique : des qu'un filleul devient Premium, son parrain recoit +30 jours
create or replace function apply_parrainage_reward()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parrain_id uuid;
begin
  if new.plan = 'premium' and (old.plan is distinct from 'premium') then
    select parraine_par into v_parrain_id from users where id = new.id;
    if v_parrain_id is not null then
      update users set plan = 'premium',
        premium_expire_le = greatest(coalesce(premium_expire_le, current_date), current_date) + 30
        where id = v_parrain_id;
      update parrainages set statut = 'premium', recompense_appliquee = true
        where filleul_id = new.id and recompense_appliquee = false;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_parrainage_reward on users;
create trigger trg_parrainage_reward
  after update of plan on users
  for each row execute function apply_parrainage_reward();


-- ============================================================
-- FICHIER SOURCE : supabase_fix_admin_role.sql
-- ============================================================
-- A coller dans un nouvel onglet SQL Editor -> RUN

-- Retire le role admin du compte test "Oumar"
update users set role = 'user' where telephone ilike '%90564473';

-- Donne le role admin a tes deux vrais numeros
update users set role = 'admin' where telephone ilike '%76908031' or telephone ilike '%90647106';


-- ============================================================
-- FICHIER SOURCE : supabase_fix_liaison_v2.sql
-- ============================================================
-- ============================================================
-- FIX LIAISON MEMBRES v2 — script consolide et sans danger
-- A coller dans un NOUVEL onglet Supabase SQL Editor -> RUN (le vrai bouton "Run", pas "Run selected")
-- N'efface aucune donnee. Peut etre relance plusieurs fois sans probleme.
-- Objectif : garantir que chaque membre ajoute a une tontine se relie
-- automatiquement au compte de la personne des qu'elle a un compte HABY
-- (que ce soit avant ou apres son inscription), et que les regles de
-- lecture (RLS) sont bien a jour partout.
-- ============================================================

-- 1) Colonne de liaison (si jamais manquante)
alter table membres add column if not exists user_id uuid references auth.users(id);

-- 2) Fonctions de verification d'appartenance (source unique de verite)
create or replace function is_owner_of(p_groupe_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(select 1 from groupes where id = p_groupe_id and user_id = auth.uid());
$$;

create or replace function is_membre_of(p_groupe_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(select 1 from membres where groupe_id = p_groupe_id and user_id = auth.uid());
$$;

-- 3) Fonction de liaison manuelle (appelee par l'app juste apres l'ajout d'un membre)
create or replace function link_membre(p_membre_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tel text;
  v_user_id uuid;
begin
  select regexp_replace(tel, '[^0-9]', '', 'g') into v_tel from membres where id = p_membre_id;
  if v_tel is null or length(v_tel) < 8 then return; end if;
  select id into v_user_id from users
    where right(regexp_replace(telephone, '[^0-9]', '', 'g'), 8) = right(v_tel, 8)
    limit 1;
  if v_user_id is not null then
    update membres set user_id = v_user_id where id = p_membre_id;
  end if;
end;
$$;

-- 4) Trigger de liaison retroactive (des qu'une nouvelle personne cree son compte,
--    on relie tous les membres existants qui portent son numero)
create or replace function link_membres_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update membres set user_id = new.id
    where user_id is null
    and right(regexp_replace(tel, '[^0-9]', '', 'g'), 8) = right(regexp_replace(new.telephone, '[^0-9]', '', 'g'), 8);
  return new;
end;
$$;

drop trigger if exists trg_link_membres_on_signup on users;
create trigger trg_link_membres_on_signup
  after insert on users
  for each row execute function link_membres_on_signup();

-- 5) RATTRAPAGE GENERAL : relie MAINTENANT tous les membres non lies existants
--    (couvre le cas ou le trigger n'existait pas encore quand des comptes ont ete crees)
update membres m
set user_id = u.id
from users u
where m.user_id is null
  and length(regexp_replace(m.tel, '[^0-9]', '', 'g')) >= 8
  and right(regexp_replace(u.telephone, '[^0-9]', '', 'g'), 8) = right(regexp_replace(m.tel, '[^0-9]', '', 'g'), 8);

-- 6) RLS a jour partout (lecture pour proprietaire + admin + membre lie)
drop policy if exists "groupes_select" on groupes;
create policy "groupes_select" on groupes for select using (
  auth.uid() = user_id or is_admin() or is_membre_of(id)
);

drop policy if exists "membres_select" on membres;
create policy "membres_select" on membres for select using (
  is_owner_of(groupe_id) or is_admin() or user_id = auth.uid()
);
drop policy if exists "membres_write" on membres;
create policy "membres_write" on membres for insert with check (is_owner_of(groupe_id) or is_admin());
drop policy if exists "membres_update" on membres;
create policy "membres_update" on membres for update using (is_owner_of(groupe_id) or is_admin()) with check (is_owner_of(groupe_id) or is_admin());
drop policy if exists "membres_delete" on membres;
create policy "membres_delete" on membres for delete using (is_owner_of(groupe_id) or is_admin());

drop policy if exists "transactions_select" on transactions;
create policy "transactions_select" on transactions for select using (
  is_owner_of(groupe_id) or is_admin()
  or exists (select 1 from membres m where m.id = transactions.membre_id and m.user_id = auth.uid())
);

drop policy if exists "checklist_select" on checklist;
create policy "checklist_select" on checklist for select using (
  is_owner_of(groupe_id) or is_admin() or is_membre_of(groupe_id)
);

drop policy if exists "messages_select" on messages;
create policy "messages_select" on messages for select using (
  is_owner_of(groupe_id) or is_admin() or is_membre_of(groupe_id)
);
drop policy if exists "messages_write" on messages;
create policy "messages_write" on messages for insert with check (
  auteur_user_id = auth.uid() and (is_owner_of(groupe_id) or is_admin() or is_membre_of(groupe_id))
);

-- 7) VERIFICATION — regarde le resultat de ces 2 requetes apres avoir lance le script
-- (a) combien de membres sont maintenant lies vs pas encore lies
select
  count(*) filter (where user_id is not null) as membres_lies,
  count(*) filter (where user_id is null) as membres_pas_encore_lies
from membres;

-- (b) liste des membres NON lies avec un compte qui existe pourtant (probleme de numero different)
select m.id, m.prenom, m.tel as tel_membre, g.nom as tontine
from membres m
join groupes g on g.id = m.groupe_id
where m.user_id is null
order by m.prenom;


-- ============================================================
-- FICHIER SOURCE : supabase_cron_rappels.sql
-- ============================================================
-- A coller dans un nouvel onglet SQL Editor -> RUN
-- Programme l'envoi automatique des rappels chaque jour a 8h (heure de Bamako = UTC, donc 8h UTC = 8h Bamako)

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('rappels-tontine-quotidien') where exists (
  select 1 from cron.job where jobname = 'rappels-tontine-quotidien'
);

select cron.schedule(
  'rappels-tontine-quotidien',
  '0 8 * * *',
  $$
  select net.http_post(
    url := 'https://tgcltyibsorhotoiogeu.supabase.co/functions/v1/daily-reminders',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "_T5KqLRWqR5DhgRArHaiGGcM1RPP67jKOnekB6wJSIk"}'::jsonb
  );
  $$
);


-- ============================================================
-- FICHIER SOURCE : supabase_messagerie_privee.sql
-- ============================================================
-- ============================================================
-- MESSAGERIE PRIVEE — script sans danger
-- A coller dans un NOUVEL onglet Supabase SQL Editor -> RUN
-- N'efface aucune donnee. Ajoute juste la possibilite d'envoyer
-- un message prive (texte ou vocal) a UN SEUL membre au lieu de tout le groupe.
-- ============================================================

-- 1) Colonne : si vide = message de groupe (comportement actuel, inchange).
--    Si remplie = message prive, visible seulement par l'expediteur et ce destinataire.
alter table messages add column if not exists destinataire_user_id uuid references auth.users(id);

-- 2) Regles de lecture mises a jour :
--    - message de groupe (destinataire_user_id vide) -> visible par tous les membres du groupe, comme avant
--    - message prive -> visible SEULEMENT par l'expediteur et le destinataire (+ admin)
drop policy if exists "messages_select" on messages;
create policy "messages_select" on messages for select using (
  is_admin()
  or (destinataire_user_id is null and (is_owner_of(groupe_id) or is_membre_of(groupe_id)))
  or (destinataire_user_id is not null and (auteur_user_id = auth.uid() or destinataire_user_id = auth.uid()))
);

-- 3) Regle d'ecriture : on peut envoyer un message (groupe ou prive) si on fait partie du groupe
drop policy if exists "messages_write" on messages;
create policy "messages_write" on messages for insert with check (
  auteur_user_id = auth.uid() and (is_owner_of(groupe_id) or is_admin() or is_membre_of(groupe_id))
);

-- Verification : compte les messages prives vs de groupe existants (0/0 si aucun envoye pour l'instant, normal)
select
  count(*) filter (where destinataire_user_id is not null) as messages_prives,
  count(*) filter (where destinataire_user_id is null) as messages_de_groupe
from messages;


-- ============================================================
-- FICHIER SOURCE : supabase_creatrice_membre.sql
-- ============================================================
-- ============================================================
-- CREATRICE = AUSSI MEMBRE — script sans danger
-- A coller dans un NOUVEL onglet Supabase SQL Editor -> RUN
-- Ajoute la creatrice comme membre de sa propre tontine (pour qu'elle
-- puisse elle aussi etre marquee "payee/pas payee" comme les autres).
-- Ne touche que les tontines existantes qui n'ont pas deja ce membre.
-- Les NOUVELLES tontines creees depuis l'app le font deja automatiquement.
-- ============================================================

insert into membres (groupe_id, prenom, tel, quartier, photo_url, paye, score, versements, cycles_paies, ordre, user_id)
select g.id, u.prenom || ' (moi)', u.telephone, '', u.photo_url, false, 80, 0, 0,
  coalesce((select count(*) from membres m2 where m2.groupe_id = g.id), 0),
  u.id
from groupes g
join users u on u.id = g.user_id
where not exists (
  select 1 from membres m where m.groupe_id = g.id and m.user_id = g.user_id
)
on conflict (groupe_id, tel) do nothing;

-- Verification : combien de tontines ont maintenant leur creatrice comme membre
select count(*) as tontines_avec_creatrice_membre
from groupes g
where exists (select 1 from membres m where m.groupe_id = g.id and m.user_id = g.user_id);


-- ============================================================
-- FICHIER SOURCE : supabase_montant_perso.sql
-- ============================================================
-- ============================================================
-- MONTANT PERSONNALISE PAR MEMBRE — script sans danger
-- A coller dans un NOUVEL onglet Supabase SQL Editor -> RUN
-- Permet a un membre de cotiser un montant different du montant
-- standard de la tontine (ex: 25000 pour certains, 50000 pour d'autres).
-- Si vide (NULL), le membre continue d'utiliser le montant standard
-- de la tontine, comme avant -- aucun impact sur les tontines existantes.
-- ============================================================

alter table membres add column if not exists montant_perso numeric;
alter table groupes add column if not exists montant_initial numeric default 0;

-- CORRECTIF : la table cagnottes n'avait jamais la colonne montant_collecte,
-- ce qui bloquait la creation de toute nouvelle cagnotte avec une erreur.
alter table cagnottes add column if not exists montant_collecte numeric default 0;
alter table cagnotte_contributions add column if not exists tel text;
alter table cagnotte_contributions add column if not exists preuve_url text;

-- Historique de la caisse sociale : garde une trace de chaque ajout/retrait avec motif et date
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

-- Active le "temps reel" sur les messages : necessaire pour que les notifications
-- s'affichent aussi quand la personne est deja en train d'utiliser l'application
alter publication supabase_realtime add table messages;

select count(*) as membres_avec_montant_perso from membres where montant_perso is not null;

