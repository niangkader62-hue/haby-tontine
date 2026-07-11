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
