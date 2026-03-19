// ---------------------------------------------------------------------------
// GardenOS – API: Scrape variety info from a web page
// ---------------------------------------------------------------------------
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { rateLimit } from "@/app/lib/rateLimit";

// Allowlist of trusted domains for scraping (SSRF protection)
const ALLOWED_DOMAINS = [
  "floradania.dk",
  "plantorama.dk",
  "blomsterlandet.dk",
  "bilka.dk",
  "bauhaus.dk",
  "silvan.dk",
  "jfrø.dk",
  "xn--jfr-0na.dk",
  "impecta.dk",
  "grantoftegaard.dk",
  "spirekassen.dk",
  "nykaalund.dk",
  "vikima.dk",
  "legeplanter.dk",
  "planter.dk",
  "froehandleren.dk",
  "wikipedia.org",
  "da.wikipedia.org",
];

function isDomainAllowed(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  return ALLOWED_DOMAINS.some((d) => h === d || h.endsWith("." + d));
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit: 10 scrapes per minute per user
    const rl = rateLimit(`${session.user.id}:scrape`, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "For mange forespørgsler. Vent et øjeblik." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
      );
    }

    const { url } = await request.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL er påkrævet" }, { status: 400 });
    }

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json({ error: "Ugyldig URL" }, { status: 400 });
    }

    // SSRF protection: only allow HTTPS and trusted domains
    if (parsedUrl.protocol !== "https:") {
      return NextResponse.json(
        { error: "Kun HTTPS-URL'er er tilladt." },
        { status: 400 },
      );
    }

    if (!isDomainAllowed(parsedUrl.hostname)) {
      return NextResponse.json(
        { error: "Denne hjemmeside er ikke på listen over tilladte kilder. Kontakt admin hvis den bør tilføjes." },
        { status: 403 },
      );
    }

    // Fetch the page
    const response = await fetch(parsedUrl.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "da-DK,da;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Kunne ikke hente siden (HTTP ${response.status})` },
        { status: 400 },
      );
    }

    const html = await response.text();
    const extracted = extractFromHtml(html, parsedUrl.toString());

    return NextResponse.json(extracted);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ukendt fejl";
    return NextResponse.json({ error: `Fejl ved scraping: ${message}` }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// HTML extraction helpers
// ---------------------------------------------------------------------------

function cleanHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractFromHtml(html: string, sourceUrl: string) {
  // --- Title / Name ---
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const ogTitleMatch = html.match(
    /<meta[^>]*property=["']og:title["'][^>]*content=["']([\s\S]*?)["']/i,
  );

  const name = cleanHtml(ogTitleMatch?.[1] ?? h1Match?.[1] ?? titleMatch?.[1] ?? "Ukendt sort");

  // --- Description ---
  const metaDescMatch = html.match(
    /<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i,
  );
  const ogDescMatch = html.match(
    /<meta[^>]*property=["']og:description["'][^>]*content=["']([\s\S]*?)["']/i,
  );
  const description = cleanHtml(ogDescMatch?.[1] ?? metaDescMatch?.[1] ?? "");

  // --- Image ---
  const ogImageMatch = html.match(
    /<meta[^>]*property=["']og:image["'][^>]*content=["']([\s\S]*?)["']/i,
  );
  const imageUrl = ogImageMatch?.[1] ?? undefined;

  // --- Try to extract growing data from text ---
  const bodyText = cleanHtml(html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, ""));

  // Days to harvest
  const daysMatch = bodyText.match(/(\d{2,3})\s*dage?\s*(til\s*høst|to\s*harvest|to\s*maturity)/i);
  const daysToHarvest = daysMatch ? parseInt(daysMatch[1], 10) : undefined;

  // Spacing
  const spacingMatch = bodyText.match(
    /(?:planteafstand|afstand|spacing)[:\s]*(\d{1,3})\s*cm/i,
  );
  const spacingCm = spacingMatch ? parseInt(spacingMatch[1], 10) : undefined;

  // Color
  const colorPatterns = [
    /(?:farve|color|colour)[:\s]*([a-zæøåA-ZÆØÅ]+(?:\s+[a-zæøåA-ZÆØÅ]+)?)/i,
  ];
  let color: string | undefined;
  for (const pattern of colorPatterns) {
    const m = bodyText.match(pattern);
    if (m) {
      color = m[1].trim();
      break;
    }
  }

  // Seed source (from domain)
  const domain = new URL(sourceUrl).hostname.replace(/^www\./, "");

  // --- JSON-LD structured data ---
  const jsonLdMatch = html.match(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  let structuredName: string | undefined;
  let structuredDesc: string | undefined;
  let structuredImage: string | undefined;

  if (jsonLdMatch) {
    try {
      const ld = JSON.parse(jsonLdMatch[1]);
      const item = Array.isArray(ld) ? ld[0] : ld;
      if (item?.name) structuredName = String(item.name);
      if (item?.description) structuredDesc = cleanHtml(String(item.description));
      if (item?.image) {
        const img = Array.isArray(item.image) ? item.image[0] : item.image;
        structuredImage = typeof img === "string" ? img : img?.url;
      }
    } catch {
      // ignore parse errors
    }
  }

  return {
    name: structuredName ?? name,
    description: structuredDesc ?? description,
    imageUrl: structuredImage ?? imageUrl,
    sourceUrl,
    daysToHarvest,
    spacingCm,
    color,
    seedSource: domain,
    addedVia: "scrape" as const,
  };
}
