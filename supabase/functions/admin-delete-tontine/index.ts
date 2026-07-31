// Edge Function Supabase : suppression complete d'UNE tontine (groupe), depuis l'onglet
// Administration, SANS toucher au compte de la creatrice.
//
// POURQUOI CETTE FONCTION EXISTE
// La suppression d'un compte propose "garder les tontines" (defaut) ou "tout supprimer",
// mais "tout supprimer" est refuse des qu'une tontine a plus d'un membre -- un garde-fou
// pour ne jamais effacer l'argent d'un vrai groupe. Consequence : une tontine de TEST
// remplie de faux membres ne pouvait plus etre supprimee sans remettre TOUTE la base a
// zero. Cette fonction comble ce trou : elle efface une tontine precise et tout ce qui
// y est rattache, en laissant les comptes des personnes intacts.
//
// DEUX TEMPS, JAMAIS UN SEUL
//   action = "apercu"     -> ne supprime RIEN, renvoie l'inventaire de ce qui sera efface
//   action = "supprimer"  -> supprime pour de bon
//
// CE QUI EST EFFACE
//   - la ligne "groupes" : toutes ses tables enfants (membres, transactions, prets,
//     votes, elections, messages, declarations de paiement, tirages, checklist, caisse
//     sociale, rapports de reunion) partent en cascade grace aux cles etrangeres ;
//   - la table "rappels", qui porte un groupe_id SANS cle etrangere, est effacee a la main ;
//   - les photos du groupe dans le bucket "photos" (declarations/, recus/, prets/,
//     versements/) et les audios dans le bucket "audio" (messages/).
//
// CE QUI N'EST PAS TOUCHE : les comptes (auth.users, public.users). Personne n'est
// supprime ; seule la tontine disparait. Les lignes "membres" appartiennent au groupe,
// elles s'en vont avec lui -- mais la personne, elle, garde son compte et ses autres tontines.
//
// GARDE-FOUS
//   - reserve aux comptes ayant le role admin ;
//   - action destructrice explicite (action = "supprimer") apres un apercu.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const journal: string[] = [];
  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!serviceKey) return json({ error: "SUPABASE_SERVICE_ROLE_KEY manquante dans les secrets de la fonction" }, 500);

    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey);

    // --- 1. Qui appelle ? -----------------------------------------------------
    const jeton = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!jeton) return json({ error: "Non authentifie" }, 401);

    const { data: { user: appelant }, error: errAuth } = await supabase.auth.getUser(jeton);
    if (errAuth || !appelant) return json({ error: "Session invalide" }, 401);

    const { data: profilAppelant } = await supabase.from("users").select("role").eq("id", appelant.id).single();
    if (profilAppelant?.role !== "admin") return json({ error: "Reserve aux administratrices" }, 403);

    // --- 2. Quelle tontine ? --------------------------------------------------
    const { groupe_id, action } = await req.json().catch(() => ({}));
    if (!groupe_id) return json({ error: "groupe_id manquant" }, 400);

    const { data: groupe } = await supabase
      .from("groupes").select("id, nom").eq("id", groupe_id).single();
    if (!groupe) return json({ error: "Cette tontine n'existe pas (deja supprimee ?)" }, 404);

    // --- 3. Inventaire de ce qui est rattache a la tontine --------------------
    const compter = async (table: string) => {
      const { count } = await supabase.from(table).select("*", { count: "exact", head: true }).eq("groupe_id", groupe_id);
      return count ?? 0;
    };
    const inventaire = {
      nom: groupe.nom,
      membres: await compter("membres"),
      transactions: await compter("transactions"),
      prets: await compter("prets"),
      messages: await compter("messages"),
    };

    if (action !== "supprimer") {
      return json({ ok: true, apercu: true, inventaire });
    }

    // --- 4. Photos et audios du groupe (le stockage n'a pas de cascade) --------
    // Tolerant : un dossier vide ou une erreur de stockage ne doit pas empecher la
    // suppression en base, qui est l'essentiel.
    const purgerDossier = async (bucket: string, dossier: string) => {
      try {
        const { data: fichiers, error } = await supabase.storage.from(bucket).list(dossier, { limit: 1000 });
        if (error || !fichiers?.length) return;
        const chemins = fichiers.filter((f) => f?.name).map((f) => `${dossier}/${f.name}`);
        if (chemins.length) {
          const { error: eDel } = await supabase.storage.from(bucket).remove(chemins);
          journal.push(`stockage ${bucket}/${dossier} : ${eDel ? "ERREUR " + eDel.message : chemins.length + " fichier(s) supprime(s)"}`);
        }
      } catch (e) {
        journal.push(`stockage ${bucket}/${dossier} : ERREUR ${(e as Error)?.message || "inconnue"}`);
      }
    };
    for (const prefixe of ["declarations", "recus", "prets", "versements"]) {
      await purgerDossier("photos", `${prefixe}/${groupe_id}`);
    }
    await purgerDossier("audio", `messages/${groupe_id}`);

    // --- 5. Table sans cascade : rappels --------------------------------------
    const { error: eRappels } = await supabase.from("rappels").delete().eq("groupe_id", groupe_id);
    if (eRappels) journal.push(`rappels : ERREUR ${eRappels.message}`);

    // --- 6. La tontine elle-meme : la cascade emporte toutes les tables enfants -
    const { error: eGroupe } = await supabase.from("groupes").delete().eq("id", groupe_id);
    if (eGroupe) {
      journal.push(`groupes : ERREUR ${eGroupe.message}`);
      return json({
        error: "La tontine n'a pas pu etre supprimee : " + eGroupe.message + ". Rien d'irreversible n'a ete perdu cote comptes.",
        journal,
      }, 500);
    }
    journal.push(`tontine "${groupe.nom}" supprimee (membres, cotisations, prets et messages compris)`);

    return json({
      ok: true,
      supprime: true,
      message: `Tontine "${groupe.nom}" entierement supprimee. Les comptes des membres n'ont pas ete touches.`,
      journal,
    });
  } catch (e) {
    return json({ error: "Erreur : " + ((e as Error)?.message || "inconnue"), journal }, 500);
  }
});
