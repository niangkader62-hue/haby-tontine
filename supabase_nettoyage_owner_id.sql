-- ============================================================
-- NETTOYAGE : policies redondantes basees sur owner_id
-- ============================================================
-- Les tables groupes et membres avaient chacune une policy "ALL" basee sur
-- une colonne owner_id, en plus des policies normales basees sur user_id /
-- is_owner_of(). owner_id n'etait utilisee nulle part ailleurs (aucune
-- fonction RLS, aucun code de l'app ne la lit), toujours identique a
-- user_id, et aucune fonctionnalite de transfert de propriete n'existe.
-- Simple redondance qui aurait pu devenir une faille si les 2 colonnes
-- se desynchronisaient un jour (ex: futur transfert de propriete qui ne
-- mettrait a jour qu'une seule des deux colonnes).
-- La colonne owner_id elle-meme n'est PAS supprimee (juste plus utilisee
-- par aucune policy), au cas ou elle serve un jour a une vraie fonctionnalite.
-- ============================================================

drop policy if exists "groupes_owner_all" on groupes;
drop policy if exists "membres_owner_all" on membres;
