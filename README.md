# Cursor Commerce

A working prototype for cursor-native commerce assistance. It watches customer journey signals on a product page, then shows a small cursor-near prompt when the shopper appears uncertain.

## Try it

1. For the non-AI static demo, start a static server from this folder:

   ```bash
   python3 -m http.server 8000
   ```

2. Open `http://localhost:8000/thesis.html` for the thesis.
3. Open `http://localhost:8000/demo-apparel-page.html` for the demo.
4. Hover over the size buttons for a couple of seconds, or click the product image.

The assistant should appear near your cursor with prompts like “Need fit help?” or “Want to see it on yourself?”

## Gemini try-on

The virtual try-on endpoint uses Gemini image editing. By default it uses `gemini-2.0-flash-preview-image-generation` because it is more likely to work on free-tier API keys. To use Nano Banana / Gemini 2.5 Flash Image after enabling billing, set:

```bash
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
```

Do not put the real key in frontend JavaScript. For local Vercel testing, create `.env.local`:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
```

Then run the Vercel dev server instead of `python3 -m http.server`:

```bash
vercel dev
```

Open the URL printed by Vercel, usually `http://localhost:3000/demo-apparel-page.html`. The AI try-on will not work on the plain Python static server because that server cannot run `/api/try-on`.

If you do not have Vercel CLI installed, use the included local server instead:

```bash
node local-dev-server.js
```

Open `http://localhost:8000/demo-apparel-page.html`. This server serves the static demo and runs `/api/try-on`.

For production, add `GEMINI_API_KEY` in the Vercel project environment variables, then redeploy.

## What V1 does

- Detects shopping journey signals on product pages.
- Extracts title, price, and visible size options when possible.
- Classifies hovered elements as size selector, size guide, price, image, reviews, or add-to-cart.
- Triggers one proactive size-help prompt from size hesitation.
- Recommends a size locally from height, weight, usual size, and preferred fit.
- Opens a virtual try-on drawer from product-image interest.
- Calls the serverless Gemini endpoint for AI try-on previews when configured.
