// Edge Function Supabase : remise a zero complete des donnees de test
// PROTEGEE : verifie que l'appelant est bien authentifie ET a le role admin
// avant de faire quoi que ce soit. Utilise la cle service_role pour pouvoir
// nettoyer aussi auth.users (impossible depuis le client normal).
//
// Version "diagnostic" : capture et renvoie le detail de chaque etape,
// pour savoir precisement laquelle echoue si la suppression ne marche pas.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const journal = [];
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    if (!jwt) return new Response(JSON.stringify({ error: "Non authentifie" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    journal.push(`cle service_role presente : ${serviceKey ? "oui (" + serviceKey.length + " caracteres)" : "NON - MANQUANTE"}`);
    if (!serviceKey) {
      return new Response(JSON.stringify({ error: "SUPABASE_SERVICE_ROLE_KEY manquante dans les secrets de la fonction", journal }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey);

    const { data: { user: caller }, error: authErr } = await supabase.auth.getUser(jwt);
    if (authErr || !caller) return new Response(JSON.stringify({ error: "Session invalide : " + (authErr?.message || ""), journal }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    journal.push(`appelant identifie : ${caller.id}`);

    const { data: profil, error: profilErr } = await supabase.from("users").select("role, telephone").eq("id", caller.id).single();
    if (profilErr) journal.push(`erreur lecture profil : ${profilErr.message}`);
    if (!profil || profil.role !== "admin") {
      return new Response(JSON.stringify({ error: "Reserve aux administrateurs (role actuel : " + (profil?.role || "inconnu") + ")", journal }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    journal.push(`role admin confirme pour ${profil.telephone}`);

    const numerosProteges = ["76908031", "90647106"];
    const estProtege = (tel) => numerosProteges.some((n) => (tel || "").includes(n));

    const { count: avantGroupes } = await supabase.from("groupes").select("*", { count: "exact", head: true });
    journal.push(`groupes avant suppression : ${avantGroupes}`);

    const { error: e1, count: c1 } = await supabase.from("groupes").delete({ count: "exact" }).neq("id", "00000000-0000-0000-0000-000000000000");
    journal.push(`suppression groupes : ${e1 ? "ERREUR - " + e1.message : c1 + " ligne(s) supprimee(s)"}`);

    const { error: e2, count: c2 } = await supabase.from("cagnottes").delete({ count: "exact" }).neq("id", "00000000-0000-0000-0000-000000000000");
    journal.push(`suppression cagnottes : ${e2 ? "ERREUR - " + e2.message : c2 + " ligne(s) supprimee(s)"}`);

    const { error: e3, count: c3 } = await supabase.from("objectifs").delete({ count: "exact" }).neq("id", "00000000-0000-0000-0000-000000000000");
    journal.push(`suppression objectifs : ${e3 ? "ERREUR - " + e3.message : c3 + " ligne(s) supprimee(s)"}`);

    const { data: tousLesUsers, error: eUsers } = await supabase.from("users").select("id, telephone");
    if (eUsers) journal.push(`erreur lecture users : ${eUsers.message}`);
    const aSupprimer = (tousLesUsers || []).filter((u) => !estProtege(u.telephone)).map((u) => u.id);
    journal.push(`comptes de test identifies : ${aSupprimer.length} sur ${(tousLesUsers || []).length} au total`);

    let comptesSupprimesReel = 0;
    if (aSupprimer.length > 0) {
      await supabase.from("push_subscriptions").delete().in("user_id", aSupprimer);
      await supabase.from("paiements").delete().in("user_id", aSupprimer);
      await supabase.from("parrainages").delete().in("parrain_id", aSupprimer);
      await supabase.from("parrainages").delete().in("filleul_id", aSupprimer);
      const { error: eDelUsers, count: cDelUsers } = await supabase.from("users").delete({ count: "exact" }).in("id", aSupprimer);
      journal.push(`suppression table users : ${eDelUsers ? "ERREUR - " + eDelUsers.message : cDelUsers + " ligne(s) supprimee(s)"}`);
      for (const id of aSupprimer) {
        const { error: eAuth } = await supabase.auth.admin.deleteUser(id);
        if (eAuth) journal.push(`erreur suppression auth.users pour ${id} : ${eAuth.message}`);
        else comptesSupprimesReel++;
      }
    }
    journal.push(`comptes auth.users effectivement supprimes : ${comptesSupprimesReel}`);

    const { count: apresGroupes } = await supabase.from("groupes").select("*", { count: "exact", head: true });
    journal.push(`groupes restants apres suppression : ${apresGroupes}`);

    return new Response(JSON.stringify({ ok: true, comptes_supprimes: comptesSupprimesReel, journal }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    journal.push(`exception : ${e.message}`);
    return new Response(JSON.stringify({ error: "Erreur : " + (e.message || "inconnue"), journal }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
