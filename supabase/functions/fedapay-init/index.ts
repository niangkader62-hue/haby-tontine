// Edge Function Supabase : initialise un paiement FedaPay depuis la page /paiement.
//
// ROLE : la page publique appelle cette fonction ; la fonction cree une transaction chez
// FedaPay (avec la CLE SECRETE qui reste ICI, jamais dans le navigateur), y attache les
// metadonnees (type_transaction, id_tontine, id_utilisateur), puis renvoie l'URL de
// paiement hebergee par FedaPay. Le navigateur n'a plus qu'a rediriger vers cette URL.
//
// SECURITE : verify_jwt = FALSE (le payeur n'est pas forcement connecte), mais la fonction
// ne fait qu'INITIER un paiement ; c'est le WEBHOOK (verifie aupres de FedaPay) qui, seul,
// credite/marque payer. Un appel malveillant ne peut donc rien valider tout seul.

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: cors });

// Sandbox par defaut ; passe FEDAPAY_ENV=live dans les secrets pour la production.
const FEDAPAY_BASE = (Deno.env.get("FEDAPAY_ENV") === "live")
  ? "https://api.fedapay.com/v1"
  : "https://sandbox-api.fedapay.com/v1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const secret = Deno.env.get("FEDAPAY_SECRET_KEY");
    if (!secret) return json({ error: "FEDAPAY_SECRET_KEY manquante dans les secrets" }, 500);

    const {
      type_transaction, id_tontine, id_utilisateur, membre_id,
      montant, telephone, prenom, reseau, pays, devise,
    } = await req.json().catch(() => ({}));

    // --- Validations minimales ------------------------------------------------
    if (type_transaction !== "cotisation" && type_transaction !== "depot_personnel")
      return json({ error: "type_transaction invalide" }, 400);
    const montantNum = Math.floor(Number(montant));
    if (!Number.isFinite(montantNum) || montantNum < 100)
      return json({ error: "Montant invalide (minimum 100)" }, 400);
    if (type_transaction === "cotisation" && !id_tontine)
      return json({ error: "id_tontine requis pour une cotisation" }, 400);
    const tel = String(telephone || "").replace(/[^\d+]/g, "");
    if (tel.length < 8) return json({ error: "Numero de telephone invalide" }, 400);

    const service = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const origin = req.headers.get("origin") || "https://tontine.kbsdigitalagency.com";

    // --- 1) Creer la transaction chez FedaPay ---------------------------------
    // Le montant XOF est un entier (pas de centimes). callback_url = retour du payeur.
    const creation = await fetch(`${FEDAPAY_BASE}/transactions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        description: type_transaction === "cotisation"
          ? `Cotisation tontine ${id_tontine}` : "Depot personnel",
        amount: montantNum,
        currency: { iso: devise || "XOF" },
        callback_url: `${origin}/?paiement=1&retour=1`,
        customer: {
          firstname: (prenom || "Payeur").slice(0, 40),
          lastname: "THT",
          phone_number: { number: tel, country: (pays || "BJ").toLowerCase() },
        },
        // METADONNEES : c'est ce que le webhook relira pour router le paiement.
        metadata: {
          type_transaction,
          id_tontine: id_tontine || null,
          id_utilisateur: id_utilisateur || null,
          membre_id: membre_id || null,
          reseau: reseau || null,
          pays: pays || null,
        },
      }),
    });
    const dataC = await creation.json();
    // FedaPay enveloppe l'objet sous une cle "v1/transaction".
    const trx = dataC["v1/transaction"] || dataC.transaction || dataC;
    if (!creation.ok || !trx?.id)
      return json({ error: "FedaPay: creation refusee", detail: dataC }, 502);

    // --- 2) Generer le token / l'URL de paiement hebergee ---------------------
    const tok = await fetch(`${FEDAPAY_BASE}/transactions/${trx.id}/token`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${secret}`, "Content-Type": "application/json" },
    });
    const dataT = await tok.json();
    const url = dataT.url || dataT["v1/transaction"]?.url;
    if (!tok.ok || !url)
      return json({ error: "FedaPay: token/url indisponible", detail: dataT }, 502);

    // --- 3) Journaliser (statut pending) : le webhook le passera a approved ----
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
      raw: { creation: trx },
    });

    // Le navigateur redirige vers cette URL (checkout FedaPay : push USSD, Wave, carte...).
    return json({ ok: true, url, fedapay_id: String(trx.id) });
  } catch (e) {
    return json({ error: "Erreur serveur : " + ((e as Error)?.message || "inconnue") }, 500);
  }
});
