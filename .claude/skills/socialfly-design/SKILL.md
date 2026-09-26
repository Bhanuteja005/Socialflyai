---
name: socialfly-design
description: SocialFly's white/black + brand-green design system (sidebar + inset panel shell, Geist Pixel titles, Google Sans Flex body, DM Mono numbers, soft large-radius panels, soft green glow — no dot textures). Use before building or changing any UI in apps/app, apps/admin or apps/site — pages, components, empty states, landing sections.
---

# SocialFly design

1. Read `docs/design.md` in full — it is the source of truth (tokens, type scale, radii, shell,
   components, copy, accessibility, shipping checklist).
2. **Keep the existing structure.** The product owner wants upgrades inside the current layouts
   (sidebar shell, same sections in the same order). Don't move modules, merge sections or change
   navigation without asking first.
3. Build with the shared primitives in `packages/ui/src/components` (`Button`, `Card`, `PageHeader`,
   `SectionHeader`, `StatCard`, `EmptyState`, `Tabs`, `Badge`, `AppFrame` …). Don't restyle them
   per page; if a pattern is missing, add it to `packages/ui` and document it in `docs/design.md`.
4. Color: white (light) or black (dark) structure with the logo green (`#0be27d`) as the single
   accent — hero action, active states, progress, first chart series. Other color only for platform
   logos, user media and status (dot, soft pill, thin bar). Trim copy that restates a title.
5. Type roles: `font-pixel` only for page titles, the site hero and short intros; `font-mono`
   (+ `tabular-nums`) for every number, time, price and meta label; `font-sans` for everything else.
6. Verify in a real browser — light, dark and 390px wide — and fix any page-level horizontal
   scroll. Then run `bun run typecheck` and `bun run lint`.
