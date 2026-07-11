// Edge Function Supabase : envoie automatiquement les rappels de cotisation
// Declenchee une fois par jour par une tache planifiee (pg_cron), jamais par le navigateur
//
// Logique des rappels (basee sur la vraie date d'echeance de chaque tontine) :
//   - Echeance = demain      -> "Rappel : cotisation due demain"        (tout le monde)
//   - Echeance = aujourd'hui -> "Rappel : cotisation due aujourd'hui"   (tout le monde)
//   - Echeance depassee      -> "Paiement en retard"                    (seulement les membres pas encore payes,
//                                                                         renvoye tous les 3 jours pour ne pas spammer)

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

  const todayDate = new Date();
  const todayStr = todayDate.toISOString().split("T")[0];
  const tomorrow = new Date(todayDate);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  // Repasse en gratuit les comptes Premium dont le mois offert par parrainage est expire
  await supabase.from("users").update({ plan: "free" }).lt("premium_expire_le", todayStr).eq("plan", "premium");

  const sendTo = async (uid, title, body) => {
    const { data: sub } = await supabase.from("push_subscriptions").select("subscription").eq("user_id", uid).single();
    if (!sub) return false;
    try {
      await webpush.sendNotification(sub.subscription, JSON.stringify({ title, body }));
      return true;
    } catch (_e) {
      return false;
    }
  };

  let sent = 0;

  // 1) TONTINES DONT L'ECHEANCE EST DEMAIN OU AUJOURD'HUI -> rappel a tout le monde
  const { data: groupesDus } = await supabase
    .from("groupes")
    .select("id, nom, montant, user_id, date_echeance")
    .in("date_echeance", [tomorrowStr, todayStr]);

  for (const g of groupesDus || []) {
    const estAujourdhui = g.date_echeance === todayStr;
    const { data: membres } = await supabase.from("membres").select("user_id").eq("groupe_id", g.id).not("user_id", "is", null);
    const userIds = [...new Set([g.user_id, ...(membres || []).map((m) => m.user_id)])].filter(Boolean);
    const title = "HABY Tontine - Rappel";
    const body = estAujourdhui
      ? `Cotisation "${g.nom}" due aujourd'hui (${g.montant} FCFA). Pense a preparer ton versement !`
      : `Cotisation "${g.nom}" due demain (${g.montant} FCFA). Pense a preparer ton versement !`;
    for (const uid of userIds) {
      if (await sendTo(uid, title, body)) sent++;
    }
  }

  // 2) TONTINES EN RETARD (echeance passee) -> alerte uniquement aux membres pas encore payes,
  //    renvoyee tous les 3 jours (jour+1, jour+4, jour+7, ...) pour eviter le spam quotidien
  const { data: groupesRetard } = await supabase
    .from("groupes")
    .select("id, nom, montant, user_id, date_echeance")
    .lt("date_echeance", todayStr);

  for (const g of groupesRetard || []) {
    const echeance = new Date(g.date_echeance + "T00:00:00Z");
    const joursRetard = Math.floor((todayDate.getTime() - echeance.getTime()) / 86400000);
    if (joursRetard < 1 || (joursRetard - 1) % 3 !== 0) continue; // seulement jour+1, jour+4, jour+7...

    const { data: membres } = await supabase.from("membres").select("id, prenom, user_id, paye").eq("groupe_id", g.id).eq("paye", false).not("user_id", "is", null);
    for (const m of membres || []) {
      const ok = await sendTo(
        m.user_id,
        "HABY Tontine - Paiement en retard",
        `Ta cotisation "${g.nom}" (${g.montant} FCFA) est en retard de ${joursRetard} jour(s). Merci de regulariser au plus vite.`
      );
      if (ok) sent++;
    }
    // La creatrice recoit aussi un recapitulatif si des membres n'ont pas paye
    if ((membres || []).length > 0) {
      const ok = await sendTo(
        g.user_id,
        "HABY Tontine - Retards de paiement",
        `${membres.length} membre(s) n'ont pas encore paye la cotisation "${g.nom}" (en retard de ${joursRetard} jour(s)).`
      );
      if (ok) sent++;
    }
  }

  return new Response(
    JSON.stringify({ ok: true, echeances_j: (groupesDus || []).length, groupes_en_retard: (groupesRetard || []).length, notifications_envoyees: sent }),
    { headers: { "Content-Type": "application/json" } }
  );
});
