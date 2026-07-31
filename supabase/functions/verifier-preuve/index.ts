// Edge Function Supabase : regarde une photo envoyee comme preuve de paiement et dit
// si c'en est vraiment une.
//
// LE PROBLEME
// N'importe quelle image passait : un selfie, une photo de chaussures, une capture au
// hasard. La creatrice devait tout verifier a l'oeil, une photo apres l'autre.
//
// CE QUE FAIT CETTE FONCTION
// Elle envoie l'image a Gemini et lui demande UNIQUEMENT de lire ce qu'il voit, au
// format JSON : est-ce une confirmation de paiement mobile, de quel operateur, pour
// quel montant, a quelle date. L'application peut alors refuser d'emblee ce qui n'a
// rien a voir, et afficher "Orange Money - 25 000 F - 30/07" a cote de la photo.
//
// CE QU'ELLE NE FAIT PAS, ET IL FAUT LE SAVOIR
// Elle ne prouve PAS qu'un paiement a eu lieu. Une capture peut etre fabriquee, ou
// etre celle du paiement de quelqu'un d'autre. Elle reconnait la FORME d'une preuve,
// pas sa VERITE. La confirmation humaine de la creatrice reste ce qui fait foi.
// C'est pourquoi le doute profite toujours a la membre : en cas d'incertitude ou de
// panne, la photo est acceptee et simplement signalee.

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

// Deux signaux sont demandes a l'IA, pas un seul. "decision" dit si l'image est une
// preuve ; "sujet_principal" dit ce que l'image MONTRE, en un mot d'une liste fermee.
// Reconnaitre le sujet ("une personne", "un objet") est une tache bien plus fiable
// pour un modele de vision que de juger "est-ce une preuve". On s'en sert comme
// filet : un sujet manifestement non financier fait refuser, meme si la decision hesite.
const SUJETS_NON_PREUVE = new Set([
  "personne", "animal", "lieu", "objet", "capture_sans_argent",
]);

const CONSIGNE = `Tu examines une image envoyee comme preuve d'un paiement mobile en Afrique de l'Ouest
(Mali, Senegal, Burkina, Cote d'Ivoire).

EST une preuve valable :
- une capture d'ecran de confirmation d'un operateur (Orange Money, Wave, Moov Money,
  Free Money, MTN MoMo, Djamo, Sama Money, Wizall...) ;
- un SMS de confirmation de transfert ;
- un recu ou bordereau papier photographie ;
- une photo de billets de banque ou de pieces (remise en main propre).

N'EST PAS une preuve, meme si l'image est nette et de bonne qualite :
- une personne : portrait, selfie, photo de famille, photo d'identite ;
- un animal, un paysage, un batiment, une voiture ;
- un plat, un vetement, un meuble, un objet quelconque ;
- une capture d'ecran sans rapport avec de l'argent (discussion, reseau social, jeu,
  meteo, page web) ;
- une image decorative ou trouvee sur internet.

Reponds UNIQUEMENT par un objet JSON, sans texte autour, sans balises de code :
{
  "sujet_principal": "preuve_paiement" | "personne" | "animal" | "lieu" | "objet" | "capture_sans_argent",
  "decision": "preuve" | "pas_preuve" | "incertain",
  "type": "capture_operateur" | "sms" | "recu_papier" | "billets" | "autre",
  "operateur": "Orange Money" | "Wave" | "Moov Money" | "autre nom lu" | null,
  "montant": nombre entier sans espace ni devise, ou null si illisible,
  "devise": "FCFA" ou autre, ou null,
  "date": "JJ/MM/AAAA" telle que lue, ou null,
  "description": "ce que tu vois vraiment, en 8 mots maximum, en francais"
}

REGLE 1 -- "sujet_principal", ce que montre l'image AVANT tout jugement :
- "preuve_paiement" : capture d'operateur, SMS de transfert, recu papier, billets/pieces ;
- "personne"        : un visage, un selfie, un portrait, une photo d'identite ;
- "animal"          : un animal ;
- "lieu"            : un paysage, une rue, un batiment, une voiture ;
- "objet"           : un plat, un vetement, un meuble, un objet du quotidien ;
- "capture_sans_argent" : une capture d'ecran qui ne parle pas d'argent (discussion,
                    reseau social, jeu, meteo, page web).
  Devant un visage net, reponds "personne" -- jamais "preuve_paiement".

REGLE 2 -- "decision" :
- "preuve"     : tu reconnais une preuve valable (sujet_principal = "preuve_paiement") ;
- "pas_preuve" : le sujet n'a rien a voir avec un paiement ;
- "incertain"  : reserve aux images qu'on ne PEUT PAS identifier (trop floues, trop
                 sombres, surexposees, coupees). Si tu arrives a dire ce que montre
                 l'image, tu n'es PAS dans ce cas.

Une photo de billets reste une preuve valable meme sans aucun texte : sujet_principal
"preuve_paiement", "decision": "preuve", "type": "billets", et "montant": null si tu ne
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

    const montantLu = Number(lu.montant);
    const decision = String(lu.decision || "incertain");
    const sujet = String(lu.sujet_principal || "");

    // Trace serveur (visible dans les logs edge-function) : permet de voir exactement
    // ce que l'IA a repondu si une image passe ou est refusee a tort.
    console.log(`[verifier-preuve] sujet=${sujet} decision=${decision} operateur=${lu.operateur ?? ""} montant=${lu.montant ?? ""} desc=${lu.description ?? ""}`);

    // Traduction en verdict pour l'application.
    //
    // HISTORIQUE DU BUG : on ne refusait que si "decision" valait exactement "pas_preuve".
    // Or, devant un portrait, le modele repondait souvent "incertain" (par prudence) et la
    // photo passait. On s'appuie donc AUSSI sur "sujet_principal" : si l'image montre
    // manifestement autre chose qu'un paiement (une personne, un objet...), on refuse,
    // meme si "decision" hesite -- et meme si elle dit "preuve" par erreur, car reconnaitre
    // le sujet est plus fiable que juger la valeur de preuve.
    const sujetEstNonPreuve = SUJETS_NON_PREUVE.has(sujet);
    const verdict = sujetEstNonPreuve ? "refuse"
                  : decision === "pas_preuve" ? "refuse"
                  : decision === "preuve"     ? "valide"
                  : "doute";

    // Ecart de montant : information, jamais motif de refus. Un versement partiel ou
    // un paiement groupe sont des situations parfaitement normales dans une tontine.
    let ecartMontant: string | null = null;
    if (verdict !== "refuse" && Number.isFinite(montantLu) && montantLu > 0 && Number(montant_attendu) > 0) {
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
      montant: Number.isFinite(montantLu) && montantLu > 0 ? montantLu : null,
      devise: lu.devise ?? null,
      date: lu.date ?? null,
      decision,
      sujet_principal: sujet || null,
      description: lu.description ?? null,
      ecart_montant: ecartMontant,
    });
  } catch (e) {
    return onLaissePasser("erreur technique : " + ((e as Error)?.message || "inconnue"));
  }
});
