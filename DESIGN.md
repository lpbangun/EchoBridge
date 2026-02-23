# DESIGN.md — EchoBridge Design System

## Design Philosophy: Swiss International Style

EchoBridge follows the Swiss International Typographic Style. Every element serves a function. Nothing is decorative. The interface communicates through typography, space, and structure — not through color, shadows, or ornamentation.

**Principles:**
1. **Content is the interface.** The meeting transcript and notes ARE the product. The UI is a frame, not a feature.
2. **Precision over personality.** Every spacing value, font size, and color has a reason. No eyeballing.
3. **Reduction.** If an element can be removed without losing function, remove it.
4. **Grid discipline.** Everything aligns to the 8px base grid. No exceptions.

---

## Typography

### Font Stack

```css
/* Primary: Helvetica Neue or system equivalent */
--font-sans: 'Helvetica Neue', 'Helvetica', 'Arial', system-ui, sans-serif;

/* Monospace: for transcripts and code */
--font-mono: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
```

Do NOT use Google Fonts. Helvetica Neue is the canonical Swiss typeface. The system fallback chain ensures consistency across platforms without external font loading.

### Type Scale (based on 1.250 ratio — Major Third)

```
--text-xs:    0.75rem   / 12px   — Labels, metadata, timestamps
--text-sm:    0.875rem  / 14px   — Secondary text, captions
--text-base:  1rem      / 16px   — Body text, transcript
--text-lg:    1.25rem   / 20px   — Section headers in notes
--text-xl:    1.5rem    / 24px   — Page titles, session titles
--text-2xl:   2rem      / 32px   — Hero text (landing page only)
```

### Font Weights

Only three weights. Never use anything else.

```
--font-regular:  400   — Body text, descriptions
--font-medium:   500   — UI labels, buttons, interactive elements
--font-bold:     700   — Titles, emphasis (use sparingly)
```

### Letter Spacing

```
--tracking-tight:   -0.01em   — Large titles (text-xl, text-2xl)
--tracking-normal:   0        — Body text
--tracking-wide:     0.05em   — Uppercase labels, metadata
--tracking-widest:   0.1em    — Section labels, category tags
```

### Tailwind mapping:

```jsx
// Page title
<h1 className="text-xl font-bold tracking-tight text-neutral-900">

// Section header
<h2 className="text-lg font-medium text-neutral-900">

// Body text
<p className="text-base font-normal text-neutral-700 leading-relaxed">

// Metadata / label
<span className="text-xs font-medium tracking-widest uppercase text-neutral-500">

// Transcript text
<p className="font-mono text-sm text-neutral-600 leading-relaxed">
```

---

## Color Palette

Minimal. Functional. No gradients. No decorative color.

### Core

```
--white:         #FFFFFF     — Backgrounds
--neutral-50:    #FAFAFA     — Subtle background differentiation
--neutral-100:   #F5F5F5     — Card backgrounds, input backgrounds
--neutral-200:   #E5E5E5     — Borders, dividers
--neutral-300:   #D4D4D4     — Disabled borders
--neutral-400:   #A3A3A3     — Placeholder text
--neutral-500:   #737373     — Secondary text, metadata
--neutral-600:   #525252     — Tertiary text
--neutral-700:   #404040     — Primary body text
--neutral-900:   #171717     — Titles, emphasis, primary text
--black:         #000000     — Reserved for logo only
```

### Functional (used ONLY for status/feedback)

```
--red-600:       #DC2626     — Recording indicator, errors, destructive
--red-50:        #FEF2F2     — Error background
--green-600:     #16A34A     — Success, complete status
--green-50:      #F0FDF4     — Success background
--amber-600:     #D97706     — Warning, processing status
--amber-50:      #FFFBEB     — Warning background
--blue-600:      #2563EB     — Links, active states, primary actions
--blue-50:       #EFF6FF     — Active/selected background
```

### Usage rules:

- **No color for decoration.** Color indicates status or interaction state.
- **Default state is grayscale.** A screen at rest should be almost entirely black/white/gray.
- **One accent per screen.** If a recording indicator is red, nothing else on that screen is red.
- **Links are blue-600. Nothing else is blue unless it's interactive.**

### Context type colors (the ONLY decorative exception)

Each session type has a subtle color accent used in its icon badge only:

```
📚 Class Lecture      — blue-600
🚀 Startup Meeting   — neutral-900 (black)
🔬 Research          — neutral-600
💡 Working Session   — amber-600
🎤 Talk / Seminar    — neutral-700
```

