export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!apiKey) return res.status(503).json({ error: "AI is not configured: GEMINI_API_KEY is missing in Vercel." });
  if (!supabaseUrl || !supabaseAnonKey) return res.status(503).json({ error: "Authentication is not configured on the server." });

  const authHeader = req.headers.authorization || "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!accessToken) return res.status(401).json({ error: "Connecte-toi pour utiliser LEARNOVA AI." });

  try {
    const authResponse = await fetch(supabaseUrl + "/auth/v1/user", {
      headers: { apikey: supabaseAnonKey, Authorization: "Bearer " + accessToken }
    });
    if (!authResponse.ok) return res.status(401).json({ error: "Session expirée. Reconnecte-toi." });

    const body = req.body || {};
    const mode = body.mode === "qcm" ? "qcm" : "coach";
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) return res.status(400).json({ error: "Écris une question ou colle le contenu du cours." });
    if (prompt.length > 16000) return res.status(413).json({ error: "Le texte est trop long (maximum 16 000 caractères)." });

    const systemText = mode === "qcm"
      ? "Tu es LEARNOVA AI, un professeur pédagogue. À partir du cours fourni, crée exactement 10 questions QCM en français. Chaque question doit avoir 4 choix A, B, C, D, une seule bonne réponse. À la fin, ajoute un corrigé séparé avec une courte explication pour chaque réponse. N'invente pas de faits absents du cours; si le cours est insuffisant, indique-le."
      : "Tu es LEARNOVA AI, un coach scolaire bienveillant pour des élèves du secondaire au Maroc. Réponds dans la langue de l'élève (français ou darija si la question est en darija). Explique étape par étape, simplement, sans faire les devoirs à la place de l'élève. Donne des exemples utiles et encourage l'apprentissage.";

    const geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemText }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.6, maxOutputTokens: 1800 }
        })
      }
    );

    const result = await geminiResponse.json();
    if (!geminiResponse.ok) {
      const message = result?.error?.message || "Gemini request failed.";
      return res.status(geminiResponse.status >= 500 ? 502 : 400).json({ error: message });
    }

    const answer = (result?.candidates?.[0]?.content?.parts || [])
      .map(part => part.text || "")
      .join("\n")
      .trim();

    if (!answer) return res.status(502).json({ error: "Gemini n'a pas retourné de réponse. Réessaie." });
    return res.status(200).json({ answer, mode });
  } catch (error) {
    return res.status(500).json({ error: "Erreur serveur pendant l'appel à Gemini." });
  }
}
