// ---------------------------------------------------------------------------
// GardenOS – API: Generate custom plant/garden icon via DALL·E
// ---------------------------------------------------------------------------
// POST /api/generate-icon
// Body: { prompt: string, image?: string (base64 data-url) }
// Returns: { icon: string (base64 data-url of generated PNG icon) }
// ---------------------------------------------------------------------------
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY er ikke konfigureret.", needsConfig: true },
        { status: 503 },
      );
    }

    const body = await request.json();
    const { prompt, image } = body as { prompt?: string; image?: string };

    if (!prompt?.trim() && !image) {
      return NextResponse.json(
        { error: "Angiv en beskrivelse eller upload et billede." },
        { status: 400 },
      );
    }

    // ── Step 1: If image provided, use GPT-4o to describe the plant ──
    let plantDescription = prompt?.trim() || "";

    if (image) {
      const imageUrl = image.startsWith("data:")
        ? image
        : `data:image/jpeg;base64,${image}`;

      const visionRes = await fetch(
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
                  {
                    type: "text",
                    text: `Du er en botaniker. Beskriv denne plante KORT på engelsk (max 15 ord) så den kan bruges som en billedprompt til at lave et lille simpelt ikon. Fokuser på: plantens form, farve, og mest markante træk. Svar KUN med beskrivelsen, intet andet.${
                      plantDescription
                        ? `\n\nBrugerens egen beskrivelse: "${plantDescription}"`
                        : ""
                    }`,
                  },
                  { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
                ],
              },
            ],
            max_tokens: 60,
          }),
        },
      );

      if (visionRes.ok) {
        const visionData = await visionRes.json();
        const desc = visionData.choices?.[0]?.message?.content?.trim();
        if (desc) {
          plantDescription = desc;
        }
      }
    }

    // ── Step 2: Generate icon via DALL·E 3 ──
    const dallePrompt = `A tiny flat-design garden icon, 128x128 pixels, simple and cute, white background, minimal detail, bold outlines, emoji style. Subject: ${plantDescription || "a green garden plant"}. No text, no labels, centered, single object.`;

    const dalleRes = await fetch(
      "https://api.openai.com/v1/images/generations",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "dall-e-3",
          prompt: dallePrompt,
          n: 1,
          size: "1024x1024",
          quality: "standard",
          response_format: "b64_json",
        }),
      },
    );

    if (!dalleRes.ok) {
      const errData = await dalleRes.json().catch(() => ({}));
      console.error("DALL·E error:", errData);
      return NextResponse.json(
        { error: errData?.error?.message || "Kunne ikke generere ikon." },
        { status: 500 },
      );
    }

    const dalleData = await dalleRes.json();
    const b64 = dalleData.data?.[0]?.b64_json;

    if (!b64) {
      return NextResponse.json(
        { error: "Intet billede returneret fra DALL·E." },
        { status: 500 },
      );
    }

    const iconDataUrl = `data:image/png;base64,${b64}`;

    return NextResponse.json({
      icon: iconDataUrl,
      description: plantDescription,
    });
  } catch (err) {
    console.error("generate-icon error:", err);
    return NextResponse.json(
      { error: "Der opstod en fejl. Prøv igen." },
      { status: 500 },
    );
  }
}
