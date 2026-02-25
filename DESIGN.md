# DESIGN.md — EchoBridge Design System

## Design Philosophy: Dark Glassmorphism

EchoBridge uses a dark glassmorphic design language. Frosted glass cards float over a warm gradient background. The interface communicates through typography, translucency, and structure. Orange is the primary accent — warm, intentional, never decorative.

**Principles:**
1. **Content is the interface.** The meeting transcript and notes ARE the product. The UI is a frame, not a feature.
2. **Glass containers separate content from background.** Each section lives in a translucent card with subtle borders and blur.
3. **Reduction.** If an element can be removed without losing function, remove it.
4. **Grid discipline.** Everything aligns to the 8px base grid. No exceptions.

---

## Typography

### Font Stack

```css
/* Primary: Outfit (clean geometric sans-serif) */
--font-sans: 'Outfit', system-ui, -apple-system, sans-serif;

/* Monospace: for transcripts, code, timers */
--font-mono: 'JetBrains Mono', 'SF Mono', 'Menlo', 'Consolas', monospace;
```

### Type Scale

```
--text-xs:    0.75rem   / 12px   — Labels, metadata, timestamps
--text-sm:    0.875rem  / 14px   — Secondary text, captions, default body
--text-base:  1rem      / 16px   — Body text, transcript, inputs
--text-lg:    1.25rem   / 20px   — Section headers
--text-xl:    1.5rem    / 24px   — Page titles, session titles
--text-2xl:   2rem      / 32px   — Hero text (dashboard title)
--text-3xl:   1.875rem  / 30px   — Recording timer (md breakpoint)
--text-5xl:   3rem      / 48px   — Recording timer (desktop)
```

### Font Weights

```
--font-regular:   400   — Body text, descriptions
--font-medium:    500   — UI labels, buttons, interactive elements
--font-semibold:  600   — Page titles, card titles
--font-bold:      700   — Recording timer, emphasis
```

### Letter Spacing

```
--tracking-tight:   -0.01em   — Large titles (text-xl+)
--tracking-normal:   0        — Body text
--tracking-wide:     0.05em   — Uppercase labels
--tracking-widest:   0.1em    — Section labels, category tags
```

### Tailwind mapping:

```jsx
// Page title
<h1 className="text-xl font-semibold tracking-tight text-slate-50">

// Section header
<h2 className="text-lg font-medium text-slate-100">

// Body text
<p className="text-sm text-slate-300 leading-relaxed">

// Metadata / label
<span className="section-label">
// equivalent to: text-xs font-medium tracking-widest uppercase text-slate-400

// Transcript text
<p className="font-mono text-sm text-slate-300 leading-relaxed">

// Recording timer
<span className="text-3xl md:text-5xl font-bold font-mono text-slate-50">
```

---

## Color Palette

Warm and functional. Orange accent on a dark slate canvas.

### Background

```css
body {
  background: linear-gradient(135deg, #0f172a 0%, #431407 50%, #0f172a 100%);
  background-attachment: fixed;
}
/* Subtle noise texture overlay at 3% opacity for depth */
```

Base body: `bg-slate-900 text-slate-50`

### Core Palette

```
--slate-900:     #0f172a     — Page background (via gradient)
--slate-800:     #1e293b     — Dropdown options, deep backgrounds
--slate-700:     #334155     — Dividers, code block backgrounds
--slate-600:     #475569     — (rarely used)
--slate-500:     #64748b     — Disabled text
--slate-400:     #94a3b8     — Secondary text, metadata, placeholders
--slate-300:     #cbd5e1     — Body text, descriptions
--slate-200:     #e2e8f0     — (rarely used)
--slate-100:     #f1f5f9     — Titles, card titles, high-emphasis text
--slate-50:      #f8fafc     — Primary text, headings, timer
--white:         #ffffff     — Button text on orange
```

### Accent (Orange)

```
--orange-300:    #fdba74     — Hover states for orange elements
--orange-400:    #fb923c     — Links, active tabs, interactive highlights
--orange-500:    #f97316     — Primary action buttons, CTA
--orange-600:    #ea580c     — Active/pressed state for primary buttons
```

