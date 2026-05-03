// One-shot script: generate 8 UI mockups via fal.ai (openai/gpt-image-2)
// and download each PNG to public/design-mockups/<slug>.png.
//
// Run with:
//   FAL_KEY="..." node scripts/generate-mockups.mjs
//
// The key is read from env, never written to disk.

import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const FAL_KEY = process.env.FAL_KEY;
if (!FAL_KEY) {
  console.error("Missing FAL_KEY env var.");
  process.exit(1);
}

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(ROOT, "..", "public", "design-mockups");
await mkdir(OUT_DIR, { recursive: true });

// ────────────────────────────────────────────────────────────────────────────
// Prompt templates: 4 layouts × 2 aesthetics = 8 mockups.
// Designed so each variation produces a visually distinct UI; common context
// is shared so the *content* is comparable across them.
// ────────────────────────────────────────────────────────────────────────────

const COMMON =
  "A high-fidelity desktop UI mockup, 16:9 landscape, for a D&D tabletop battlemap web app called Daggor. " +
  "The center stage shows a top-down dungeon battlemap: a stone-floor parchment-style map with a subtle square grid " +
  "(~30 columns × 18 rows), three player tokens (red, blue, green circles with thin white border), two monster " +
  "tokens (purple circles), one or two grey rectangular cover walls. Realistic, sharp typography, real UI text — " +
  "not lorem ipsum. Show information density of a real GM dashboard. No mobile devices, no people, no hands, no logos.";

const LAYOUTS = {
  "floating-panels": {
    label: "Floating panels (current)",
    desc:
      "Layout: Tools and panels are FLOATING CARDS at the four edges. " +
      "A vertical icon toolbar floats on the LEFT EDGE with about 7 small icon buttons stacked (settings gear, " +
      "layers/maps, chevrons for floor up/down, a small circle for tokens, a square for cover, a people-icon for " +
      "spawn area, an eye for fog). " +
      "A small player-list card floats in the TOP-RIGHT showing 'Players (3/4)' and three rows: Alice (red dot, live), " +
      "Bob (blue dot, live), Eve (green dot, off). " +
      "An initiative tracker card floats in the BOTTOM-LEFT showing 'INITIATIVE — Round 2' header, four entries with " +
      "current turn highlighted: '1. Goblin · 18', '2. Bob · 14 (current)', '3. Alice · 11', '4. Owlbear · 7'. " +
      "Below them: Prev / Next turn / Edit / Reset buttons. " +
      "A soundboard card floats in the BOTTOM-RIGHT with 'SOUNDBOARD · Broadcast' header and three rows: " +
      "'Tavern ambient · loop (playing, eq bars)', 'Combat 1 (paused)', 'Mysterious whispers (paused)'. " +
      "The map fills the entire space behind/between these floating cards.",
  },
  "three-pane-shell": {
    label: "Three-pane Discord shell",
    desc:
      "Layout: Strict three-column structure with a thin top bar. " +
      "TOP BAR (~40px): breadcrumbs reading 'Daggor / Crystal Caves / Floor 1', a small ⌘K search hint on the right, " +
      "an audio mute icon, a 'Display ⤓' button. " +
      "NARROW LEFT RAIL (~64px wide): vertical stack of 7 small monochrome icon buttons (settings, maps, tokens, " +
      "cover, spawn, fog, separator, audio mute). One icon shows an active state. " +
      "MIDDLE MAIN PANE: the battlemap fills this column edge-to-edge with grid and tokens. " +
      "RIGHT SIDE PANE (~320px wide): three TABS at top labeled 'Players' (active) / 'Initiative' / 'Audio'. " +
      "Below the active tab: a list of 3 connected players with avatars, position coordinates, live/off badges. " +
      "STATUS BAR at the bottom (~24px) with dim text: 'connected · 73% zoom · floor 1/3 · 2 NPCs'.",
  },
  "left-rail-only": {
    label: "Linear-style left rail",
    desc:
      "Layout: One single dim LEFT SIDEBAR (~260px wide) with collapsible sections, no top bar, no right pane. " +
      "Sidebar sections from top to bottom: " +
      "'Crystal Caves' map title (small chevron picker for switching maps), " +
      "▾ 'MAPS' expanded with 4 small thumbnails or text rows, " +
      "▾ 'PLAYERS (3)' showing 3 rows with color dots and short names, " +
      "▾ 'INITIATIVE — Round 2' showing 'Bob is up · prev / next' compact controls, " +
      "▸ 'AUDIO' collapsed (just header). " +
      "The right of the sidebar is the battlemap, full-bleed. Tools live as a tiny floating cluster in the bottom-right " +
      "corner of the canvas (4 icon buttons). Subtle dividers between sections, no harsh borders. Inter typography, " +
      "very compact 12-13px.",
  },
  "canvas-first": {
    label: "Owlbear minimalist canvas-first",
    desc:
      "Layout: The battlemap fills 100% of the screen edge to edge — no chrome, no top bar, no side panels. " +
      "ONE floating tool palette docked at the BOTTOM CENTER: a horizontal pill with 6 icon buttons (settings, " +
      "tokens, cover, spawn, fog, audio). The active tool is highlighted. " +
      "TINY TEXT bottom-left in dim gray: 'Crystal Caves · Floor 1 · 3 players · Round 2'. " +
      "TINY TEXT bottom-right: a small 'Bob's turn' pill with the brand color. " +
      "Maximum canvas space. Players and tokens dominate the visual field.",
  },
};

