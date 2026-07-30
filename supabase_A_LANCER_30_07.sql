-- ============================================================
-- SCRIPT UNIQUE A LANCER (30/07/2026)
-- A coller EN ENTIER dans un NOUVEL onglet Supabase -> SQL Editor -> RUN
-- Sans danger : n'efface aucune donnee, peut etre relance sans probleme.
-- ============================================================
-- Il regroupe les 2 scripts en attente :
--   1) le quota quotidien de HABY (protege la facture de l'IA)
--   2) l'anti-reutilisation des preuves de paiement
-- ============================================================


-- ============================================================
-- 1) QUOTA QUOTIDIEN DE HABY
-- ============================================================
-- L'IA (Gemini) est le SEUL service facture a l'usage de toute l'application.
-- Sans limite, une seule personne tres bavarde peut faire grimper la facture.
-- Le plan gratuit est donc plafonne (10 questions/jour) et le Premium reste
-- illimite -- ce qui donne au passage une vraie raison de s'abonner.
-- Le comptage est verifie DANS la fonction serveur haby-chat : une limite posee
-- seulement dans l'application serait contournable.
create table if not exists haby_usage (
  user_id uuid references auth.users(id) on delete cascade,
  jour date not null default (now() at time zone 'utc')::date,
  nb int not null default 0,
  primary key (user_id, jour)
);

alter table haby_usage enable row level security;

-- Chacune peut consulter sa propre consommation (affichee dans l'app).
-- L'ecriture est faite par la fonction serveur avec la cle de service.
drop policy if exists "haby_usage_select" on haby_usage;
create policy "haby_usage_select" on haby_usage for select using (
  user_id = auth.uid() or is_admin()
);

-- Purge des compteurs de plus de 30 jours (la table reste minuscule).
create or replace function purge_haby_usage()
returns void
language sql
security definer
set search_path = public
as $$
  delete from haby_usage where jour < (now() at time zone 'utc')::date - 30;
$$;


-- ============================================================
-- 2) ANTI-REUTILISATION DES PREUVES DE PAIEMENT
-- ============================================================
-- N'importe quelle image etait acceptee comme preuve. La fraude la plus simple
-- consiste a renvoyer LA MEME capture Orange Money / Wave a chaque cycle.
-- L'application calcule une empreinte (SHA-256) du fichier envoye et la stocke ici :
-- si la meme image a deja servi dans la meme tontine, elle est refusee.
--
-- A SAVOIR : cela n'empeche PAS de photographier de l'argent qui n'est pas le sien,
-- ni de fabriquer une fausse capture. Aucun controle technique ne peut prouver qu'un
-- paiement a eu lieu. Seule la confirmation humaine de la creatrice fait foi -- la
-- photo reste une TRACE en cas de litige. Ceci bloque la triche facile, rien de plus.
alter table transactions add column if not exists photo_hash text;
alter table declarations_paiement add column if not exists photo_hash text;

-- Index pour que la verification reste instantanee, meme avec des milliers de versements
create index if not exists transactions_photo_hash_idx
  on transactions (groupe_id, photo_hash) where photo_hash is not null;

create index if not exists declarations_photo_hash_idx
  on declarations_paiement (groupe_id, photo_hash) where photo_hash is not null;


-- ============================================================
-- VERIFICATIONS (regarde les resultats affiches)
-- ============================================================

-- (a) Les 2 colonnes photo_hash doivent apparaitre
select table_name, column_name
from information_schema.columns
where column_name = 'photo_hash'
order by table_name;

-- (b) Poids actuel du stockage, par dossier -- a surveiller quand on approche de 1 Go
select
  split_part(name, '/', 1) as dossier,
  count(*) as fichiers,
  pg_size_pretty(coalesce(sum((metadata->>'size')::bigint), 0)) as taille
from storage.objects
where bucket_id in ('photos', 'audio')
group by 1
order by coalesce(sum((metadata->>'size')::bigint), 0) desc;

select 'tout est en place : quota HABY + anti-reutilisation des preuves' as resultat;
