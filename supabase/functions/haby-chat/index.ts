// Edge Function Supabase : proxy securise vers l'API Gemini (Google)
// La cle API reste cote serveur, jamais exposee au navigateur.
//
// MAITRISE DES COUTS (l'IA est le seul poste facture a l'usage de toute l'app) :
//   1) Quota quotidien par personne sur le plan gratuit, verifie ICI cote serveur --
//      une limite posee seulement dans l'application serait contournable.
//   2) On n'envoie que la fin de la conversation : sans cela, tout l'historique etait
//      renvoye a chaque question et le cout d'un echange grandissait sans arret.
//   3) Reponses plafonnees : HABY doit repondre court, inutile de payer pour plus.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const QUOTA_GRATUIT_PAR_JOUR = 10;   // questions/jour sur le plan gratuit
const MAX_MESSAGES_HISTORIQUE = 10;  // derniers messages envoyes a l'IA
const MAX_TOKENS_REPONSE = 800;      // reponses courtes = facture reduite

const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Message renvoye dans le format attendu par le chat, pour s'afficher comme une reponse
// normale de HABY au lieu d'une erreur technique.
const reponseHaby = (texte: string) => json({ content: [{ text: texte }] });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { system, messages } = await req.json();
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return json({ error: "Cle API Gemini non configuree sur le serveur" }, 500);

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

    if (userId) {
      try {
        const { data: profil } = await service.from("users").select("plan, role").eq("id", userId).single();
        const illimite = profil?.plan === "premium" || profil?.role === "admin";
        if (!illimite) {
          const jour = new Date().toISOString().split("T")[0];
          const { data: usage, error: errUsage } = await service
            .from("haby_usage").select("nb").eq("user_id", userId).eq("jour", jour).maybeSingle();
          if (!errUsage) {
            const dejaPose = Number(usage?.nb) || 0;
            if (dejaPose >= QUOTA_GRATUIT_PAR_JOUR) {
              return reponseHaby(
                `Tu as pose tes ${QUOTA_GRATUIT_PAR_JOUR} questions du jour a HABY. ` +
                `Reviens demain, ou passe en Premium pour lui parler sans limite !`
              );
            }
            await service.from("haby_usage")
              .upsert({ user_id: userId, jour, nb: dejaPose + 1 }, { onConflict: "user_id,jour" });
          }
        }
      } catch { /* on laisse passer plutot que de bloquer HABY */ }
    }

    // Seuls les derniers echanges sont envoyes.
    const recents = (messages || []).slice(-MAX_MESSAGES_HISTORIQUE);
    const contents = recents.map((m: { role: string; content: string }) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    // Gemini EXIGE que la conversation commence par un tour "user". Or le premier message
    // affiche dans le chat est l'accueil de HABY (role "model") : envoye tel quel, il
    // faisait echouer TOUTE la conversation ("HABY a un souci technique"). On retire donc
    // les tours "model" en tete jusqu'a tomber sur une vraie question de la personne.
    while (contents.length && contents[0].role === "model") contents.shift();
    if (contents.length === 0) return reponseHaby("Pose-moi ta question et je te reponds !");

    const corpsGemini = JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { temperature: 0.6, maxOutputTokens: MAX_TOKENS_REPONSE, topP: 0.9 },
    });
    const urlGemini = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const res = await fetch(urlGemini, { method: "POST", headers: { "Content-Type": "application/json" }, body: corpsGemini });
    let data = await res.json();
    let reply = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "";

    // Un reessai unique en cas d'echec passager (surcharge momentanee de l'IA).
    if (!reply) {
      const res2 = await fetch(urlGemini, { method: "POST", headers: { "Content-Type": "application/json" }, body: corpsGemini });
      data = await res2.json();
      reply = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "";
    }

    // Toujours rien : on fait REMONTER la vraie raison (quota, blocage, etc.).
    if (!reply) {
      const raison = data?.error?.message
        || data?.promptFeedback?.blockReason
        || data?.candidates?.[0]?.finishReason
        || "reponse vide";
      return reponseHaby("HABY est momentanement indisponible. (detail : " + raison + ")");
    }

    return reponseHaby(reply);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