### Functional (status/feedback only)

```
--red-400:       #f87171     — Error text, recording label
--red-500:       #ef4444     — Recording dot, stop button background
--green-400:     #4ade80     — Success text, connected status
--green-600:     #16a34a     — Success background accents
--amber-400:     #fbbf24     — Warning text, processing status
--blue-600:      #2563eb     — External links (rare)
```

### Glass / Translucency

```
--glass-bg:          rgba(255, 255, 255, 0.08)     — Standard glass card
--glass-strong-bg:   rgba(255, 255, 255, 0.12)     — Sidebar glass
--glass-border:      rgba(255, 255, 255, 0.15)     — Standard glass border
--glass-strong-border: rgba(255, 255, 255, 0.18)   — Sidebar border
--glass-input-bg:    rgba(255, 255, 255, 0.10)     — Input background
--glass-hover:       rgba(255, 255, 255, 0.14)     — Hover state
```

### Usage rules:

- **Orange for actions and navigation.** Primary buttons, active tabs, links, accent badges.
- **Slate for content hierarchy.** slate-50 for titles, slate-300 for body, slate-400 for metadata.
- **Red/green/amber for status only.** Recording, errors, success, processing.
- **No decorative color.** Every color serves a functional purpose.

### Context type colors

Each session type uses a subtle icon, but no distinct color treatment. Context is conveyed via uppercase labels (`section-label`), not color.

---

## Spacing

### 8px base grid

Every spacing value is a multiple of 4px, targeting 8px as the standard unit. No arbitrary values.

```
--space-1:   4px    — Tight inline gaps (icon + label)
--space-2:   8px    — Minimum spacing between related elements
--space-3:   12px   — Small internal padding
--space-4:   16px   — Standard internal padding, card gaps
--space-5:   20px   — Standard gap between elements
--space-6:   24px   — Section padding
--space-8:   32px   — Large section gaps
--space-10:  40px   — Page-level horizontal padding
--space-12:  48px   — Major section breaks, page vertical padding
--space-16:  64px   — Page-level top/bottom margins
```

### Tailwind mapping:

```jsx
// Glass card internal padding
className="p-4 md:p-6"       // 16px mobile, 24px desktop

// Gap between cards in a list
className="gap-4"             // 16px

// Page container
className="px-4 py-6 md:px-6 md:py-12"

// Section break
className="mt-8"              // 32px
```

---

## Layout

### Container

```jsx
// Main content container — max 768px for readability (transcripts/notes)
<div className="max-w-3xl mx-auto px-4 py-6 md:px-6 md:py-12">

// Dashboard/list views — max 1280px
<div className="max-w-5xl mx-auto px-4 py-6 md:px-6 md:py-12">

// Full-width (recording screen only)
<div className="min-h-screen flex flex-col items-center justify-center px-4 py-6">

// Two-column with sidebar (AskPage, SessionView chat)
<div className="flex h-screen">
  <aside className="w-72 border-r border-white/15">...</aside>
  <main className="flex-1">...</main>
</div>
```

### Grid

Use CSS Grid or Flexbox. No float.

```jsx
// Session list
<div className="grid gap-4">
  {sessions.map(s => <SessionCard key={s.id} session={s} />)}
</div>

// Context selector (5 cards in 3-column grid)
<div className="grid grid-cols-3 gap-3">
  ...
</div>

// Concept cards (4 items)
<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
  ...
</div>
```

---

## Custom CSS Classes

All defined in `frontend/src/index.css` via `@layer components`:

### `.glass` — Standard Glass Card

```css
.glass {
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.15);
}
```

Used with `rounded-xl` on all containers, cards, and sections.

### `.glass-strong` — Emphasized Glass

```css
.glass-strong {
  background: rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.18);
}
```

Used for sidebars (chat panel, conversation list).

### `.glass-input` — Form Inputs

```css
.glass-input {
  @apply bg-white/10 border border-white/15 text-slate-50 placeholder:text-slate-400;
  @apply focus:border-orange-400/60 focus:outline-none focus:ring-1 focus:ring-orange-400/20;
  @apply transition-all duration-200 rounded-xl;
  backdrop-filter: blur(12px);
}
```

