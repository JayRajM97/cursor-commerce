const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SHEIN_CSV = process.env.SHEIN_CSV || "/Users/harshwardhansolanki/Downloads/shein-products.csv";
const WALMART_CSV = process.env.WALMART_CSV || "/Users/harshwardhansolanki/Downloads/walmart-products.csv";
const OUT_PATH = path.join(ROOT, "data", "products.json");

const CATEGORY_WEIGHTS = [
  { key: "crystal", label: "Crystals", score: 120 },
  { key: "jade", label: "Crystals", score: 110 },
  { key: "quartz", label: "Crystals", score: 105 },
  { key: "stone", label: "Crystals", score: 90 },
  { key: "table decorative", label: "Desk Decor", score: 95 },
  { key: "ornament", label: "Desk Decor", score: 78 },
  { key: "decor", label: "Home Decor", score: 72 },
  { key: "candle", label: "Candles", score: 68 },
  { key: "plant", label: "Plants", score: 58 },
  { key: "vase", label: "Vases", score: 58 },
  { key: "storage", label: "Storage", score: 44 },
  { key: "cushion", label: "Textiles", score: 42 },
  { key: "curtain", label: "Curtains", score: 40 },
  { key: "rug", label: "Rugs", score: 36 },
  { key: "shoe", label: "Footwear", score: 32 },
  { key: "sneaker", label: "Footwear", score: 32 },
  { key: "beauty", label: "Beauty", score: 30 },
  { key: "makeup", label: "Beauty", score: 30 }
];

const TAG_RULES = [
  { label: "Crystals", keys: ["crystal", "jade", "quartz", "selenite", "healing crystals", "crystal shapes"] },
  { label: "Desk Decor", keys: ["desktop", "desk", "office decoration", "table decorative", "tabletop", "figurine"] },
  { label: "Home Decor", keys: ["home decor", "home decoration", "decorative", "ornament", "festival decor", "wall decor"] },
  { label: "Room Decor", keys: ["room decor", "bedroom", "living room", "curtain", "rug", "cushion", "vase"] },
  { label: "Giftable", keys: ["gift", "holiday", "christmas", "valentine"] },
  { label: "Candles", keys: ["candle", "home fragrance"] },
  { label: "Plants", keys: ["plant", "artificial flower", "artificial plants"] },
  { label: "Vases", keys: ["vase"] },
  { label: "Storage", keys: ["storage", "organizer", "cabinet", "rack", "holder"] },
  { label: "Textiles", keys: ["cushion", "sheet", "blanket", "pillow", "curtain", "rug"] },
  { label: "Curtains", keys: ["curtain", "blackout curtain", "window treatment"] },
  { label: "Rugs", keys: ["rug", "area rug"] },
  { label: "Footwear", keys: ["shoe", "sneaker", "clog", "boot", "sandal", "slipper"] },
  { label: "Beauty", keys: ["beauty", "makeup", "skin", "eye shadow", "hair color", "lash"] },
  { label: "Clothing", keys: ["clothing", "jeans", "pants", "shirt", "tank", "tops", "dress", "shorts", "apparel"] }
];

const COLOR_WORDS = [
  "yellow",
  "blue",
  "green",
  "jade",
  "white",
  "black",
  "grey",
  "gray",
  "pink",
  "gold",
  "silver",
  "brown",
  "clear",
  "multicolor",
  "natural",
  "ivory",
  "navy",
  "purple",
  "red"
];

const SHEIN_EXCLUSIONS = [
  "nail",
  "earring",
  "bracelet",
  "necklace",
  "hair clip",
  "wig",
  "balloon",
  "sticker",
  "phone case",
  "tattoo",
  "shoe decoration",
  "shoe accessory",
  "power tool",
  "wire",
  "cable",
  "unbeatablesale"
];

const SHEIN_ALLOWED_ROOTS = new Set(["Home & Living", "Home Textile"]);
const SHEIN_ALLOWED_CATEGORIES = [
  "crystal",
  "healing crystals",
  "table decorative",
  "festival decor",
  "artificial plants",
  "candles",
  "vase",
  "cushion",
  "storage",
  "decorative crafts",
  "tabletop fountains",
  "home fragrance",
  "ornaments"
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const [headers, ...records] = rows;
  return records
    .filter((record) => record.some(Boolean))
    .map((record) =>
      Object.fromEntries(headers.map((header, index) => [header, record[index] ?? ""]))
    );
}

