// Edge Function Supabase : WEBHOOK FedaPay (notification asynchrone de paiement).
//
// SECURITE (double barriere) :
//   1) On verifie la signature HMAC de l'entete x-fedapay-signature (secret du webhook).
//   2) SURTOUT, on ne fait JAMAIS confiance au corps recu : on RE-INTERROGE FedaPay avec
//      l'id de la transaction pour obtenir le statut + le montant + les metadonnees
//      AUTHENTIQUES. Un faux webhook ne peut donc rien valider.
//
// IDEMPOTENCE : le drapeau fedapay_transactions.applique garantit qu'un paiement n'est
// JAMAIS traite deux fois, meme si FedaPay renvoie le webhook plusieurs fois.
//
// verify_jwt = FALSE (c'est FedaPay qui appelle, sans session).

import { createClient } from "npm:@supabase/supabase-js@2";

const FEDAPAY_BASE = (Deno.env.get("FEDAPAY_ENV") === "live")
  ? "https://api.fedapay.com/v1"
  : "https://sandbox-api.fedapay.com/v1";

// Verifie la signature HMAC-SHA256 du corps brut avec le secret du webhook FedaPay.
async function signatureValide(brut: string, entete: string | null, secret: string) {
  if (!entete || !secret) return false;
  // L'entete FedaPay ressemble a "t=...,s=...". On extrait la partie signature.
  const sig = entete.split(",").map((p) => p.trim())
    .find((p) => p.startsWith("s="))?.slice(2) || entete.trim();
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(brut));
  const attendu = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return attendu === sig;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  try {
    const secretKey = Deno.env.get("FEDAPAY_SECRET_KEY") ?? "";
    const webhookSecret = Deno.env.get("FEDAPAY_WEBHOOK_SECRET") ?? "";
    const service = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    const brut = await req.text();
    // 1) Signature (si un secret de webhook est configure). On loggue mais on s'appuie
    //    surtout sur la re-verification API ci-dessous.
    const sigOk = webhookSecret
      ? await signatureValide(brut, req.headers.get("x-fedapay-signature"), webhookSecret)
      : true;

    const evt = JSON.parse(brut || "{}");
    const entite = evt.entity || evt["v1/transaction"] || evt.transaction || {};
    const fedapayId = entite.id || evt.transaction_id;
    if (!fedapayId) return new Response("no id", { status: 200 }); // rien a faire, on acquitte

    // 2) SOURCE DE VERITE : on redemande la transaction a FedaPay.
    const r = await fetch(`${FEDAPAY_BASE}/transactions/${fedapayId}`, {
      headers: { "Authorization": `Bearer ${secretKey}` },
    });
    const d = await r.json();
    const trx = d["v1/transaction"] || d.transaction || d;
    const statut = String(trx?.status || "").toLowerCase();
    const meta = trx?.metadata || entite.metadata || {};
    const montant = Math.floor(Number(trx?.amount || 0));

    // On enregistre TOUJOURS le statut recu (audit), meme si pas approuve.
    await service.from("fedapay_transactions")
      .update({ statut, raw: { webhook: evt, verif: trx }, ...(sigOk ? {} : { reseau: "SIGNATURE_INVALIDE" }) })
      .eq("fedapay_id", String(fedapayId));

    // On n'agit QUE si FedaPay confirme "approved".
    if (statut !== "approved") return new Response("ok (non approuve)", { status: 200 });

    // --- IDEMPOTENCE : deja applique ? on acquitte sans rien refaire ----------
    const { data: existant } = await service.from("fedapay_transactions")
      .select("applique, type_transaction, id_tontine, id_utilisateur, telephone, montant")
      .eq("fedapay_id", String(fedapayId)).maybeSingle();
    if (existant?.applique) return new Response("ok (deja applique)", { status: 200 });

    const type = meta.type_transaction || existant?.type_transaction;
    const idTontine = meta.id_tontine || existant?.id_tontine || null;
    const idUser = meta.id_utilisateur || existant?.id_utilisateur || null;
    const membreId = meta.membre_id || null;
    const tel = existant?.telephone || null;
    const mnt = montant || existant?.montant || 0;

    // --- ROUTAGE -------------------------------------------------------------
    if (type === "cotisation" && idTontine) {
      // Retrouver la ligne membre : par membre_id transmis, sinon par (tontine, telephone).
      let membre = null;
      if (membreId) {
        const { data } = await service.from("membres").select("*").eq("id", membreId).maybeSingle();
        membre = data;
      }
      if (!membre && tel) {
        const { data } = await service.from("membres").select("*")
          .eq("groupe_id", idTontine).eq("tel", tel).maybeSingle();
        membre = data;
      }
      if (membre) {
        const nouveauVerse = (Number(membre.versements) || 0) + mnt;
        const { data: g } = await service.from("groupes").select("montant,cycle").eq("id", idTontine).maybeSingle();
        const du = Number(membre.montant_perso ?? g?.montant ?? 0);
        const paye = nouveauVerse >= du;
        const cyclesPaies = (paye && !membre.paye) ? (Number(membre.cycles_paies) || 0) + 1 : (Number(membre.cycles_paies) || 0);
        await service.from("membres").update({
          versements: nouveauVerse, paye, cycles_paies: cyclesPaies,
        }).eq("id", membre.id);
        // Ecriture au carnet (comme un versement normal).
        await service.from("transactions").insert({
          groupe_id: idTontine, membre_id: membre.id, montant: mnt,
          cycle: g?.cycle || 1, statut: paye ? "paye" : "partiel",
        });
      }
    } else if (type === "depot_personnel") {
      await service.from("depots_personnels").insert({
        id_utilisateur: idUser, telephone: tel, montant: mnt, fedapay_id: String(fedapayId),
      });
    }

    // Marque comme applique -> plus jamais retraite.
    await service.from("fedapay_transactions")
      .update({ applique: true, statut: "approved" }).eq("fedapay_id", String(fedapayId));

    // 200 propre : indispensable pour que FedaPay considere le webhook recu.
    return new Response("ok", { status: 200 });
  } catch (e) {
    // On renvoie 200 pour eviter que FedaPay ne re-tente en boucle sur une erreur non
    // reessayable ; l'audit reste dans fedapay_transactions.raw. (Passe a 500 si tu
    // preferes les re-essais automatiques de FedaPay.)
    return new Response("erreur: " + ((e as Error)?.message || "?"), { status: 200 });
  }
});
