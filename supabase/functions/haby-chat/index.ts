// Edge Function Supabase : proxy securise vers l'API Gemini (Google) - GRATUIT
// La cle API reste cote serveur, jamais exposee au navigateur

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const { system, messages } = await req.json();
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Cle API Gemini non configuree sur le serveur" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Conversion du format Anthropic (role: user/assistant) vers le format Gemini (role: user/model)
    const contents = (messages || []).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents,
          generationConfig: { temperature: 0.6, maxOutputTokens: 500, topP: 0.9 },
        }),
      }
    );
    const data = await res.json();
    const reply = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    if (!reply && data.error) {
      return new Response(JSON.stringify({ content: [{ text: "HABY a un souci technique, reessaie dans un instant." }] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // On reformate la reponse pour rester compatible avec le code du chat HABY, sans rien changer cote App.jsx
    return new Response(JSON.stringify({ content: [{ text: reply || "Desole, reessaie !" }] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
