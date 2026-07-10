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
