// Edge Function Supabase : initie un paiement Premium via CinetPay
// Appelee par l'utilisatrice connectee depuis l'app

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PREMIUM_PRICE = 1000; // FCFA / mois

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader ?? "" } } }
    );
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Non authentifie" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: profile } = await supabase.from("users").select("*").eq("id", user.id).single();

    const apikey = Deno.env.get("CINETPAY_APIKEY");
    const siteId = Deno.env.get("CINETPAY_SITE_ID");
    if (!apikey || !siteId) {
      return new Response(JSON.stringify({ error: "CinetPay non configure" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const transactionId = `HABY-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const serviceSupabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    await serviceSupabase.from("paiements").insert({
      user_id: user.id, transaction_id: transactionId, montant: PREMIUM_PRICE, statut: "pending",
    });

    const projectUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const payload = {
      apikey,
      site_id: siteId,
      transaction_id: transactionId,
      amount: PREMIUM_PRICE,
      currency: "XOF",
      description: "Abonnement HABY Tontine Premium (1 mois)",
      customer_name: profile?.prenom || "Utilisatrice",
      customer_surname: "HABY",
      customer_phone_number: profile?.telephone || "",
      notify_url: `${projectUrl}/functions/v1/cinetpay-webhook`,
      return_url: "https://haby-tontine.netlify.app",
      channels: "ALL",
      lang: "FR",
    };

    const res = await fetch("https://api-checkout.cinetpay.com/v2/payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (data.code !== "201" && data.code !== 201) {
      return new Response(JSON.stringify({ error: data.message || "Erreur CinetPay" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ payment_url: data.data.payment_url, transaction_id: transactionId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
