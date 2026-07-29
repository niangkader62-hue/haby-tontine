// Edge Function Supabase : recoit la notification de paiement de CinetPay
// IMPORTANT : on ne fait jamais confiance aux donnees brutes envoyees par le webhook,
// on revient toujours interroger l'API CinetPay pour verifier le vrai statut (recommandation officielle)

import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    if (req.method === "GET") return new Response("ok", { status: 200 });

    const body = await req.formData().catch(() => null);
    const transactionId = body?.get("cpm_trans_id")?.toString();
    if (!transactionId) return new Response("ok", { status: 200 });

    const apikey = Deno.env.get("CINETPAY_APIKEY");
    const siteId = Deno.env.get("CINETPAY_SITE_ID");
    if (!apikey || !siteId) return new Response("ok", { status: 200 });

    const verifRes = await fetch("https://api-checkout.cinetpay.com/v2/payment/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apikey, site_id: siteId, transaction_id: transactionId }),
    });
    const verif = await verifRes.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    if (verif.data?.status === "ACCEPTED") {
      const { data: paiement } = await supabase.from("paiements").select("*").eq("transaction_id", transactionId).single();
      if (paiement && paiement.statut !== "accepted") {
        await supabase.from("paiements").update({ statut: "accepted" }).eq("transaction_id", transactionId);

        // IMPORTANT : on passe l'utilisatrice en Premium ET on lui pose une date de fin.
        // Sans cette date, l'abonnement ne se terminait JAMAIS : la tache quotidienne qui
        // repasse les comptes expires en "free" compare `premium_expire_le` a aujourd'hui,
        // et une valeur vide (NULL) ne correspond jamais en SQL. Resultat : un seul
        // paiement de 1 000 FCFA donnait le Premium a vie.
        const { data: profil } = await supabase.from("users").select("premium_expire_le").eq("id", paiement.user_id).single();
        const aujourdhui = new Date();
        const finActuelle = profil?.premium_expire_le ? new Date(profil.premium_expire_le + "T00:00:00Z") : null;
        // Un renouvellement anticipe s'ajoute au temps restant au lieu de l'effacer.
        const base = finActuelle && finActuelle > aujourdhui ? finActuelle : aujourdhui;
        const jours = Number(paiement.duree_jours) > 0 ? Number(paiement.duree_jours) : 30;
        const fin = new Date(base);
        fin.setUTCDate(fin.getUTCDate() + jours);

        await supabase.from("users").update({
          plan: "premium",
          premium_expire_le: fin.toISOString().split("T")[0],
        }).eq("id", paiement.user_id);
      }
    } else if (verif.data?.status === "REFUSED") {
      await supabase.from("paiements").update({ statut: "refused" }).eq("transaction_id", transactionId);
    }

    return new Response("ok", { status: 200 });
  } catch (e) {
    return new Response("ok", { status: 200 });
  }
});