const AESTHETICS = {
  "restrained": {
    label: "Restrained (Linear)",
    desc:
      "Aesthetic: Near-black canvas around #09090B. Panels in dark zinc #18181B with hairline borders at white-8%-opacity. " +
      "ONE accent color, a burnt-orange #D4671A, used sparingly for primary buttons, current-turn highlights, focus rings — " +
      "nothing else uses orange. Body text in cool neutral whites at 3 tiers (foreground / muted / dim). " +
      "Inter typography, tight 12-14px UI text. NO glassmorphism, NO gradients, NO drop shadows beyond subtle elevation, " +
      "NO ornaments, NO atmospheric effects. Reads like Linear, Notion, or Vercel's dashboard. Calm, clinical, precise.",
  },
  "theatrical": {
    label: "Theatrical (D&D)",
    desc:
      "Aesthetic: Atmospheric dark with a SUBTLE WARM VIGNETTE darkening the screen edges, as if lit by candlelight. " +
      "Brand accent is a parchment-amber #D4A04A used on headings and active borders. The battlemap has a subtle warm glow " +
      "halo bleeding from its edges. Panel borders carry a faint flame-orange inner glow. Section headings use an ornate " +
      "Cinzel-style serif; body text is Inter. Hints of gilded trim and aged-parchment texture on panel backgrounds. " +
      "Reads unmistakably as a D&D tool — moody, theatrical, candle-lit, not generic SaaS. Restrained execution: NO sparkles, " +
      "NO heavy gradients, NO obvious fantasy clip-art — the atmosphere is in the lighting and the typography.",
  },
};

const VARIANTS = [];
for (const [layoutKey, layout] of Object.entries(LAYOUTS)) {
  for (const [aesKey, aesthetic] of Object.entries(AESTHETICS)) {
    VARIANTS.push({
      slug: `${layoutKey}__${aesKey}`,
      label: `${layout.label} · ${aesthetic.label}`,
      prompt: `${COMMON}\n\n${layout.desc}\n\n${aesthetic.desc}`,
    });
  }
}

console.log(`Generating ${VARIANTS.length} mockups...`);

// ────────────────────────────────────────────────────────────────────────────
// fal API call. Synchronous mode (`sync_mode: true`) returns the result on the
// initial response instead of going through the queue.
// ────────────────────────────────────────────────────────────────────────────

const ENDPOINT = "https://fal.run/openai/gpt-image-2";

async function generateOne(variant) {
  const start = Date.now();
  console.log(`  → ${variant.slug}: requesting...`);

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Key ${FAL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: variant.prompt,
      image_size: "landscape_16_9",
      quality: "high",
      output_format: "png",
      num_images: 1,
      sync_mode: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`fal returned ${res.status} for ${variant.slug}: ${body.slice(0, 300)}`);
  }

  const json = await res.json();
  const url = json?.images?.[0]?.url;
  if (!url) {
    throw new Error(`no image URL in response for ${variant.slug}: ${JSON.stringify(json).slice(0, 300)}`);
  }

  // Download the PNG.
  const imgRes = await fetch(url);
  if (!imgRes.ok) {
    throw new Error(`failed to download image for ${variant.slug}: ${imgRes.status}`);
  }
  const buf = Buffer.from(await imgRes.arrayBuffer());
  const path = join(OUT_DIR, `${variant.slug}.png`);
  await writeFile(path, buf);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`  ✓ ${variant.slug}: ${(buf.length / 1024).toFixed(0)} KB in ${elapsed}s`);
  return { slug: variant.slug, label: variant.label, path: `/design-mockups/${variant.slug}.png` };
}

// Fire in parallel, capped to 4 at a time so fal doesn't rate-limit.
async function inBatches(items, fn, batchSize) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map(fn));
    settled.forEach((r) => {
      if (r.status === "fulfilled") results.push(r.value);
      else console.error("✗", r.reason?.message ?? r.reason);
    });
  }
  return results;
}

const successes = await inBatches(VARIANTS, generateOne, 4);

// Write a manifest the /design-mockups page can read.
const manifest = {
  generatedAt: new Date().toISOString(),
  variants: successes,
};
await writeFile(join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));

console.log(`\n${successes.length}/${VARIANTS.length} mockups saved to public/design-mockups/`);
console.log(`Manifest at public/design-mockups/manifest.json`);
