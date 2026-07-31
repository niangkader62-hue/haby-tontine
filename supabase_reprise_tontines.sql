-- ============================================================
-- SUPPRIMER UN COMPTE SANS PERDRE SES TONTINES
-- A coller dans un NOUVEL onglet Supabase -> SQL Editor -> RUN
-- Sans danger : ajoute une colonne, assouplit une contrainte, n'efface aucune donnee.
-- ============================================================
-- LE PROBLEME
-- La suppression d'un compte etait refusee des que la personne dirigeait une tontine.
-- C'etait volontaire -- son compte est lie a la tontine, et l'effacer emportait les
-- versements de tout le groupe -- mais cela rendait la suppression inutilisable dans le
-- cas le plus courant : quelqu'un s'inscrit, cree une tontine, se trompe de numero, et
-- veut recommencer.
--
-- LA SOLUTION
-- On separe les deux choses. Le compte part, la tontine reste, et le numero de telephone
-- de la proprietaire est inscrit sur la tontine. A la reinscription avec le MEME numero,
-- la personne retrouve automatiquement ses tontines.
--
-- Le mecanisme existe deja pour les membres : depuis toujours, quand quelqu'un s'inscrit,
-- un declencheur rattache par numero de telephone les lignes de membre qui l'attendaient.
-- On etend simplement ce declencheur aux tontines.
-- ============================================================


-- ------------------------------------------------------------
-- 1) OU RETENIR A QUI LA TONTINE APPARTIENT
-- ------------------------------------------------------------
-- Rempli uniquement quand un compte est supprime en conservant ses tontines.
-- Remis a vide des que la personne reprend possession de sa tontine.
alter table groupes add column if not exists proprietaire_tel text;

create index if not exists groupes_proprietaire_tel_idx
  on groupes (proprietaire_tel) where proprietaire_tel is not null;


-- ------------------------------------------------------------
-- 2) NEUTRALISER UNE CASCADE QUI EFFACAIT LA TONTINE EN SILENCE
-- ------------------------------------------------------------
-- La table groupes porte DEUX colonnes de propriete : user_id (celle qu'utilise
-- l'application) et owner_id (une ancienne colonne, plus utilisee nulle part).
-- owner_id est reliee au profil avec la mention "on delete cascade" : effacer la ligne
-- du profil suffisait a faire disparaitre la tontine, sans aucun ordre de suppression.
-- Pour pouvoir garder une tontine sans proprietaire, il faut donc pouvoir vider owner_id.
alter table groupes alter column owner_id drop not null;


-- ------------------------------------------------------------
-- 3) RENDRE SES TONTINES A LA REINSCRIPTION
-- ------------------------------------------------------------
-- Le declencheur existant rattachait deja les lignes de membre par numero de telephone.
-- On lui ajoute la reprise des tontines mises en attente. La comparaison se fait sur les
-- 8 derniers chiffres, exactement comme pour les membres : cela absorbe les differences
-- d'indicatif (+223, 00223, rien) et les espaces.
create or replace function link_membres_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- (inchange) rattachement des lignes de membre qui portaient ce numero
  update membres set user_id = new.id
    where user_id is null
    and right(regexp_replace(tel, '[^0-9]', '', 'g'), 8) = right(regexp_replace(new.telephone, '[^0-9]', '', 'g'), 8);

  -- (nouveau) reprise des tontines laissees en attente par une suppression de compte
  update groupes
     set user_id = new.id,
         owner_id = new.id,
         proprietaire_tel = null
   where proprietaire_tel is not null
     and user_id is null
     and right(regexp_replace(proprietaire_tel, '[^0-9]', '', 'g'), 8) = right(regexp_replace(new.telephone, '[^0-9]', '', 'g'), 8);

  return new;
end;
$$;

-- Le declencheur lui-meme ne change pas, mais on le recree pour etre certain qu'il
-- pointe bien sur la nouvelle version de la fonction.
drop trigger if exists trg_link_membres_on_signup on users;
create trigger trg_link_membres_on_signup
  after insert on users
  for each row execute function link_membres_on_signup();


-- ============================================================
-- VERIFICATIONS (regarde les resultats affiches)
-- ============================================================

-- (a) La colonne doit exister et owner_id doit accepter le vide
select column_name, is_nullable
from information_schema.columns
where table_name = 'groupes' and column_name in ('proprietaire_tel', 'owner_id', 'user_id')
order by column_name;

-- (b) Le declencheur doit etre en place
select tgname as declencheur, tgenabled as actif
from pg_trigger where tgname = 'trg_link_membres_on_signup';

-- (c) Tontines actuellement en attente de reprise (vide au depart, c'est normal)
select id, nom, proprietaire_tel, created_at
from groupes where proprietaire_tel is not null
order by created_at;

select 'reprise des tontines en place -- un compte peut etre supprime sans perdre ses tontines' as resultat;
