// Edge Function Supabase : envoie automatiquement les rappels de cotisation
// Declenchee une fois par jour par une tache planifiee (pg_cron), jamais par le navigateur
//
// Logique des rappels (basee sur la vraie date d'echeance de chaque tontine) :
//   - Echeance dans 2 jours, demain, ou aujourd'hui -> "Rappel"    (tout le monde, montant personnalise si defini)
//   - Echeance depassee de 1 ou 2 jours              -> "Paiement en retard"  (seulement les membres pas encore payes)

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
  const dansDeuxJours = new Date(todayDate);
  dansDeuxJours.setDate(dansDeuxJours.getDate() + 2);
  const dansDeuxJoursStr = dansDeuxJours.toISOString().split("T")[0];

  // Repasse en gratuit les comptes Premium dont le mois offert par parrainage est expire
  await supabase.from("users").update({ plan: "free" }).lt("premium_expire_le", todayStr).eq("plan", "premium");

  const sendTo = async (uid, title, body, url) => {
    const { data: sub } = await supabase.from("push_subscriptions").select("subscription").eq("user_id", uid).single();
    if (!sub) return false;
    try {
      await webpush.sendNotification(sub.subscription, JSON.stringify({ title, body, url: url || "/" }));
      return true;
    } catch (_e) {
      return false;
    }
  };

  let sent = 0;

  // 1) TONTINES DONT L'ECHEANCE EST DEMAIN OU AUJOURD'HUI -> rappel a tout le monde,
  //    avec le montant personnalise de chacun si defini
  const { data: groupesDus } = await supabase
    .from("groupes")
    .select("id, nom, montant, user_id, date_echeance")
    .in("date_echeance", [dansDeuxJoursStr, tomorrowStr, todayStr]);

  const libelleEcheance = (dateEcheance) => {
    if (dateEcheance === todayStr) return "due aujourd'hui";
    if (dateEcheance === tomorrowStr) return "due demain";
    return "due dans 2 jours";
  };

  for (const g of groupesDus || []) {
    const quand = libelleEcheance(g.date_echeance);
    const url = `/?g=${g.id}&tab=rapport`;
    const title = "THT - Rappel";
    const { data: membres } = await supabase.from("membres").select("user_id, montant_perso").eq("groupe_id", g.id).not("user_id", "is", null);

    const dejaNotifies = new Set();
    for (const m of membres || []) {
      if (dejaNotifies.has(m.user_id)) continue;
      dejaNotifies.add(m.user_id);
      const montant = m.montant_perso || g.montant;
      const body = `Cotisation "${g.nom}" ${quand} (${montant} FCFA). Pense a preparer ton versement !`;
      if (await sendTo(m.user_id, title, body, url)) sent++;
    }
    // Filet de securite : si la creatrice n'a pas encore sa propre ligne membre (anciennes tontines), on la notifie quand meme
    if (!dejaNotifies.has(g.user_id)) {
      const body = `Cotisation "${g.nom}" ${quand} (${g.montant} FCFA). Pense a preparer ton versement !`;
      if (await sendTo(g.user_id, title, body, url)) sent++;
    }
  }

  // 2) TONTINES EN RETARD (echeance passee) -> alerte uniquement aux membres pas encore payes,
  //    envoyee le lendemain (jour+1) et le surlendemain (jour+2) de l'echeance, puis plus rien ensuite
  const { data: groupesRetard } = await supabase
    .from("groupes")
    .select("id, nom, montant, user_id, date_echeance")
    .lt("date_echeance", todayStr);

  for (const g of groupesRetard || []) {
    const echeance = new Date(g.date_echeance + "T00:00:00Z");
    const joursRetard = Math.floor((todayDate.getTime() - echeance.getTime()) / 86400000);
    if (joursRetard !== 1 && joursRetard !== 2) continue; // seulement jour+1 et jour+2

    const url = `/?g=${g.id}&tab=rapport`;
    const { data: membres } = await supabase.from("membres").select("id, prenom, user_id, paye, montant_perso").eq("groupe_id", g.id).eq("paye", false).not("user_id", "is", null);
    for (const m of membres || []) {
      const montant = m.montant_perso || g.montant;
      const ok = await sendTo(
        m.user_id,
        "THT - Paiement en retard",
        `Ta cotisation "${g.nom}" (${montant} FCFA) est en retard de ${joursRetard} jour(s). Merci de regulariser au plus vite.`,
        url
      );
      if (ok) sent++;
    }
    // La creatrice recoit aussi un recapitulatif si des membres n'ont pas paye
    if ((membres || []).length > 0) {
      const ok = await sendTo(
        g.user_id,
        "THT - Retards de paiement",
        `${membres.length} membre(s) n'ont pas encore paye la cotisation "${g.nom}" (en retard de ${joursRetard} jour(s)).`,
        url
      );
      if (ok) sent++;
    }
  }

  return new Response(
    JSON.stringify({ ok: true, echeances_j: (groupesDus || []).length, groupes_en_retard: (groupesRetard || []).length, notifications_envoyees: sent }),
    { headers: { "Content-Type": "application/json" } }
  );
});
