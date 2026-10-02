# Nodus Design System

**Nodus** — decentralized private cloud. Category: *Private Programmable Cloud / Private Data Infrastructure*. Blockchain is part of the infrastructure; the brand is about **private data infrastructure**.

Promise: **Your data has a guardian.**
Personality: technical, quiet, precise, premium, trustworthy, futuristic, minimal — mysterious without being obscure, technological without looking gamer.

Visual language = **Deep Black + Nodus Blue + Geist + Voxel Data + Guardian + Technical Grid**. Master test: *does it look like Nodus without the logo?*

## Sources
- `uploads/ChatGPT Image Sep 29, 2026, 03_14_55 PM.png` — official key visual (Guardian, pixel mark + wordmark lockup, 4-color palette). Copied to `assets/nodus-key-visual.png`; crops derived from it.
- "NODUS — MASTER DESIGN SYSTEM" brief (pasted text, 48 sections) — source of all rules below.
- No codebase, Figma, product screenshots or slide templates were provided. UI kits are therefore brand-spec-derived, not recreations of an existing product.

## Products / surfaces
- **Console** (web app) — objects, nodes, access keys, developer SDK → `ui_kits/console/`
- **Website** (marketing landing) → `ui_kits/website/`
- Also governed (no kit yet): developer portal/docs, decks, documents, social, motion.

---

## CONTENT FUNDAMENTALS
- **Short, technical, understandable, confident.** Headlines are 2–7 words, often two clipped sentences: *"Your data. Under your control."*, *"Private by design."*, *"One private data layer."*
- **Lead with the benefit, then the mechanism.** First talk privacy, control, building, data. Only then encryption, distributed storage, blockchain, protocols.
- **Voice:** address the reader as **you / your** ("your data", "your nodes"). Nodus speaks as a quiet system, rarely "we" (only in onboarding/company contexts: "We onboard a small number of teams each week.").
- **Casing:** sentence case for headlines, buttons and labels ("Get early access", "Create key"). UPPERCASE only for small labels with 0.08em tracking and for API verbs **PUT · GET · SHARE · SEARCH**.
- **Wordmark:** always **Nodus** — never NODUS, never nodus.
- **Periods on headlines** are welcome — they give the calm, final tone. Buttons have no periods.
- **Numbers are concrete and mono:** "24 fragments · 8 nodes", "42 ms", "2.41 TB". Use `·` as the separator.
- **No emoji. No exclamation marks. No buzzwords** (no "revolutionary", "web3", "to the moon"). No crypto/NFT vocabulary in marketing.
- Empty/success copy is reassuring and precise: *"Nothing shared with you yet."*, *"Upload encrypted — report.pdf → 24 fragments on 8 nodes."*, *"No fragment is missing, no key is exposed."*
- Core phrases: Your data. Under your control. · Private by design. · Programmable by default. · One private data layer. · Build your product. Not your storage infrastructure. · Your data deserves its own guardian.

