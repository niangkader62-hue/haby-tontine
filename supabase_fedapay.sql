-- =============================================================================
-- FEDAPAY : tables de suivi des paiements par QR (cotisation + depot personnel)
-- A lancer UNE fois dans Supabase (SQL Editor) avant de deployer les fonctions.
-- =============================================================================

-- 1) Journal de TOUTES les transactions FedaPay (source de verite cote app).
--    On y garde le lien avec FedaPay (fedapay_id), le type, et un drapeau
--    d'idempotence "applique" pour ne JAMAIS crediter/marquer payer deux fois
--    si FedaPay renvoie plusieurs fois le meme webhook.
create table if not exists public.fedapay_transactions (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  fedapay_id    text unique,                 -- id de la transaction chez FedaPay
  type_transaction text not null,            -- 'cotisation' | 'depot_personnel'
  id_tontine    uuid,                         -- rempli si cotisation
  id_utilisateur uuid,                        -- le payeur, si connu
  telephone     text,
  reseau        text,                         -- orange | mtn | moov | wave | card...
  pays          text,                         -- 'BJ','SN','CI','ML','TG','NE','BF','GN'...
  montant       integer not null,             -- en XOF (entier, pas de centimes)
  devise        text not null default 'XOF',
  statut        text not null default 'pending', -- pending|approved|declined|canceled
  applique      boolean not null default false,  -- deja traite par le webhook ?
  raw           jsonb                          -- payload brut pour audit
);
alter table public.fedapay_transactions enable row level security;
-- Aucune policy : seul le service_role (les Edge Functions) lit/ecrit cette table.

-- 2) Depots personnels approuves (le "solde admin" = somme de ces depots).
create table if not exists public.depots_personnels (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  id_utilisateur uuid,
  telephone     text,
  montant       integer not null,
  fedapay_id    text,
  devise        text not null default 'XOF'
);
alter table public.depots_personnels enable row level security;

-- 3) RPC public (SECURITY DEFINER) : a partir d'un NUMERO de telephone, renvoie les
--    tontines ou cette personne est membre + le montant a payer. Sert a remplir le menu
--    deroulant de la page /paiement SANS exposer toutes les tontines (respect de la vie
--    privee : on ne liste que celles qui concernent le payeur).
create or replace function public.tontines_du_payeur(p_tel text)
returns table(id uuid, nom text, montant integer, membre_id uuid, id_createur uuid)
language sql
security definer
set search_path = public
as $$
  select g.id, g.nom, coalesce(m.montant_perso, g.montant)::integer as montant,
         m.id as membre_id, g.user_id as id_createur
  from membres m
  join groupes g on g.id = m.groupe_id
  where right(regexp_replace(m.tel, '[^0-9]', '', 'g'), 8)
      = right(regexp_replace(p_tel, '[^0-9]', '', 'g'), 8);
$$;
grant execute on function public.tontines_du_payeur(text) to anon, authenticated;