### `.glass-select` — Dropdowns

```css
.glass-select {
  @apply bg-white/10 border border-white/15 text-slate-50;
  @apply focus:border-orange-400/60 focus:outline-none focus:ring-1 focus:ring-orange-400/20;
  @apply transition-all duration-200 rounded-xl appearance-none;
  backdrop-filter: blur(12px);
}
```

### `.btn-primary` — Primary Action Button

```css
.btn-primary {
  @apply bg-orange-500 text-white text-sm font-medium px-5 py-2.5 rounded-lg;
  @apply hover:bg-orange-400 active:bg-orange-600;
  @apply transition-all duration-200;
  @apply shadow-lg shadow-orange-500/25 hover:shadow-orange-400/30;
}
```

Orange with glow shadow. One primary per screen maximum.

### `.btn-secondary` — Secondary/Ghost Button

```css
.btn-secondary {
  @apply bg-white/5 text-slate-300 text-sm font-medium px-5 py-2.5 rounded-lg;
  @apply border border-white/10 hover:bg-white/10 hover:text-slate-100;
  @apply transition-all duration-200;
}
```

Translucent with subtle border.

### `.section-label` — Uppercase Label

```css
.section-label {
  @apply text-xs font-medium tracking-widest uppercase text-slate-400;
}
```

### `.glass-scrollbar` — Custom Scrollbar

```css
.glass-scrollbar::-webkit-scrollbar { width: 6px; }
.glass-scrollbar::-webkit-scrollbar-track { background: transparent; }
.glass-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); border-radius: 3px; }
.glass-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.25); }
```

### `.touch-target` — Minimum Touch Target

```css
.touch-target { min-height: 44px; min-width: 44px; }
```

### `.safe-area-inset` — Notch-Safe Padding

```css
.safe-area-inset {
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
  padding-bottom: env(safe-area-inset-bottom);
}
```

---

## Components

### Buttons

Three types:

```jsx
// Primary action (one per screen maximum)
<button className="btn-primary">Start Recording</button>

// Secondary action
<button className="btn-secondary">Upload File</button>

// Destructive (rare)
<button className="bg-red-500 hover:bg-red-400 text-white text-sm font-medium px-5 py-2.5 rounded-lg shadow-lg shadow-red-500/25 transition-all duration-200">
  Stop Recording
</button>
```

**Rules:**
- Maximum ONE primary (orange) button per screen
- Buttons use `rounded-lg`
- Padding: `px-5 py-2.5` (20px × 10px)
- `transition-all duration-200` on all buttons

### Glass Cards

```jsx
<div className="glass rounded-xl p-4 md:p-6">
  <span className="section-label">{context_label}</span>
  <h3 className="mt-2 text-base font-medium text-slate-100">{title}</h3>
  <p className="mt-1 text-sm text-slate-400">{metadata}</p>
</div>
```

**Rules:**
- Always `rounded-xl`
- Always `.glass` class for background/blur/border
- Hover: `hover:bg-white/[0.12]` or `hover:border-white/25`
- No shadows on cards (only on buttons)

### Inputs

```jsx
<input
  className="glass-input w-full text-base px-4 py-3 rounded-xl"
  placeholder="Session title..."
/>
```

**Rules:**
- `rounded-xl` on all inputs
- Focus: orange ring (`focus:border-orange-400/60 focus:ring-1 focus:ring-orange-400/20`)
- No icons inside inputs
- Placeholder: `text-slate-400`

### Tags / Chips

```jsx
// Filter chip (inactive)
<button className="text-xs font-medium px-2.5 py-1 rounded-full bg-white/10 border border-white/15 text-slate-400 hover:bg-white/[0.14] transition-all">
  All
</button>

// Filter chip (active)
<button className="text-xs font-medium px-2.5 py-1 rounded-full bg-orange-500/20 border border-orange-400/50 text-orange-300">
  Startup
</button>

// Metadata tag
<span className="text-xs px-2.5 py-0.5 rounded-full bg-orange-500/10 border border-orange-400/20 text-orange-300">
  Series: Weekly Syncs
</span>
```

