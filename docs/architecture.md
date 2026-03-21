# Nightcap Library Architecture Plan

## Product direction

Nightcap Library is a static, dark, premium tasting-reference app for GitHub Pages. It is intentionally not a store, recipe index, review platform, or image-led catalog.

## Screen structure

### 1. Library / home screen
- Sticky search bar.
- Family filters for broad browsing (`Whiskey`, `Wine`, `Spirit`, `Cocktail`, `Beer`, `RTD`, `Mocktail`, `Soft Drink`, `Water`).
- Category filters generated from the current family.
- Compact result cards with:
  - name
  - category
  - subtype/producer line
  - short aroma/flavor preview
  - optional compact metadata chips (`Barrel Proof`, `Flight`, `Ambiguous`, etc.)

### 2. Dedicated profile screen
- Explicit back button.
- The browser URL preserves library state through query params.
- The app restores search/filter/scroll state when returning.
- Layout order:
  1. name
  2. category and family context
  3. subtype / varietal
  4. producer
  5. region / origin
  6. ABV / strength
  7. proof
  8. aroma notes
  9. flavor profile
  10. body / texture
  11. finish
  12. pairings
  13. notable signature traits
  14. collapsible research notes / methodology section

## UX flow

1. User opens app.
2. User searches or filters locally.
3. User taps a concise card.
4. App opens a dedicated profile route using `?drink=<id>`.
5. User reads tasting-first content.
6. User goes back using the back button.
7. Query params and saved scroll offset restore the library exactly where they left it.

## Component structure

- `HeroHeader`
- `SearchToolbar`
- `FilterChips`
- `DrinkCard`
- `DetailHero`
- `FactGrid`
- `TastingDefinitionList`
- `PairingsGrid`
- `SignatureTraits`
- `ResearchNotes`
- `Badge`

The implementation is kept in a single small JS entry for GitHub Pages simplicity, but the UI is structured in component-like rendering functions.

## Local data architecture

### Normalized master schema

Each entry supports nullable/optional fields and richer metadata:

```json
{
  "id": "string",
  "name": "string",
  "family": "Whiskey | Wine | Spirit | Cocktail | Beer | RTD | Mocktail | Soft Drink | Water",
  "category": "string",
  "subtype": "string?",
  "varietal": "string?",
  "producer": "string?",
  "origin": {
    "country": "string?",
    "region": "string?",
    "display": "string"
  },
  "strength": {
    "abv": "number?",
    "abvDisplay": "string?",
    "proof": "number?",
    "proofDisplay": "string?",
    "display": "string?",
    "confirmation": "exact | approximate | batch-dependent | release-dependent | market-dependent | barrel-dependent | flight-dependent | not-clearly-confirmed",
    "note": "string?"
  },
  "tasting": {
    "aroma": ["string"],
    "flavor": ["string"],
    "body": "string?",
    "finish": "string?"
  },
  "pairings": {
    "proteins": ["string"],
    "spices_flavor_companions": ["string"],
    "cheeses": ["string"],
    "cuisines": ["string"]
  },
  "signatureTraits": ["string"],
  "tags": ["string"],
  "whiskey": {
    "displayTags": ["string"],
    "styleTerms": ["string"]
  },
  "research": {
    "sourceTypesConsulted": ["string"],
    "conflictsFound": "string?",
    "resolution": "string?",
    "confidence": "High | Medium | Low",
    "profileLevel": "Product-specific | Product-family level | Category-level",
    "ambiguityStatus": "string",
    "caveats": ["batch_variation | barrel_variation | release_variation | private_barrel | market_variation | likely_interpretation"]
  },
  "sourceRecord": {
    "displayName": "string",
    "normalizedFrom": "string?"
  }
}
```

### UI display schema

The detail page uses a display-oriented projection:
- top hero
- compact fact grid
- tasting list
- pairings cards
- signature traits
- research accordion

The master schema remains richer than the initial display layer.

## Search behavior

Local search is precomputed into a single lowercase search surface containing:
- name
- family
- category
- subtype / varietal
- producer
- origin
- aroma terms
- flavor terms
- whiskey-specific style terms
- caveat tags

This enables matches for terms like:
- `wheated`
- `barrel proof`
- `single barrel`
- `port cask`
- `japanese single malt`
- `blackberry`
- `champagne`

## Optional field handling rules

- Hide empty fields instead of showing placeholders.
- Prefer `strength.display` when the source is approximate or caveated.
- Show `proof` separately when present.
- Omit signature section if no signature traits exist.
- Show research/source context only in the secondary section.

## Category normalization strategy

### Family-level mapping
- Whiskey
- Wine
- Spirit
- Cocktail
- Beer
- RTD
- Mocktail
- Soft Drink
- Water

### Category examples
- Whiskey → `Bourbon`, `Rye whiskey`, `Japanese whisky`, `Whiskey Flight`
- Wine → `Sparkling wine`, `Red wine`, `White wine`, `Rose wine`
- Spirit → `Vodka`, `Gin`, `Rum`, `Tequila`, `Mezcal`
- Cocktail → `Cocktail`
- Beer → `Stout`, `IPA`, `Lager`, etc.

`sourceRecord.normalizedFrom` preserves imperfect original naming so display cleanup never destroys provenance.

## Whiskey classification strategy

Whiskey is intentionally multi-layered:
- `family`: always `Whiskey`
- `category`: broad tradition or type (`Bourbon`, `Scotch whisky`, `Japanese whisky`, `Whiskey Flight`)
- `subtype`: more precise interpretation (`wheated bourbon`, `cask-strength rye`, `Japanese single malt`)
- `whiskey.displayTags`: top-of-page chips for fast recognition
- `whiskey.styleTerms`: expanded terms for local search

### Supported whiskey distinctions
- wheated bourbon
- high-rye bourbon
- bottled-in-bond
- barrel proof / cask strength
- single barrel
- private barrel / store pick
- small batch
- toasted / finished / secondary cask
- port-finished and other wine-cask finishes
- batch-dependent releases
- release-dependent expressions
- family-level profiles
- curated whiskey flights

## Strength-field handling strategy

The app avoids collapsing ABV and proof into one naive field.

### Rules
1. If exact ABV/proof are known, show both separately.
2. If values vary by batch/release/barrel/market, use `strength.display` and preserve the caveat note.
3. If proof is unknown but ABV is known, show only ABV.
4. If a drink is non-alcoholic, show `0.0% ABV` or `Non-alcoholic`.
5. Strength confirmation states are designed for uncertainty-aware display, not hidden normalization.

## Badge strategy

### Confidence badges
- High → green-tinted
- Medium → gold-tinted
- Low → red-tinted

### Ambiguity badges
- Clear interpretation
- Likely interpretation
- Normalized from imperfect naming
- Batch-dependent
- Variant-dependent
- Rotating composition
- Market-dependent

### Caveat badges
- Batch Variation
- Barrel Variation
- Release Variation
- Private Barrel
- Market Variation
- Likely Interpretation

## Scalable styling system

- dark background with restrained warm highlight color
- Manrope for display typography
- Inter for UI/body text
- shared card system (`glass-panel`, `info-card`, `drink-card`)
- chip/badge tokens
- responsive two-column detail layout collapsing to one column on mobile

## Version one priorities

1. Polished browsing.
2. Reliable local search.
3. Strong detail-page presentation.
4. Correct handling of optional/null fields.
5. Excellent whiskey classification and caveat presentation.
6. GitHub Pages deployment with no build step.

## Deferred beyond v1

- advanced faceted search
- client-side indexing library
- offline PWA behavior
- import pipeline from source documents
- favorites or collections
- multi-page static pre-generation
