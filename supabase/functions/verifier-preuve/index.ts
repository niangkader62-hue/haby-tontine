// Edge Function Supabase : regarde une photo envoyee comme preuve de paiement et dit
// si c'en est vraiment une.
//
// LE PROBLEME
// N'importe quelle image passait : un selfie, une photo de chaussures, une capture au
// hasard. La creatrice devait tout verifier a l'oeil, une photo apres l'autre.
//
// L'APPROCHE, ET POURQUOI ELLE A CHANGE
// On demandait a l'IA de JUGER : "est-ce une preuve ?". C'est une question d'opinion, et
// le modele hesitait -- un portrait passait. Desormais on ne lui demande plus un avis,
// on lui demande des FAITS : lit-elle un montant ? un nom d'operateur ? des mots lies a
// de l'argent ? Et c'est L'APPLICATION qui tranche, sur ces faits :
//   - au moins un indice concret d'argent (montant, operateur, type financier, mots
//     d'argent) -> c'est une preuve, on accepte ;
//   - une image NETTE sans aucun indice d'argent (un visage, un objet, un paysage) ->
//     ce n'est pas une preuve, on refuse ;
//   - une image qu'on ne peut pas identifier (floue, sombre) -> le doute profite a la
//     membre, on laisse passer et on signale.
// Lire un montant ou "Orange Money" est une tache que le modele rate quasiment jamais ;
// c'est bien plus sur que de lui faire porter un jugement.
//
// CE QU'ELLE NE FAIT PAS, ET IL FAUT LE SAVOIR
// Elle ne prouve PAS qu'un paiement a eu lieu. Une capture peut etre fabriquee, ou
// etre celle du paiement de quelqu'un d'autre. Elle reconnait la FORME d'une preuve,
// pas sa VERITE. La confirmation humaine de la creatrice reste ce qui fait foi.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Une verification par photo envoyee. Une membre depose une preuve par cycle : ce
// plafond genereux ne gene personne, il empeche seulement une boucle d'appels.
const QUOTA_VERIFS_PAR_JOUR = 40;
const TAILLE_MAX_IMAGE = 4 * 1024 * 1024; // 4 Mo : au-dela, ce n'est pas une capture d'ecran

const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// En cas de panne, de quota atteint ou de reponse illisible, on ACCEPTE la photo.
// Bloquer un vrai paiement parce que l'IA est indisponible serait bien pire que
// laisser passer une image douteuse que la creatrice verra de toute facon.
const onLaissePasser = (raison: string) =>
  json({ ok: true, verifie: false, verdict: "indetermine", raison });

// Types d'image qui SONT, par nature, une preuve financiere.
const TYPES_FINANCIERS = new Set(["capture_operateur", "sms", "recu_papier", "billets"]);