**Rules:**
- Filter chips and tags use `rounded-full`
- Active state: orange tint background + orange text
- Inactive state: white/10 background + slate-400 text

### Tab Navigation

```jsx
<nav className="glass rounded-xl p-1 inline-flex gap-1">
  <button className="px-4 py-2 text-sm font-medium rounded-lg bg-orange-500/20 text-orange-300">
    Summary
  </button>
  <button className="px-4 py-2 text-sm font-medium rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5">
    Transcript
  </button>
  <button className="px-4 py-2 text-sm font-medium rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5">
    Interpretations
  </button>
</nav>
```

Active tab: orange tint background + orange text. Tabs live inside a glass pill container.

---

## Status Indicators

### Recording

```jsx
// Pulsing red dot + label
<div className="flex items-center gap-2">
  <span className="relative flex h-3 w-3">
    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
  </span>
  <span className="text-sm font-medium text-red-400">RECORDING</span>
</div>
```

### Loading Spinner

```jsx
<div className="h-4 w-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
```

### Skeleton Loading

```jsx
<div className="h-4 bg-white/10 rounded-lg animate-pulse" />
```

### Status Text Colors

```
created / waiting / closed    → text-slate-500
recording                     → text-red-400
transcribing / processing     → text-amber-400
complete                      → text-green-400
error                         → text-red-400
```

### Audio Waveform (Recording Screen)

24 bars arranged horizontally. Center bars are tallest, edges taper. Bars react to real audio levels via AnalyserNode.

```jsx
// Each bar
<div
  className="w-1 rounded-full bg-orange-400"
  style={{ height: `${barHeight}px`, opacity: distanceFromCenter }}
/>
```

Orange bars, `rounded-full`, heights animated based on audio input.

---

## Iconography

Use Lucide React icons. 20px default size. Stroke width 1.5.

```jsx
import { Mic, Upload, Search, Settings, ArrowLeft, Copy, Download } from 'lucide-react';

<Mic size={20} strokeWidth={1.5} className="text-slate-400" />
```

**Rules:**
- Default icon color: `text-slate-400`
- Hover: `hover:text-orange-400` or `hover:text-slate-200`
- Icons accompany text, or standalone in compact action rows
- Recording mic: `text-red-400`

---

## The Recording Screen

The most important screen. Calm and focused — you're in a meeting, you glance at it, you see it's working. Nothing distracting.

```
┌──────────────────────────────────────────────┐
│                                              │
│        ┌─────────────────────────┐          │
│        │                         │          │
│        │     ● RECORDING         │          │
│        │     01:23:45            │          │
│        │                         │          │
│        │  ▁▃▅▇▅▃▁▃▅▇▅▃▁▃▅▇▅▃  │          │
│        │                         │          │
│        │  [ Pause ]  [ Stop ]    │          │
│        │                         │          │
│        └─────────────────────────┘          │
│                                              │
│       📚 HGSE T550 — Learning Transfer      │
│       Room: PROB-0219 · 3 listeners         │
│                                              │
└──────────────────────────────────────────────┘
```

- Centered glass card: `glass rounded-xl p-12 max-w-lg`
- Timer: `text-3xl md:text-5xl font-bold font-mono text-slate-50`
- Waveform: 24 orange bars, audio-reactive
- Stop button: red with red glow (`bg-red-500 shadow-lg shadow-red-500/25`)
- Pause button: `btn-secondary`
- Session metadata at bottom in `text-sm text-slate-400`
- 80% whitespace. Screen is mostly empty.

---

## Animations

Minimal but purposeful. The app should feel responsive, not bouncy.

**Allowed:**
- `transition-all duration-200` on hover states (backgrounds, borders, text, opacity)
- `transition-colors` as a lighter alternative for simple color changes
- `animate-ping` on the recording indicator dot only
- `animate-spin` on loading spinners
- `animate-pulse` on skeleton loading placeholders
- Waveform bar height transitions (inline styles)

