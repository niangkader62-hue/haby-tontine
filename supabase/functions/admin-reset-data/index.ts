// Edge Function Supabase : remise a zero complete des donnees de test
// PROTEGEE : verifie que l'appelant est bien authentifie ET a le role admin
// avant de faire quoi que ce soit. Utilise la cle service_role pour pouvoir
// nettoyer aussi auth.users (impossible depuis le client normal).

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    if (!jwt) return new Response(JSON.stringify({ error: "Non authentifie" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Verifie que l'appelant existe et est bien admin AVANT toute suppression
    const { data: { user: caller }, error: authErr } = await supabase.auth.getUser(jwt);
    if (authErr || !caller) return new Response(JSON.stringify({ error: "Session invalide" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: profil } = await supabase.from("users").select("role, telephone").eq("id", caller.id).single();
    if (!profil || profil.role !== "admin") {
      return new Response(JSON.stringify({ error: "Reserve aux administrateurs" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Les 2 vrais numeros a conserver (jamais supprimes)
    const numerosProteges = ["76908031", "90647106"];
    const estProtege = (tel) => numerosProteges.some((n) => (tel || "").includes(n));

    await supabase.from("groupes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("cagnottes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("objectifs").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    const { data: tousLesUsers } = await supabase.from("users").select("id, telephone");
    const aSupprimer = (tousLesUsers || []).filter((u) => !estProtege(u.telephone)).map((u) => u.id);

    if (aSupprimer.length > 0) {
      await supabase.from("push_subscriptions").delete().in("user_id", aSupprimer);
      await supabase.from("paiements").delete().in("user_id", aSupprimer);
      await supabase.from("parrainages").delete().in("parrain_id", aSupprimer);
      await supabase.from("parrainages").delete().in("filleul_id", aSupprimer);
      await supabase.from("users").delete().in("id", aSupprimer);
      for (const id of aSupprimer) {
        await supabase.auth.admin.deleteUser(id).catch(() => {});
      }
    }

    return new Response(JSON.stringify({ ok: true, comptes_supprimes: aSupprimer.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Erreur : " + (e.message || "inconnue") }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
