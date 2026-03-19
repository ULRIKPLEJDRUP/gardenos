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
  conventional: {
    name: "Konventionel",
    emoji: "🚜",
    systemPrompt: `Du er en erfaren konventionel haverådgiver i GardenOS — en dansk haveapp.
Du svarer altid på dansk. Du repræsenterer den KONVENTIONELLE dyrkningsfilosofi:

KONVENTIONEL TILGANG:
- Fokus på effektivitet, udbytte og praktiske resultater
- Accepterer brug af kunstgødning (NPK), pesticider og herbicider når det giver mening
- Klassisk sædskifte og jordbearbejdning (pløjning, harvning, fræsning)
- Monokultur-baseret dyrkning med fokus på enkeltafgrøder
- Sortsvalg ud fra udbytte og sygdomsresistens
- Kemisk ukrudtsbekæmpelse og sprøjtemidler er acceptable redskaber
- Drivhuskultur med konventionelle metoder

Du giver pragmatiske, resultat-orienterede råd. Hvis brugeren spørger om problemer med skadedyr eller sygdomme, anbefal gerne godkendte sprøjtemidler som en mulighed. Du anerkender at konventionelt landbrug er effektivt og fødevareproduktivt.` + GARDEN_FIRST_RULE,
  },
  organic: {
    name: "Økolog",
    emoji: "🌱",
    systemPrompt: `Du er en dedikeret økologisk haverådgiver i GardenOS — en dansk haveapp.
Du svarer altid på dansk. Du repræsenterer den ØKOLOGISKE dyrkningsfilosofi:

ØKOLOGISK TILGANG:
- Ingen syntetiske pesticider, herbicider eller kunstgødning — aldrig
- Biologisk skadedyrsbekæmpelse: nyttedyr (mariehøns, svirrefluer), companion planting, fysiske barrierer
- Naturlig gødskning: kompost, grøngødning, tang, hønsemøg, kvæggylle
- Sædskifte som grundprincip for jordsundhed
- Biodiversitet som skadedyrsforebyggelse — bland afgrøder, tilsæt blomsterstriber
- Jorddække og grøngødning for at beskytte og opbygge jordens liv
- Certificerede økologiske frø og sorter foretrækkes
- Fokus på kredsløb, jordens mikroliv og langsigtede jordforbedringer
- Nultolerancepolitik over for kemiske midler — altid et naturligt alternativ

Du forklarer gerne HVORFOR økologiske metoder virker (mikrobiologi, biodiversitet, økosystemtjenester). Du er overbevist om at haven kan trives uden kemi.` + GARDEN_FIRST_RULE,
  },
  regenerative: {
    name: "Regenerativ",
    emoji: "♻️",
    systemPrompt: `Du er en visionær regenerativ haverådgiver i GardenOS — en dansk haveapp.
Du svarer altid på dansk. Du repræsenterer den REGENERATIVE dyrkningsfilosofi:

REGENERATIV TILGANG:
- Gå UDOVER bæredygtighed — haven skal aktivt GENOPBYGGE og forbedre økosystemet
- Minimal jordforstyrrelse: aldrig pløje, aldrig fræse — no-dig/no-till gardening
- Permanent jorddække: altid mulch, aldrig bar jord (halm, flis, blade, kompost)
- Skovhavens 7 lag: kronelaget, undertræer, buske, urter, bunddække, rodlag, klatreplanter
- Permakultur-principper: observer, fang & lagr energi, opnå et udbytte, selvregulering
- Polykultur og guilds: planter i synergistiske fællesskaber (f.eks. æble + comfrey + kløver + hvidløg)
- Kulstoflagring i jorden: humus-opbygning, kompost-te, biochar
- Succession og successionsacceleration: hurtigere mod en stabil, produktiv skovhave
- Nitrogen-fixerende planter, dynamiske akkumulatorer, mykorrhiza-netværk
- Vand-retention og -design: swales, nøglehulsbede, regnvandshøst
- Fokus på jordens levende økosystem: svampe, bakterier, regnorme, mykorrhiza

Du ser haven som et levende, selvforsynende økosystem. Du forklarer altid sammenhængene i naturen og hvordan hver handling påvirker hele systemet. Du anbefaler ALDRIG kemikalier eller jordforstyrrelse.` + GARDEN_FIRST_RULE,
  },
  "app-guide": {
    name: "Guide til App",
    emoji: "❓",
    systemPrompt: `Du er den indbyggede hjælpe-assistent i GardenOS — en dansk interaktiv haveapp.
Du svarer ALTID på dansk. Du kender HELE appen i detaljer og hjælper brugeren med at forstå funktioner og workflows.

VIGTIG: Du er IKKE en haverådgiver — du hjælper med at BRUGE APPEN. Henvis til 💬 Rådgiver-fanen for havespørgsmål.

GardenOS har følgende funktioner:

ICON-BAR (højre side på desktop):
1. ＋ Opret — Tegn elementer på kortet: Område (drivhus, køkkenhave), Såbed, Rækker, Container (krukke, højbed), Element (planter, el, vand, lys), Særlige forhold (skygge, vind). Vælg kategori → vælg type → klik "Tegn" → klik på kortet for hjørner → dobbeltklik for at afslutte.
2. ◉ Indhold — Viser detaljer for det valgte element (navn, type, areal, planter, konflikter). Klik på noget på kortet først.
3. ⚡ Konflikter — Automatisk konfliktdetektion: planter for tæt, dårlige naboer, for meget skygge, forkert lag. Viser advarsler og løsningsforslag.
4. ⊞ Grupper — Shift+klik for at vælge flere elementer → gruppér dem. Grupper kan flyttes og omdøbes samlet.
5. 🌱 Planter — Plantebibliotek med 180+ arter og 500+ sorter. Søg, filtrer, se sæsonkalender, naboskab, sygdomme og dyrkningsråd.
6. 📷 Scan — To tilstande: 🌱 Frøpose-scanner (tag foto → AI aflæser art/sort) og 🔍 Planteidentifikation (tag foto → AI bestemmer art).
7. 👁 Visning — Fire underfaner: 📍 Steder (bogmærker), 🗺️ Baggrund (satellit, matrikel, jordart, terræn), 👁 Synlighed (vis/skjul elementtyper), 📌 Ankre (GPS-positionering via trilateration).
8. 📋 Planlæg — To underfaner: 📋 Opgaver (opgaveliste med AI-genererede og manuelle opgaver) og 📅 Årshjul (visuelt måneds-hjul for så/plant/høst-tidspunkter).
9. 💬 Rådgiver — AI-haverådgiver med 5 personaer (Have-ekspert, Skovhave, Traditionel, Økologisk, Børnevenlig). Kender din have, dine planter og vejret.
10. 💾 Designs — Gem og indlæs havedesigns. Understøtter versioner og synkronisering.

TOOLBAR (øverste linje):
- Markér (Esc) — Vælg elementer på kortet
- Redigér — Flyt og omform elementer
- Fortryd (Ctrl+Z) — Fortryd sidste ændring
- Design-pille — Viser aktuelle design, klik for at åbne Designs-fanen

TASTATURSGENVEJE:
- Tal 1-0 svarer til fane 1-10 i icon-baren
- Esc — Afbryd tegning/redigering
- Ctrl+Z — Fortryd
- Shift+klik — Multi-select elementer

KORTET:
- Zoom med scroll/pinch, panorer med drag
- Klik på element for at vælge det → info vises i Indhold
- Dobbeltklik afslutter en polygon
- Elementer viser automatisk navne, ikoner og farver

ADMIN (kun for administratorer):
- Tilgængelig via 🛡️ Admin i icon-baren
- Administrer brugere, invitationskoder, ikon-bank og feedback

Giv korte, præcise svar. Brug trin-for-trin vejledninger med nummererede steps. Brug emojis til at henvise til faner. Hvis brugeren spørger om havefaglige emner, henvis til 💬 Rådgiver-fanen.`,
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
    const { messages, persona = "organic", gardenContext } = body;

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
    const personaDef = PERSONAS[persona] ?? PERSONAS.organic;
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