**Forbidden:**
- No page transition animations (instant route swap)
- No slide-in/slide-out animations
- No parallax or scroll effects
- No hover scale/transform effects
- No bounce or spring animations
- No toast pop-in animations (use inline status messages)

---

## Responsive Behavior

Three breakpoints:

```
Mobile:  < 640px   — Single column, stacked layout, smaller padding
Tablet:  640-1024px — Intermediate sizing, some two-column layouts
Desktop: > 1024px  — Full layout with sidebars, chat panels
```

The app is desktop-first (it's a meeting tool — you're at a laptop). Mobile should work but is not the primary experience.

```jsx
// Responsive padding
className="px-4 py-6 md:px-6 md:py-12"

// Responsive text
className="text-base md:text-lg"

// Show/hide sidebar
className="hidden lg:block"

// Responsive flex direction
className="flex flex-col sm:flex-row gap-4"

// Chat sidebar (hidden on mobile, visible on desktop)
<aside className="hidden lg:block w-[400px] fixed right-0 top-0 h-full">
```

---

## Design Patterns Reference

### Standard Page Layout

```jsx
<div className="max-w-3xl mx-auto px-4 py-6 md:px-6 md:py-12">
  {/* Back button + title */}
  <div className="flex items-center gap-4 mb-8">
    <button onClick={() => navigate(-1)} className="btn-secondary p-2">
      <ArrowLeft size={20} />
    </button>
    <h1 className="text-xl font-semibold text-slate-50">Page Title</h1>
  </div>

  {/* Content in glass cards */}
  <div className="glass rounded-xl p-4 md:p-6">
    ...
  </div>
</div>
```

### Glass Form Card

```jsx
<div className="glass rounded-xl p-8">
  <label className="section-label">Field Label</label>
  <input className="glass-input w-full text-base px-4 py-3 rounded-xl mt-2" />

  <div className="flex gap-3 mt-6">
    <button className="btn-primary flex-1">Primary Action</button>
    <button className="btn-secondary flex-1">Secondary</button>
  </div>
</div>
```

### Empty State

```jsx
<div className="glass rounded-xl p-8 text-center">
  <IconComponent size={32} className="mx-auto text-slate-500 mb-4" />
  <p className="text-slate-400 mb-4">Nothing here yet</p>
  <button className="btn-primary">Create Something</button>
</div>
```

### Header Card (Dashboard)

```jsx
<div className="glass rounded-xl px-6 py-4">
  <div className="flex items-center justify-between">
    <div>
      <h1 className="text-lg font-semibold text-slate-50"
          style={{ textShadow: '0 0 20px rgba(249, 115, 22, 0.3)' }}>
        ECHOBRIDGE
      </h1>
      <p className="text-sm text-slate-400">Description text</p>
    </div>
    <div className="flex items-center gap-2">
      {/* Action buttons */}
    </div>
  </div>
</div>
```

The title has a subtle orange text-shadow glow for brand emphasis.

---

## Anti-Patterns (Things You Must NOT Do)

1. **No light/white backgrounds** — always dark slate or glass translucency
2. **No solid background colors on cards** — use `.glass` class only
3. **No neutral/gray Tailwind palette** — use slate palette exclusively
4. **No bold colored backgrounds** for containers (only for buttons and status dots)
5. **No multiple orange CTAs** per screen — one primary action maximum
6. **No emoji in the UI** (use Lucide icons; emoji are only in this spec for illustration)
7. **No floating action buttons** or fixed-position CTAs
8. **No modals** if avoidable (use inline expansion, sidebars, or new pages)
9. **No external CSS files or CSS-in-JS** — Tailwind only + index.css custom classes
10. **No Google Fonts** — Outfit and JetBrains Mono are self-hosted or system-fallback
11. **No non-functional decoration** — every visual element serves a purpose
12. **No inconsistent border-radius** — glass cards use `rounded-xl`, buttons use `rounded-lg`, chips/pills use `rounded-full`

The result should look like a premium dark-mode tool — clean, warm, and functional. Not a SaaS landing page, not a neon cyberpunk dashboard.
