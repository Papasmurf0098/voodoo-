# Nightcap Library

Nightcap Library is a self-contained GitHub Pages web app for browsing a local drink-profile database with tasting-first presentation and preserved search/browse state.

## Why this architecture

- Static SPA with no backend, suitable for GitHub Pages.
- Local JSON content model that supports product-specific, family-level, category-level, ambiguous, and variation-heavy records.
- Whiskey-aware schema that preserves family/category/subtype plus caveat tags like bottled-in-bond, private barrel, batch variation, and release variation.
- Consumer-facing detail presentation first, research/context second.

## Local development

Because the app uses `fetch()` for local JSON, serve the repository with a simple static server:

```bash
python -m http.server 4173
```

Then open `http://localhost:4173`.

## Data model notes

`data/drinks.json` uses a normalized master-entry shape:

- `family`, `category`, `subtype`/`varietal`
- `strength` for ABV/proof display and confirmation strategy
- `tasting`, `pairings`, `signatureTraits`
- `research` for confidence, ambiguity, conflicts, resolution, profile level, and caveats
- `sourceRecord` for corrected display names and normalization tracing
- `whiskey` for style-driven search terms and display chips

## GitHub Pages deployment

Push the repository to a GitHub repo and enable GitHub Pages from the default branch root. The app is fully static and does not require a build step.
