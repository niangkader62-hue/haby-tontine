-- ============================================================
-- CORRECTIF : boucle infinie dans la regle de securite "collecteur"
-- A coller dans un NOUVEL onglet Supabase SQL Editor -> RUN
-- Ce script remplace uniquement les 2 regles posees precedemment,
-- avec la bonne technique (fonction dediee au lieu d'une sous-requete
-- directe sur la meme table), pour eviter l'erreur "Versement impossible".
-- ============================================================

-- Fonction dediee (comme is_owner_of / is_membre_of) : verifie si la
-- personne connectee est collectrice designee pour cette tontine,
-- SANS provoquer de boucle infinie sur la table membres.
create or replace function is_collecteur_of(p_groupe_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(select 1 from membres where groupe_id = p_groupe_id and user_id = auth.uid() and role_collecteur = true);
$$;

drop policy if exists "membres_update" on membres;
create policy "membres_update" on membres for update using (
  is_owner_of(groupe_id) or is_admin() or is_collecteur_of(groupe_id)
) with check (
  is_owner_of(groupe_id) or is_admin() or is_collecteur_of(groupe_id)
);

drop policy if exists "transactions_write" on transactions;
create policy "transactions_write" on transactions for insert with check (
  is_owner_of(groupe_id) or is_admin() or is_collecteur_of(groupe_id)
);

-- Verification : cette requete doit reussir sans erreur
select 'ok' as test;

-- Les collecteurs peuvent aussi cocher la checklist (recu envoye, etc.)
drop policy if exists "transactions_update" on transactions;
create policy "transactions_update" on transactions for update using (
  is_owner_of(groupe_id) or is_admin() or is_collecteur_of(groupe_id)
);

select 'ok2' as test2;
