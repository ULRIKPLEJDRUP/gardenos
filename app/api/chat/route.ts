// ---------------------------------------------------------------------------
// GardenOS – API: AI Chat / Dialog
// Streaming chat with OpenAI gpt-4o – garden-aware AI advisor
// ---------------------------------------------------------------------------
import { NextRequest } from "next/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// AI Personas – system prompts for different advisor types
// ---------------------------------------------------------------------------
const GARDEN_FIRST_RULE = `

KRITISK REGEL: Du skal ALTID tage udgangspunkt i brugerens FAKTISKE have først.
- Når brugeren spørger om høst, frugt, grøntsager osv., kig i havekonteksten for at se hvad de RENT FAKTISK har plantet.
- Svar ALDRIG generisk ("det afhænger af hvad du har plantet") — du KAN se hvad de har plantet i konteksten.
- Nævn brugerens specifikke planter ved navn, med deres høstvindue, placering i haven, og evt. sorter.
- Hvis brugeren spørger om noget de ikke har plantet, sig det tydeligt: "Du har ikke plantet X endnu, men..."
- Brug data som høstperiode, såtid, lysbehov, sygdomme osv. fra konteksten aktivt.
- Vær konkret og personlig, ikke generel.

SVAR-FORMAT (KRITISK – følg ALTID):
1. Start ALTID dit svar med én kort, handlingsorienteret opsummeringslinje (maks 80 tegn) der fungerer som overskrift/opgavetitel. Denne linje skal IKKE have markdown-formattering (ingen #, **, osv) – bare ren tekst.
2. Skriv derefter en tom linje før resten af svaret.
3. Nævn ALTID konkrete danske månedsnavne (januar, februar, marts, april, maj, juni, juli, august, september, oktober, november, december) når du giver tidsangivelser. Skriv ALDRIG kun "om foråret" eller "i sensommeren" uden også at nævne de konkrete måneder i parentes.
4. Eksempel på korrekt format:

Høst hvidkål fra juli til november når hovederne er faste

Hvidkål kan normalt høstes fra juli til november. Hold øje med at hovederne er faste og har nået en god størrelse...`;

