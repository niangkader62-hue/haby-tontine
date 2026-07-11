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
