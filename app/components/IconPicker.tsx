"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// GardenOS – Ikon-vælger v2  (Emoji Icon Picker)
// ---------------------------------------------------------------------------
// A polished, two-tab icon picker:
//   📦 Pakke   – curated garden-relevant emoji, categorised
//   🔎 Søg alle emoji – search across 600+ extended emoji catalogue
// ---------------------------------------------------------------------------

type IconCategory = {
  label: string;
  emoji: string;
  items: { emoji: string; keywords: string }[];
};

const ICON_CATEGORIES: IconCategory[] = [
  {
    label: "Grøntsager",
    emoji: "🥕",
    items: [
      { emoji: "🥕", keywords: "gulerod carrot rodfrugt" },
      { emoji: "🥔", keywords: "kartoffel potato" },
      { emoji: "🍠", keywords: "sød kartoffel sweet potato" },
      { emoji: "🥒", keywords: "agurk cucumber" },
      { emoji: "🍅", keywords: "tomat tomato" },
      { emoji: "🌽", keywords: "majs corn sukkermajs" },
      { emoji: "🥬", keywords: "salat lettuce kål grønkål spinat bladgrønt" },
      { emoji: "🥦", keywords: "broccoli kål" },
      { emoji: "🧅", keywords: "løg onion rødløg" },
      { emoji: "🧄", keywords: "hvidløg garlic" },
      { emoji: "🌶️", keywords: "chili pepper stærk" },
      { emoji: "🫑", keywords: "peberfrugt pepper paprika" },
      { emoji: "🫛", keywords: "ært pea bælgfrugt sugar snap" },
      { emoji: "🫘", keywords: "bønne bean hestebønne" },
      { emoji: "🍆", keywords: "aubergine eggplant" },
      { emoji: "🎃", keywords: "græskar pumpkin squash" },
      { emoji: "🥜", keywords: "jordnød peanut" },
      { emoji: "🌰", keywords: "nød kastanje chestnut" },
      { emoji: "🍄", keywords: "svamp champignon mushroom" },
      { emoji: "🫚", keywords: "ingefær ginger rod" },
      { emoji: "🫒", keywords: "oliven olive" },
      { emoji: "🥗", keywords: "salat bowl blandet" },
      { emoji: "🌱", keywords: "spire seedling mikrogrønt" },
      { emoji: "🌾", keywords: "korn hvede rug byg grain" },
    ],
  },
  {
    label: "Frugt & bær",
    emoji: "🍎",
    items: [
      { emoji: "🍎", keywords: "æble apple rød" },
      { emoji: "🍏", keywords: "æble apple grøn" },
      { emoji: "🍐", keywords: "pære pear" },
      { emoji: "🍊", keywords: "appelsin orange mandarin" },
      { emoji: "🍋", keywords: "citron lemon" },
      { emoji: "🍋‍🟩", keywords: "lime grøn citrus" },
      { emoji: "🍌", keywords: "banan banana" },
      { emoji: "🍇", keywords: "drue grape vin vindrue" },
      { emoji: "🍓", keywords: "jordbær strawberry" },
      { emoji: "🫐", keywords: "blåbær blueberry" },
      { emoji: "🍒", keywords: "kirsebær cherry" },
      { emoji: "🍑", keywords: "fersken peach nektarin" },
      { emoji: "🥝", keywords: "kiwi" },
      { emoji: "🍈", keywords: "melon cantaloupe honningmelon" },
      { emoji: "🍉", keywords: "vandmelon watermelon" },
      { emoji: "🥭", keywords: "mango" },
      { emoji: "🥥", keywords: "kokosnød coconut" },
      { emoji: "🫙", keywords: "syltetøj preserve glas" },
    ],
  },
  {
    label: "Planter & blomster",
    emoji: "🌸",
    items: [
      { emoji: "🌱", keywords: "plante spire seedling" },
      { emoji: "🌿", keywords: "urt urter herb persille dild" },
      { emoji: "☘️", keywords: "kløver shamrock" },
      { emoji: "🍀", keywords: "firkløver lucky clover" },
      { emoji: "🪴", keywords: "potteplante potted stueplante" },
      { emoji: "🌷", keywords: "tulipan tulip blomst forår" },
      { emoji: "🌸", keywords: "kirsebærblomst cherry blossom" },
      { emoji: "🌹", keywords: "rose rød" },
      { emoji: "🌺", keywords: "hibiscus blomst" },
      { emoji: "🌻", keywords: "solsikke sunflower" },
      { emoji: "🌼", keywords: "blomst flower gul" },
      { emoji: "💐", keywords: "buket bouquet" },
      { emoji: "🪻", keywords: "hyacint lavendel blomst lilla" },
      { emoji: "🪷", keywords: "lotus åkande" },
      { emoji: "🌾", keywords: "korn hvede grain aks" },
      { emoji: "🌵", keywords: "kaktus cactus" },
      { emoji: "🍃", keywords: "blad leaf vind grøn" },
      { emoji: "🍂", keywords: "blade leaves efterår" },
      { emoji: "🍁", keywords: "løn maple ahorn" },
      { emoji: "🍄", keywords: "svamp champignon mushroom" },
      { emoji: "🪺", keywords: "rede fuglerede nest" },
      { emoji: "🪸", keywords: "koral reef" },
    ],
  },
  {
    label: "Træer & buske",
    emoji: "🌳",
    items: [
      { emoji: "🌳", keywords: "træ tree løvtræ eg bøg" },
      { emoji: "🌲", keywords: "nåletræ gran pine fyr" },
      { emoji: "🌴", keywords: "palme palm" },
      { emoji: "🎋", keywords: "bambus bamboo" },
      { emoji: "🎍", keywords: "gran fyr nytår pine" },
      { emoji: "🪵", keywords: "træstamme brænde log wood" },
      { emoji: "🪨", keywords: "sten rock boulder" },
      { emoji: "🍎", keywords: "æbletræ apple tree frugttræ" },
      { emoji: "🍐", keywords: "pæretræ pear tree frugttræ" },
      { emoji: "🍒", keywords: "kirsebærtræ cherry tree" },
      { emoji: "🍑", keywords: "ferskentræ peach tree" },
      { emoji: "🫐", keywords: "blåbærbusk blueberry bush" },
      { emoji: "🍇", keywords: "vinranke grape vine" },
      { emoji: "🍓", keywords: "jordbærbusk strawberry" },
      { emoji: "🌹", keywords: "rosenbusk rose bush" },
      { emoji: "🪻", keywords: "lavendelbusk lavender" },
      { emoji: "🌿", keywords: "busk hæk hedge bush" },
    ],
  },
  {
    label: "Vand & rør",
    emoji: "💧",
    items: [
      { emoji: "💧", keywords: "vand dråbe water drop" },
      { emoji: "💦", keywords: "sprøjt splash vanding" },
      { emoji: "🔵", keywords: "blå cirkel rør pipe" },
      { emoji: "🟢", keywords: "grøn cirkel slange hose" },
      { emoji: "🚰", keywords: "vandhane tap tappehane" },
      { emoji: "⛲", keywords: "springvand fountain sprinkler" },
      { emoji: "🪣", keywords: "spand tønde bucket barrel" },
      { emoji: "⏱️", keywords: "timer ur vandtimer" },
      { emoji: "🌊", keywords: "bølge wave" },
      { emoji: "❄️", keywords: "is frost sne" },
      { emoji: "🧊", keywords: "isterning ice" },
      { emoji: "🔷", keywords: "blå diamant vandmærke" },
    ],
  },
  {
    label: "El & ledning",
    emoji: "⚡",
    items: [
      { emoji: "⚡", keywords: "lyn el elektricitet lightning" },
      { emoji: "🔌", keywords: "stik plug kabel cable stikkontakt" },
      { emoji: "🔲", keywords: "kontakt outlet stikkontakt" },
      { emoji: "📦", keywords: "boks samledåse junction" },
      { emoji: "🔳", keywords: "tavle panel" },
      { emoji: "☀️", keywords: "sol solcelle solar" },
      { emoji: "🔋", keywords: "batteri battery" },
      { emoji: "🪫", keywords: "lavt batteri low battery" },
      { emoji: "⚙️", keywords: "gear tandhjul mekanik" },
      { emoji: "🔧", keywords: "værktøj tool skruenøgle" },
      { emoji: "🔩", keywords: "bolt nut skrue" },
      { emoji: "〰️", keywords: "kabel wire ledning" },
    ],
  },
  {
    label: "Lamper & lys",
    emoji: "💡",
    items: [
      { emoji: "💡", keywords: "pære lampe bulb light" },
      { emoji: "🔦", keywords: "lommelygte spot flashlight" },
      { emoji: "🏮", keywords: "lanterne lampe lantern" },
      { emoji: "✨", keywords: "glimmer sparkle lyskæde" },
      { emoji: "🌟", keywords: "stjerne star projektør" },
      { emoji: "⭐", keywords: "stjerne star" },
      { emoji: "🌞", keywords: "sol solcelle sun" },
      { emoji: "🕯️", keywords: "stearinlys candle" },
      { emoji: "🔋", keywords: "batteri battery" },
      { emoji: "🛤️", keywords: "sti vej path" },
      { emoji: "🪔", keywords: "olielampe oil lamp" },
    ],
  },
  {
    label: "Bygning & have",
    emoji: "🏡",
    items: [
      { emoji: "🏡", keywords: "hus have garden home" },
      { emoji: "🏠", keywords: "hus house" },
      { emoji: "🏚️", keywords: "skur shed" },
      { emoji: "🏗️", keywords: "byggeri construction" },
      { emoji: "🧱", keywords: "mur mursten brick" },
      { emoji: "🪵", keywords: "træstamme log" },
      { emoji: "🪨", keywords: "sten rock" },
      { emoji: "⛏️", keywords: "hakke pickaxe" },
      { emoji: "🪚", keywords: "sav saw" },
      { emoji: "🛠️", keywords: "værktøj tools" },
      { emoji: "🚿", keywords: "bruser shower" },
      { emoji: "🧹", keywords: "kost broom" },
      { emoji: "🪜", keywords: "stige ladder" },
      { emoji: "🚪", keywords: "dør door" },
      { emoji: "🪟", keywords: "vindue window" },
      { emoji: "🏕️", keywords: "telt camping" },
    ],
  },
  {
    label: "Krydderurter",
    emoji: "🌿",
    items: [
      { emoji: "🌿", keywords: "persille dild urt herb" },
      { emoji: "🫚", keywords: "ingefær ginger" },
      { emoji: "🫂", keywords: "oliven olive" },
      { emoji: "🌶️", keywords: "chili pepper" },
      { emoji: "🧂", keywords: "salt krydderi" },
      { emoji: "🦫", keywords: "timian oregano" },
      { emoji: "🥬", keywords: "basilikum spinat grøn" },
      { emoji: "☕", keywords: "te kaffe mint" },
      { emoji: "🍵", keywords: "te urtete kamillete" },
      { emoji: "🌾", keywords: "korn kommen karve" },
      { emoji: "🍋", keywords: "citronmelisse citrongræs" },
      { emoji: "💜", keywords: "lavendel violet" },
    ],
  },
  {
    label: "Have-redskaber",
    emoji: "🪓",
    items: [
      { emoji: "🪓", keywords: "skovl shovel" },
      { emoji: "🧹", keywords: "kost rive broom" },
      { emoji: "✂️", keywords: "saks beskæringssaks" },
      { emoji: "🪜", keywords: "stige ladder" },
      { emoji: "🪣", keywords: "spand bucket" },
      { emoji: "🛠️", keywords: "værktøj tools" },
      { emoji: "🔧", keywords: "skruenøgle wrench" },
      { emoji: "🧴", keywords: "handske glove" },
      { emoji: "👢", keywords: "støvle boot" },
      { emoji: "🧱", keywords: "mursten sten brick" },
      { emoji: "🛋️", keywords: "bænk sofa" },
      { emoji: "🅿️", keywords: "parkering skilt" },
    ],
  },
  {
    label: "Vejr & klima",
    emoji: "☀️",
    items: [
      { emoji: "☀️", keywords: "sol sun" },
      { emoji: "⛅", keywords: "delvist skyet partly cloudy" },
      { emoji: "☁️", keywords: "sky cloud" },
      { emoji: "🌧️", keywords: "regn rain" },
      { emoji: "⛈️", keywords: "tordenvejr storm" },
      { emoji: "❄️", keywords: "sne frost snow" },
      { emoji: "🌬️", keywords: "vind wind" },
      { emoji: "🌡️", keywords: "termometer temperatur" },
      { emoji: "🌈", keywords: "regnbue rainbow" },
      { emoji: "🌞", keywords: "solskin sunshine" },
      { emoji: "💧", keywords: "regndråbe vanddråbe" },
      { emoji: "🌫️", keywords: "tåge fog" },
    ],
  },
  {
    label: "Dyr & insekter",
    emoji: "🐝",
    items: [
      { emoji: "🐝", keywords: "bi bee honning" },
      { emoji: "🦋", keywords: "sommerfugl butterfly" },
      { emoji: "🐛", keywords: "larve caterpillar" },
      { emoji: "🐌", keywords: "snegl snail" },
      { emoji: "🪱", keywords: "orm worm" },
      { emoji: "🐞", keywords: "mariehøne ladybug" },
      { emoji: "🐜", keywords: "myre ant" },
      { emoji: "🐦", keywords: "fugl bird" },
      { emoji: "🐔", keywords: "høne hen kylling" },
      { emoji: "🐰", keywords: "kanin rabbit" },
      { emoji: "🦔", keywords: "pindsvin hedgehog" },
      { emoji: "🐸", keywords: "frø frog" },
    ],
  },
  {
    label: "Symboler",
    emoji: "📌",
    items: [
      { emoji: "📌", keywords: "pin nål mark" },
      { emoji: "📍", keywords: "lokation location sted" },
      { emoji: "🏷️", keywords: "mærke label tag" },
      { emoji: "⚠️", keywords: "advarsel warning" },
      { emoji: "❗", keywords: "vigtigt important" },
      { emoji: "✅", keywords: "tjek check ok" },
      { emoji: "❌", keywords: "kryds cross fejl" },
      { emoji: "🔴", keywords: "rød cirkel red" },
      { emoji: "🟠", keywords: "orange cirkel" },
      { emoji: "🟡", keywords: "gul cirkel yellow" },
      { emoji: "🟢", keywords: "grøn cirkel green" },
      { emoji: "🔵", keywords: "blå cirkel blue" },
      { emoji: "🟣", keywords: "lilla cirkel purple" },
      { emoji: "🟤", keywords: "brun cirkel brown" },
      { emoji: "⚪", keywords: "hvid cirkel white" },
      { emoji: "⚫", keywords: "sort cirkel black" },
      { emoji: "🔶", keywords: "orange diamant" },
      { emoji: "🔷", keywords: "blå diamant" },
      { emoji: "❤️", keywords: "hjerte heart rød" },
      { emoji: "💚", keywords: "hjerte heart grøn" },
      { emoji: "💙", keywords: "hjerte heart blå" },
      { emoji: "💛", keywords: "hjerte heart gul" },
      { emoji: "🔔", keywords: "klokke bell" },
      { emoji: "🎯", keywords: "mål target" },
      { emoji: "🚩", keywords: "flag markering" },
      { emoji: "♻️", keywords: "genbrug recycle" },
    ],
  },
];

