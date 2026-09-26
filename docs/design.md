# SocialFly design system

The single source of truth for how SocialFly's product (`apps/app`), staff console (`apps/admin`)
and marketing site (`apps/site`) look and behave. The `socialfly-design` skill
(`.claude/skills/socialfly-design/SKILL.md`) loads this file; read it before any UI work.

Visual direction adapted from [treg's design guidelines](https://github.com/superdesigndev/treg/blob/main/design.md)
(Apache-2.0): monochrome structure, soft large-radius panels, pixel type as an accent. We borrow
the ideas, not their code or assets, and keep SocialFly's own sidebar layout.

## 1. Principles

1. **Task first, brand in the details.** The first viewport of every page shows where you are and
   the one thing to do next. Decoration never pushes the task below the fold.
2. **White (or black) + brand green.** White panels on a faintly green-tinted canvas (black in dark
   mode), near-black text, ink for everyday controls, and the logo green (`#0be27d`) as the one
   accent: the hero action ("New post", "Create post"), active nav icons, progress, checks, the
   first chart series, today markers and a soft wash behind page tops. Other color only comes from
   platform logos, user media and status (success / warning / danger / info).
3. **Less on screen.** One primary action per page. At most four KPIs in a row. No subtitle under
   every card title, no icon tile on every card, no helper paragraph that repeats the title. Put
   secondary content behind tabs, a "More" menu, a drawer or a detail page.
4. **Soft containers, clear hierarchy.** Large radii for task modules, smaller radii inside them,
   pills for selection and identity. Do not turn every row into a card.
5. **Pixels as an accent.** Geist Pixel is for page titles, the hero and a few short intros — never
   for body copy, tables or forms.
6. **Truthful UI.** Anything that looks clickable does something or says why it can't. Numbers,
   states and counts come from real data; no demo values in production paths.

## 2. Typography

Loaded with `next/font/google` in each app's root layout (self-hosted at build time), exposed as
CSS variables and mapped to Tailwind families in `packages/ui/src/styles/theme.css`.

| Role | Family (Tailwind) | Size / line height | Weight |
| --- | --- | --- | --- |
| Page title (`PageHeader`) | Geist Pixel (`font-pixel`) | 26 / 32px (22 on mobile) | 400 |
| Hero headline (site) | Geist Pixel | 56–72 / 1.05 | 400 |
| Short intro / hero subline | Geist Pixel | 16–20 / 1.4 | 400 |
| Module / card title | Google Sans Flex (`font-sans`) | 15–16 / 24px | 500 |
| Body, form labels | Google Sans Flex | 14 / 21px | 400 (labels 500) |
| Navigation, selectors, buttons | Google Sans Flex | 13 / 19.5px | 500 |
| Supporting copy | Google Sans Flex | 12.5 / 19px | 400 |
| Numbers: KPIs, counts, prices, times, credits | DM Mono (`font-mono`) | 12–28px | 400–500, `tabular-nums` |
| Meta labels, keyboard hints, ids, code | DM Mono | 11.5–12 / 18px | 400 |

- Sentence case everywhere. No ALL-CAPS labels with wide tracking; short role markers (`OWNER`,
  `STAFF`) in mono are the only exception.
- If a font fails, the page still works: pixel falls back to mono, sans to system UI.

## 3. Color and themes

Semantic tokens only (`bg-canvas`, `text-muted-foreground` …); never hard-code hex in components.
Light is the default; dark is a first-class theme with its own surface values, not an inversion.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `canvas` / `background` | `#f4f7f5` | `#000000` | Page background, sidebar |
| `surface` | `#f6f6f5` | `#121311` | Wells and inner areas inside panels |
| `surface-raised` | `#ffffff` | `#181917` | Panels, cards, menus, inputs |
| `muted` | `#f1f1f0` | `#222320` | Chips, hover fills, segmented tracks |
| `foreground` / `ink` | `#1a1a1a` | `#f3f3ef` | Text; primary buttons and active nav pills |
| `ink-foreground` | `#f8f8f7` | `#151613` | Text on ink |
| `muted-foreground` | `#666663` | `#a5a5a0` | Secondary text (≥ 4.5:1 on white) |
| `subtle-foreground` | `#8c8c88` | `#7f807b` | Hints, placeholders, disabled |
| `border` | `rgb(0 0 0 / 0.09)` | `rgb(255 255 255 / 0.10)` | Dividers, panel edges |
| `border-strong` / `input` | `rgb(37 37 34 / 0.18)` | `rgb(255 255 255 / 0.17)` | Control boundaries |
| `primary` | `#0be27d` (text on it `#04150c`) | `#0be27d` | Brand green accent; `primary-text` `#07804a` / `#3ff09c` for green text |
| `success` | `#118453` | `#45e39e` | Published, active, healthy |
| `info` | `#1a7da6` | `#6fcdf0` | Scheduled, informational |
| `warning` | `#ba6603` | `#f0c249` | Needs attention, reconnect |
| `danger` | `#c0362f` | `#f08a84` | Failed, destructive |
| `violet` | `#6d3fd6` | `#b69cff` | Staff console marker only |

Status colors appear as small dots, soft pills (`bg-*-soft text-*`) or a thin left bar — never as
large fills. Charts: series 1 is brand green, then info, then gray; heatmaps use a grayscale ramp.

## 4. Layout and shell

- **Sidebar + inset panel** (`AppFrame` in `packages/ui`). The product keeps its grouped left
  sidebar on the canvas — workspace switcher, "New post", nav groups (Publish / Create / Grow),
  connected channels, AI credits, Settings, account — and the page sits in a white rounded-3xl panel
  with a 56px top bar (breadcrumb, Ctrl/⌘K search, help, theme). The rail collapses to icons;
  below `lg` it becomes a drawer. Current nav item = white pill with a hairline ring. The admin
  console uses the same frame with violet staff markers. **Don't restructure the shell or page
  layouts without the product owner's sign-off** — upgrades happen inside the existing structure.
- **Content**: `max-w-[1200px]`, padding `24–32px` (`16px` sides on mobile).
- **Atmosphere**: a soft brand-green light glows behind the top of the panel (`bg-glow`). It is
  decorative, `aria-hidden`, and never carries information. **No dot or pixel textures** — the
  product owner rejected them.
- Spacing scale 4 / 8 / 12 / 16 / 24 / 32 / 64. One container owns each gap.
- Grids always declare columns (`grid-cols-1`, `minmax(0,1fr)`); flex/grid children get `min-w-0`.
  A bare `grid` sizes to content and overflows on phones.

## 5. Surfaces and radii

| Element | Radius | Notes |
| --- | --- | --- |
| Page module / hero panel | 24px (`rounded-3xl`) | White, 1px `border`, no shadow |
| `Card` | 20px (`rounded-2xl`) | White, 1px `border`, flat |
| Inner well, code, media preview | 16px (`rounded-xl`) | `bg-surface` or white |
| List tiles, small cards | 12px (`rounded-lg`) | |
| Buttons, inputs' search, segmented, badges, selectors | full pill (`rounded-full`) | |
| Text inputs, textareas, selects | 12px | |

Shadows are for things that float (menus, dialogs, popovers, the command palette, hover lift on
interactive cards) — static panels are flat with a hairline border.

## 6. Components (`packages/ui`)

- `Button` — `primary` (ink pill), `brand` (green pill — the one hero action per screen),
  `secondary`/`outline` (white pill with border), `ghost`, `danger`, `link`.
- `PageHeader` — pixel title, one-line description, actions right. Optional `eyebrow`.
- `SectionHeader` — 15px/500 title, optional short description, actions right.
- `StatCard` — label (13px sans, muted), value (DM Mono 26px), optional one-line hint. No icon
  tiles unless the icon carries meaning.
- `Card` family, `EmptyState` (dashed border, centered, one action), `Alert` (compact, one line when
  possible), `Tabs` (pill segmented), `Badge` (pill, `dot` for status), `Input`/`Textarea`,
  `Select`, `Switch`, `Checkbox`, `Tooltip`, `Dialog`, `DropdownMenu`, `CommandPalette` (Ctrl/⌘K).
- Category navigation inside a page uses **underline tabs**; the top nav uses **solid pills**.
  Don't mix the two treatments at one level.

## 7. Copy

Short, direct, sentence case. Buttons name the action ("Schedule post", "Connect channel").
Errors say what happened and what to do next. Page descriptions are one line or omitted. Don't
explain the obvious ("Here you can see your posts").

## 8. Motion

120–180ms for color/opacity/small transforms, 280ms for page-level entry. Easing
`cubic-bezier(.22,1,.36,1)`. Interactive cards may lift 1–2px. No bounce, no scroll reveals, no
blinking. Respect `prefers-reduced-motion` (handled globally in `theme.css`).

## 9. Accessibility

Landmarks, one `h1` per page, continuous heading order, native buttons, labelled controls, visible
focus rings, 4.5:1 text contrast, status never by color alone (dot + label), icon buttons with
`aria-label`, wide tables scroll inside their own container, 44px touch targets on mobile.

## 10. Checklist before shipping UI

1. First viewport: where am I, what's the next action — nothing else competing.
2. Color: white/black + brand green accent only; status colors only where state is shown.
3. Fonts: pixel only on titles/hero; numbers in DM Mono; body in Google Sans Flex.
4. Light, dark and 390px mobile all checked in a real browser; no page-level horizontal scroll.
5. Loading, empty, error and permission-denied states exist and read clearly.
6. `bun run typecheck` and `bun run lint` pass.
