-- ============================================================
-- ANTI-REUTILISATION DES PREUVES DE PAIEMENT
-- A coller dans un NOUVEL onglet Supabase SQL Editor -> RUN
-- Sans danger : ajoute deux colonnes, n'efface aucune donnee.
-- ============================================================
-- PROBLEME : n'importe quelle image etait acceptee comme preuve de paiement.
-- La fraude la plus simple et la plus courante consiste a renvoyer LA MEME capture
-- Orange Money / Wave a chaque cycle.
--
-- SOLUTION : l'application calcule une empreinte (SHA-256) du fichier envoye et la
-- stocke ici. Si la meme image a deja servi dans la meme tontine, elle est refusee.
--
-- A SAVOIR, EN TOUTE FRANCHISE : cela n'empeche PAS de photographier de l'argent qui
-- n'est pas le sien, ni de fabriquer une fausse capture. Aucun controle technique ne
-- peut prouver qu'un paiement a reellement eu lieu. Seule la confirmation humaine de
-- la creatrice fait foi -- la photo reste une TRACE en cas de litige, pas une preuve
-- automatique. Ce controle bloque la triche facile, c'est tout.
-- ============================================================

alter table transactions add column if not exists photo_hash text;
alter table declarations_paiement add column if not exists photo_hash text;

-- Index pour que la verification reste instantanee meme avec des milliers de versements
create index if not exists transactions_photo_hash_idx
  on transactions (groupe_id, photo_hash) where photo_hash is not null;

create index if not exists declarations_photo_hash_idx
  on declarations_paiement (groupe_id, photo_hash) where photo_hash is not null;

-- Verification : les deux colonnes doivent apparaitre
select table_name, column_name
from information_schema.columns
where column_name = 'photo_hash'
order by table_name;

select 'anti-reutilisation des preuves en place' as resultat;