function parseJsonList(value, fallback = []) {
  if (!value || value === "null") return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function parseAttributes(value) {
  return parseJsonList(value)
    .filter((item) => item && item.name && item.value)
    .map((item) => ({ name: String(item.name), value: String(item.value) }));
}

function asNumber(value) {
  const number = Number(String(value || "").replace(/[$,]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function cleanImage(value) {
  return String(value || "").replace(/^"+|"+$/g, "");
}

function normalizeName(name) {
  return String(name || "")
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .trim();
}

function shortDescription(description, name) {
  const cleaned = normalizeName(description)
    .replace(/^Free Returns\s*✓\s*Free Shipping\s*✓\.\s*/i, "")
    .replace(name, "")
    .replace(/\s+-\s+.*$/, "")
    .trim();
  if (!cleaned) return name;
  return cleaned.length > 180 ? `${cleaned.slice(0, 177).trim()}...` : cleaned;
}

function inferTags(text, source, reviewCount) {
  const haystack = ` ${text.toLowerCase()} `;
  const tags = new Set();

  for (const rule of TAG_RULES) {
    if (rule.keys.some((key) => haystack.includes(key))) tags.add(rule.label);
  }

  if (/\b(desk|office|desktop)\b/.test(haystack)) {
    tags.add("Desk Ready");
  }
  if (/\b(gift|holiday)\b/.test(haystack)) tags.add("Giftable");
  if (source === "Walmart" && reviewCount > 1000) tags.add("Review Rich");
  return Array.from(tags).slice(0, 5);
}

function inferUseCase(text, rootCategory = "") {
  const haystack = text.toLowerCase();
  if (/clothing|jeans|pants|shirt|tank|tops|dress|shorts|apparel/i.test(`${rootCategory} ${text}`)) {
    return "Fit and styling";
  }
  if (haystack.includes("desk") || haystack.includes("office") || haystack.includes("desktop")) {
    return "Desk or workspace";
  }
  if (haystack.includes("gift") || haystack.includes("holiday")) return "Gifting";
  if (haystack.includes("curtain") || haystack.includes("rug") || haystack.includes("cushion")) {
    return "Room styling";
  }
  if (haystack.includes("shoe") || haystack.includes("sneaker") || haystack.includes("clog")) {
    return "Fit and outfit matching";
  }
  if (haystack.includes("beauty") || haystack.includes("makeup") || haystack.includes("skin")) {
    return "Routine matching";
  }
  return "Home discovery";
}

function inferMood(text) {
  const haystack = text.toLowerCase();
  if (haystack.includes("blue") || haystack.includes("jade") || haystack.includes("green")) return "Calm";
  if (haystack.includes("yellow") || haystack.includes("gold") || haystack.includes("rainbow")) return "Bright";
  if (haystack.includes("black") || haystack.includes("grey") || haystack.includes("gray")) return "Minimal";
  if (haystack.includes("pink") || haystack.includes("cute")) return "Playful";
  if (haystack.includes("natural") || haystack.includes("wood")) return "Natural";
  return "Curated";
}

function inferColors(text, explicitColor) {
  const haystack = `${explicitColor || ""} ${text}`.toLowerCase();
  const colors = COLOR_WORDS.filter((color) => haystack.includes(color));
  if (explicitColor && !colors.length) colors.push(explicitColor);
  return Array.from(new Set(colors)).slice(0, 4);
}

function scoreProduct(product) {
  const haystack = [
    product.name,
    product.description,
    product.category,
    product.rootCategory,
    product.tags.join(" ")
  ]
    .join(" ")
    .toLowerCase();

  let score = product.source === "SHEIN" ? 8 : 0;
  for (const weight of CATEGORY_WEIGHTS) {
    if (haystack.includes(weight.key)) score += weight.score;
  }
  if (product.source === "SHEIN" && product.rootCategory === "Home & Living") score += 34;
  if (product.source === "SHEIN" && product.rootCategory === "Jewelry & Watches") score += 26;
  if (product.price > 0 && product.price <= 25) score += 16;
  if (product.reviewCount > 1000) score += 12;
  if (product.imageCount > 2) score += 8;
  if (product.source === "SHEIN" && SHEIN_EXCLUSIONS.some((word) => haystack.includes(word))) {
    score -= 90;
  }
  return score;
}

function isSheinDecorCandidate(product) {
  const haystack = [
    product.name,
    product.description,
    product.category,
    product.rootCategory,
    product.tags.join(" ")
  ]
    .join(" ")
    .toLowerCase();
  const category = product.category.toLowerCase();
  const hasDecorSignal =
    SHEIN_ALLOWED_ROOTS.has(product.rootCategory) ||
    product.tags.includes("Desk Ready") ||
    product.tags.includes("Room Decor") ||
    SHEIN_ALLOWED_CATEGORIES.some((allowed) => category.includes(allowed));
  const allowedRootOrCategory =
    SHEIN_ALLOWED_ROOTS.has(product.rootCategory) ||
    SHEIN_ALLOWED_CATEGORIES.some((allowed) => category.includes(allowed));
  const excluded = SHEIN_EXCLUSIONS.some((word) => haystack.includes(word));
  return hasDecorSignal && allowedRootOrCategory && (!excluded || category.includes("crystal shapes"));
}

function normalizeShein(row) {
  const name = normalizeName(row.product_name);
  const attributes = parseAttributes(row.other_attributes);
  const images = parseJsonList(row.image_urls)
    .map(cleanImage)
    .filter((url) => url.startsWith("http") && !url.includes("/p-"));
  const image = cleanImage(row.main_image) || images[0];
  const text = [
    name,
    row.description,
    row.category,
    row.root_category,
    row.color,
    row.size,
    attributes.map((item) => `${item.name} ${item.value}`).join(" ")
  ].join(" ");
  const tagText = [
    name,
    row.category,
    row.root_category,
    row.color,
    row.size,
    attributes
      .filter((item) => /^(color|material|style|type|main stone)$/i.test(item.name))
      .map((item) => `${item.name} ${item.value}`)
      .join(" ")
  ].join(" ");

  const product = {
    id: `shein-${row.product_id}`,
    sourceId: row.product_id,
    source: "SHEIN",
    name,
    brand: row.brand || "SHEIN",
    description: shortDescription(row.description, name),
    price: asNumber(row.final_price || row.initial_price),
    currency: row.currency || "USD",
    image,
    images: Array.from(new Set([image, ...images])).filter(Boolean).slice(0, 6),
    category: row.category || "SHEIN",
    rootCategory: row.root_category || "SHEIN",
    color: row.color || "",
    colors: inferColors(text, row.color),
    rating: asNumber(row.rating),
    reviewCount: asNumber(row.reviews_count),
    imageCount: asNumber(row.image_count),
    url: row.url,
    attributes,
    tags: inferTags(tagText, "SHEIN", asNumber(row.reviews_count)),
    useCase: inferUseCase(tagText, row.root_category),
    mood: inferMood(tagText)
  };
  product.score = scoreProduct(product);
  return product;
}

function normalizeWalmart(row) {
  const name = normalizeName(row.product_name);
  const attributes = parseAttributes(row.specifications).concat(parseAttributes(row.other_attributes));
  const images = parseJsonList(row.image_urls).map(cleanImage).filter((url) => url.startsWith("http"));
  const image = cleanImage(row.main_image) || images[0];
  const colors = parseJsonList(row.colors).join(" ");
  const text = [
    name,
    row.description,
    row.category_name,
    row.root_category_name,
    row.brand,
    colors,
    attributes.map((item) => `${item.name} ${item.value}`).join(" ")
  ].join(" ");
  const tagText = [
    name,
    row.category_name,
    row.root_category_name,
    row.brand,
    colors,
    attributes
      .filter((item) => /^(color|material|fabric content|gender|clothing size|pant style|shoe size|features)$/i.test(item.name))
      .map((item) => `${item.name} ${item.value}`)
      .join(" ")
  ].join(" ");

  const product = {
    id: `walmart-${row.product_id}`,
    sourceId: row.product_id,
    source: "Walmart",
    name,
    brand: row.brand || "Walmart",
    description: shortDescription(row.description, name),
    price: asNumber(row.final_price || row.initial_price),
    currency: row.currency || "USD",
    image,
    images: Array.from(new Set([image, ...images])).filter(Boolean).slice(0, 6),
    category: row.category_name || "Walmart",
    rootCategory: row.root_category_name || "Walmart",
    color: colors,
    colors: inferColors(text, colors),
    rating: asNumber(row.rating || row.rating_stars),
    reviewCount: asNumber(row.review_count),
    imageCount: images.length,
    url: row.url,
    attributes,
    tags: inferTags(tagText, "Walmart", asNumber(row.review_count)),
    useCase: inferUseCase(tagText, row.root_category_name),
    mood: inferMood(tagText)
  };
  product.score = scoreProduct(product);
  return product;
}

function buildCatalog() {
  const sheinProducts = parseCsv(fs.readFileSync(SHEIN_CSV, "utf8"))
    .map(normalizeShein)
    .filter((product) => product.name && product.image && product.price);
  const walmartProducts = parseCsv(fs.readFileSync(WALMART_CSV, "utf8"))
    .map(normalizeWalmart)
    .filter((product) => product.name && product.image && product.price);

  const sheinDecor = sheinProducts
    .filter((product) => product.score >= 52 && isSheinDecorCandidate(product))
    .sort((a, b) => b.score - a.score)
    .slice(0, 72);
  const walmartSupport = walmartProducts
    .filter((product) => product.score >= 28 || product.reviewCount > 1000 || product.tags.includes("Clothing"))
    .sort((a, b) => b.score + b.reviewCount / 1000 - (a.score + a.reviewCount / 1000))
    .slice(0, 1000);

  const products = [...sheinDecor, ...walmartSupport].map((product, index) => ({
    ...product,
    rank: index + 1,
    score: undefined
  }));

  const categories = Array.from(new Set(products.flatMap((product) => product.tags))).sort();
  const catalog = {
    generatedAt: new Date().toISOString(),
    sources: [
      { name: "SHEIN", rowsRead: sheinProducts.length, selected: sheinDecor.length },
      { name: "Walmart", rowsRead: walmartProducts.length, selected: walmartSupport.length }
    ],
    focus: "SHEIN crystal and home decor with Walmart support categories",
    categories,
    products
  };

  fs.writeFileSync(OUT_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`Wrote ${products.length} products to ${path.relative(ROOT, OUT_PATH)}`);
}

buildCatalog();
