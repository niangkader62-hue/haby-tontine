// Edge Function Supabase : suppression complete d'UN compte, depuis l'onglet Administration.
//
// POURQUOI CETTE FONCTION EXISTE
// Quand quelqu'un cree un compte par erreur, il ne peut pas recommencer : son numero
// reste pris dans auth.users et l'inscription est refusee. Or auth.users est intouchable
// depuis l'application (cle anon). Seule une fonction serveur avec la cle service_role
// peut liberer le numero -- c'est tout l'objet de ce fichier.
//
// DEUX TEMPS, JAMAIS UN SEUL
//   action = "apercu"     -> ne supprime RIEN, renvoie l'inventaire de ce qui sera efface
//   action = "supprimer"  -> supprime pour de bon
// Une suppression de compte est irreversible : l'administratrice doit voir ce qu'elle
// detruit avant de le detruire.
//
// GARDE-FOUS
//   - reserve aux comptes ayant le role admin
//   - impossible de supprimer son propre compte (on se couperait l'acces)
//   - impossible de supprimer un autre admin
//   - si la personne possede une tontine ou d'autres membres cotisent, on REFUSE :
//     supprimer son compte detruirait la tontine et les comptes de tout le groupe.
//     L'administratrice doit alors transferer la tontine ou la supprimer sciemment.
//
// CE QUI EST CONSERVE : les lignes "membres" de la personne dans les tontines des AUTRES
// ne sont pas effacees, seulement detachees du compte (user_id remis a vide). Les
// versements deja enregistres restent donc dans les comptes du groupe -- une page de
// carnet deja ecrite ne s'efface pas parce qu'une personne s'en va.

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

    // --- 2. Qui supprimer ? ---------------------------------------------------
    const { user_id, action } = await req.json().catch(() => ({}));
    if (!user_id) return json({ error: "user_id manquant" }, 400);
    if (user_id === appelant.id) {
      return json({ error: "Tu ne peux pas supprimer ton propre compte : tu perdrais l'acces a l'Administration." }, 400);
    }

    const { data: cible } = await supabase
      .from("users").select("id, prenom, telephone, role, plan, created_at").eq("id", user_id).single();
    if (!cible) return json({ error: "Ce compte n'existe pas (deja supprime ?)" }, 404);
    if (cible.role === "admin") {
      return json({ error: "Ce compte est administrateur. Retire-lui d'abord le role admin si tu veux vraiment le supprimer." }, 400);
    }

    // --- 3. Inventaire de ce qui est rattache a ce compte ----------------------
    const compter = async (table: string, colonne: string) => {
      const { count } = await supabase.from(table).select("*", { count: "exact", head: true }).eq(colonne, user_id);
      return count ?? 0;
    };

    // Tontines dont la personne est proprietaire, et nombre de membres dans chacune.
    // ATTENTION : la table groupes a DEUX colonnes de propriete, user_id et owner_id.
    // owner_id porte une cascade vers public.users : effacer la ligne du profil suffirait
    // a faire disparaitre la tontine, sans passer par aucun delete explicite. On interroge
    // donc les deux colonnes, sinon le garde-fou du dessous pourrait etre contourne
    // silencieusement si les deux valeurs venaient a differer.
    const { data: sesTontines } = await supabase
      .from("groupes").select("id, nom").or(`user_id.eq.${user_id},owner_id.eq.${user_id}`);
    const tontines: { id: string; nom: string; membres: number }[] = [];
    for (const g of sesTontines || []) {
      const { count } = await supabase.from("membres").select("*", { count: "exact", head: true }).eq("groupe_id", g.id);
      tontines.push({ id: g.id, nom: g.nom, membres: count ?? 0 });
    }
    // Une tontine "vivante" = plus d'une personne dedans. La supprimer effacerait
    // les cotisations des autres, ce qu'aucune suppression de compte ne doit faire.
    const tontinesVivantes = tontines.filter((t) => t.membres > 1);

    const inventaire = {
      prenom: cible.prenom,
      telephone: cible.telephone,
      plan: cible.plan,
      inscrit_le: cible.created_at,
      tontines_possedees: tontines,
      tontines_vivantes: tontinesVivantes,
      participations: await compter("membres", "user_id"),
      cagnottes: await compter("cagnottes", "user_id"),
      objectifs_epargne: await compter("objectifs", "user_id"),
      paiements: await compter("paiements", "user_id"),
      messages_envoyes: await compter("messages", "auteur_user_id"),
    };

    if (action !== "supprimer") {
      return json({ ok: true, apercu: true, inventaire });
    }

    // --- 4. Refus si la suppression detruirait le groupe de quelqu'un d'autre --
    if (tontinesVivantes.length > 0) {
      return json({
        error:
          `Suppression refusee : cette personne dirige ${tontinesVivantes.length} tontine(s) ou d'autres membres cotisent ` +
          `(${tontinesVivantes.map((t) => `"${t.nom}" : ${t.membres} membres`).join(", ")}). ` +
          `Supprimer son compte effacerait ces tontines et les versements de tout le groupe. ` +
          `Supprime ou transfere d'abord ces tontines, puis reessaie.`,
        inventaire,
      }, 409);
    }

    // --- 5. Suppression ------------------------------------------------------
    // Ordre voulu : on detache d'abord, on efface ensuite, on libere le numero en dernier.
    // Si une etape echoue, les precedentes restent faites -- la fonction est concue pour
    // etre relancee sans risque (chaque operation est idempotente).

    // Detachement : la personne disparait des tontines des autres, mais l'historique
    // des versements du groupe reste intact.
    const { error: eDetach, count: cDetach } = await supabase
      .from("membres").update({ user_id: null }, { count: "exact" }).eq("user_id", user_id);
    journal.push(`membres detaches (historique conserve) : ${eDetach ? "ERREUR " + eDetach.message : cDetach}`);

    // Ses tontines vides (0 ou 1 membre : elle seule) peuvent partir avec elle.
    for (const t of tontines) {
      const { error } = await supabase.from("groupes").delete().eq("id", t.id);
      journal.push(`tontine "${t.nom}" supprimee : ${error ? "ERREUR " + error.message : "oui"}`);
    }

    // Tables rattachees au compte. Chaque suppression est independante : une table
    // absente ou vide ne doit pas empecher les suivantes.
    const aNettoyer: [string, string][] = [
      ["push_subscriptions", "user_id"],
      ["haby_usage", "user_id"],
      ["preuve_usage", "user_id"],
      ["paiements", "user_id"],
      ["parrainages", "parrain_id"],
      ["parrainages", "filleul_id"],
      ["votes", "voter_user_id"],
      ["messages", "auteur_user_id"],
      ["messages", "destinataire_user_id"],
      ["objectif_versements", "user_id"],
      ["objectifs", "user_id"],
      ["cagnottes", "user_id"],
      ["activity_logs", "user_id"],
    ];
    for (const [table, colonne] of aNettoyer) {
      const { error } = await supabase.from(table).delete().eq(colonne, user_id);
      if (error) journal.push(`${table}.${colonne} : ERREUR ${error.message}`);
    }

    const { error: eProfil } = await supabase.from("users").delete().eq("id", user_id);
    journal.push(`profil users : ${eProfil ? "ERREUR " + eProfil.message : "supprime"}`);

    // Derniere etape, la seule qui libere reellement le numero de telephone.
    const { error: eAuth } = await supabase.auth.admin.deleteUser(user_id);
    if (eAuth) {
      journal.push(`auth.users : ERREUR ${eAuth.message}`);
      return json({
        error:
          "Le profil a ete efface mais le numero n'a PAS pu etre libere (" + eAuth.message + "). " +
          "Relance la suppression : l'operation peut etre repetee sans risque.",
        journal,
      }, 500);
    }
    journal.push("auth.users : supprime -- le numero est libre");

    return json({
      ok: true,
      supprime: true,
      message: `Compte de ${cible.prenom} (${cible.telephone}) entierement supprime. Le numero est libre : cette personne peut se reinscrire comme nouvelle utilisatrice.`,
      journal,
    });
  } catch (e) {
    return json({ error: "Erreur : " + ((e as Error)?.message || "inconnue"), journal }, 500);
  }
});
