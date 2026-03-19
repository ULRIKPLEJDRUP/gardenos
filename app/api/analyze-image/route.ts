// ---------------------------------------------------------------------------
// GardenOS – API: Analyze plant image (seed packet or plant photo)
// Uses OpenAI Vision API (gpt-4o) when OPENAI_API_KEY is configured.
// ---------------------------------------------------------------------------
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { rateLimit } from "@/app/lib/rateLimit";

// Route segment config – allow large base64 image payloads & longer AI timeout
export const maxDuration = 60; // seconds (Vercel Pro: up to 300)
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit: 10 image analyses per minute per user
    const rl = rateLimit(`${session.user.id}:analyze-image`, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "For mange billedanalyser. Vent et øjeblik." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
      );
    }

    const { image, type } = await request.json();

    if (!image || typeof image !== "string") {
      return NextResponse.json(
        { error: "Billede er påkrævet (base64 data-URL)" },
        { status: 400 },
      );
    }

    const analysisType: "seed-packet" | "plant-photo" =
      type === "plant-photo" ? "plant-photo" : "seed-packet";

    // Check for OpenAI API key
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "OPENAI_API_KEY er ikke konfigureret. Tilføj den i .env.local for at aktivere billedgenkendelse.",
          needsConfig: true,
        },
        { status: 503 },
      );
    }

    // Build prompt based on analysis type
    const prompt =
      analysisType === "seed-packet"
        ? `Du analyserer et billede af en frøpose eller et plantelabel fra en have/frøforretning.
Udtræk al synlig information og returnér som JSON med disse felter:
{
  "name": "Sortens navn (fx 'Nantes 2')",
  "speciesName": "Planteart på dansk (fx 'Gulerod')",
  "description": "Kort beskrivelse af sorten",
  "daysToHarvest": <antal dage til høst, tal eller null>,
  "taste": "Smagsprofil hvis nævnt",
  "color": "Farve",
  "sowStart": <såperiode start, månedsnummer 1-12 eller null>,
  "sowEnd": <såperiode slut, månedsnummer 1-12 eller null>,
  "harvestStart": <høstperiode start, månedsnummer 1-12 eller null>,
  "harvestEnd": <høstperiode slut, månedsnummer 1-12 eller null>,
  "seedSource": "Frøleverandør/mærke",
  "spacingCm": <planteafstand i cm, tal eller null>,
  "notes": "Evt. andre bemærkninger"
}
Returnér KUN valid JSON, ingen kommentarer eller forklaringer.`
        : `Du er en ekspert-botaniker og haveekspert. Du analyserer et foto af en plante taget i en dansk have.
Identificér planten så præcist som muligt — art, evt. sort, og vurder egenskaber.

Returnér JSON med disse felter:
{
  "speciesName": "Dansk artsnavn (fx 'Mælkebøtte', 'Tomat', 'Brændenælde')",
  "latinName": "Latinsk artsnavn (fx 'Taraxacum officinale')",
  "name": "Evt. specifik sort hvis genkendelig, ellers samme som speciesName",
  "description": "Kort beskrivelse af planten — hvad du ser, kendetegn, størrelse",
  "isWeed": <true/false — er det ukrudt i en have-kontekst?>,
  "isEdible": <true/false — er nogen del af planten spiselig?>,
  "isPoisonous": <true/false — er planten giftig for mennesker?>,
  "isInvasive": <true/false — er den invasiv i Danmark?>,
  "habitat": "Hvor planten typisk gror (fx 'Græsplæne, vejkant', 'Dyrket i køkkenhave')",
  "color": "Dominerende farve(r)",
  "heightCm": <estimeret højde i cm, tal eller null>,
  "careAdvice": "Kort plejeråd eller anbefaling — hvad bør haveejeren gøre? Fjerne? Beholde? Pleje?",
  "confidence": "Høj / Middel / Lav — din sikkerhed i identifikationen",
  "notes": "Andre observationer — sygdomstegn, modenhed, årstidskendetegn"
}
Returnér KUN valid JSON, ingen kommentarer eller forklaringer.`;

    const imageUrl = image.startsWith("data:")
      ? image
      : `data:image/jpeg;base64,${image}`;

    const openaiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: imageUrl } },
              ],
            },
          ],
          max_tokens: 1200,
          temperature: 0.2,
        }),
        signal: AbortSignal.timeout(30000),
      },
    );

    if (!openaiResponse.ok) {
      const errBody = await openaiResponse.text().catch(() => "");
      console.error("OpenAI API error:", openaiResponse.status, errBody);
      return NextResponse.json(
        { error: `OpenAI API-fejl (${openaiResponse.status}). Tjek din API-nøgle.` },
        { status: 500 },
      );
    }

    const openaiData = await openaiResponse.json();
    const content: string = openaiData.choices?.[0]?.message?.content ?? "";

    console.log("OpenAI raw response content:", content.slice(0, 500));

    // Parse JSON from the response (may be wrapped in ```json ... ```)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("No JSON found in AI response:", content);
      return NextResponse.json(
        { error: "Kunne ikke parse AI-svar", raw: content },
        { status: 500 },
      );
    }

    let extracted;
    try {
      extracted = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error("JSON parse error:", parseErr, "Raw match:", jsonMatch[0].slice(0, 300));
      return NextResponse.json(
        { error: "Kunne ikke parse AI-svar (ugyldig JSON)", raw: content },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ...extracted,
      addedVia: analysisType,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ukendt fejl";
    console.error("Image analysis error:", message);
    return NextResponse.json(
      { error: `Fejl ved billedanalyse: ${message}` },
      { status: 500 },
    );
  }
}
