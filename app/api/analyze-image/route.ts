// ---------------------------------------------------------------------------
// GardenOS – API: Analyze plant image (seed packet or plant photo)
// Uses OpenAI Vision API (gpt-4o) when OPENAI_API_KEY is configured.
// ---------------------------------------------------------------------------
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
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
        : `Du analyserer et billede af en plante i en have.
Identificér planten så præcist som muligt og returnér som JSON:
{
  "name": "Bedste bud på sortsnavn, eller 'Ukendt sort'",
  "speciesName": "Planteart på dansk (fx 'Tomat', 'Gulerod')",
  "description": "Beskrivelse af hvad du ser — størrelse, form, farve, tilstand",
  "color": "Farve på frugt/blad/blomst",
  "heightCm": <estimeret højde i cm, tal eller null>,
  "notes": "Andre observationer — sygdomstegn, modenhed, sortskendetegn"
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

    // Parse JSON from the response (may be wrapped in ```json ... ```)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Kunne ikke parse AI-svar", raw: content },
        { status: 500 },
      );
    }

    const extracted = JSON.parse(jsonMatch[0]);

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