These appear ONLY as small icon badges, never as backgrounds or borders.

---

## Spacing

### 8px base grid

Every spacing value is a multiple of 8px. No exceptions.

```
--space-1:   4px    — ONLY for tight inline gaps (icon + label)
--space-2:   8px    — Minimum spacing between related elements
--space-3:   12px   — Small internal padding
--space-4:   16px   — Standard internal padding
--space-5:   20px   — Standard gap between elements
--space-6:   24px   — Section padding
--space-8:   32px   — Large section gaps
--space-10:  40px   — Page-level padding
--space-12:  48px   — Major section breaks
--space-16:  64px   — Page-level top/bottom margins
```

### Tailwind mapping:

```jsx
// Card internal padding
className="p-6"          // 24px

// Gap between cards in a list
className="space-y-4"    // 16px

// Page container
className="px-10 py-16"  // 40px horizontal, 64px vertical

// Section break
className="mt-12"        // 48px
```

---

## Layout

### Container

```jsx
// Main content container — max 720px for readability (transcripts/notes)
<div className="max-w-3xl mx-auto px-6">

// Dashboard/list views — max 960px
<div className="max-w-5xl mx-auto px-6">

// Full-width (recording screen only)
<div className="w-full px-6">
```

### Grid

Use CSS Grid or Flexbox. No float. No absolute positioning unless absolutely necessary (modals, overlays).

```jsx
// Dashboard session list
<div className="grid gap-4">
  {sessions.map(s => <SessionCard key={s.id} session={s} />)}
</div>

// Context selector (5 cards)
<div className="grid grid-cols-3 gap-4">
  ...
</div>

// Two-column layout (session view: notes + sidebar)
<div className="grid grid-cols-[1fr_320px] gap-8">
  <main>...</main>
  <aside>...</aside>
</div>
```

---

## Components

### Buttons

Two types only. No outlines, no ghosts, no gradients.

```jsx
// Primary action (one per screen maximum)
<button className="bg-neutral-900 text-white text-sm font-medium px-5 py-2.5 hover:bg-neutral-800 transition-colors">
  Start Recording
</button>

// Secondary action
<button className="bg-white text-neutral-700 text-sm font-medium px-5 py-2.5 border border-neutral-200 hover:border-neutral-400 transition-colors">
  Upload File
</button>

// Destructive (rare)
<button className="bg-white text-red-600 text-sm font-medium px-5 py-2.5 border border-neutral-200 hover:border-red-300 transition-colors">
  Delete
</button>
```

**Rules:**
- Maximum ONE primary button per screen
- Buttons have no border-radius (sharp corners are Swiss)
- Padding is precise: `px-5 py-2.5` (20px × 10px)
- Only `transition-colors`, no other transitions on buttons

### Cards

```jsx
<div className="border border-neutral-200 p-6 hover:border-neutral-400 transition-colors">
  <span className="text-xs font-medium tracking-widest uppercase text-neutral-500">
    {context_label}
  </span>
  <h3 className="mt-2 text-base font-medium text-neutral-900">
    {title}
  </h3>
  <p className="mt-1 text-sm text-neutral-500">
    {metadata}
  </p>
</div>
```

**Rules:**
- No border-radius (sharp corners)
- No shadows (ever)
- No background color (white only, or neutral-50 for selected state)
- Border: 1px neutral-200, hover to neutral-400

### Inputs

```jsx
<input
  className="w-full text-base px-4 py-3 border border-neutral-200 bg-white placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none transition-colors"
  placeholder="Session title..."
/>
```

**Rules:**
- No border-radius
- No shadow on focus (border change only)
- Focus state: border goes to neutral-900 (black)
- No icons inside inputs

### Tags / Chips

```jsx
<span className="inline-block text-xs font-medium tracking-wide px-2.5 py-1 border border-neutral-200 text-neutral-600">
  learning-transfer
</span>
```

**Rules:**
- No border-radius
- No background color
- Border only
- Used for tags, filter chips, context labels

### Tab Navigation

```jsx
<nav className="flex border-b border-neutral-200">
  <button className="px-4 py-3 text-sm font-medium text-neutral-900 border-b-2 border-neutral-900">
    Summary
  </button>
  <button className="px-4 py-3 text-sm font-medium text-neutral-500 hover:text-neutral-700">
    Transcript
  </button>
  <button className="px-4 py-3 text-sm font-medium text-neutral-500 hover:text-neutral-700">
    Interpretations
  </button>
</nav>
```

