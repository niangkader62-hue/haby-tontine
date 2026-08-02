// Edge Function Supabase : initialise un paiement FedaPay depuis l'application.
//
// Gere 3 types de paiement :
//   - "cotisation"      : paiement d'une cotisation de tontine (credite le membre).
//   - "depot_personnel" : depot sur le solde personnel.
//   - "abonnement"      : abonnement Premium THT (mensuel 1000 / annuel 10000).
//
// verify_jwt = FALSE. C'est le WEBHOOK verifie aupres de FedaPay qui, seul, valide un paiement.

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: cors });

const ENV = Deno.env.get("FEDAPAY_ENV");
const IS_SANDBOX = ENV !== "live";
const FEDAPAY_BASE = IS_SANDBOX
  ? "https://sandbox-api.fedapay.com/v1"
  : "https://api.fedapay.com/v1";

// Formules d'abonnement Premium THT. Le prix est calcule ICI (jamais fait confiance au client).
const FORMULES: Record<string, { prix: number; jours: number; libelle: string }> = {
  mensuel: { prix: 1000, jours: 30, libelle: "Abonnement THT Premium (1 mois)" },
  annuel: { prix: 10000, jours: 365, libelle: "Abonnement THT Premium (1 an)" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const service = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const debug = (etape: string, http_status: number, detail: unknown) =>
    service.from("fedapay_debug").insert({ etape, http_status, detail }).then(() => {}, () => {});
  try {
    const secret = Deno.env.get("FEDAPAY_SECRET_KEY");
    if (!secret) { debug("secret_manquant", 500, {}); return json({ error: "FEDAPAY_SECRET_KEY manquante dans les secrets" }, 500); }

    const {
      type_transaction, id_tontine, id_utilisateur, membre_id,
      montant, telephone, prenom, reseau, pays, devise, formule,
    } = await req.json().catch(() => ({}));

    if (!["cotisation", "depot_personnel", "abonnement"].includes(type_transaction))
      return json({ error: "type_transaction invalide" }, 400);
    if (type_transaction === "cotisation" && !id_tontine)
      return json({ error: "id_tontine requis pour une cotisation" }, 400);
    if (type_transaction === "abonnement" && !id_utilisateur)
      return json({ error: "id_utilisateur requis pour un abonnement" }, 400);

    // Montant : pour un abonnement, il est FIXE par la formule (securite). Sinon, fourni.
    const f = FORMULES[formule === "annuel" ? "annuel" : "mensuel"];
    const montantNum = type_transaction === "abonnement" ? f.prix : Math.floor(Number(montant));
    const dureeJours = type_transaction === "abonnement" ? f.jours : null;
    if (!Number.isFinite(montantNum) || montantNum < 100)
      return json({ error: "Montant invalide (minimum 100)" }, 400);

    const tel = String(telephone || "").replace(/[^\d+]/g, "");
    if (tel.length < 8) return json({ error: "Numero de telephone invalide" }, 400);

    // EN SANDBOX UNIQUEMENT : on force le numero de test "succes" de FedaPay (66000001, Benin)
    // pour que la simulation aboutisse. En LIVE, on utilise le vrai numero du payeur.
    const telFedapay = IS_SANDBOX ? "66000001" : tel;
    const paysFedapay = IS_SANDBOX ? "bj" : (pays || "BJ").toLowerCase();

    const origin = req.headers.get("origin") || "https://tontine.kbsdigitalagency.com";
    const description = type_transaction === "cotisation"
      ? `Cotisation tontine ${id_tontine}`
      : type_transaction === "abonnement" ? f.libelle : "Depot personnel";

    // --- 1) Creer la transaction chez FedaPay ---------------------------------
    const creation = await fetch(`${FEDAPAY_BASE}/transactions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        description,
        amount: montantNum,
        currency: { iso: devise || "XOF" },
        callback_url: `${origin}/?paiement=1&retour=1`,
        customer: {
          firstname: (prenom || "Payeur").slice(0, 40),
          lastname: "THT",
          phone_number: { number: telFedapay, country: paysFedapay },
        },
        metadata: {
          type_transaction,
          id_tontine: id_tontine || null,
          id_utilisateur: id_utilisateur || null,
          membre_id: membre_id || null,
          duree_jours: dureeJours,
          reseau: reseau || null,
          pays: pays || null,
        },
      }),
    });
    const dataC = await creation.json();
    const trx = dataC["v1/transaction"] || dataC.transaction || dataC;
    if (!creation.ok || !trx?.id) {
      await debug("creation", creation.status, dataC);
      return json({ error: "FedaPay: creation refusee", detail: dataC }, 502);
    }

    // --- 2) Generer le token / l'URL de paiement hebergee ---------------------
    const tok = await fetch(`${FEDAPAY_BASE}/transactions/${trx.id}/token`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${secret}`, "Content-Type": "application/json" },
    });
    const dataT = await tok.json();
    const url = dataT.url || dataT["v1/transaction"]?.url;
    if (!tok.ok || !url) {
      await debug("token", tok.status, dataT);
      return json({ error: "FedaPay: token/url indisponible", detail: dataT }, 502);
    }

    // --- 3) Journaliser (statut pending) --------------------------------------
    await service.from("fedapay_transactions").insert({
      fedapay_id: String(trx.id),
      type_transaction,
      id_tontine: id_tontine || null,
      id_utilisateur: id_utilisateur || null,
      telephone: tel,
      reseau: reseau || null,
      pays: pays || null,
      montant: montantNum,
      devise: devise || "XOF",
      statut: "pending",
      raw: { creation: trx, duree_jours: dureeJours },
    });

    return json({ ok: true, url, fedapay_id: String(trx.id) });
  } catch (e) {
    await debug("exception", 500, { message: (e as Error)?.message || "inconnue" });
    return json({ error: "Erreur serveur : " + ((e as Error)?.message || "inconnue") }, 500);
  }
});