const CONSIGNE = `Tu examines une image envoyee comme preuve d'un paiement mobile en Afrique de l'Ouest
(Mali, Senegal, Burkina, Cote d'Ivoire).

Ton travail n'est PAS de juger si "c'est une vraie preuve" : c'est seulement de LIRE et de
RAPPORTER, honnetement, ce que l'image contient. L'application decidera ensuite.

Une preuve de paiement contient au moins l'une de ces choses :
- une capture d'ecran de confirmation d'un operateur (Orange Money, Wave, Moov Money,
  Free Money, MTN MoMo, Djamo, Sama Money, Wizall...) ;
- un SMS de confirmation de transfert ;
- un recu ou bordereau papier ;
- des billets de banque ou des pieces.

Reponds UNIQUEMENT par un objet JSON, sans texte autour, sans balises de code :
{
  "sujet_principal": "preuve_paiement" | "personne" | "animal" | "lieu" | "objet" | "capture_sans_argent" | "illisible",
  "indices_argent": true | false,
  "type": "capture_operateur" | "sms" | "recu_papier" | "billets" | "autre",
  "operateur": "Orange Money" | "Wave" | "Moov Money" | "autre nom lu" | null,
  "montant": nombre entier sans espace ni devise, ou null si illisible,
  "devise": "FCFA" ou autre, ou null,
  "date": "JJ/MM/AAAA" telle que lue, ou null,
  "description": "ce que tu vois vraiment, en 8 mots maximum, en francais"
}

REGLE 1 -- "indices_argent", le champ le plus important. Reponds true si tu vois SUR
l'image AU MOINS UN de ces elements :
- un montant chiffre (ex : 25 000, 10.000) ;
- une devise ou son symbole (FCFA, CFA, F, XOF) ;
- un nom d'operateur d'argent mobile ou de banque ;
- des mots de transaction (transfert, envoi, recu, paiement, solde, reference, ID de
  transaction, "vous avez recu", "transaction reussie") ;
- des billets de banque ou des pieces reconnaissables.
Sinon (un visage, un animal, un paysage, un objet, une capture sans rien de tout cela),
reponds false. Dans le doute sur une image NETTE ou tu ne vois aucun chiffre ni mot
d'argent, reponds false.

REGLE 2 -- "sujet_principal", ce que montre l'image :
- "preuve_paiement" : operateur, SMS, recu, billets/pieces ;
- "personne" : un visage, un selfie, un portrait, une photo d'identite ;
- "animal", "lieu" (paysage, rue, batiment, voiture), "objet" (plat, vetement, meuble...) ;
- "capture_sans_argent" : une capture d'ecran qui ne parle pas d'argent ;
- "illisible" : image trop floue, trop sombre ou coupee pour etre identifiee.
Devant un visage net, reponds "personne" avec "indices_argent": false -- jamais "preuve_paiement".

Une photo de billets est une preuve valable meme sans texte : sujet_principal
"preuve_paiement", "type": "billets", "indices_argent": true, "montant": null si tu ne
peux pas compter avec certitude.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return onLaissePasser("cle Gemini non configuree");

    const { image_base64, mime_type, montant_attendu } = await req.json().catch(() => ({}));
    if (!image_base64) return json({ error: "image manquante" }, 400);
    if (image_base64.length > TAILLE_MAX_IMAGE * 1.4) return onLaissePasser("image trop volumineuse pour etre analysee");

    const service = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // --- Quota quotidien (table preuve_usage, distincte de celle de HABY) ------
    // Tolerant : si la table manque ou que la lecture echoue, on laisse passer.
    let userId: string | null = null;
    try {
      const jeton = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
      if (jeton) {
        const { data } = await service.auth.getUser(jeton);
        userId = data?.user?.id ?? null;
      }
    } catch { /* on continue sans quota */ }
    if (!userId) return json({ error: "Non authentifie" }, 401);

    const jour = new Date().toISOString().split("T")[0];
    try {
      const { data: usage, error } = await service
        .from("preuve_usage").select("nb").eq("user_id", userId).eq("jour", jour).maybeSingle();
      if (!error) {
        const deja = Number(usage?.nb) || 0;
        if (deja >= QUOTA_VERIFS_PAR_JOUR) return onLaissePasser("quota de verifications atteint pour aujourd hui");
        await service.from("preuve_usage").upsert({ user_id: userId, jour, nb: deja + 1 }, { onConflict: "user_id,jour" });
      }
    } catch { /* on laisse passer */ }

    // --- Lecture de l'image par Gemini ----------------------------------------
    const reponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: CONSIGNE }] },
          contents: [{
            role: "user",
            parts: [
              { inline_data: { mime_type: mime_type || "image/jpeg", data: image_base64 } },
              { text: "Analyse cette image et reponds en JSON." },
            ],
          }],
          generationConfig: {
            temperature: 0,               // on veut une lecture, pas de l'imagination
            maxOutputTokens: 300,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!reponse.ok) return onLaissePasser("service d analyse indisponible");
    const data = await reponse.json();
    const brut = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "";
    if (!brut) return onLaissePasser("aucune reponse d analyse");

    let lu: Record<string, unknown>;
    try {
      lu = JSON.parse(brut.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim());
    } catch {
      return onLaissePasser("reponse d analyse illisible");
    }

    // --- Faits lus sur l'image (c'est l'app qui tranche, pas l'IA) -------------
    const montantLu = Number(lu.montant);
    const aMontant = Number.isFinite(montantLu) && montantLu > 0;
    const operateurTxt = String(lu.operateur ?? "").trim().toLowerCase();
    const aOperateur = operateurTxt !== "" && operateurTxt !== "null" && operateurTxt !== "aucun";
    const type = String(lu.type ?? "");
    const typeFinancier = TYPES_FINANCIERS.has(type);
    const indicesArgent = lu.indices_argent === true;
    const sujet = String(lu.sujet_principal || "");

    // Une image est "identifiee" des lors que l'IA a su dire ce qu'elle montre. Si elle
    // est illisible (floue, sombre), on ne refuse pas : le doute profite a la membre.
    const imageIdentifiee = sujet !== "" && sujet !== "illisible";

    // Preuve concrete = au moins un fait d'argent lu sur l'image. C'est la seule chose
    // qui fait accepter -- et l'absence totale de fait, sur une image nette, qui fait refuser.
    const preuveConcrete = aMontant || aOperateur || typeFinancier || indicesArgent;

    const verdict = preuveConcrete ? "valide"
                  : imageIdentifiee ? "refuse"
                  : "doute";

    // Trace serveur (logs edge-function) : montre exactement les faits lus et le verdict.
    console.log(`[verifier-preuve] verdict=${verdict} sujet=${sujet} indices_argent=${indicesArgent} operateur=${lu.operateur ?? ""} montant=${lu.montant ?? ""} type=${type} desc=${lu.description ?? ""}`);

    // Ecart de montant : information, jamais motif de refus. Un versement partiel ou
    // un paiement groupe sont des situations parfaitement normales dans une tontine.
    let ecartMontant: string | null = null;
    if (verdict !== "refuse" && aMontant && Number(montant_attendu) > 0) {
      const attendu = Number(montant_attendu);
      if (Math.abs(montantLu - attendu) > Math.max(1, attendu * 0.02)) {
        ecartMontant = `La photo indique ${montantLu.toLocaleString("fr-FR")} F, la cotisation attendue est ${attendu.toLocaleString("fr-FR")} F.`;
      }
    }

    return json({
      ok: true,
      verifie: true,
      verdict,                                     // "valide" | "doute" | "refuse"
      type: lu.type ?? null,
      operateur: lu.operateur ?? null,
      montant: aMontant ? montantLu : null,
      devise: lu.devise ?? null,
      date: lu.date ?? null,
      sujet_principal: sujet || null,
      indices_argent: indicesArgent,
      description: lu.description ?? null,
      ecart_montant: ecartMontant,
    });
  } catch (e) {
    return onLaissePasser("erreur technique : " + ((e as Error)?.message || "inconnue"));
  }
});
