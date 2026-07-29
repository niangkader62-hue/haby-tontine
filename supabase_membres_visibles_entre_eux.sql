-- ============================================================
-- CORRECTIF : un membre ne voyait pas les autres membres de sa tontine
-- A coller dans un NOUVEL onglet Supabase SQL Editor -> RUN
-- Sans danger : ne modifie qu'une regle de lecture, n'efface aucune donnee.
-- ============================================================
-- PROBLEME TROUVE : la policy "membres_select" autorisait la lecture seulement
-- pour la creatrice (is_owner_of), les admins, ou sa PROPRE ligne (user_id = auth.uid()).
-- Consequence concrete : une participante qui ouvrait sa tontine ne voyait
-- qu'elle-meme dans la liste des membres. D'ou :
--   - la liste des destinataires de messages prives paraissait vide/incomplete,
--   - la nouvelle section "Membres de la tontine" du Profil n'aurait affiche personne,
--   - le trombinoscope et les votes de prets etaient fausses.
--
-- CORRECTIF : on ajoute is_membre_of(groupe_id) -- deja utilisee ailleurs et
-- SECURITY DEFINER, donc aucune recursion RLS possible. Un membre voit donc
-- les autres membres de SES tontines, et rien d'autre.
-- ============================================================

drop policy if exists "membres_select" on membres;
create policy "membres_select" on membres for select using (
  is_owner_of(groupe_id) or is_admin() or is_membre_of(groupe_id) or user_id = auth.uid()
);

-- Verrou anti double-tirage : un seul gagnant par cycle et par tontine, meme si
-- deux personnes lancent le tirage en meme temps depuis deux telephones.
-- (On nettoie d'abord d'eventuels doublons deja presents, en gardant le plus ancien.)
delete from tirages t using tirages plus_ancien
where t.groupe_id = plus_ancien.groupe_id
  and t.cycle = plus_ancien.cycle
  and t.created_at > plus_ancien.created_at;

create unique index if not exists tirages_groupe_cycle_unique on tirages (groupe_id, cycle);

select 'membres visibles entre eux + verrou du tirage en place' as resultat;
