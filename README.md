# Hesitate Fit Assistant

A working Chrome extension prototype for apparel shopping pages. It watches for size hesitation, then shows a small cursor-near prompt that opens a fit recommendation panel.

## Try it

1. Open Chrome and go to `chrome://extensions`.
2. Turn on Developer mode.
3. Click **Load unpacked**.
4. Select this folder:

   `/Users/harshwardhansolanki/Documents/Codex/2026-04-25/can-you-access-this-chat`

5. Visit a product page on Gymshark, or open `demo-apparel-page.html`.
6. Hover over the size buttons for a couple of seconds, or click **Size guide**.

The assistant should appear near your cursor with: “Not sure about size?”

## What V1 does

- Detects likely apparel product pages.
- Extracts title, price, and visible size options when possible.
- Classifies hovered elements as size selector, size guide, price, image, reviews, or add-to-cart.
- Triggers one proactive size-help prompt from size hesitation.
- Recommends a size locally from height, weight, usual size, and preferred fit.

No backend or API key is needed for this prototype.
