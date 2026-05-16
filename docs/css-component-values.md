# CSS Component Values

Use this as the quick reference for asking for UI changes like wider cards, tighter stacks, or smaller headers.

## Global

| Area | Current values |
| --- | --- |
| Background | `--bg: #f6f0df`, body uses radial + vertical cream gradient |
| Text | `--text: #111111`, `--muted: #111111` |
| Spacing scale | `--space-1: 4px` through `--space-12: 32px`; most gaps/padding now use these tokens |
| Lines | `--line-soft: rgba(95, 76, 49, 0.12)`, `--line-dashed: rgba(95, 76, 49, 0.18)` |
| Surfaces | `--surface: #fffdf9`, `--field-surface: #fffdf6` |
| Font sizes | Only 3 app-wide tokens: `--font-sm: 0.7rem`, `--font-md: 0.84rem`, `--font-lg: 0.96rem` |
| Text casing | UI labels, buttons, helper text, and placeholders are lowercase; only main title headings use uppercase styling |
| App shell | `height: 100vh`, padding `--space-8 --space-10 --space-6`, `overflow: hidden` |
| Default font weight | `400` on all elements |

## Header

| Component | Current values |
| --- | --- |
| Header grid | `220px minmax(420px, 720px) minmax(180px, 1fr)`, gap `--space-8` |
| Header separator | none |
| Brand text | uppercase, `--font-lg`, letter spacing `0.04em` |
| Search group | grid: `minmax(220px, 1fr) auto`, gap `--space-6`; bottom inset line lives only on `search-field` |
| Search input | padding `--space-5 --space-7`, font `--font-md`, transparent background |
| Search actions | horizontal, gap `--space-5`, no wrap |
| Header action links | uppercase, `--font-md`, letter spacing `0.04em` |

## Board Layout

| Component | Current values |
| --- | --- |
| Main board grid | `minmax(0, 3fr) minmax(240px, 1fr)` |
| Main board max width | `1840px` |
| Board column gap | `--space-10` |
| To Do grid | 2 equal columns, gap `--space-12`, scrolls internally if needed |
| Finish / On Hold column | right-side column, roughly 1/4 width |
| Finish / On Hold spacing | two equal-height rows, gap `--space-9` |

## Cards

| Component | Current values |
| --- | --- |
| Full card width | `min(100%, 384px)` |
| Full card min height | `316px` |
| Full card padding | `--space-8 --space-8 --space-9` |
| Full card shadow | `0 8px 18px rgba(0, 0, 0, 0.04)` |
| Compact card width | `min(100%, 260px)` in Finish / On Hold |
| Compact card min height | content-fit, no forced minimum |
| Compact card padding | `--space-5 --space-6` |
| Compact card content | client left, project right; client + project only; no divider line or extra metadata |
| Hover lift | `translateY(-18px)` with stronger shadow |

## Stacks

| Component | Current values |
| --- | --- |
| To Do visible max | `20` cards |
| Finish / On Hold visible max | `6` cards |
| Default page stack max | `5` cards |
| Stack x spread | max total spread `32px` |
| Stack y step | starts at `42px`, compresses with more cards |
| Empty To Do height | `420px` |
| Empty Finish / On Hold height | `24px` |

## Page Views

| Component | Current values |
| --- | --- |
| All cards grid | `repeat(auto-fill, minmax(344px, 1fr))`, gap `22px` |
| All cards page cards | full-width static cards; clicking opens Focus Mode |
| Incomplete page | header margin bottom `18px`; section header hidden |

## Focus Mode

| Component | Current values |
| --- | --- |
| Modal width | `min(50vw, 720px)` on desktop; mobile/tablet falls back to available viewport width |
| Modal max height | `min(86vh, 760px)` with internal scroll |
| Modal padding | `--space-12` desktop, `--space-8` mobile |
| Summary strip | removed |
| Details grid | 2 columns, gap `--space-5`, top/bottom divider lines |
| Field span | Focus Mode field labels use `--font-md`, same as text boxes |
| Fields | padding `--space-4 --space-5`, inset 1px border, font `--font-md` |
| Priority / Checklist panels | vertical padding only, no side padding, invisible frame: transparent background and no box-shadow |
| Checklist item editor | top border only, padding `--space-5 0` |
| Move/action rows | gap `--space-5/--space-6`, top divider line |

## Controls

| Component | Current values |
| --- | --- |
| Primary/ghost buttons | transparent background, uppercase, `--font-md` |
| Plus button | `24px x 24px`, black background, white text |
| Priority dots | 5 colored dots, controlled per card |
| Section title | uses `--font-md`; row-slot section title uses `--font-lg` |

## Responsive Breakpoints

| Breakpoint | Behavior |
| --- | --- |
| `max-width: 1120px` | Header/main grids collapse to one column; right status column becomes 2 columns |
| `max-width: 720px` | To Do and status columns become 1 column; cards shrink to `min(100%, 304px)` |