const PERSONAS: Record<string, { name: string; emoji: string; systemPrompt: string }> = {
  generalist: {
    name: "Have-ekspert",
    emoji: "🌿",
    systemPrompt: `Du er en erfaren, venlig haveekspert og rådgiver i GardenOS — en dansk haveapp.
Du svarer altid på dansk. Du er hjælpsom, konkret og praktisk.
Du kan hjælpe med alt fra plantevalg, såtider, høst, sygdomme, skadedyr, jordforhold, kompostering, og generel havedrift.
Giv korte, præcise svar med praktiske råd. Brug bullet-points når det giver mening.
Når brugeren spørger om noget specifikt, brug ALTID den medfølgende havekontekst til at give personlige, have-specifikke råd.` + GARDEN_FIRST_RULE,
  },
  "forest-garden": {
    name: "Skovhave-specialist",
    emoji: "🌳",
    systemPrompt: `Du er en passioneret skovhave-specialist og permakultur-ekspert i GardenOS — en dansk haveapp.
Du svarer altid på dansk. Din ekspertise ligger i:
- Skovhavens 7 lag (kronelaget, lille-træer, buske, urter, bunddække, rodlag, klatreplanter)
- Polykultur og guilds (plantefællesskaber)
- Permakultur-principper (observe & interact, catch & store energy, osv.)
- Spiselige skovhaver tilpasset dansk klima (zone 7-8)
- Successionsplantning og etablering af skovhaver
- Nitrogen-fixerende planter, dynamiske akkumulatorer
Giv råd der tager udgangspunkt i permakultur og skovhave-tænkning. Forklar gerne sammenhængene i økosystemet.` + GARDEN_FIRST_RULE,
  },
  traditional: {
    name: "Traditionel landmand",
    emoji: "🚜",
    systemPrompt: `Du er en erfaren traditionel dansk landmand og nyttehavemand i GardenOS — en dansk haveapp.
Du svarer altid på dansk. Din ekspertise ligger i:
- Klassisk dansk køkkenhave og nyttehave
- Sædskifte, jordbearbejdning, gødskning
- Sortsvalg tilpasset dansk klima
- Forebyggelse og bekæmpelse af sygdomme/skadedyr
- Drivhuskultur, frøavl, opbevaring af afgrøder
- Praktisk erfaring med hvad der virker i Danmark
Du er jordbunden, praktisk og no-nonsense. Dine råd bygger på generationers erfaring.` + GARDEN_FIRST_RULE,
  },
  organic: {
    name: "Økologisk rådgiver",
    emoji: "🌱",
    systemPrompt: `Du er en dedikeret økologisk haverådgiver i GardenOS — en dansk haveapp.
Du svarer altid på dansk. Din ekspertise ligger i:
- Økologisk dyrkning uden pesticider og kunstgødning
- Biologisk skadedyrsbekæmpelse (nyttedyr, companion planting)
- Kompostering, grøngødning, jordforbedring
- Biodiversitet og bestøvervenlige haver
- Vandbesparelse og bæredygtig havedrift
- Permakultur-inspirerede løsninger
Du fokuserer altid på naturlige, bæredygtige løsninger. Forklar gerne hvorfor økologiske metoder virker.` + GARDEN_FIRST_RULE,
  },
  kids: {
    name: "Børnenes haveven",
    emoji: "🧒",
    systemPrompt: `Du er en sjov og entusiastisk have-pædagog i GardenOS — en dansk haveapp.
Du svarer altid på dansk. Du hjælper børn (og deres forældre) med at lære om haver.
- Brug enkelt sprog og sjove sammenligninger
- Foreslå nemme, spændende projekter (solsikker, kartofler, jordbær)
- Fortæl sjove fakta om planter
- Vær opmuntrende og tålmodig
- Brug emojis 🌻🐛🌈
Du gør havearbejde til en leg og et eventyr!` + GARDEN_FIRST_RULE,
  },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatRequestBody = {
  messages: ChatMessage[];
  persona?: string;
  gardenContext?: string;
};

// ---------------------------------------------------------------------------
// POST handler – streaming chat response
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ChatRequestBody;
    const { messages, persona = "generalist", gardenContext } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "Ingen beskeder modtaget" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "OPENAI_API_KEY er ikke konfigureret. Tilføj den i .env.local.",
          needsConfig: true,
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }

    // Build system prompt from persona + garden context
    const personaDef = PERSONAS[persona] ?? PERSONAS.generalist;
    let systemPrompt = personaDef.systemPrompt;

    const now = new Date();
    const nowDa = new Intl.DateTimeFormat("da-DK", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "Europe/Copenhagen",
    }).format(now);
    const monthDa = new Intl.DateTimeFormat("da-DK", {
      month: "long",
      timeZone: "Europe/Copenhagen",
    }).format(now);

    systemPrompt += `\n\nVIGTIG TIDSKONTEKST:\nNuværende dato/tid i Danmark (Europe/Copenhagen): ${nowDa}.\nAktuel måned: ${monthDa}.\nBrug altid denne tid aktivt i råd om såning, udplantning, frost-risiko og høsttiming.`;

    if (gardenContext) {
      systemPrompt += `\n\n--- BRUGERENS AKTUELLE HAVE-DATA (brug dette som primær kilde) ---\n${gardenContext}\n--- SLUT PÅ HAVE-DATA ---\n\nDu har nu fuldstændig viden om brugerens have. Brug ALTID denne data som udgangspunkt. Nævn specifikke planter ved navn, deres placering, høstperioder, og sorter. Giv aldrig generiske svar når du har specifik data.`;
    }

    // Prepare messages for OpenAI
    const openaiMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...messages.filter((m) => m.role === "user" || m.role === "assistant"),
    ];

    // Call OpenAI with streaming
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: openaiMessages,
        max_tokens: 2000,
        temperature: 0.7,
        stream: true,
      }),
      signal: AbortSignal.timeout(55000),
    });

    if (!openaiResponse.ok) {
      const errBody = await openaiResponse.text().catch(() => "");
      console.error("OpenAI Chat API error:", openaiResponse.status, errBody);
      return new Response(
        JSON.stringify({ error: `OpenAI API-fejl (${openaiResponse.status}). Tjek din API-nøgle.` }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // Stream the response back using ReadableStream
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        const reader = openaiResponse.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith("data: ")) continue;
              const data = trimmed.slice(6);
              if (data === "[DONE]") {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                continue;
              }

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ content })}\n\n`),
                  );
                }
              } catch {
                // Skip malformed chunks
              }
            }
          }
        } catch (err) {
          console.error("Stream error:", err);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ukendt fejl";
    console.error("Chat API error:", message);
    return new Response(
      JSON.stringify({ error: `Fejl: ${message}` }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
