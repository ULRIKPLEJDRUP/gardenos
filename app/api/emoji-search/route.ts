// ---------------------------------------------------------------------------
// GardenOS – API: Search emoji
// Uses the open-source emoji data from Unicode's emoji-test.txt
// via the NPM package 'unicode-emoji-json' pattern — but we embed a curated
// extended set of ~600 relevant emoji directly to avoid dependencies.
// ---------------------------------------------------------------------------
import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Extended emoji catalogue – ~600 emoji with search keywords
// Grouped to cover: objects, nature, food, symbols, buildings, tools, vehicles
// ---------------------------------------------------------------------------
type EmojiEntry = { e: string; n: string }; // emoji, name

const EXTENDED_EMOJI: EmojiEntry[] = [
  // ── Smileys & People ──
  {e:"😀",n:"grinning face"},{e:"😃",n:"grinning face big eyes"},{e:"😄",n:"grinning squinting"},{e:"😁",n:"beaming face"},{e:"😊",n:"smiling face blush"},{e:"🥰",n:"smiling hearts love"},{e:"😎",n:"sunglasses cool"},{e:"🤔",n:"thinking face"},{e:"🤗",n:"hugging face"},{e:"🙄",n:"rolling eyes"},{e:"😱",n:"screaming fear"},{e:"😡",n:"angry red face"},{e:"👍",n:"thumbs up like"},{e:"👎",n:"thumbs down dislike"},{e:"👏",n:"clapping hands"},{e:"🙌",n:"raising hands"},{e:"💪",n:"flexed biceps strong"},{e:"🤝",n:"handshake"},{e:"✌️",n:"victory peace"},{e:"👋",n:"waving hand"},{e:"🖐️",n:"raised hand"},{e:"☝️",n:"index pointing up"},{e:"👆",n:"backhand index up"},{e:"👇",n:"backhand index down"},{e:"👈",n:"backhand index left"},{e:"👉",n:"backhand index right"},
  // ── Animals & Nature ──
  {e:"🐶",n:"dog face"},{e:"🐱",n:"cat face"},{e:"🐭",n:"mouse face"},{e:"🐹",n:"hamster"},{e:"🐰",n:"rabbit face bunny"},{e:"🦊",n:"fox"},{e:"🐻",n:"bear"},{e:"🐼",n:"panda"},{e:"🐨",n:"koala"},{e:"🐯",n:"tiger"},{e:"🦁",n:"lion"},{e:"🐮",n:"cow"},{e:"🐷",n:"pig"},{e:"🐸",n:"frog"},{e:"🐵",n:"monkey"},{e:"🐔",n:"chicken hen"},{e:"🐧",n:"penguin"},{e:"🐦",n:"bird"},{e:"🦅",n:"eagle"},{e:"🦆",n:"duck"},{e:"🦉",n:"owl"},{e:"🦇",n:"bat"},{e:"🐺",n:"wolf"},{e:"🐗",n:"boar"},{e:"🐴",n:"horse"},{e:"🦄",n:"unicorn"},{e:"🐝",n:"honeybee bee"},{e:"🐛",n:"bug caterpillar"},{e:"🦋",n:"butterfly"},{e:"🐌",n:"snail"},{e:"🐞",n:"ladybug ladybird"},{e:"🐜",n:"ant"},{e:"🪲",n:"beetle"},{e:"🪳",n:"cockroach"},{e:"🦟",n:"mosquito"},{e:"🪰",n:"fly"},{e:"🪱",n:"worm earthworm"},{e:"🦠",n:"microbe bacteria"},{e:"🐢",n:"turtle tortoise"},{e:"🐍",n:"snake"},{e:"🦎",n:"lizard"},{e:"🦖",n:"dinosaur t-rex"},{e:"🐙",n:"octopus"},{e:"🦀",n:"crab"},{e:"🦞",n:"lobster"},{e:"🦐",n:"shrimp prawn"},{e:"🐠",n:"tropical fish"},{e:"🐟",n:"fish"},{e:"🐡",n:"blowfish"},{e:"🐬",n:"dolphin"},{e:"🐳",n:"whale"},{e:"🦈",n:"shark"},{e:"🐊",n:"crocodile"},{e:"🦔",n:"hedgehog"},{e:"🦦",n:"otter"},{e:"🦥",n:"sloth"},{e:"🦨",n:"skunk"},
  // ── Plants ──
  {e:"🌱",n:"seedling sprout plant"},{e:"🌲",n:"evergreen tree pine"},{e:"🌳",n:"deciduous tree oak"},{e:"🌴",n:"palm tree"},{e:"🌵",n:"cactus desert"},{e:"🌾",n:"sheaf rice wheat grain"},{e:"🌿",n:"herb leaf green"},{e:"☘️",n:"shamrock clover"},{e:"🍀",n:"four leaf clover lucky"},{e:"🍁",n:"maple leaf"},{e:"🍂",n:"fallen leaf autumn"},{e:"🍃",n:"leaf fluttering wind"},{e:"🪴",n:"potted plant houseplant"},{e:"🪵",n:"wood log timber"},{e:"🪨",n:"rock stone boulder"},{e:"🪸",n:"coral reef"},{e:"🪻",n:"hyacinth flower"},{e:"🪷",n:"lotus flower"},{e:"🌷",n:"tulip flower"},{e:"🌸",n:"cherry blossom flower"},{e:"🌹",n:"rose flower red"},{e:"🌺",n:"hibiscus flower"},{e:"🌻",n:"sunflower"},{e:"🌼",n:"blossom flower yellow"},{e:"💐",n:"bouquet flowers"},{e:"🍄",n:"mushroom fungi"},{e:"🪺",n:"nest eggs bird"},
  // ── Food & Vegetables ──
  {e:"🍎",n:"red apple fruit"},{e:"🍏",n:"green apple"},{e:"🍐",n:"pear fruit"},{e:"🍊",n:"tangerine orange mandarin"},{e:"🍋",n:"lemon citrus"},{e:"🍌",n:"banana"},{e:"🍇",n:"grapes vine"},{e:"🍓",n:"strawberry berry"},{e:"🫐",n:"blueberries"},{e:"🍈",n:"melon"},{e:"🍉",n:"watermelon"},{e:"🍑",n:"peach"},{e:"🍒",n:"cherries"},{e:"🥝",n:"kiwi fruit"},{e:"🍅",n:"tomato"},{e:"🥑",n:"avocado"},{e:"🥕",n:"carrot vegetable"},{e:"🥒",n:"cucumber"},{e:"🌽",n:"corn ear maize"},{e:"🥬",n:"leafy green lettuce cabbage"},{e:"🥦",n:"broccoli"},{e:"🧅",n:"onion"},{e:"🧄",n:"garlic"},{e:"🌶️",n:"hot pepper chili"},{e:"🫑",n:"bell pepper capsicum"},{e:"🥔",n:"potato"},{e:"🍆",n:"eggplant aubergine"},{e:"🫛",n:"pea pod bean"},{e:"🥜",n:"peanuts groundnut"},{e:"🫘",n:"beans"},{e:"🌰",n:"chestnut nut"},{e:"🍞",n:"bread loaf"},{e:"🥐",n:"croissant"},{e:"🧀",n:"cheese wedge"},{e:"🥚",n:"egg"},{e:"🍯",n:"honey pot"},{e:"🥛",n:"milk glass"},{e:"☕",n:"coffee cup hot"},{e:"🫖",n:"teapot"},{e:"🍵",n:"tea cup"},{e:"🧃",n:"juice box"},{e:"🍺",n:"beer mug"},{e:"🍷",n:"wine glass"},{e:"🧊",n:"ice cube"},{e:"🥤",n:"cup straw"},
  // ── Objects & Tools ──
  {e:"⌚",n:"watch clock time"},{e:"📱",n:"mobile phone smartphone"},{e:"💻",n:"laptop computer"},{e:"🖥️",n:"desktop computer screen monitor"},{e:"🖨️",n:"printer"},{e:"⌨️",n:"keyboard"},{e:"🖱️",n:"computer mouse"},{e:"💾",n:"floppy disk save"},{e:"💿",n:"optical disc cd"},{e:"📷",n:"camera photo"},{e:"📹",n:"video camera"},{e:"🔍",n:"magnifying glass search left"},{e:"🔎",n:"magnifying glass search right"},{e:"🔬",n:"microscope"},{e:"🔭",n:"telescope"},{e:"📡",n:"satellite antenna dish"},{e:"💡",n:"light bulb idea lamp"},{e:"🔦",n:"flashlight torch spotlight"},{e:"🏮",n:"red paper lantern"},{e:"🕯️",n:"candle light"},{e:"🪔",n:"oil lamp diya"},{e:"📔",n:"notebook journal"},{e:"📕",n:"book red closed"},{e:"📖",n:"open book"},{e:"📝",n:"memo note pencil"},{e:"✏️",n:"pencil"},{e:"🖊️",n:"pen"},{e:"📌",n:"pushpin pin"},{e:"📍",n:"round pushpin location"},{e:"📎",n:"paperclip"},{e:"✂️",n:"scissors cut"},{e:"📐",n:"triangular ruler"},{e:"📏",n:"straight ruler measure"},{e:"🗑️",n:"wastebasket trash bin"},{e:"📦",n:"package box parcel"},{e:"📫",n:"mailbox letter"},{e:"🏷️",n:"label tag price"},{e:"🔑",n:"key"},{e:"🗝️",n:"old key antique"},{e:"🔒",n:"locked padlock"},{e:"🔓",n:"unlocked open"},
  // ── Electric & Technology ──
  {e:"🔌",n:"electric plug socket outlet power cord cable"},{e:"🔋",n:"battery full charge power"},{e:"🪫",n:"low battery empty power"},{e:"💡",n:"light bulb lamp idea"},{e:"⚡",n:"high voltage lightning electricity zap bolt"},{e:"🔲",n:"black square button switch outlet"},{e:"🔳",n:"white square button switch panel"},{e:"☀️",n:"sun solar panel energy"},{e:"⚙️",n:"gear settings cog mechanical"},{e:"🔧",n:"wrench spanner tool"},{e:"🔩",n:"nut bolt screw fastener"},{e:"🛠️",n:"hammer wrench tools repair"},{e:"⛏️",n:"pick axe mining tool"},{e:"🪛",n:"screwdriver tool"},{e:"🪚",n:"saw carpentry wood"},{e:"🗜️",n:"clamp compression tool vise"},{e:"🧰",n:"toolbox tools chest"},{e:"🧲",n:"magnet attract"},{e:"⚗️",n:"alembic chemistry science"},{e:"🧪",n:"test tube science"},{e:"🧫",n:"petri dish"},{e:"📻",n:"radio"},{e:"📺",n:"television tv screen"},{e:"🎙️",n:"studio microphone"},{e:"🎛️",n:"control knobs dial panel slider"},{e:"🎚️",n:"level slider control"},{e:"📠",n:"fax machine"},{e:"🖲️",n:"trackball"},{e:"💽",n:"computer disk minidisc"},{e:"🧮",n:"abacus calculate"},{e:"〰️",n:"wavy dash cable wire line"},
  // ── Water & Plumbing ──
  {e:"💧",n:"water drop droplet"},{e:"💦",n:"sweat droplets splash spray"},{e:"🌊",n:"water wave ocean sea"},{e:"🚰",n:"potable water tap faucet"},{e:"🚿",n:"shower head water bathroom"},{e:"🛁",n:"bathtub bath"},{e:"🪣",n:"bucket pail water"},{e:"⛲",n:"fountain water spray"},{e:"🧴",n:"lotion bottle squeeze"},{e:"🧽",n:"sponge clean"},{e:"🧹",n:"broom sweep clean"},{e:"🧺",n:"basket laundry"},{e:"❄️",n:"snowflake cold ice frost"},{e:"🌧️",n:"cloud rain water"},{e:"⛈️",n:"cloud lightning rain thunderstorm"},{e:"🌦️",n:"sun behind rain cloud"},{e:"🌈",n:"rainbow"},{e:"☔",n:"umbrella rain"},{e:"⏱️",n:"stopwatch timer"},{e:"⏲️",n:"timer clock alarm"},{e:"🧊",n:"ice cube frozen"},
  // ── Buildings & Places ──
  {e:"🏠",n:"house home building"},{e:"🏡",n:"house garden home"},{e:"🏢",n:"office building"},{e:"🏣",n:"post office"},{e:"🏥",n:"hospital"},{e:"🏦",n:"bank"},{e:"🏪",n:"convenience store shop"},{e:"🏫",n:"school"},{e:"🏬",n:"department store mall"},{e:"🏭",n:"factory industry"},{e:"🏗️",n:"building construction crane"},{e:"🧱",n:"brick wall"},{e:"🪵",n:"wood log"},{e:"🛖",n:"hut cabin"},{e:"🏕️",n:"camping tent"},{e:"🏚️",n:"derelict house shed abandoned"},{e:"⛺",n:"tent camping"},{e:"🏰",n:"castle"},{e:"🗼",n:"tower"},{e:"🗽",n:"statue liberty"},{e:"⛪",n:"church"},{e:"🕌",n:"mosque"},{e:"🛕",n:"temple"},{e:"⛩️",n:"shrine torii gate"},{e:"🌉",n:"bridge night"},{e:"🚪",n:"door entrance"},{e:"🪟",n:"window"},{e:"🪜",n:"ladder"},{e:"🛗",n:"elevator lift"},{e:"🛝",n:"playground slide"},{e:"🛞",n:"wheel tire"},
  // ── Transport & Vehicles ──
  {e:"🚗",n:"car automobile"},{e:"🚕",n:"taxi cab"},{e:"🚙",n:"suv car"},{e:"🚌",n:"bus"},{e:"🚎",n:"trolleybus"},{e:"🚐",n:"minibus van"},{e:"🚑",n:"ambulance"},{e:"🚒",n:"fire engine truck"},{e:"🚜",n:"tractor farm"},{e:"🛻",n:"pickup truck"},{e:"🏎️",n:"racing car"},{e:"🚲",n:"bicycle bike"},{e:"🛴",n:"kick scooter"},{e:"🛵",n:"motor scooter"},{e:"🏍️",n:"motorcycle"},{e:"🚂",n:"locomotive train"},{e:"✈️",n:"airplane plane"},{e:"🚀",n:"rocket space"},{e:"🛸",n:"flying saucer ufo"},{e:"⛵",n:"sailboat"},{e:"🚤",n:"speedboat"},{e:"⛽",n:"fuel pump gas station"},{e:"🛤️",n:"railway track path rail"},{e:"🛣️",n:"motorway highway road"},{e:"🗺️",n:"world map atlas"},
  // ── Signs, Symbols & Arrows ──
  {e:"⚠️",n:"warning sign caution alert"},{e:"🚫",n:"prohibited forbidden no stop"},{e:"❌",n:"cross mark no error"},{e:"❗",n:"exclamation mark important"},{e:"❓",n:"question mark"},{e:"✅",n:"check mark done yes ok"},{e:"☑️",n:"ballot box check"},{e:"✔️",n:"check mark"},{e:"➡️",n:"right arrow"},{e:"⬅️",n:"left arrow"},{e:"⬆️",n:"up arrow"},{e:"⬇️",n:"down arrow"},{e:"↗️",n:"up-right arrow northeast"},{e:"↘️",n:"down-right arrow southeast"},{e:"↙️",n:"down-left arrow southwest"},{e:"↖️",n:"up-left arrow northwest"},{e:"↕️",n:"up-down arrow vertical"},{e:"↔️",n:"left-right arrow horizontal"},{e:"🔄",n:"counterclockwise arrows refresh reload"},{e:"🔃",n:"clockwise arrows cycle"},{e:"🔀",n:"shuffle twisted arrows random"},{e:"🔁",n:"repeat loop"},{e:"🔂",n:"repeat single"},{e:"♻️",n:"recycling symbol recycle"},{e:"📶",n:"antenna bars signal strength wifi"},{e:"🔇",n:"muted speaker silent"},{e:"🔈",n:"speaker low volume"},{e:"🔉",n:"speaker medium volume"},{e:"🔊",n:"speaker high volume loud"},{e:"🔔",n:"bell notification ring"},{e:"🔕",n:"bell slash muted silent"},
  // ── Shapes & Colors ──
  {e:"🔴",n:"red circle"},{e:"🟠",n:"orange circle"},{e:"🟡",n:"yellow circle"},{e:"🟢",n:"green circle"},{e:"🔵",n:"blue circle"},{e:"🟣",n:"purple circle"},{e:"🟤",n:"brown circle"},{e:"⚫",n:"black circle"},{e:"⚪",n:"white circle"},{e:"🔶",n:"large orange diamond"},{e:"🔷",n:"large blue diamond"},{e:"🔸",n:"small orange diamond"},{e:"🔹",n:"small blue diamond"},{e:"🔺",n:"red triangle pointed up"},{e:"🔻",n:"red triangle pointed down"},{e:"💠",n:"diamond dot"},{e:"🔲",n:"black square button"},{e:"🔳",n:"white square button"},{e:"⬛",n:"black large square"},{e:"⬜",n:"white large square"},{e:"◼️",n:"black medium square"},{e:"◻️",n:"white medium square"},{e:"▪️",n:"black small square"},{e:"▫️",n:"white small square"},
  // ── Hearts & Love ──
  {e:"❤️",n:"red heart love"},{e:"🧡",n:"orange heart"},{e:"💛",n:"yellow heart"},{e:"💚",n:"green heart"},{e:"💙",n:"blue heart"},{e:"💜",n:"purple heart"},{e:"🖤",n:"black heart"},{e:"🤍",n:"white heart"},{e:"🤎",n:"brown heart"},{e:"💔",n:"broken heart"},{e:"❤️‍🔥",n:"heart on fire burning"},{e:"❤️‍🩹",n:"mending heart healing"},{e:"💕",n:"two hearts"},{e:"💖",n:"sparkling heart"},{e:"💗",n:"growing heart"},{e:"💘",n:"heart arrow cupid"},{e:"💝",n:"heart ribbon gift"},{e:"💞",n:"revolving hearts"},{e:"💟",n:"heart decoration"},
  // ── Sports & Activities ──
  {e:"⚽",n:"soccer ball football"},{e:"🏀",n:"basketball"},{e:"🏈",n:"american football"},{e:"⚾",n:"baseball"},{e:"🎾",n:"tennis"},{e:"🏐",n:"volleyball"},{e:"🎳",n:"bowling"},{e:"🏏",n:"cricket"},{e:"🏑",n:"field hockey"},{e:"🏒",n:"ice hockey"},{e:"🥅",n:"goal net"},{e:"⛳",n:"golf flag"},{e:"🏹",n:"bow arrow archery"},{e:"🎣",n:"fishing rod"},{e:"🤿",n:"diving mask"},{e:"🎿",n:"skis"},{e:"🛷",n:"sled"},{e:"🎯",n:"bullseye target dart"},{e:"🧩",n:"puzzle jigsaw"},{e:"🎮",n:"video game controller"},{e:"🎲",n:"game die dice"},{e:"♟️",n:"chess pawn"},{e:"🎭",n:"performing arts theater"},{e:"🎨",n:"artist palette paint color"},{e:"🎬",n:"clapper board film movie"},{e:"🎤",n:"microphone karaoke"},{e:"🎧",n:"headphone music audio"},{e:"🎵",n:"musical note music"},{e:"🎶",n:"musical notes music"},{e:"🎹",n:"musical keyboard piano"},
  // ── Weather & Sky ──
  {e:"☀️",n:"sun sunny"},{e:"🌙",n:"crescent moon night"},{e:"⭐",n:"star"},{e:"🌟",n:"glowing star bright sparkle"},{e:"✨",n:"sparkles glitter magic"},{e:"🌞",n:"sun face"},{e:"🌝",n:"full moon face"},{e:"🌈",n:"rainbow"},{e:"☁️",n:"cloud"},{e:"⛅",n:"sun behind cloud"},{e:"🌤️",n:"sun behind small cloud"},{e:"🌥️",n:"sun behind large cloud"},{e:"🌦️",n:"sun behind rain cloud"},{e:"🌧️",n:"cloud rain"},{e:"🌨️",n:"cloud snow"},{e:"⛈️",n:"cloud lightning rain storm"},{e:"🌩️",n:"cloud lightning"},{e:"🌪️",n:"tornado"},{e:"🌫️",n:"fog mist"},{e:"🌬️",n:"wind face blow"},{e:"🔥",n:"fire flame hot burn"},{e:"💨",n:"dashing away wind"},{e:"🌡️",n:"thermometer temperature"},
  // ── Flags & Misc ──
  {e:"🚩",n:"triangular flag mark post"},{e:"🏁",n:"chequered flag finish race"},{e:"🏳️",n:"white flag surrender"},{e:"🏴",n:"black flag"},{e:"🎌",n:"crossed flags"},{e:"🇩🇰",n:"flag denmark danish"},{e:"♿",n:"wheelchair accessible"},{e:"🚼",n:"baby symbol"},{e:"🚻",n:"restroom toilet"},{e:"🚮",n:"litter bin trash"},{e:"⚛️",n:"atom symbol science"},{e:"🔰",n:"japanese beginner symbol"},{e:"⚕️",n:"medical symbol health"},{e:"⚖️",n:"balance scale justice"},{e:"🔱",n:"trident emblem"},{e:"👑",n:"crown king queen royal"},{e:"💎",n:"gem stone diamond jewel"},{e:"🏆",n:"trophy cup winner"},{e:"🥇",n:"gold medal first"},{e:"🥈",n:"silver medal second"},{e:"🥉",n:"bronze medal third"},{e:"🎪",n:"circus tent"},{e:"🎡",n:"ferris wheel"},{e:"🎢",n:"roller coaster"},{e:"🎠",n:"carousel horse"},
  // ── Numbers ──
  {e:"0️⃣",n:"keycap zero number 0"},{e:"1️⃣",n:"keycap one number 1"},{e:"2️⃣",n:"keycap two number 2"},{e:"3️⃣",n:"keycap three number 3"},{e:"4️⃣",n:"keycap four number 4"},{e:"5️⃣",n:"keycap five number 5"},{e:"6️⃣",n:"keycap six number 6"},{e:"7️⃣",n:"keycap seven number 7"},{e:"8️⃣",n:"keycap eight number 8"},{e:"9️⃣",n:"keycap nine number 9"},{e:"🔟",n:"keycap ten number 10"},{e:"#️⃣",n:"keycap hash number"},{e:"*️⃣",n:"keycap asterisk star"},
];

// Pre-build a lowercase search index
const SEARCH_INDEX = EXTENDED_EMOJI.map((e) => ({
  emoji: e.e,
  name: e.n,
  lower: e.n.toLowerCase(),
}));

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const q = query.toLowerCase();
  const terms = q.split(/\s+/);

  // Score-based matching: more term matches = higher score
  const scored = SEARCH_INDEX.map((entry) => {
    let score = 0;
    for (const term of terms) {
      if (entry.lower.includes(term)) score += 1;
      if (entry.lower.startsWith(term)) score += 0.5;
      if (entry.emoji === query) score += 10; // exact emoji match
    }
    return { ...entry, score };
  })
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 60);

  const results = scored.map((e) => ({
    emoji: e.emoji,
    name: e.name,
    group: "",
    subGroup: "",
  }));

  return NextResponse.json({ results });
}
