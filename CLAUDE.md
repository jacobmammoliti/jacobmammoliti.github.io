# CLAUDE.md

This file guides Claude Code when working on this Hugo site. The scope is strictly **styling and Hugo theme work** — do not modify post content.

---

## Scope

- Allowed: layout templates, CSS, partials, shortcodes, Hugo config (`hugo.toml`), static assets (CSS/JS/images used by the theme)
- Not allowed: anything under `content/` — post body text, front matter, images linked from posts

---

## Project Overview

A minimalist Hugo tech blog using a custom local theme called `techblog`.

```
themes/techblog/
├── layouts/
│   ├── _default/
│   │   ├── baseof.html      # Root HTML scaffold
│   │   ├── list.html        # Home/post-list page
│   │   └── single.html      # Individual post page
│   └── partials/
│       ├── header.html      # Site branding, nav, social links
│       └── footer.html      # Copyright, footer text
├── static/
│   ├── css/style.css        # Single stylesheet (~760 lines)
│   └── js/lightbox.js       # Image lightbox
└── theme.toml
```

Config lives in `hugo.toml` at the repo root. Front matter uses TOML (`+++` delimiters).

---

## Design Principles

- **Minimal and content-first.** No cards, heavy shadows, or decorative flourishes.
- **Readability over style.** Generous line-height (1.6 body, 1.8 post body), comfortable spacing.
- **Subtle color palette:** `#333` body text, `#2c3e50` headings, `#3498db` links, `#6b7280` meta.
- **Single CSS file.** All styles live in `themes/techblog/static/css/style.css`. Do not split into multiple files unless explicitly asked.
- **No utility-class frameworks** (no Tailwind, Bootstrap, etc.). Write plain CSS.

---

## Hugo Conventions

- **Config format:** TOML (`hugo.toml`)
- **Front matter format:** TOML (`+++` delimiters)
- **Template inheritance:** `baseof.html` defines `{{ block "main" . }}` filled by `list.html` and `single.html`
- **Partials** live in `themes/techblog/layouts/partials/` and are called with `{{ partial "name.html" . }}`
- **Params:** Site-level params are in `hugo.toml` under `[params]` and accessed in templates as `.Site.Params.*`
- **Menus:** Defined in `hugo.toml` under `[[menu.main]]`, iterated in templates with `.Site.Menus.main`
- **Taxonomy:** Tags only (`tags = ['...']` in front matter). No categories.
- **Reading time:** Available via `.ReadingTime` (integer, minutes)
- **Syntax highlighting:** Chroma with `monokai` style configured in `hugo.toml`; highlight.js also loaded in production as a client-side fallback

---

## CSS Conventions

### Structure (in order within style.css)
1. Reset & base (`*`, `body`)
2. Typography (headings, paragraphs, links)
3. Header (`.site-header`, `.site-branding`, `.social-links`)
4. Navigation (`.site-nav`)
5. Post card / single post (`.post-card`, `.post-card-preview`, `.post-body`, `.post-meta`, `.post-tags`)
6. Images & lightbox
7. Code blocks (`pre`, `code`, `.highlight`)
8. Syntax highlighting overrides (per-language)
9. Other elements (blockquotes, lists, figures)
10. Post grid and navigation
11. Responsive (`@media max-width: 768px`)

### Key classes
| Class | Used in |
|---|---|
| `.site-header` | `header.html` |
| `.site-branding` | `header.html` |
| `.site-nav` | `header.html` |
| `.post-card` | `single.html` (full post) |
| `.post-card-preview` | `list.html` (summary card) |
| `.post-header` | `single.html` |
| `.post-body` | `single.html` |
| `.post-meta` | date + reading time row |
| `.post-tags` | tag pill row on post pages |
| `.post-preview-tags` | tag pill row on list page |
| `.tag` | individual tag pill |
| `.post-grid` | grid wrapper in `list.html` |
| `.post-navigation` | prev/next links in `single.html` |

### Responsive breakpoint
Single breakpoint at `768px`. Reduce padding, font sizes, and switch flex layouts to column.

### Language badge colors (on `pre code::before`)
- bash/sh/zsh: `#116329` (green)
- dockerfile: `#0550ae` (blue)
- yaml/yml: `#8250df` (purple)
- python: `#3572a5` (blue)
- go: `#00acd7` (cyan)

---

## What to Avoid

- Do not edit files under `content/`
- Do not add JavaScript beyond what is needed for styling/UX (lightbox pattern already in place)
- Do not introduce CSS frameworks or preprocessors
- Do not rename or restructure the `techblog` theme directory
- Do not change the syntax highlighting `style` in `hugo.toml` without explicit instruction — the CSS overrides in `style.css` are tuned to `monokai`