## VISUAL FOUNDATIONS
- **Palette update (Sep 29, 2026):** Acid Lime was replaced by **Nodus Blue `#1FA8FF`** (sampled from the blue Guardian). Hover `#4DBBFF`, press `#0A8FE6`, dim `#0B6FB3`; light-theme text-safe blue `#0069B8`. Tokens renamed `--nd-lime*` → `--nd-blue*`. Wherever this doc says "Blue", it plays the role the brief gave Acid Lime (signal color, 3–7%).
- **Color.** Deep `#080B0A` background (70–80%), Stone `#E8EEE8` text (10–20%), Slate `#66706A` secondary/borders (5–10%), **Nodus Blue `#1FA8FF` as signal only (3–7%)** — CTA, active/selected, progress, data highlights, Guardian eyes. Derived darks `#0C100E #111613 #171D19 #202720` build depth. Functional red `#FF5A4E` / amber `#FFB547` only for error/warning. No other hues. Tokens: `tokens/colors.css`.
- **Type.** Geist everywhere (fallback Inter, Arial). Display 600, tight tracking (-0.045em), few words. H1/H2 600, H3 500–600, body 400, labels 500 uppercase +0.08em. **Geist Mono** for code, hashes, API, metrics, metadata. Never a pixel font for text. `tokens/typography.css`.
- **Spacing.** 4px base: 4 8 12 16 24 32 48 64 96 128. Generous negative space is part of the identity — sections use 96–128px vertical padding.
- **Backgrounds.** Flat Deep, optionally the **technical grid** (64px, ~10% slate hairlines, `--bg-grid`). Localized blue radial light is allowed where data "emits" it (CTA panel corner, active node). No full-bleed gradients, no purple/blue SaaS gradients, no textures. Imagery = official Guardian/voxel renders on black.
- **Light & glow.** Light comes *from the data*: active voxels, Guardian eyes, progress bars, the selected tab indicator. Glow is soft, localized, controlled (`--glow-sm`, `--glow-cta`). Never cyberpunk neon.
- **Cards.** Deep-derived fill (`--surface-1`), 1px slate border at 24% opacity, radius 16 (12–20 by scale), **no big drop shadows**. Active card = blue border + soft 32px blue halo. Use surfaces only when they add hierarchy.
- **Borders.** Always 1px, slate low-opacity; blue when active/focused. No strong white borders.
- **Shadows.** Dark, soft (`--shadow-sm/md/lg`) and mainly for floating layers (dialogs, toasts, tooltips).
- **Glass.** Dark translucent `rgba(12,16,14,.72)` + 16px blur + subtle border — only navbar (on scroll), toasts, floating controls, modal scrims.
- **Radii.** 8 small · 10–12 controls · 16 cards · 20–24 large surfaces/dialogs. Never pill-heavy; badges use 6px.
- **Hover.** Primary: lighter blue `#4DBBFF` + soft glow. Secondary: border → blue. Ghost: text → blue + 8% blue tint. Rows/cards: surface steps one level lighter or border → slate.
- **Press.** Darker blue `#0A8FE6` + 1px translateY. No shrink/bounce.
- **Focus.** 2px Deep gap + 2px blue ring (`--focus-ring`); inputs use blue border + 3px 8%-blue ring.
- **Motion.** Precise, physical, computational. Fade, translate, voxel fragmentation/reconstruction, glow pulses. Easing `cubic-bezier(.2,0,0,1)`; micro 150–250ms, UI 250–450ms, brand 600–1200ms. **No bounce, no elastic.** Honors `prefers-reduced-motion` (durations → 0).
- **Voxels.** The data language: idle (dark), active (blue), encrypted (dark + blue edge), transferring (blue + trail), verified (stone→blue), blocked (dashed slate). Every state also differs in shape/border, not only color.
- **Data viz.** Deep bg; primary series blue, secondary Stone, reference Slate (dashed); ultra-subtle grid. No multi-color palettes.
- **Layout.** 1200px max container; fixed glass nav on marketing; app shell = 232px sidebar (deep-0) + 64px topbar. Mobile is its own composition, not a shrunk desktop.
- **Documents/print.** Invert: Stone background, Deep text, blue only as small highlights.

## ICONOGRAPHY
- **Lucide** (CDN, pinned `lucide@0.453.0`) — linear, geometric, 1.5px stroke (2px under 16px). Loaded automatically by the `Icon` component; no icon font or sprite was provided, so this is the spec's stated preference, not a substitution.
- Default color Slate-2/secondary; **active = Nodus Blue**.
- Common glyphs: shield, lock, key-round, database, boxes, network, server, fingerprint, terminal, upload, download, share-2, search, check, circle-alert.
- **No emoji. No 3D icons in UI** — 3D is reserved for the Guardian and voxels. Unicode used only as typographic separators (`·`, `→`, `✓` in terminal output, `⌘K`).
- Avoid: giant padlocks, generic cloud icons, chains, coins.

## Brand assets (`assets/`)
- `nodus-key-visual.png` — full official key visual (1536×1024)
- `guardian-blue.png` — **official Guardian (blue, 3/4 view, 1254², black bg)**. Primary Guardian asset everywhere. **Never redraw or reinterpret.**
- `guardian-blue-head.png` — head crop; `guardian-face-blue.png` — visor crop with eyes removed (eyes rendered live in the nav/splash).
- Legacy lime-era assets (`nodus-key-visual.png`, `nodus-lockup.png`, `nodus-mark.png`, `guardian-front/back.png`, old crops) are kept for reference only — **do not use** (off-palette).
- The `Wordmark` component renders "No" Stone + "dus" Blue in Geist 600, matching the lockup. **No vector logo was provided** — request SVGs for production.

---

## Index
- `styles.css` — entry; `@import`s only → `tokens/{fonts,colors,typography,spacing,effects,base}.css`
- `guidelines/` — 21 foundation specimen cards (Colors, Type, Spacing, Effects, Motion, Brand)
- `components/` — React primitives (below), one `@dsCard` per folder
- `ui_kits/console/` — web app click-through · `ui_kits/website/` — landing page
- `assets/` — brand imagery · `thumbnail.html` — DS tile · `SKILL.md` — agent skill

### Components
- **core/** — Icon, Button, IconButton, Badge, Tag, Card
- **forms/** — Input, Select, Checkbox, Radio, Switch
- **navigation/** — Tabs
- **feedback/** — Dialog, Toast, Tooltip, ProgressBar
- **brand/** — Voxel, Guardian, Wordmark
- **data/** — CodeBlock, Stat

### Intentional additions
No source component inventory existed, so a standard set was authored. Beyond the standard list: **Icon** (Lucide wrapper), **ProgressBar** (spec: progress in blue), **Voxel / Guardian / Wordmark** (spec §03, §12–14), **CodeBlock** (spec §36), **Stat** (spec §32 data slides/dashboards).
