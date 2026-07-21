// Edge Function Supabase : fait passer automatiquement une tontine au cycle
// suivant quand son echeance est depassee depuis assez longtemps.
// Declenchee une fois par jour par une tache planifiee (pg_cron), jamais par le navigateur.
//
// Regle : on attend 3 jours apres la date d'echeance avant de faire passer au
// cycle suivant, pour laisser le temps aux rappels "retard" (J+1, J+2) de
// daily-reminders de faire leur effet.
//
// A ce moment-la, pour chaque membre :
//   - ce qu'il n'a pas fini de payer ce cycle (montant du - versements recus,
//     jamais negatif) s'ajoute a sa "dette" cumulee -- elle n'est JAMAIS effacee
//     automatiquement, seule une administratrice peut l'ajuster manuellement.
//   - versements et paye repartent a 0 / false pour le nouveau cycle.
// Le cycle de la tontine avance de 1, et une nouvelle date d'echeance est
// calculee a partir de l'ancienne (pas de la date du jour, pour garder un
// rythme regulier meme si la tache tourne en retard).
// On ne fait rien si la tontine a deja atteint son dernier cycle (cycle >= total_cycles).

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const GRACE_JOURS = 3;

function prochaineEcheance(dateStr, frequence) {
  const d = new Date(dateStr + "T00:00:00Z");
  if (frequence === "Hebdo") d.setUTCDate(d.getUTCDate() + 7);
  else if (frequence === "Bimensuel") d.setUTCDate(d.getUTCDate() + 15);
  else d.setUTCMonth(d.getUTCMonth() + 1); // Mensuel, ou valeur inconnue -> mensuel par defaut
  return d.toISOString().split("T")[0];
}

Deno.serve(async (req) => {
  // Securite : seule la tache planifiee (qui connait le secret) peut declencher cette fonction
  const secret = req.headers.get("x-cron-secret");
  if (secret !== Deno.env.get("CRON_SECRET")) {
    return new Response(JSON.stringify({ error: "Non autorise" }), { status: 401 });
  }

  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (publicKey && privateKey) webpush.setVapidDetails("mailto:contact@habytontine.app", publicKey, privateKey);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const sendTo = async (uid, title, body, url) => {
    if (!uid || !publicKey || !privateKey) return false;
    const { data: sub } = await supabase.from("push_subscriptions").select("subscription").eq("user_id", uid).single();
    if (!sub) return false;
    try {
      await webpush.sendNotification(sub.subscription, JSON.stringify({ title, body, url: url || "/" }));
      return true;
    } catch (_e) {
      return false;
    }
  };

  const limiteStr = new Date(Date.now() - GRACE_JOURS * 86400000).toISOString().split("T")[0];

  const { data: groupesAFaireAvancer } = await supabase
    .from("groupes")
    .select("id, nom, montant, user_id, cycle, total_cycles, date_echeance, frequence")
    .not("date_echeance", "is", null)
    .lte("date_echeance", limiteStr);

  let groupesAvances = 0;
  let notifications = 0;

  for (const g of groupesAFaireAvancer || []) {
    if ((g.cycle || 1) >= (g.total_cycles || 12)) continue; // derniere manche : on n'avance plus

    const { data: membres } = await supabase
      .from("membres")
      .select("id, prenom, user_id, montant_perso, versements, dette")
      .eq("groupe_id", g.id);

    for (const m of membres || []) {
      const montantDu = m.montant_perso != null ? Number(m.montant_perso) : Number(g.montant) || 0;
      const manque = Math.max(0, montantDu - (Number(m.versements) || 0));
      const nouvelleDette = (Number(m.dette) || 0) + manque;
      await supabase.from("membres").update({ dette: nouvelleDette, versements: 0, paye: false }).eq("id", m.id);
      if (manque > 0 && m.user_id) {
        const ok = await sendTo(
          m.user_id,
          "THT - Nouveau cycle",
          `"${g.nom}" passe au cycle suivant. Il te restait ${manque} FCFA a payer -- ajoute a ta dette (total : ${nouvelleDette} FCFA).`,
          `/?g=${g.id}&tab=membres`
        );
        if (ok) notifications++;
      } else if (m.user_id) {
        const ok = await sendTo(m.user_id, "THT - Nouveau cycle", `"${g.nom}" passe au cycle suivant. Bonne continuation !`, `/?g=${g.id}&tab=membres`);
        if (ok) notifications++;
      }
    }

    const nouvelleEcheance = prochaineEcheance(g.date_echeance, g.frequence);
    await supabase.from("groupes").update({ cycle: (g.cycle || 1) + 1, date_echeance: nouvelleEcheance }).eq("id", g.id);
    groupesAvances++;
  }

  return new Response(
    JSON.stringify({ ok: true, groupes_avances: groupesAvances, notifications_envoyees: notifications }),
    { headers: { "Content-Type": "application/json" } }
  );
});
