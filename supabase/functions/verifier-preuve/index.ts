// Edge Function Supabase : regarde une photo envoyee comme preuve de paiement et dit
// si c'en est vraiment une.
//
// REGLE ACTUELLE (stricte) : on n'accepte que si l'image porte un montant, un nom
// d'operateur, ou est franchement financiere (billets/recu/sms/capture operateur).
// Tout le reste -- selfie, visage, objet, paysage -- est REFUSE. Une image illisible
// (floue/sombre) n'est pas bloquee, pour ne pas rejeter un vrai paiement mal photographie.
//
// CE QU'ELLE NE FAIT PAS : elle ne prouve PAS qu'un paiement a eu lieu. Elle reconnait la
// FORME d'une preuve, pas sa VERITE. La confirmation de la creatrice reste ce qui fait foi.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const QUOTA_VERIFS_PAR_JOUR = 40;
const TAILLE_MAX_IMAGE = 4 * 1024 * 1024; // 4 Mo

const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// En cas de panne technique de l'IA (indisponible, illisible), on ne bloque pas un vrai
// paiement : la photo passe, non verifiee, et la creatrice la voit de toute facon.
const onLaissePasser = (raison: string) =>
  json({ ok: true, verifie: false, verdict: "indetermine", raison });

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

LIS ATTENTIVEMENT ET SOIS HONNETE :
- "montant" : un nombre SEULEMENT si tu vois vraiment des chiffres d'un montant sur l'image.
  Sur un visage, un objet ou un paysage, il n'y a pas de montant -> mets null. N'invente jamais.
- "operateur" : un nom SEULEMENT si tu le LIS sur l'image. Sinon null. N'invente jamais.
- "type" : "billets" seulement si on voit vraiment des billets/pieces ; sinon "autre".
- "sujet_principal" : ce que montre l'image. Devant un visage net -> "personne". Une image
  trop floue/sombre pour etre identifiee -> "illisible".
- "indices_argent" : true seulement si tu vois un montant, une devise (FCFA/CFA/F/XOF), un
  nom d'operateur, des mots de transaction, ou des billets. Sinon false.`;

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
            temperature: 0,
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

    // Faits durs lus sur l'image.
    const montantLu = Number(lu.montant);
    const aMontant = Number.isFinite(montantLu) && montantLu > 0;
    const operateurTxt = String(lu.operateur ?? "").trim().toLowerCase();
    const aOperateur = operateurTxt !== "" && operateurTxt !== "null" && operateurTxt !== "aucun";
    const type = String(lu.type ?? "");
    const typeFinancier = TYPES_FINANCIERS.has(type);
    const indicesArgent = lu.indices_argent === true;
    const sujet = String(lu.sujet_principal || "");

    // REGLE STRICTE : on ACCEPTE seulement sur une preuve d'argent concrete (montant,
    // operateur, type financier). Tout le reste est REFUSE. Une image illisible n'est pas
    // bloquee (pour ne pas rejeter un vrai paiement mal photographie).
    const preuveConcrete = aMontant || aOperateur || typeFinancier;
    const verdict = preuveConcrete ? "valide"
                  : sujet === "illisible" ? "doute"
                  : "refuse";

    // Diagnostic : on enregistre ce que l'IA a repondu, pour pouvoir le lire ensuite.
    try {
      await service.from("preuve_debug").insert({
        user_id: userId,
        verdict,
        sujet,
        indices_argent: indicesArgent,
        montant: aMontant ? montantLu : null,
        operateur: lu.operateur ?? null,
        type,
        brut: brut.slice(0, 2000),
      });
    } catch { /* le diagnostic ne doit jamais bloquer la verification */ }

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
      verdict,
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
