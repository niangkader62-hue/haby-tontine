-- A coller dans un nouvel onglet SQL Editor -> RUN
-- Sans danger : ajoute juste une regle de securite supplementaire

-- Autoriser un admin a modifier le role d'une autre utilisatrice (pour nommer des co-admins)
drop policy if exists "users_update_admin" on users;
create policy "users_update_admin" on users for update using (is_admin()) with check (is_admin());
