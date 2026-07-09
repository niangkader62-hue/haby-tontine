// Edge Function Supabase : envoie automatiquement un rappel push la veille de chaque echeance
// Declenchee une fois par jour par une tache planifiee (pg_cron), jamais par le navigateur

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  // Securite : seule la tache planifiee (qui connait le secret) peut declencher cette fonction
  const secret = req.headers.get("x-cron-secret");
  if (secret !== Deno.env.get("CRON_SECRET")) {
    return new Response(JSON.stringify({ error: "Non autorise" }), { status: 401 });
  }

  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!publicKey || !privateKey) {
    return new Response(JSON.stringify({ error: "Cles VAPID manquantes" }), { status: 500 });
  }
  webpush.setVapidDetails("mailto:contact@habytontine.app", publicKey, privateKey);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // Tontines dont l'echeance tombe demain
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  const { data: groupes, error } = await supabase
    .from("groupes")
    .select("id, nom, montant, user_id")
    .eq("date_echeance", tomorrowStr);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  let sent = 0;
  for (const g of groupes || []) {
    // Destinataires : la creatrice + tous les membres lies a un compte
    const { data: membres } = await supabase.from("membres").select("user_id").eq("groupe_id", g.id).not("user_id", "is", null);
    const userIds = [...new Set([g.user_id, ...(membres || []).map((m) => m.user_id)])].filter(Boolean);

    for (const uid of userIds) {
      const { data: sub } = await supabase.from("push_subscriptions").select("subscription").eq("user_id", uid).single();
      if (!sub) continue;
      try {
        await webpush.sendNotification(
          sub.subscription,
          JSON.stringify({
            title: "HABY Tontine - Rappel",
            body: `Cotisation "${g.nom}" due demain (${g.montant} FCFA). Pense a preparer ton versement !`,
          })
        );
        sent++;
      } catch (_e) {
        // abonnement expire ou invalide, on ignore et on continue
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, groupes: (groupes || []).length, notifications_envoyees: sent }), {
    headers: { "Content-Type": "application/json" },
  });
});
