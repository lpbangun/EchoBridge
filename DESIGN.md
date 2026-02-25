# DESIGN.md — EchoBridge Design System

## Design Philosophy: Dark Zinc / Lime

EchoBridge uses a dark zinc interface with lime green (#C4F82A) accent. Solid dark surfaces replace glass effects. The interface communicates through typography, contrast, and structure. Lime is the primary accent — sharp, functional, never decorative.

**Principles:**
1. **Content is the interface.** The meeting transcript and notes ARE the product. The UI is a frame, not a feature.
2. **Solid surfaces separate content from background.** Each section lives in a zinc card with subtle borders. No blur, no transparency.
3. **Reduction.** If an element can be removed without losing function, remove it.
4. **Grid discipline.** Everything aligns to the 8px base grid. No exceptions.

---

## Typography

### Font Stack

```css
/* Display: Space Grotesk (titles, branding, buttons) */
--font-display: 'Space Grotesk', system-ui, sans-serif;

/* Body: Manrope (navigation, descriptions, body text) */
--font-sans: 'Manrope', system-ui, sans-serif;

/* Mono: Space Mono (metadata, timestamps, code, section labels) */
--font-mono: 'Space Mono', 'Menlo', 'Consolas', monospace;
```

### Type Scale

```
--text-xs:    0.75rem   / 12px   — Labels, metadata, timestamps
--text-sm:    0.875rem  / 14px   — Body copy, descriptions
--text-base:  1rem      / 16px   — Card titles, primary content
--text-lg:    1.125rem  / 18px   — Section headings
--text-xl:    1.25rem   / 20px   — Page titles
--text-2xl:   1.5rem    / 24px   — Hero text
--text-3xl:   1.875rem  / 30px   — Timer display
```

### Weight Usage

| Weight | Font | Usage |
|--------|------|-------|
| 400 | Manrope | Body text |
| 500 | Manrope | Navigation items (inactive) |
| 600 | Manrope | Navigation items (active), descriptions |
| 700 | Space Grotesk | Page titles, card titles, buttons |
| 800 | Space Grotesk | Branding, metric values |
| 400 | Space Mono | Metadata, timestamps, section labels |
| 700 | Space Mono | Metric values (optional) |

---

## Color Palette

### Surfaces

```
--surface-darker:  #0A0A0A    — Page background
--surface-dark:    #111111    — Sidebar, chat panels
--surface:         #18181B    — Cards, inputs
```

### Borders

```
--border:          #27272A    — Default borders
--border-hover:    #3F3F46    — Hover state borders
```

### Accent (Lime)

```
--accent:          #C4F82A    — Primary buttons, active states, links
--accent-hover:    #D4FF4A    — Hover state
--accent-muted:    rgba(196, 248, 42, 0.08)  — Subtle backgrounds
--accent-border:   rgba(196, 248, 42, 0.25)  — Active card borders
```

### Text

```
--text-primary:    #FFFFFF    — Titles, primary content
--text-secondary:  #A1A1AA    — Descriptions (zinc-400)
--text-muted:      #71717A    — Sidebar icons, placeholders (zinc-500)
--text-metadata:   #52525B    — Timestamps, metadata (zinc-600)
```

### Functional Colors (unchanged)

```
Red:    text-red-400      — Recording, errors, stop buttons
Amber:  text-amber-400    — Transcribing, processing, warnings
Green:  text-green-400    — Complete, success states
```

---

## Layout

### App Shell

```
┌──────────────────────────────────────────┐
│ Sidebar (220px)  │  TopBar              │
│ ─────────────    │  ────────────────    │
│ [Logo]           │  [Search] [Upload]   │
│ Dashboard        │          [Record]    │
│ Recordings       │                      │
│ Series           │  Main Content        │
│ Rooms            │  (scrollable)        │
│ Ask              │                      │
│ ─────────────    │  max-w-4xl           │
│ Settings         │  mx-auto px-6 py-8   │
│ Guide            │                      │
└──────────────────────────────────────────┘
```

- **Sidebar:** 220px wide, `#111111` bg, `border-r border-[#27272A]`, fixed
- **TopBar:** Full width, `border-b border-[#27272A]`, px-4 lg:px-10 py-3
- **Main content:** `flex-1 overflow-y-auto`, content centered with `max-w-4xl mx-auto px-6 py-8`
- **Recording page:** Full-screen, no sidebar/topbar
- **Agent meeting page:** Full content area with conversation log, controls at bottom
- **Mobile:** Sidebar hidden by default, toggle via hamburger in TopBar

---

## Components

### Cards

```css
/* Standard card */
.card {
  bg-[#18181B] border border-[#27272A] rounded-[14px]
}

/* Large card (forms, feature sections) */
.card-lg {
  bg-[#18181B] border border-[#27272A] rounded-[16px]
}

/* Active card (lime border + glow) */
.card-active {
  bg-[#18181B] border border-accent-border rounded-[14px] shadow-glow
}
```

### Buttons

```css
/* Primary: lime bg, dark text */
.btn-primary {
  bg-accent text-zinc-900 font-display font-bold rounded-[10px]
}

/* Secondary: dark bg, zinc border */
.btn-secondary {
  bg-surface text-zinc-300 font-sans font-medium border border-border rounded-[10px]
}
```

### Inputs

```css
/* Text input */
.eb-input {
  bg-surface border border-border text-white rounded-[10px]
  focus:border-accent/60 focus:ring-1 focus:ring-accent/20
}

/* Select */
.eb-select {
  bg-surface border border-border text-white rounded-[10px]
}
```

### Filter Chips

```css
/* Active chip */
.chip-active {
  bg-accent text-zinc-900 font-semibold rounded-full
}

/* Inactive chip */
.chip-inactive {
  bg-transparent text-zinc-400 border border-border rounded-full
  hover:border-zinc-500 hover:text-zinc-300
}
```

### Section Labels

```css
.section-label {
  font-mono text-[10px] uppercase tracking-[1px] text-zinc-500
}
```

### Sidebar Navigation Item

```css
/* Active */
bg-[#C4F82A14] text-accent font-semibold rounded-[10px]

/* Inactive */
text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 font-medium rounded-[10px]
```

### Tabs (Inline Underline)

```css
/* Active tab */
text-accent border-b-2 border-accent font-medium pb-2

/* Inactive tab */
text-zinc-500 hover:text-zinc-300
```

Used in: SessionView (Summary/Transcript/Interpretations), SeriesView (Memory/Sessions), SettingsPage config snippets (MCP/OpenClaw/REST), AskPage conversation list.

---

## Spacing

All spacing uses the 8px grid via Tailwind's default scale:

```
p-1  = 4px     gap-1  = 4px
p-2  = 8px     gap-2  = 8px
p-3  = 12px    gap-3  = 12px
p-4  = 16px    gap-4  = 16px
p-5  = 20px    gap-5  = 20px
p-6  = 24px    gap-6  = 24px
p-8  = 32px    gap-8  = 32px
p-10 = 40px
p-12 = 48px
```

---

## Agent Meeting UI

### Conversation Log
```css
/* Message bubble */
.meeting-message {
  border-l-2 border-accent px-4 py-2
}

/* Speaker label */
.speaker-label {
  font-mono text-xs text-accent font-medium
}

/* System message (directive, status) */
.system-message {
  text-xs text-zinc-500 italic border-l-2 border-zinc-700 px-4 py-1
}
```

### Agent Persona Cards
```css
/* Agent card in meeting setup */
.agent-card {
  bg-surface border border-border rounded-[14px] p-4
}

/* Internal agent indicator */
.agent-internal {
  text-xs text-zinc-400 font-mono
}

/* External agent indicator */
.agent-external {
  text-xs text-amber-400 font-mono
}
```

---

## Settings Patterns

### Checkbox List (Auto Sockets, Sync Toggles)
```css
/* Checkbox group container */
.checkbox-group {
  space-y-3 mt-4
}

/* Single checkbox row */
.checkbox-row {
  flex items-center gap-3 cursor-pointer
}

/* Checkbox input */
input[type="checkbox"] {
  h-4 w-4 accent-lime-400
}

/* Label with description */
.checkbox-label {
  text-sm text-zinc-300
}
.checkbox-description {
  text-xs text-zinc-500
}
```

### Settings Section Card
```css
/* Reused across all settings sections */
.settings-section {
  card-lg p-4 md:p-6 mt-8
}
.settings-title {
  text-sm font-semibold text-zinc-200 uppercase tracking-wider
}
.settings-description {
  text-sm text-zinc-400 mt-1
}
```

---

## Action Buttons (Session View)

### Grouped Actions
```css
/* Button row for session actions */
.action-row {
  flex flex-wrap items-center gap-4 mt-8 pt-8 border-t border-border
}
```

### Agent Analysis Button
```css
/* Uses btn-secondary with Bot icon */
.btn-agent-analyze {
  btn-secondary inline-flex items-center gap-2 text-sm disabled:opacity-50
}
/* Loading state: text changes to "Analyzing...", button disabled */
```

---

## Cloud Storage Section

### Connection Test
```css
/* Test result badge */
.connection-ok {
  text-sm text-green-400
}
.connection-fail {
  text-sm text-red-400
}
```

### Sync Status Grid
```css
/* Three-column stats */
.sync-grid {
  grid grid-cols-3 gap-4 text-center
  bg-surface-dark border border-border rounded-xl p-4
}
.sync-value {
  text-2xl font-semibold text-white
}
.sync-label {
  text-xs text-zinc-400 mt-1
}
```

---

## Anti-Patterns (DO NOT)

- **No glass/blur.** No `backdrop-filter`, no translucent backgrounds, no `rgba(255,255,255,0.08)`.
- **No orange.** The accent is lime `#C4F82A`. Orange `#f97316` is banned.
- **No slate colors.** Use `zinc-*` scale: `zinc-400`, `zinc-500`, `zinc-600`, `zinc-800`, `zinc-900`.
- **No gradients on backgrounds.** Page background is flat `#0A0A0A`.
- **No noise textures.** No SVG noise overlays.
- **No text-shadow glow.** The old orange text glow is removed.
- **No Outfit font.** Use Space Grotesk (display), Manrope (body), Space Mono (mono).
- **No JetBrains Mono.** Use Space Mono for all monospace text.
- **No rounded-xl on cards.** Use `rounded-[14px]` or `rounded-[16px]` via card classes.
- **No back buttons.** Navigation is handled by the persistent sidebar.