Active tab: black text + 2px black bottom border. No background change.

---

## Status Indicators

### Recording
```jsx
// Pulsing red dot
<span className="relative flex h-3 w-3">
  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600"></span>
</span>
```

The recording dot is the ONLY element that uses `rounded-full` in the entire app.

### Progress
```jsx
// Simple progress bar
<div className="h-1 w-full bg-neutral-100">
  <div className="h-1 bg-neutral-900 transition-all" style={{ width: `${progress}%` }}></div>
</div>
```

Black bar on light gray. No rounded corners. No animation beyond width transition.

### Status badges
```
created      → text-neutral-500, no border
recording    → text-red-600
transcribing → text-amber-600
processing   → text-amber-600
complete     → text-green-600
error        → text-red-600
```

Text only. No background badges. No pills.

---

## Iconography

Use Lucide React icons. 20px default size. Stroke width 1.5.

```jsx
import { Mic, Upload, Search, Settings, ArrowLeft, Copy, Download } from 'lucide-react';

<Mic size={20} strokeWidth={1.5} className="text-neutral-700" />
```

**Rules:**
- Icons are always neutral-700 or neutral-500
- Icons accompany text, never standalone (except in icon-only buttons in tight spaces)
- Never colorful icons (exception: red recording mic)

---

## The Recording Screen

This is the most important screen. It should feel calm and focused — you're in a meeting, you glance at it, you see it's working. Nothing distracting.

```
┌──────────────────────────────────────────────┐
│                                              │
│                                              │
│              ● RECORDING                     │
│              01:23:45                         │
│                                              │
│     ▁▃▅▇▅▃▁▃▅▇▅▃▁▃▅▇▅▃▁▃▅▇▅▃▁             │
│                                              │
│         [ Pause ]    [ Stop ]                │
│                                              │
│                                              │
│  📚 HGSE T550 — Learning Transfer           │
│  Room: PROB-0219 · 3 listeners              │
│                                              │
└──────────────────────────────────────────────┘
```

- Timer is `text-2xl font-bold font-mono` — the largest element
- Audio waveform is a thin, minimal visualization (neutral-400)
- Session metadata at bottom in `text-sm text-neutral-500`
- Massive whitespace. The screen is 80% empty.

---

## Dark Theme

Not in v1. The app is light-only. A Swiss-style dark theme (white on black, same sharp geometry) can be added later. Do not build dark mode support, do not add `dark:` Tailwind variants.

---

## Animations

Almost none. The app should feel instant and static, not bouncy.

**Allowed:**
- `transition-colors duration-150` on hover states (borders, text)
- `transition-all duration-300` on progress bars
- `animate-ping` on the recording indicator ONLY
- Page route transitions: none (instant swap)

**Forbidden:**
- No fade-in on page load
- No slide animations
- No skeleton loaders (use simple "Loading..." text)
- No toast animations (use inline status messages)
- No hover scale effects
- No parallax, no scroll effects

---

## Responsive Behavior

Three breakpoints:

```
Mobile:  < 640px   — Single column, full-width cards, stacked layout
Tablet:  640-1024px — Same as desktop but narrower margins
Desktop: > 1024px  — Full layout with sidebars where specified
```

The app is desktop-first (it's a meeting tool — you're at a laptop). Mobile should work but is not the primary experience.

```jsx
// Example responsive pattern
<div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-8">
  <main>...</main>
  <aside className="hidden md:block">...</aside>
</div>
```

---

## Anti-Patterns (Things You Must NOT Do)

1. **No rounded corners** anywhere (except the recording dot indicator)
2. **No shadows** anywhere (no `shadow-sm`, no `shadow-md`, nothing)
3. **No gradients** anywhere
4. **No colored backgrounds** for cards or containers (white or neutral-50 only)
5. **No bold color** except for functional status indicators
6. **No emoji in the UI** (use Lucide icons; emoji are only in this spec for illustration)
7. **No border-radius on buttons, inputs, or cards** (`rounded-none` or just omit)
8. **No hover background changes** (hover changes borders or text color only)
9. **No skeleton loaders or shimmer effects**
10. **No floating action buttons**
11. **No modals** if avoidable (use inline expansion or new pages)
12. **No "AI" aesthetic** (no purple gradients, no glowing effects, no particle backgrounds)

The result should look like a tool designed by Josef Müller-Brockmann, not a tool designed by a SaaS landing page.
