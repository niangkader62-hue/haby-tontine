-- ============================================================
-- REDUCTION DES COUTS : quota HABY + nettoyage du stockage
-- A coller dans un NOUVEL onglet Supabase SQL Editor -> RUN
-- Sans danger : ne supprime aucune donnee existante.
-- ============================================================

-- ------------------------------------------------------------
-- 1) QUOTA QUOTIDIEN DE HABY (le seul poste facture a l'usage)
-- ------------------------------------------------------------
-- L'IA (Gemini) est facturee a la question. Sans limite, une seule personne tres
-- bavarde peut faire grimper la facture. Le plan gratuit est donc plafonne, et le
-- Premium reste illimite -- ce qui donne au passage une vraie raison de s'abonner.
-- Le comptage est verifie DANS la fonction serveur haby-chat : une limite posee
-- seulement dans l'application serait contournable.
create table if not exists haby_usage (
  user_id uuid references auth.users(id) on delete cascade,
  jour date not null default (now() at time zone 'utc')::date,
  nb int not null default 0,
  primary key (user_id, jour)
);

alter table haby_usage enable row level security;

-- Chacune peut consulter sa propre consommation (pour l'afficher dans l'app).
-- L'ecriture est faite par la fonction serveur avec la cle de service, donc aucune
-- policy d'insertion n'est necessaire ici.
drop policy if exists "haby_usage_select" on haby_usage;
create policy "haby_usage_select" on haby_usage for select using (
  user_id = auth.uid() or is_admin()
);

-- Purge automatique des compteurs de plus de 30 jours (table qui reste minuscule).
create or replace function purge_haby_usage()
returns void
language sql
security definer
set search_path = public
as $$
  delete from haby_usage where jour < (now() at time zone 'utc')::date - 30;
$$;


-- ------------------------------------------------------------
-- 2) VOIR CE QUE PESE LE STOCKAGE (a consulter de temps en temps)
-- ------------------------------------------------------------
-- Le stockage des images est le poste qui grandira le plus vite. Cette requete
-- indique combien de place est utilisee, par dossier. A surveiller quand on
-- approche de 1 Go (limite de l'offre gratuite Supabase).
select
  split_part(name, '/', 1) as dossier,
  count(*) as fichiers,
  pg_size_pretty(coalesce(sum((metadata->>'size')::bigint), 0)) as taille
from storage.objects
where bucket_id in ('photos', 'audio')
group by 1
order by coalesce(sum((metadata->>'size')::bigint), 0) desc;


-- ------------------------------------------------------------
-- 3) NETTOYAGE DES VIEUX MEDIAS -- A LIRE AVANT D'UTILISER
-- ------------------------------------------------------------
-- Les requetes ci-dessous sont COMMENTEES exprès : elles suppriment definitivement
-- des fichiers. Ne les activer (retirer les --) qu'en connaissance de cause.
--
-- Les preuves de paiement ont une valeur en cas de litige : ne pas les supprimer
-- trop tot. Les recus, eux, sont regenerables a tout moment depuis l'app, donc ce
-- sont eux qu'il faut nettoyer en premier.

-- Recus de plus de 6 mois (regenerables, donc sans risque) :
-- delete from storage.objects
-- where bucket_id = 'photos' and name like 'recus/%'
--   and created_at < now() - interval '6 months';

-- Messages vocaux de plus d'un an :
-- delete from storage.objects
-- where bucket_id = 'audio' and created_at < now() - interval '1 year';

-- Preuves de versement de plus de 2 ans (a ne faire QUE si le reglement de tes
-- tontines ne demande pas de conserver les justificatifs plus longtemps) :
-- delete from storage.objects
-- where bucket_id = 'photos' and name like 'versements/%'
--   and created_at < now() - interval '2 years';


select 'quota HABY en place -- regarde le tableau du stockage ci-dessus' as resultat;