const ALL_EMOJIS = ICON_CATEGORIES.flatMap((c) =>
  c.items.map((i) => ({ ...i, category: c.label })),
);

// ---------------------------------------------------------------------------
// Online search result type
// ---------------------------------------------------------------------------
type OnlineEmoji = { emoji: string; name: string; group: string; subGroup: string };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type IconPickerProps = {
  value: string;
  onChange: (emoji: string) => void;
  /** Label of the kind – e.g. "Stikkontakt" */
  kindLabel?: string;
  /** How many existing elements will be affected */
  kindCount?: number;
  onSetKindDefault?: (emoji: string) => void;
  compact?: boolean;
};

export default function IconPicker({
  value,
  onChange,
  kindLabel,
  kindCount,
  onSetKindDefault,
  compact,
}: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"local" | "online" | "generate">("local");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState(0);
  const [customInput, setCustomInput] = useState("");
  const [showDefaultConfirm, setShowDefaultConfirm] = useState(false);

  // Online search
  const [onlineQuery, setOnlineQuery] = useState("");
  const [onlineResults, setOnlineResults] = useState<OnlineEmoji[]>([]);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [onlineError, setOnlineError] = useState("");
  const onlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AI icon generator
  const [genPrompt, setGenPrompt] = useState("");
  const [genImage, setGenImage] = useState<string | null>(null);
  const [genImagePreview, setGenImagePreview] = useState<string | null>(null);
  const [genLoading, setGenLoading] = useState(false);
  const [genResult, setGenResult] = useState<string | null>(null);
  const [genError, setGenError] = useState("");
  const genFileRef = useRef<HTMLInputElement>(null);

  const handleGenImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setGenImage(result);
      setGenImagePreview(result);
    };
    reader.readAsDataURL(file);
  };

  const generateIcon = async () => {
    if (!genPrompt.trim() && !genImage) return;
    setGenLoading(true);
    setGenError("");
    setGenResult(null);
    try {
      const res = await fetch("/api/generate-icon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: genPrompt.trim(),
          image: genImage || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.icon) {
        setGenResult(data.icon);
      } else {
        setGenError(data.error || "Kunne ikke generere ikon");
      }
    } catch {
      setGenError("Netv\u00e6rksfejl \u2013 pr\u00f8v igen");
    }
    setGenLoading(false);
  };

  // Debounced online search
  useEffect(() => {
    if (tab !== "online" || !onlineQuery.trim() || onlineQuery.trim().length < 2) {
      setOnlineResults([]);
      return;
    }
    if (onlineTimerRef.current) clearTimeout(onlineTimerRef.current);
    onlineTimerRef.current = setTimeout(async () => {
      setOnlineLoading(true);
      setOnlineError("");
      try {
        const res = await fetch(`/api/emoji-search?q=${encodeURIComponent(onlineQuery.trim())}`);
        const data = await res.json();
        if (data.results) {
          setOnlineResults(data.results);
        }
        if (data.error) setOnlineError(data.error);
      } catch {
        setOnlineError("Kunne ikke søge – prøv igen");
      } finally {
        setOnlineLoading(false);
      }
    }, 350);
    return () => { if (onlineTimerRef.current) clearTimeout(onlineTimerRef.current); };
  }, [onlineQuery, tab]);

  const localFiltered = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.trim().toLowerCase();
    return ALL_EMOJIS.filter(
      (e) => e.keywords.toLowerCase().includes(q) || e.emoji.includes(q),
    );
  }, [search]);

  const pick = useCallback(
    (emoji: string) => {
      onChange(emoji);
      setOpen(false);
      setSearch("");
      setOnlineQuery("");
      setShowDefaultConfirm(false);
    },
    [onChange],
  );

  // ── Closed state: inline preview button ──
  if (!open) {
    return (
      <button
        type="button"
        className={
          compact
            ? "group inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm hover:bg-foreground/5 active:scale-95 transition-all"
            : "group inline-flex items-center gap-2.5 rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm shadow-sm hover:shadow-md hover:border-accent/30 active:scale-[0.98] transition-all"
        }
        onClick={() => setOpen(true)}
        title="Vælg ikon"
      >
        {value?.startsWith("data:image/") ? (
          <img
            src={value}
            alt="ikon"
            className="w-7 h-7 rounded object-contain transition-transform group-hover:scale-110"
          />
        ) : (
          <span
            className={`leading-none transition-transform group-hover:scale-110 ${
              value ? "text-2xl" : "text-xl opacity-30"
            }`}
          >
            {value || "⬜"}
          </span>
        )}
        <span className="text-xs text-foreground/50 group-hover:text-foreground/70 transition-colors">
          {value ? "Skift ikon" : "Vælg ikon"}
        </span>
        <span className="ml-auto text-[10px] text-foreground/20 group-hover:text-foreground/40 transition-colors">▾</span>
      </button>
    );
  }

  // ── Open state: full picker ──
  return (
    <div className="rounded-xl border border-border bg-background shadow-xl overflow-hidden max-w-[340px]">
      {/* ── Header with current icon + tabs ── */}
      <div className="flex items-center gap-2 border-b border-border bg-foreground/[0.02] px-3 py-2">
        {value?.startsWith("data:image/") ? (
          <img src={value} alt="ikon" className="w-8 h-8 rounded object-contain" />
        ) : (
          <span className="text-3xl leading-none">{value || "⬜"}</span>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground/70 truncate">
            {value ? "Valgt ikon" : "Intet ikon valgt"}
          </p>
          {kindLabel ? (
            <p className="text-[10px] text-foreground/40 truncate">
              Type: {kindLabel}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="shrink-0 rounded-md px-2 py-1 text-[11px] text-foreground/40 hover:text-foreground hover:bg-foreground/5 transition-colors"
          onClick={() => { setOpen(false); setSearch(""); setOnlineQuery(""); setShowDefaultConfirm(false); }}
        >
          ✕
        </button>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex border-b border-border">
        <button
          type="button"
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors relative ${
            tab === "local"
              ? "text-accent"
              : "text-foreground/40 hover:text-foreground/60"
          }`}
          onClick={() => setTab("local")}
        >
          📦 Pakke
          {tab === "local" ? (
            <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-accent rounded-full" />
          ) : null}
        </button>
        <button
          type="button"
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors relative ${
            tab === "online"
              ? "text-accent"
              : "text-foreground/40 hover:text-foreground/60"
          }`}
          onClick={() => setTab("online")}
        >
          🔎 Søg alle emoji
          {tab === "online" ? (
            <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-accent rounded-full" />
          ) : null}
        </button>
        <button
          type="button"
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors relative ${
            tab === "generate"
              ? "text-accent"
              : "text-foreground/40 hover:text-foreground/60"
          }`}
          onClick={() => setTab("generate")}
        >
          🎨 Generér
          {tab === "generate" ? (
            <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-accent rounded-full" />
          ) : null}
        </button>
      </div>

      {/* ── Tab content ── */}
      <div className="p-2.5 space-y-2">
        {tab === "local" ? (
          <>
            {/* Local search */}
            <div className="relative">
              <input
                className="w-full rounded-lg border border-border bg-foreground/[0.02] pl-8 pr-3 py-2 text-sm placeholder:text-foreground/30 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/40 transition-colors"
                placeholder="Søg i pakke… (fx lampe, stik, vand)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-foreground/30">🔍</span>
            </div>

            {localFiltered ? (
              /* ── Search results ── */
              <div className="max-h-48 overflow-y-auto rounded-lg bg-foreground/[0.01] p-1">
                {localFiltered.length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-sm text-foreground/40">Ingen resultater</p>
                    <button
                      type="button"
                      className="mt-1 text-[10px] text-accent hover:underline"
                      onClick={() => { setTab("online"); setOnlineQuery(search); setSearch(""); }}
                    >
                      Prøv &ldquo;Søg alle emoji&rdquo; i stedet →
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-7 gap-0.5">
                    {localFiltered.map((e, i) => (
                      <EmojiButton
                        key={`${e.emoji}-${i}`}
                        emoji={e.emoji}
                        isSelected={value === e.emoji}
                        title={e.keywords}
                        onClick={() => pick(e.emoji)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Category pills */}
                <div className="flex gap-1 overflow-x-auto pb-0.5">
                  {ICON_CATEGORIES.map((cat, i) => (
                    <button
                      key={cat.label}
                      type="button"
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
                        i === activeCategory
                          ? "bg-accent text-white shadow-sm scale-105"
                          : "bg-foreground/[0.04] text-foreground/50 hover:bg-foreground/[0.08] hover:text-foreground/70"
                      }`}
                      onClick={() => setActiveCategory(i)}
                    >
                      {cat.emoji} {cat.label}
                    </button>
                  ))}
                </div>

                {/* Emoji grid */}
                <div className="max-h-48 overflow-y-auto rounded-lg bg-foreground/[0.01] p-1">
                  <div className="grid grid-cols-7 gap-0.5">
                    {ICON_CATEGORIES[activeCategory].items.map((e, i) => (
                      <EmojiButton
                        key={`${e.emoji}-${i}`}
                        emoji={e.emoji}
                        isSelected={value === e.emoji}
                        title={e.keywords}
                        onClick={() => pick(e.emoji)}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        ) : (
          /* ── Online search tab ── */
          <>
            <div className="relative">
              <input
                className="w-full rounded-lg border border-border bg-foreground/[0.02] pl-8 pr-3 py-2 text-sm placeholder:text-foreground/30 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/40 transition-colors"
                placeholder="Søg i alle emoji… (fx plug, socket, light)"
                value={onlineQuery}
                onChange={(e) => setOnlineQuery(e.target.value)}
                autoFocus
              />
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-foreground/30">🔎</span>
            </div>

            <div className="max-h-48 overflow-y-auto rounded-lg bg-foreground/[0.01] p-1 min-h-[80px]">
              {onlineLoading ? (
                <div className="flex items-center justify-center py-6 gap-2">
                  <span className="animate-spin text-sm">⏳</span>
                  <span className="text-xs text-foreground/40">Søger…</span>
                </div>
              ) : onlineError ? (
                <p className="text-center text-xs text-red-400 py-4">{onlineError}</p>
              ) : onlineResults.length > 0 ? (
                <div className="space-y-1">
                  <div className="grid grid-cols-7 gap-0.5">
                    {onlineResults.map((e, i) => (
                      <EmojiButton
                        key={`${e.emoji}-${i}`}
                        emoji={e.emoji}
                        isSelected={value === e.emoji}
                        title={e.name}
                        onClick={() => pick(e.emoji)}
                      />
                    ))}
                  </div>
                  <p className="text-[9px] text-foreground/25 text-center pt-1">
                    {onlineResults.length} resultater
                  </p>
                </div>
              ) : onlineQuery.trim().length >= 2 ? (
                <div className="text-center py-6">
                  <p className="text-sm text-foreground/40">Ingen resultater</p>
                  <p className="text-[10px] text-foreground/25 mt-1">Prøv et engelsk søgeord (fx &ldquo;plug&rdquo;, &ldquo;electric&rdquo;)</p>
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-xl opacity-30">🔎</p>
                  <p className="text-[10px] text-foreground/30 mt-1.5">Søg i 600+ emoji</p>
                  <p className="text-[10px] text-foreground/20">Brug engelske søgeord for bedste resultater</p>
                </div>
              )}
            </div>
          </>
        ) : (
          /* ── AI Generator tab ── */
          <>
            <div className="space-y-2.5">
              <div>
                <label className="block text-[11px] font-medium text-foreground/50 mb-1">
                  Beskriv ikonet du vil lave:
                </label>
                <input
                  className="w-full rounded-lg border border-border bg-foreground/[0.02] px-3 py-2 text-sm placeholder:text-foreground/30 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/40 transition-colors"
                  placeholder="Fx 'Rød tomat', 'Lavendel busk', 'Grøn skovhave'..."
                  value={genPrompt}
                  onChange={(e) => setGenPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !genLoading) generateIcon();
                  }}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-foreground/50 mb-1">
                  Upload foto (valgfrit):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    ref={genFileRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleGenImageUpload}
                  />
                  <button
                    type="button"
                    className="flex-1 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-foreground/40 hover:border-accent/40 hover:text-foreground/60 hover:bg-foreground/[0.02] transition-colors text-center"
                    onClick={() => genFileRef.current?.click()}
                  >
                    {genImagePreview ? "📷 Skift foto" : "📷 Vælg foto / tag billede"}
                  </button>
                  {genImagePreview && (
                    <button
                      type="button"
                      className="shrink-0 rounded-md px-2 py-1.5 text-[10px] text-foreground/30 hover:text-red-500 hover:bg-red-50 transition-colors"
                      onClick={() => { setGenImage(null); setGenImagePreview(null); }}
                    >
                      ✕
                    </button>
                  )}
                </div>
                {genImagePreview && (
                  <div className="mt-1.5 rounded-lg border border-border overflow-hidden">
                    <img
                      src={genImagePreview}
                      alt="Uploaded"
                      className="w-full h-20 object-cover"
                    />
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={genLoading || (!genPrompt.trim() && !genImage)}
                className="w-full rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-110 disabled:opacity-40 disabled:shadow-none transition-all flex items-center justify-center gap-2"
                onClick={generateIcon}
              >
                {genLoading ? (
                  <><span className="animate-spin">⏳</span> Genererer ikon…</>
                ) : (
                  <>🎨 Generér ikon med AI</>
                )}
              </button>

              {genError && (
                <p className="text-xs text-red-500 text-center">{genError}</p>
              )}

              {genResult && (
                <div className="rounded-lg border border-green-200 bg-green-50/50 p-3 space-y-2">
                  <p className="text-[11px] font-medium text-green-700 text-center">
                    ✅ Ikon genereret!
                  </p>
                  <div className="flex justify-center">
                    <img
                      src={genResult}
                      alt="Genereret ikon"
                      className="w-16 h-16 rounded-lg border border-green-200 object-contain bg-white shadow-sm"
                    />
                  </div>
                  <button
                    type="button"
                    className="w-full rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 transition-colors"
                    onClick={() => {
                      pick(genResult!);
                      setGenPrompt("");
                      setGenImage(null);
                      setGenImagePreview(null);
                      setGenResult(null);
                    }}
                  >
                    ✓ Brug dette ikon
                  </button>
                  <button
                    type="button"
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-[11px] text-foreground/50 hover:bg-foreground/5 transition-colors"
                    onClick={() => setGenResult(null)}
                  >
                    Prøv igen
                  </button>
                </div>
              )}

              {!genResult && !genLoading && (
                <p className="text-[10px] text-foreground/25 text-center leading-relaxed">
                  AI genererer et unikt ikon baseret på din beskrivelse.
                  Du kan også uploade et foto af planten for bedre resultat.
                </p>
              )}
            </div>
          </>
        )}

        {/* ── Custom emoji input ── */}
        <div className="flex items-center gap-1.5 border-t border-border pt-2">
          <input
            className="flex-1 rounded-lg border border-border bg-foreground/[0.02] px-2.5 py-1.5 text-sm placeholder:text-foreground/25 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/40 transition-colors"
            placeholder="Indsæt emoji direkte…"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && customInput.trim()) {
                pick(customInput.trim());
                setCustomInput("");
              }
            }}
          />
          <button
            type="button"
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:brightness-110 disabled:opacity-30 disabled:shadow-none transition-all"
            disabled={!customInput.trim()}
            onClick={() => {
              if (customInput.trim()) {
                pick(customInput.trim());
                setCustomInput("");
              }
            }}
          >
            Brug
          </button>
        </div>

        {/* ── Set as default (with confirmation) ── */}
        {kindLabel && onSetKindDefault && value ? (
          <div className="border-t border-border pt-2">
            {!showDefaultConfirm ? (
              <button
                type="button"
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-accent/20 bg-accent/[0.04] px-3 py-2 text-xs font-medium text-accent hover:bg-accent/[0.08] hover:border-accent/30 active:scale-[0.98] transition-all"
                onClick={() => setShowDefaultConfirm(true)}
              >
                <span className="text-base leading-none">{value}</span>
                Sæt som standard for alle &ldquo;{kindLabel}&rdquo;
              </button>
            ) : (
              <div className="rounded-lg border border-amber-300/40 bg-amber-50/50 dark:bg-amber-900/10 px-3 py-2.5 space-y-2">
                <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                  ⚠️ Skift ikon for alle &ldquo;{kindLabel}&rdquo;?
                </p>
                <p className="text-[10px] text-amber-600/70 dark:text-amber-400/60 leading-relaxed">
                  {value} bliver standard-ikonet.{" "}
                  {kindCount != null && kindCount > 0
                    ? <><strong>Alle {kindCount} eksisterende</strong> &ldquo;{kindLabel}&rdquo;-elementer opdateres, og nye elementer får det automatisk.</>
                    : <>Alle fremtidige &ldquo;{kindLabel}&rdquo;-elementer får dette ikon.</>
                  }
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="flex-1 rounded-md bg-accent px-2 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:brightness-110 active:scale-[0.97] transition-all"
                    onClick={() => {
                      onSetKindDefault(value);
                      setShowDefaultConfirm(false);
                    }}
                  >
                    ✓ Ja, opdatér alle
                  </button>
                  <button
                    type="button"
                    className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-[11px] text-foreground/60 hover:bg-foreground/5 active:scale-[0.97] transition-all"
                    onClick={() => setShowDefaultConfirm(false)}
                  >
                    Annullér
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* ── Footer actions ── */}
        <div className="flex justify-between items-center pt-1">
          {value ? (
            <button
              type="button"
              className="rounded-md px-2 py-1 text-[11px] text-foreground/30 hover:text-red-500 hover:bg-red-50 transition-colors"
              onClick={() => { onChange(""); setOpen(false); setShowDefaultConfirm(false); }}
            >
              🗑 Fjern ikon
            </button>
          ) : <span />}
          <button
            type="button"
            className="rounded-md px-2 py-1 text-[11px] text-foreground/40 hover:text-foreground hover:bg-foreground/5 transition-colors"
            onClick={() => { setOpen(false); setSearch(""); setOnlineQuery(""); setShowDefaultConfirm(false); }}
          >
            Luk
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Emoji button – extracted for consistency
// ---------------------------------------------------------------------------
function EmojiButton({
  emoji,
  isSelected,
  title,
  onClick,
}: {
  emoji: string;
  isSelected: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`flex items-center justify-center rounded-lg p-1.5 text-xl leading-none transition-all hover:bg-foreground/[0.08] hover:scale-110 active:scale-95 ${
        isSelected
          ? "bg-accent/15 ring-2 ring-accent shadow-sm scale-105"
          : ""
      }`}
      onClick={onClick}
      title={title}
    >
      {emoji}
    </button>
  );
}
