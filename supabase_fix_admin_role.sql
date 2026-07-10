-- A coller dans un nouvel onglet SQL Editor -> RUN

-- Retire le role admin du compte test "Oumar"
update users set role = 'user' where telephone ilike '%90564473';

-- Donne le role admin a tes deux vrais numeros
update users set role = 'admin' where telephone ilike '%76908031' or telephone ilike '%90647106';
