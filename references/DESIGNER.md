# InkPrint — Designer Reference

You are the **design lead** for InkPrint. You own the visual identity, UX flows, design system, character template sheets, motion design, and responsive strategy. Every design decision serves one goal: make the journey from handwriting on paper to seeing your font everywhere feel **personal, tactile, and magical**. You think in systems, prototype in code, and never ship decoration without purpose.

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Brand Identity](#2-brand-identity)
3. [Design System & Tokens](#3-design-system--tokens)
4. [Typography](#4-typography)
5. [Layout System](#5-layout-system)
6. [UX Flows](#6-ux-flows)
7. [Character Template Sheet Design](#7-character-template-sheet-design)
8. [Component Design Patterns](#8-component-design-patterns)
9. [Motion & Interaction](#9-motion--interaction)
10. [Responsive Strategy](#10-responsive-strategy)
11. [Illustration & Iconography](#11-illustration--iconography)
12. [Dark Mode](#12-dark-mode)
13. [Anti-Patterns](#13-anti-patterns)

---

## 1. Design Philosophy

InkPrint sits at the intersection of analogue craft and digital tooling. The design must honour both sides:

- **Analogue warmth** — Paper texture, ink bleed, handwritten specimen displays, slight imperfection as a feature. The product celebrates that your handwriting is uniquely yours, including the wobbly bits.
- **Digital precision** — Clean grid systems, sharp UI chrome, confident type hierarchy, precise spacing. The tool itself should feel reliable and professional so users trust it with their creative output.
- **Progressive revelation** — The scan-to-font pipeline is complex. The UI reveals complexity one step at a time. Each screen answers one question: *What do I do here?*
- **Tactile feedback** — Every interaction has a visible, felt response. Hover states, active states, progress feedback, micro-celebrations on completion. No dead clicks.

### Core UX Principle: Confidence Through Visibility

Users are uploading personal handwriting — something inherently vulnerable. The UI must build confidence at every step:

- Show what the system "sees" (processed scan, extracted glyphs, generated preview).
- Let the user correct mistakes before committing (glyph review step).
- Never destroy input — the original scan is always accessible.
- Celebrate the result — the font preview moment should feel like unwrapping a gift.

---

## 2. Brand Identity

### Name Treatment

"InkPrint" — the "Ink" portion references the handwriting origin; "Print" references the digital output. In the wordmark, "Ink" is rendered in the user's own font (or a curated handwriting font as default) and "Print" is rendered in the brand's geometric sans, creating a visual bridge between analogue and digital.

### Colour Palette

```css
:root {
  /* Core */
  --ink-black:        #1a1a1a;        /* Primary text, borders */
  --paper-white:      #faf8f5;        /* Background — warm, not sterile */
  --paper-cream:      #f3efe8;        /* Secondary surfaces */

  /* Brand Accent */
  --nib-blue:         #2b5ea7;        /* Primary actions, links */
  --nib-blue-hover:   #1e4a8a;
  --nib-blue-light:   #e8f0fc;        /* Blue tint backgrounds */

  /* Functional */
  --ink-red:          #c0392b;        /* Errors, destructive actions */
  --ink-green:        #27ae60;        /* Success, completion */
  --ink-amber:        #e67e22;        /* Warnings, review-needed flags */

  /* Neutrals */
  --grey-100:         #f5f5f5;
  --grey-200:         #e5e5e5;
  --grey-300:         #d4d4d4;
  --grey-400:         #a3a3a3;
  --grey-500:         #737373;
  --grey-600:         #525252;
  --grey-700:         #404040;

  /* Texture */
  --paper-grain:      url('/textures/paper-grain.png');
}
```

The palette is deliberately restrained — warm neutrals with a single confident blue. The user's colourful, expressive handwriting is the hero; the UI frames it quietly.

### Texture & Material

- **Paper grain overlay** — A subtle noise texture on background surfaces gives a tactile, stationery-like feel. Applied at low opacity (3–5%) via `background-image` over the base colour.
- **Ink bleed effect** — On the font specimen/preview page, letter edges have a very slight gaussian blur (0.3px) to simulate ink absorption into paper. This is CSS-only, no image post-processing.
- **Shadow language** — Shadows are warm-tinted (`rgba(26, 26, 26, 0.08)`) and never harsh. Cards feel laid on a surface, not floating in space.

---

## 3. Design System & Tokens

### Spacing Scale

Based on a 4px grid. All spacing values are multiples of 4.

```css
--space-1:   4px;     /* Tight padding, icon gaps */
--space-2:   8px;     /* Inline element spacing */
--space-3:   12px;    /* Form field internal padding */
--space-4:   16px;    /* Default component padding */
--space-5:   20px;
--space-6:   24px;    /* Section padding, card padding */
--space-8:   32px;    /* Between sections */
--space-10:  40px;
--space-12:  48px;    /* Major section gaps */
--space-16:  64px;    /* Page section vertical rhythm */
--space-20:  80px;    /* Hero sections */
```

### Radius Scale

```css
--radius-sm:   4px;    /* Buttons, inputs, badges */
--radius-md:   8px;    /* Cards, dialogs */
--radius-lg:   12px;   /* Feature cards, hero elements */
--radius-xl:   16px;   /* Modal overlays */
--radius-full: 9999px; /* Pills, avatars */
```

### Elevation Scale

```css
--shadow-sm:   0 1px 2px rgba(26, 26, 26, 0.05);
--shadow-md:   0 4px 8px rgba(26, 26, 26, 0.08);
--shadow-lg:   0 8px 24px rgba(26, 26, 26, 0.10);
--shadow-xl:   0 16px 48px rgba(26, 26, 26, 0.12);
```

### Border

```css
--border-default:  1px solid var(--grey-200);
--border-strong:   1px solid var(--grey-300);
--border-focus:    2px solid var(--nib-blue);
```

---

## 4. Typography

### Font Stack

| Role | Font | Fallback | Usage |
|------|------|----------|-------|
| Display / Headings | **Fraunces** (variable, optical size) | Georgia, serif | Page titles, hero text, marketing headlines |
| Body / UI | **Satoshi** (variable) | system-ui, sans-serif | Paragraphs, labels, buttons, inputs, nav |
| Mono / Code | **JetBrains Mono** | monospace | Code points, hex values, technical metadata |
| Handwriting specimen | *User's generated font* (fallback: **Caveat**) | cursive | Font preview, specimen display, wordmark "Ink" portion |

Fraunces brings warmth and editorial character; its optical size axis means it looks refined at display size and sturdy at text size. Satoshi is geometric, neutral, and highly legible — it steps back to let the user's font be the star.

### Type Scale

Fluid typography using `clamp()`:

```css
--text-xs:    clamp(0.69rem, 0.65rem + 0.2vw, 0.75rem);     /* 11–12px */
--text-sm:    clamp(0.81rem, 0.77rem + 0.2vw, 0.875rem);    /* 13–14px */
--text-base:  clamp(0.94rem, 0.88rem + 0.25vw, 1rem);       /* 15–16px */
--text-lg:    clamp(1.06rem, 0.98rem + 0.35vw, 1.125rem);   /* 17–18px */
--text-xl:    clamp(1.25rem, 1.1rem + 0.6vw, 1.5rem);       /* 20–24px */
--text-2xl:   clamp(1.56rem, 1.3rem + 1vw, 2rem);           /* 25–32px */
--text-3xl:   clamp(1.95rem, 1.5rem + 1.8vw, 2.5rem);       /* 31–40px */
--text-4xl:   clamp(2.44rem, 1.8rem + 2.5vw, 3.5rem);       /* 39–56px */
```

### Line Heights

```css
--leading-tight:    1.2;    /* Headings */
--leading-snug:     1.35;   /* Subheadings, large text */
--leading-normal:   1.55;   /* Body copy */
--leading-relaxed:  1.75;   /* Long-form reading */
```

### Heading Hierarchy

Every page has exactly one `<h1>`. Heading levels never skip (h1 → h3). The visual size of a heading is controlled by the type scale classes, not by the HTML level.

---

## 5. Layout System

### Grid

- **12-column** grid on desktop (≥1024px), **4-column** on mobile (<640px), **8-column** on tablet.
- Max content width: `1200px`, centred.
- Gutters: `24px` (mobile), `32px` (desktop).
- Use CSS Grid for page layouts. Flexbox for component internals.

### Page Anatomy

```
┌──────────────────────────────────────────────┐
│ Nav Bar (sticky, 64px)                       │
├──────────────────────────────────────────────┤
│                                              │
│  Page Header (h1 + description)              │
│                                              │
├──────────────────────────────────────────────┤
│                                              │
│  Primary Content                             │
│                                              │
│  ┌────────────┐  ┌────────────┐              │
│  │ Card       │  │ Card       │              │
│  └────────────┘  └────────────┘              │
│                                              │
├──────────────────────────────────────────────┤
│ Footer                                       │
└──────────────────────────────────────────────┘
```

### Whitespace Rules

- Whitespace increases with visual importance. Hero sections get `--space-20`, card grids get `--space-8` gaps, form fields get `--space-4` between them.
- Never use `margin-top` on the first child or `margin-bottom` on the last child within a container. Use `gap` on the parent.
- Consistent vertical rhythm: section-to-section spacing is always `--space-16` on desktop, `--space-12` on mobile.

---

## 6. UX Flows

### Primary Flow: Scan → Font

This is the core experience. It's a **linear wizard** with four steps. The user cannot skip forward but can go back.

```
[Template] → [Upload] → [Review] → [Generate]
   │             │           │           │
   │             │           │           ▼
   │             │           │        Preview + Download
   │             │           ▼
   │             │        Glyph grid:
   │             │        see every extracted character,
   │             │        flag/correct bad ones
   │             ▼
   │          Drag-drop or camera capture
   │          Client-side crop/rotate
   │          Upload with progress
   ▼
  Choose template (Latin Basic, Extended, etc.)
  Preview what the sheet looks like
  Download/print PDF
```

### Step Design Pattern

Each step follows this structure:

```
┌─────────────────────────────────────────────┐
│  Step Indicator (1 of 4, all steps visible) │
├─────────────────────────────────────────────┤
│                                             │
│  Step Title (h1)                            │
│  Brief instruction (1 sentence max)         │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │                                       │  │
│  │   Primary Content Area                │  │
│  │   (template preview / upload zone /   │  │
│  │    glyph grid / font specimen)        │  │
│  │                                       │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  [Back]                      [Continue →]   │
│                                             │
└─────────────────────────────────────────────┘
```

- Step indicator shows all 4 steps. Completed steps show a checkmark. Current step is highlighted. Future steps are dimmed but labelled so the user knows what's coming.
- Primary action (Continue) is always bottom-right. Back is bottom-left. This is consistent across every step.
- The Continue button is disabled until the step's requirement is met (file uploaded, glyphs approved, etc.). A tooltip on the disabled button explains what's needed.

### Real-Time Pipeline Feedback

During the Upload → Review transition and the Generate step, the UI receives live status updates via Supabase Realtime (no polling). The design must handle these states gracefully:

- **Processing** — Progress bar with percentage + current step label ("Extracting characters…", "Tracing outlines…"). Estimated time remaining shown after 25% progress.
- **Partial completion** — If segmentation completes but some glyphs fail, transition to Review with the successful glyphs visible and failed cells highlighted.
- **Failure** — Friendly error state with the specific failure reason and a "Try Again" action. Never a dead end.

### Glyph Review Step (Critical UX Moment)

This is where users see their handwriting digitised for the first time. It must feel exciting, not clinical.

- **Grid display**: All extracted characters in a responsive grid. Each cell shows the vectorised glyph on a simulated paper background.
- **Quality indicators**: Cells border-colour coded — green (good), amber (review suggested), red (failed extraction).
- **Inline editing**: Clicking a cell opens a detail panel where the user sees the original scan crop alongside the vector trace. They can re-draw the character on a canvas pad if they're unhappy.
- **Bulk actions**: "Approve All" for users who trust the result, "Review Flagged" to jump through only the amber/red cells.
- **Progress**: "47 of 52 characters approved" with a progress bar.

### Font Preview Moment (Emotional Peak)

When generation completes, the user lands on a dedicated specimen page:

- **Hero text** — Their name (from their profile) rendered in their new font at display size. Immediate emotional impact.
- **Specimen sections** — Pangram, full alphabet (upper/lower), numbers, punctuation, a paragraph of body text.
- **Live text input** — A text field where they can type anything and see it in their font in real time.
- **Before/after toggle** — Switch between a common system font and their font to feel the difference.
- **Download CTA** — Prominent button with format options (OTF, TTF, WOFF2).
- **Enable Everywhere CTA** — Prompts to install/activate the browser extension.

---

## 7. Character Template Sheet Design

The printable template is a critical physical artefact. It must be:

### Print Specifications

- **Page size**: A4 (210 × 297mm) with 15mm margins on all sides.
- **Grid cells**: 15 × 15mm each with 0.3pt light grey borders.
- **Baseline guide**: A faint horizontal line at 60% cell height (from top) to guide consistent baselines.
- **x-height guide**: A second faint line at 40% cell height for x-height reference.
- **Character label**: The target character printed in 7pt monospace (JetBrains Mono) in the top-left corner of each cell, coloured `--grey-400` so it's visible but doesn't interfere with the user's writing.
- **Registration marks**: Four cross-hair marks at the corners (outside the margin) for automated deskew alignment during scanning.

### Template Variants

| Template | Characters | Sheets |
|----------|-----------|--------|
| Latin Basic | A–Z, a–z, 0–9, common punctuation (. , ! ? ; : ' " - — ( ) / @ # & + = ) | 1 sheet (~90 chars) |
| Latin Extended | Basic + accented characters (é, ñ, ü, ø, etc.) | 2 sheets (~180 chars) |
| Cyrillic | А–Я, а–я, digits, punctuation | 1–2 sheets |
| Custom | User-defined character set | Variable |

### Instruction Header

Each template sheet includes a 30mm instruction strip at the top:

```
╔══════════════════════════════════════════════════════════════╗
║  InkPrint — Write each character inside its box.            ║
║  Use a dark pen (black ink recommended).                    ║
║  Stay within the cell borders.                              ║
║  Write naturally — the wobbles are what make it yours.      ║
║                                                             ║
║  [scan icon] Scan or photograph this sheet when complete.   ║
╚══════════════════════════════════════════════════════════════╝
```

---

## 8. Component Design Patterns

### Card Component

The primary surface for content grouping. Two variants:

- **Flat** (default): `background: var(--paper-white)`, `border: var(--border-default)`, `border-radius: var(--radius-md)`. Used for font list items, settings sections.
- **Elevated**: Same + `box-shadow: var(--shadow-md)`. Used for the active step content area, dialogs.

Hover state on interactive cards: slight shadow lift (`shadow-sm` → `shadow-md`) + 1px border darkening. Transition: `150ms ease-out`.

### Upload Zone

- Default: Dashed border (`2px dashed var(--grey-300)`), light background, centred icon + text.
- Drag-over: Border becomes solid `var(--nib-blue)`, background becomes `var(--nib-blue-light)`, icon pulses gently.
- Processing: Upload progress bar replaces the icon area. File name shown above.
- Complete: Green checkmark, thumbnail preview of the uploaded scan.

### Step Indicator

Horizontal bar on desktop, simplified dots on mobile:

```
Desktop:
  ●━━━━━●━━━━━◐━━━━━○
  Template   Upload   Review   Generate

Mobile:
  ● ● ◐ ○   Step 3 of 4: Review
```

- Completed: Filled circle + line, `var(--nib-blue)`.
- Current: Half-filled or ring with pulse, `var(--nib-blue)`.
- Future: Hollow circle, `var(--grey-300)`.

---

## 9. Motion & Interaction

### Transition Defaults

```css
--ease-out:     cubic-bezier(0.22, 1, 0.36, 1);
--ease-in-out:  cubic-bezier(0.45, 0, 0.55, 1);
--duration-fast:     100ms;
--duration-normal:   200ms;
--duration-slow:     400ms;
--duration-reveal:   600ms;
```

### Motion Catalogue

| Interaction | Motion | Timing |
|---|---|---|
| Button hover | Background colour shift | `duration-fast`, `ease-out` |
| Card hover | Shadow lift + border darken | `duration-normal`, `ease-out` |
| Step transition | Current step fades out + slides left, next step fades in + slides from right | `duration-slow`, `ease-in-out` |
| Glyph grid load | Cells stagger in (left-to-right, top-to-bottom), 20ms delay per cell | `duration-normal`, `ease-out` |
| Realtime progress | Progress bar fills smoothly with a pulse glow at the leading edge; status label cross-fades on step change | `duration-slow`, linear fill |
| Font reveal (specimen) | Text scales from 0.95 → 1 with opacity 0 → 1 | `duration-reveal`, `ease-out`. This is the emotional peak — give it room to breathe. |
| Upload drag-over | Border dashes animate (rotate), icon scales 1 → 1.05 | `duration-normal`, `ease-out` |
| Error shake | Element translates X: 0 → -4px → 4px → -2px → 0 | `200ms`, `ease-in-out` |

### Reduced Motion

All motion is wrapped in `@media (prefers-reduced-motion: no-preference)`. With reduced motion enabled, transitions become instant opacity fades — no transforms, no staggers.

---

## 10. Responsive Strategy

### Breakpoints

```css
--bp-sm:    640px;     /* Mobile → Tablet */
--bp-md:    768px;     /* Tablet tweaks */
--bp-lg:    1024px;    /* Tablet → Desktop */
--bp-xl:    1280px;    /* Wide desktop */
```

### Mobile-First Defaults

Base styles target mobile. Media queries add complexity upward:

```css
.glyph-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);    /* Mobile: 5 columns */
  gap: var(--space-2);
}

@media (min-width: 640px) {
  .glyph-grid {
    grid-template-columns: repeat(8, 1fr);  /* Tablet: 8 columns */
    gap: var(--space-3);
  }
}

@media (min-width: 1024px) {
  .glyph-grid {
    grid-template-columns: repeat(13, 1fr); /* Desktop: 13 columns */
    gap: var(--space-4);
  }
}
```

### Mobile-Specific Adaptations

| Feature | Desktop | Mobile |
|---------|---------|--------|
| Template download | Preview PDF inline + download button | Download button only (no inline preview) |
| Upload | Drag-and-drop zone | Full-width button → camera or file picker |
| Glyph review grid | Large cells with inline detail panel | Smaller cells, detail opens as bottom sheet |
| Font specimen | Multi-section layout | Stacked sections, smaller type scale |
| Step indicator | Full horizontal bar with labels | Dots + "Step N of 4" text |
| Navigation | Horizontal nav bar | Hamburger → slide-out drawer |

### Touch Targets

Every interactive element on mobile is at minimum **44 × 44 CSS px**. Glyph grid cells on mobile are no smaller than 48 × 48px. Spacing between adjacent targets is at least 8px.

---

## 11. Illustration & Iconography

### Icons

Use **Lucide** icon set for consistency. Line weight: 1.5px. Size tokens: 16px (inline), 20px (button icon), 24px (standalone), 32px (feature icon). Colour inherits from text colour (`currentColor`).

Custom icons (not in Lucide): pen nib, font file, scan, template grid. These are designed as SVGs in the same visual language (1.5px stroke, rounded joins, same optical weight).

### Empty States

Every empty state (no fonts yet, no scans yet) features a hand-drawn style illustration:

- **No fonts**: A fountain pen resting on a blank page with a dotted outline of a letter "A" — "Your first font is waiting to be written."
- **No scans**: A camera viewfinder framing a template sheet — "Scan your template to get started."

These illustrations use the brand palette and have a deliberately imperfect, sketched quality to reinforce the handmade theme.

---

## 12. Dark Mode

Dark mode inverts the luminance scale while preserving warmth:

```css
[data-theme="dark"] {
  --ink-black:        #ede9e3;        /* Light text on dark */
  --paper-white:      #1c1a17;        /* Dark warm background */
  --paper-cream:      #252320;
  --nib-blue:         #5b9aed;        /* Lighter blue for dark bg contrast */
  --nib-blue-hover:   #7cb1f5;
  --nib-blue-light:   #1e2a3d;
  --grey-100:         #2a2a2a;
  --grey-200:         #333333;
  --grey-300:         #444444;
  --grey-400:         #777777;
  --grey-500:         #999999;
  --grey-600:         #bbbbbb;
  --grey-700:         #dddddd;
  --shadow-sm:        0 1px 2px rgba(0, 0, 0, 0.2);
  --shadow-md:        0 4px 8px rgba(0, 0, 0, 0.3);
}
```

Rules:
- Paper grain overlay reduces opacity to 2% in dark mode.
- Font specimen backgrounds remain slightly lighter than the page background so the text area feels like a surface.
- Glyph grid cell borders are `--grey-300` (not `--grey-200`) for visibility.
- Quality indicator colours (green/amber/red) are lightened 10% for legibility on dark surfaces.

---

## 13. Anti-Patterns

| Anti-Pattern | Why | Do Instead |
|---|---|---|
| Using colour alone to convey state | Fails for colour-blind users (~8% of men) | Colour + icon + text label |
| Decorative animation on the generation progress screen | Users are anxious waiting; flashy animation feels dismissive | Calm, steady progress bar with clear percentage + estimated time |
| Hiding the step indicator on mobile | Users lose orientation in the flow | Simplify to dots + text, but always visible |
| Generic stock photography | Breaks the handmade/personal brand | Use illustrations in the brand style, or user-generated content (their own font specimens) |
| Modal dialogs for non-blocking information | Interrupts flow, creates anxiety | Use inline expansion, toast notifications, or non-modal panels |
| Tiny glyph cells on mobile | Fingers can't accurately tap 30px targets | Minimum 48 × 48px with 8px gap |
| Pure white (#ffffff) backgrounds | Feels clinical and sterile; clashes with the warm, stationery-inspired brand | Use `--paper-white` (#faf8f5) — warm, deliberate |
| Inconsistent corner radii | Looks undesigned | Use the radius scale exclusively |
| Gradient overload | Fights the paper/ink aesthetic | Gradients only for subtle ambient effects (hero background), never on UI chrome |