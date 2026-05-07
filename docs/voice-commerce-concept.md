# Voice Commerce Surface

## Short Idea

Build a CSV-driven commerce experience where raw product data becomes a visual discovery marketplace, individual product pages, and a real-time shopping concierge that can talk, listen, remember context, and reshape the page while the shopper browses.

The Airbnb reference is only for the grid style: image-led cards, clean metadata, filters, and detail pages. The products should come from the SHEIN and Walmart CSVs.

The bigger idea is not "chatbot answers query." It is:

```text
shopper behavior + live conversation + product catalog
  -> agent judgment
  -> next best question, product, page, or action
```

## Dataset Read

### SHEIN CSV

The SHEIN file has 1,000 rows. The strongest categories for this demo are:

- Home & Living: 292 rows
- Jewelry & Watches: 90 rows
- Tools & Home Improvement: 81 rows
- Beauty & Health: 71 rows
- Bags & Luggage: 71 rows
- Home Textile: 54 rows

Important product clusters:

- Home/decor appears heavily, with 238 decor-related matches.
- Crystals appear in a smaller but high-concept set, around 10 crystal/stone/jade/quartz candidates.
- There are strong visual products: crystals, table ornaments, decorative crafts, storage, cushion covers, candles, plants, bags, jewelry.

Best SHEIN demo candidates:

- Natural Yellow Rainbow Halo Raw Crystal, aromatherapist stone, home/office decoration, $2.10
- Natural Crystal XiuYu Jade Pagoda hand-carved figurine, home/office desktop decoration, $19.90
- Selenite Crystal Pumpkin Ghost Head carving, natural rock crystal Halloween decor, $3.45
- Retro resin telephone figurine piggy bank, coffee shop decor, $20.50
- Decorative cushion covers, artificial plants, candles, and storage objects

### Walmart CSV

The Walmart file also has 1,000 rows. It is stronger for review-rich, mainstream commerce:

- Plus Size Tops: 33 rows
- Shop Curtains: 26 rows
- Cooling Sheets: 20 rows
- Colored Sheets: 17 rows
- Area Rugs: 16 rows
- Womens Tank Tops: 12 rows

Useful product clusters:

- Home/decor: curtains, sheets, rugs, candles, dressers
- Beauty: eye shadow, hair color, lash serum, skin/beauty products
- Footwear: Crocs, boots, sneakers, slippers
- Review-rich products with thousands of reviews

Best Walmart supporting demos:

- Yankee Candle Pink Sands, 23,856 reviews
- Crocs Unisex Baya Clog Sandals, 21,495 reviews
- Clara Clark sheet sets, 13k+ reviews
- Mainstays blackout curtains, 6,728 reviews
- Garnier / L'Oreal hair color, 8k-12k reviews

## Product Direction

Prioritize **SHEIN crystal and home decor** for the first voice-commerce demo.

Why:

- It naturally supports open-ended conversation.
- The shopper may not know exactly what they want.
- The agent can ask contextual questions:
  - "Where do you want to keep it?"
  - "What color is your desk?"
  - "Is your room warm, neutral, dark, or colorful?"
  - "Do you want it for decor, gifting, calming energy, or a work desk?"
- The agent can recommend alternatives:
  - If the shopper opens a yellow crystal, suggest blue, jade, or selenite based on room context.
  - If they say "desk," prioritize small table ornaments.
  - If they say "gift," prioritize decorative, symbolic, or lower-risk pieces.

Walmart should be a second dataset layer for proof that the same system works on review-heavy products like candles, curtains, shoes, and beauty.

## Page Experience

### 1. Discovery Page

Create a marketplace page using the CSV data.

It should feel like an Airbnb-style grid, but for products:

- Large image-led cards
- Product name, price, category, color/material
- Category chips such as Crystals, Desk Decor, Candles, Cushions, Storage, Beauty, Shoes
- "Recommended for desk", "Giftable", "Room decor", "Under $10" style quick filters
- Sticky search/voice surface on mobile
- Detail pages for every product

The page should not look like CSV data. It should look like a curated storefront.

### 2. Product Detail Pages

Each product gets a detail page:

- Gallery
- Title, price, category, material/color
- Description
- Attributes parsed from `other_attributes`
- Similar products from the same category or style
- Voice concierge prompt based on product type

Example for a yellow crystal:

> "Good choice. This one works as a bright desk or shelf accent. Should I save this, or show calmer blue/green pieces for a workspace?"

## Open Conversation Model

The agent should not be a one-shot parser that only converts:

> "Show me X under Y"

into filters.

It should behave like a live shopper concierge.

### What "Open Conversation" Means

The agent is always aware of:

- Which product page is open
- What product was just clicked
- What category is being explored
- What colors/materials are visible
- What the shopper has already said
- What the shopper has saved, rejected, compared, or asked to refine
- Where they are in the page

It can speak first when there is useful context.

Example:

1. Shopper opens a yellow crystal product.
2. Agent says:
   "Good choice. This feels bright and decorative. Should I save it, or show you calmer pieces for a desk?"
3. Shopper says:
   "It is for my desk."
4. Agent asks:
   "What color is your desk or room?"
5. Shopper says:
   "Dark brown desk, mostly white room."
6. Agent responds:
   "Yellow can pop nicely, but jade or blue crystal may feel calmer against dark wood. I found a few desk-sized options."
7. UI updates to a new page:
   "Desk crystals for dark wood and white rooms"

This is not just a chat response. The conversation changes the page.

## Agent Loop

The system should run this loop continuously:

```text
observe page event
  -> update shopper memory
  -> decide if agent should speak or stay quiet
  -> if speaking, ask or suggest one thing
  -> shopper replies
  -> translate reply into memory + catalog action
  -> update page
```

### Page Events To Track

- Product opened
- Product saved
- Category browsed
- Filter clicked
- Image/gallery viewed
- Scroll depth
- Long dwell on a product
- Repeated color/category switching
- Back-and-forth between similar products
- Add-to-cart or hesitation near CTA

### Memory To Maintain

Session memory can be simple JSON:

```json
{
  "intent": "desk decor",
  "room": "white room",
  "surface": "dark brown desk",
  "preferredMood": "calm",
  "likedColors": ["yellow"],
  "suggestedColors": ["jade", "blue", "selenite"],
  "savedProducts": ["40351123"],
  "rejectedProducts": []
}
```

This memory should drive the next product suggestions.

## Dynamic Page Generation

The agent creates temporary landing pages from conversation.

Examples:

- "Desk crystals for a dark brown desk"
- "Calming blue and green decor under $20"
- "Giftable crystals under $10"
- "Home accents that work in a white room"
- "Products similar to this yellow crystal, but more subtle"

Instead of showing only a text answer, the UI changes:

- New page title
- Filtered product grid
- Explanation of why each result matches
- Suggested follow-up chips or voice prompts
- Save/compare actions

Example action:

```json
{
  "say": "I found smaller jade and blue pieces that should feel calmer on a dark wood desk.",
  "action": "render_dynamic_page",
  "pageTitle": "Calm desk crystals for dark wood",
  "filters": {
    "category": ["Crystal Shapes & Carvings", "Table Decorative Ornaments"],
    "maxPrice": 25,
    "colors": ["Blue", "Green", "Jade", "Multicolor"],
    "useCase": "desk decor"
  }
}
```

## Voice Layer

### Trigger

Desktop:

- Hold Spacebar to talk
- Or click a small voice control

Mobile web:

- Contextual bottom voice pill
- Copy changes based on product/page:
  - "Ask where this would fit in your room"
  - "Ask for calmer desk decor"
  - "Ask for gift options under $10"
- Tap-and-hold to speak

The voice UI should feel like a control surface, not a chatbot menu.

### Voice Stack Options

#### Option A: ElevenLabs Conversational AI

Best for a polished real-time demo.

Use when:

- We want natural speech and agent personality
- We want WebSocket/WebRTC real-time conversation
- We want the agent to speak back quickly

Architecture:

```text
Browser mic
  -> ElevenLabs Conversational AI
  -> tool call: /api/voice-action
  -> catalog + memory engine
  -> page action + spoken reply
```

#### Option B: Sarvam Speech + Our LLM

Best if Hindi/Hinglish or Indian-language voice is central.

Use when:

- Indian-language speech matters
- We want more control over intent parsing and page actions
- We are okay wiring STT, LLM, and TTS ourselves

Architecture:

```text
Browser mic
  -> Sarvam streaming STT
  -> LLM intent + agent policy
  -> catalog + memory engine
  -> Sarvam or ElevenLabs TTS
```

### Recommendation

For the first product demo, build the interaction with text input first, then add voice.

Use ElevenLabs if the demo goal is "wow, it talks like a concierge."  
Use Sarvam if the demo goal is Indian-language shopping.

## Implementation Plan

### Phase 1: CSV Product Surface

- Parse both CSVs into normalized JSON.
- Prioritize SHEIN crystal/home decor products for the first page.
- Use Walmart as optional supporting categories: curtains, candles, shoes, beauty.
- Build a discovery page with Airbnb-style product cards.
- Build detail pages using `product_id` routes.
- Add related products by category, color, material, and price.

### Phase 2: Text Concierge

- Add a bottom/side concierge input:
  "Ask what would work on your desk."
- Track page context:
  current product, category, visible cards, saves, scroll, dwell.
- Send text + context + catalog subset to an agent endpoint.
- Agent returns:
  - `say`
  - `ask`
  - `save_memory`
  - `render_dynamic_page`
  - `open_product`
  - `compare_products`

### Phase 3: Real-Time Agent Policy

- Add a lightweight decision layer that chooses whether to speak first.
- Example rules:
  - Product opened: make one contextual comment.
  - User dwells: ask one useful question.
  - User compares colors: ask where it will be used.
  - User saves product: offer similar options.
  - User rejects product: ask what was wrong.

### Phase 4: Dynamic Page Generation

- Convert agent actions into UI state.
- Render pages like:
  - "Desk decor for a white room"
  - "Blue crystals under $20"
  - "Giftable home accents"
- Preserve conversation memory across page changes.

### Phase 5: Voice

- Add hold-to-talk on desktop.
- Add contextual voice pill on mobile.
- Start with browser SpeechRecognition if we need a fast local prototype.
- Upgrade to ElevenLabs Conversational AI or Sarvam streaming STT for production-quality demo.

## First Demo Script

1. Open the CSV-generated SHEIN decor marketplace.
2. Say: "This whole storefront is generated from raw product data."
3. Open the yellow crystal.
4. Agent says:
   "Good choice. Is this for your desk, shelf, or gifting?"
5. User says:
   "Desk."
6. Agent asks:
   "What color is your desk or room?"
7. User says:
   "Dark brown desk, white room."
8. Page becomes:
   "Calm desk crystals for dark wood"
9. Agent says:
   "Yellow will pop, but jade and blue will feel calmer. I put those first."
10. User says:
   "Show cheaper ones."
11. Page updates to under-$10 options.

## Core Positioning

This is not a chatbot on a storefront.

It is a real-time commerce concierge where the page, product data, user behavior, and conversation keep shaping each other.

