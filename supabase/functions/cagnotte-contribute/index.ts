// Edge Function Supabase : point d'acces PUBLIC (sans compte) pour les cagnottes
// - GET  ?id=<cagnotte_id>          -> renvoie les infos publiques de la cagnotte (titre, objectif, deja collecte...)
// - POST { cagnotte_id, prenom, nom, tel, montant } -> enregistre une contribution
//
// Utilise la cle service_role cote serveur : contourne les regles de securite (RLS)
// de maniere CONTROLEE, seulement pour ces deux actions precises et validees.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const id = url.searchParams.get("id");
      if (!id) return new Response(JSON.stringify({ error: "id manquant" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const { data, error } = await supabase
        .from("cagnottes")
        .select("id, titre, description, objectif, montant_collecte, beneficiaire, statut, date_limite")
        .eq("id", id)
        .single();

      if (error || !data) return new Response(JSON.stringify({ error: "Cagnotte introuvable" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (req.method === "POST") {
      const { cagnotte_id, prenom, nom, tel, montant } = await req.json();
      if (!cagnotte_id || !prenom?.trim() || !montant || Number(montant) < 100) {
        return new Response(JSON.stringify({ error: "Donnees invalides" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: cagnotte, error: cErr } = await supabase.from("cagnottes").select("id, statut, montant_collecte, titre, user_id").eq("id", cagnotte_id).single();
      if (cErr || !cagnotte) return new Response(JSON.stringify({ error: "Cagnotte introuvable" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (cagnotte.statut !== "ouverte") return new Response(JSON.stringify({ error: "Cette cagnotte n'accepte plus de contributions" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const contributeur = `${prenom.trim()} ${(nom || "").trim()}`.trim();
      const montantNum = Number(montant);

      const { error: insErr } = await supabase.from("cagnotte_contributions").insert({
        cagnotte_id, contributeur, tel: tel ? String(tel).trim() : null, montant: montantNum,
      });
      if (insErr) return new Response(JSON.stringify({ error: "Enregistrement impossible" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const nouveauTotal = Number(cagnotte.montant_collecte || 0) + montantNum;
      await supabase.from("cagnottes").update({ montant_collecte: nouveauTotal }).eq("id", cagnotte_id);

      // Notifie la creatrice de la cagnotte
      if (cagnotte.user_id) {
        const { data: sub } = await supabase.from("push_subscriptions").select("subscription").eq("user_id", cagnotte.user_id).single();
        if (sub) {
          try {
            const webpush = await import("npm:web-push@3.6.7");
            const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
            const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
            if (publicKey && privateKey) {
              webpush.default.setVapidDetails("mailto:contact@habytontine.app", publicKey, privateKey);
              await webpush.default.sendNotification(sub.subscription, JSON.stringify({
                title: "THT - Nouvelle contribution !",
                body: `${contributeur} a contribue ${montantNum} FCFA a "${cagnotte.titre}"`,
                url: "/",
              }));
            }
          } catch (_e) { /* notification best-effort, on ignore les erreurs */ }
        }
      }

      return new Response(JSON.stringify({ ok: true, contributeur, montant: montantNum, nouveauTotal, titre: cagnotte.titre }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Methode non supportee" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Erreur : " + (e.message || "inconnue") }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
