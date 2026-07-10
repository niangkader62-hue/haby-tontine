-- A coller dans un nouvel onglet SQL Editor -> RUN
-- Etape 1 : supprime les doublons deja crees (garde le plus ancien de chaque doublon)
delete from membres a using membres b
where a.groupe_id = b.groupe_id
  and a.tel = b.tel
  and a.created_at > b.created_at;

-- Etape 2 : empeche physiquement tout futur doublon (meme numero dans la meme tontine)
alter table membres drop constraint if exists membres_groupe_tel_unique;
alter table membres add constraint membres_groupe_tel_unique unique (groupe_id, tel);
