const app = document.querySelector('#app');
const libraryTemplate = document.querySelector('#library-template');
const detailTemplate = document.querySelector('#detail-template');
const SCROLL_KEY = 'nightcap-library-scroll';

const state = {
  entries: [],
  query: '',
  family: 'All',
  category: 'All',
};

const familyOrder = ['All', 'Whiskey', 'Wine', 'Spirit', 'Cocktail', 'Beer', 'RTD', 'Mocktail', 'Soft Drink', 'Water'];

const badgeLabelMap = {
  bottled_in_bond: 'Bottled in Bond',
  private_barrel: 'Private Barrel',
  barrel_proof: 'Barrel Proof',
  cask_strength: 'Cask Strength',
  single_barrel: 'Single Barrel',
  small_batch: 'Small Batch',
  finished: 'Finished',
  port_cask: 'Port Cask',
  wheated: 'Wheated',
  high_rye: 'High-Rye',
  flight: 'Flight',
  batch_variation: 'Batch Variation',
  barrel_variation: 'Barrel Variation',
  release_variation: 'Release Variation',
  market_variation: 'Market Variation',
  likely_interpretation: 'Likely Interpretation',
  ambiguous: 'Ambiguous',
};

init();
window.addEventListener('popstate', () => {
  hydrateStateFromUrl();
  render();
});

async function init() {
  app.innerHTML = '<div class="empty-state">Loading drink profiles…</div>';
  try {
    const response = await fetch('./data/drinks.json');
    if (!response.ok) throw new Error(`Failed to load data (${response.status})`);
    const data = await response.json();
    state.entries = data.entries.map(enrichEntry);
    hydrateStateFromUrl();
    render();
  } catch (error) {
    app.innerHTML = `<div class="empty-state">Unable to load the drink library. ${error.message}</div>`;
  }
}

function enrichEntry(entry) {
  const searchTerms = [
    entry.name,
    entry.family,
    entry.category,
    entry.subtype,
    entry.varietal,
    entry.producer,
    entry.origin?.display,
    ...(entry.tasting?.aroma || []),
    ...(entry.tasting?.flavor || []),
    ...(entry.whiskey?.styleTerms || []),
    ...(entry.tags || []),
    ...(entry.research?.caveats || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const preview = entry.tasting?.aroma?.slice(0, 3).join(' • ') || entry.tasting?.flavor?.slice(0, 3).join(' • ') || 'Profile available';

  return { ...entry, searchTerms, preview };
}

function hydrateStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  state.query = params.get('q') || '';
  state.family = params.get('family') || 'All';
  state.category = params.get('category') || 'All';
}

function currentDetailId() {
  return new URLSearchParams(window.location.search).get('drink');
}

function updateUrl(next = {}) {
  const params = new URLSearchParams(window.location.search);
  Object.entries(next).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '' || value === 'All') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  });
  const url = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`;
  history.pushState({}, '', url);
  hydrateStateFromUrl();
}

function replaceUrl(next = {}) {
  const params = new URLSearchParams(window.location.search);
  Object.entries(next).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '' || value === 'All') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  });
  const url = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`;
  history.replaceState({}, '', url);
  hydrateStateFromUrl();
}

function render() {
  app.innerHTML = '';
  const drinkId = currentDetailId();
  if (drinkId) {
    renderDetail(drinkId);
  } else {
    renderLibrary();
  }
}

function renderLibrary() {
  const fragment = libraryTemplate.content.cloneNode(true);
  const searchInput = fragment.querySelector('#searchInput');
  const familyFilters = fragment.querySelector('#familyFilters');
  const categoryFilters = fragment.querySelector('#categoryFilters');
  const cardGrid = fragment.querySelector('#cardGrid');
  const resultSummary = fragment.querySelector('#resultSummary');
  const resultHeading = fragment.querySelector('#resultHeading');

  searchInput.value = state.query;
  searchInput.addEventListener('input', (event) => {
    state.query = event.target.value;
    saveScroll(0);
    replaceUrl({ q: state.query, family: state.family, category: state.category, drink: null });
    refreshLibraryResults();
  });

  buildFilters(familyFilters, familyOrder, state.family, (value) => {
    state.family = value;
    state.category = 'All';
    saveScroll(0);
    replaceUrl({ q: state.query, family: state.family, category: null, drink: null });
    render();
  });

  const categories = ['All', ...new Set(state.entries.filter((entry) => state.family === 'All' || entry.family === state.family).map((entry) => entry.category))];
  buildFilters(categoryFilters, categories, state.category, (value) => {
    state.category = value;
    saveScroll(0);
    replaceUrl({ q: state.query, family: state.family, category: state.category, drink: null });
    render();
  });

  const results = filterEntries();
  resultHeading.textContent = state.query ? `Results for “${state.query}”` : 'Browse drinks';
  resultSummary.textContent = `${results.length} profiles across premium tasting-reference categories.`;

  if (!results.length) {
    cardGrid.innerHTML = '<div class="empty-state">No drinks matched that combination. Try a broader category or fewer tasting keywords.</div>';
  } else {
    results.forEach((entry) => cardGrid.appendChild(createCard(entry)));
  }

  app.appendChild(fragment);
  restoreScroll();
}

function refreshLibraryResults() {
  const cardGrid = document.querySelector('#cardGrid');
  const resultSummary = document.querySelector('#resultSummary');
  const resultHeading = document.querySelector('#resultHeading');
  if (!cardGrid) return;

  const results = filterEntries();
  resultHeading.textContent = state.query ? `Results for "${state.query}"` : 'Browse drinks';
  resultSummary.textContent = `${results.length} profiles across premium tasting-reference categories.`;

  cardGrid.innerHTML = '';
  if (!results.length) {
    cardGrid.innerHTML = '<div class="empty-state">No drinks matched that combination. Try a broader category or fewer tasting keywords.</div>';
  } else {
    results.forEach((entry) => cardGrid.appendChild(createCard(entry)));
  }
}

function buildFilters(container, values, activeValue, onSelect) {
  values.forEach((value) => {
    const button = document.createElement('button');
    button.className = `filter-chip ${value === activeValue ? 'active' : ''}`;
    button.textContent = value;
    button.addEventListener('click', () => onSelect(value));
    container.appendChild(button);
  });
}

function filterEntries() {
  return state.entries.filter((entry) => {
    const familyMatch = state.family === 'All' || entry.family === state.family;
    const categoryMatch = state.category === 'All' || entry.category === state.category;
    const queryMatch = !state.query || entry.searchTerms.includes(state.query.toLowerCase().trim());
    return familyMatch && categoryMatch && queryMatch;
  });
}

function createCard(entry) {
  const button = document.createElement('button');
  button.className = 'drink-card';
  button.innerHTML = `
    <div class="card-topline">
      <span class="badge">${entry.category}</span>
      ${entry.research?.ambiguityStatus && entry.research.ambiguityStatus !== 'Clear' ? '<span class="badge ambiguous">Ambiguous</span>' : ''}
    </div>
    <div>
      <h3 class="card-title">${entry.name}</h3>
      <p class="card-meta">${[entry.subtype || entry.varietal, entry.producer].filter(Boolean).join(' · ')}</p>
    </div>
    <p class="card-preview">${entry.preview}</p>
    <div class="badge-row">${buildInlineBadges(entry)}</div>
  `;
  button.addEventListener('click', () => {
    saveScroll(window.scrollY);
    updateUrl({ q: state.query, family: state.family, category: state.category, drink: entry.id });
    render();
    window.scrollTo({ top: 0, behavior: 'auto' });
  });
  return button;
}

function buildInlineBadges(entry) {
  const badges = [];
  if (entry.whiskey?.displayTags?.length) {
    badges.push(...entry.whiskey.displayTags.slice(0, 3));
  }
  return badges.slice(0, 3).map((tag) => `<span class="badge">${tag}</span>`).join('');
}

function renderDetail(drinkId) {
  const entry = state.entries.find((item) => item.id === drinkId);
  if (!entry) {
    updateUrl({ drink: null });
    renderLibrary();
    return;
  }

  const fragment = detailTemplate.content.cloneNode(true);
  fragment.querySelector('#backButton').addEventListener('click', () => {
    history.back();
  });

  fragment.querySelector('#detailEyebrow').textContent = `${entry.family} · ${entry.category}`;
  fragment.querySelector('#detailName').textContent = entry.name;
  fragment.querySelector('#detailSubhead').textContent = [entry.subtype || entry.varietal, entry.producer, entry.origin?.display].filter(Boolean).join(' · ');

  const topBadges = fragment.querySelector('#detailTopBadges');
  buildDetailBadges(entry).forEach((badge) => topBadges.appendChild(badge));

  const detailFacts = fragment.querySelector('#detailFacts');
  const strengthLabel = entry.strength?.abvDisplay ? 'ABV' : 'Strength';
  [
    ['Producer', entry.producer],
    ['Origin', entry.origin?.display],
    ['Subtype', entry.subtype || entry.varietal],
    [strengthLabel, formatStrength(entry.strength)],
    ['Proof', entry.strength?.proofDisplay || entry.strength?.proof?.toString()],
  ].filter(([, value]) => value).forEach(([label, value]) => detailFacts.appendChild(createFact(label, value)));

  const profileFields = fragment.querySelector('#profileFields');
  [
    ['Aroma notes', joinList(entry.tasting?.aroma)],
    ['Flavor profile', joinList(entry.tasting?.flavor)],
    ['Body / Texture', entry.tasting?.body],
    ['Finish', entry.tasting?.finish],
  ].filter(([, value]) => value).forEach(([term, value]) => appendDefinition(profileFields, term, value));

  const pairingsGrid = fragment.querySelector('#pairingsGrid');
  Object.entries(entry.pairings || {}).forEach(([key, values]) => {
    if (!values?.length) return;
    const div = document.createElement('div');
    div.className = 'pairing-card';
    div.innerHTML = `<strong>${startCase(key)}</strong><p>${values.join(', ')}</p>`;
    pairingsGrid.appendChild(div);
  });

  const signatureSection = fragment.querySelector('#signatureSection');
  if (entry.signatureTraits?.length) {
    fragment.querySelector('#signatureTraits').textContent = entry.signatureTraits.join(' ');
  } else {
    signatureSection.remove();
  }

  const researchBadges = fragment.querySelector('#researchBadges');
  createResearchBadges(entry).forEach((badge) => researchBadges.appendChild(badge));

  const researchFields = fragment.querySelector('#researchFields');
  [
    ['Confidence level', entry.research?.confidence],
    ['Ambiguity status', entry.research?.ambiguityStatus],
    ['Profile level', entry.research?.profileLevel],
    ['Conflicts found', entry.research?.conflictsFound],
    ['Resolution', entry.research?.resolution],
    ['Source types consulted', joinList(entry.research?.sourceTypesConsulted)],
    ['Source record', entry.sourceRecord?.displayName ? `${entry.sourceRecord.displayName}${entry.sourceRecord.normalizedFrom ? ` (normalized from “${entry.sourceRecord.normalizedFrom}”)` : ''}` : null],
  ].filter(([, value]) => value).forEach(([term, value]) => appendDefinition(researchFields, term, value));

  app.appendChild(fragment);
}

function appendDefinition(dl, term, value) {
  const dt = document.createElement('dt');
  dt.textContent = term;
  const dd = document.createElement('dd');
  dd.textContent = value;
  dl.append(dt, dd);
}

function createFact(label, value) {
  const div = document.createElement('div');
  div.className = 'fact';
  div.innerHTML = `<span class="fact-label">${label}</span><strong>${value}</strong>`;
  return div;
}

function buildDetailBadges(entry) {
  const labels = [...(entry.whiskey?.displayTags || [])];
  if (entry.research?.ambiguityStatus && entry.research.ambiguityStatus !== 'Clear') labels.push('Ambiguous');
  return labels.map((label) => {
    const span = document.createElement('span');
    span.className = 'badge';
    span.textContent = label;
    return span;
  });
}

function createResearchBadges(entry) {
  const badges = [];
  const confidence = entry.research?.confidence?.toLowerCase();
  if (confidence) badges.push(makeBadge(`Confidence: ${entry.research.confidence}`, `confidence-${confidence}`));
  if (entry.research?.ambiguityStatus) badges.push(makeBadge(entry.research.ambiguityStatus === 'Clear' ? 'Clear interpretation' : entry.research.ambiguityStatus, entry.research.ambiguityStatus === 'Clear' ? '' : 'ambiguous'));
  (entry.research?.caveats || []).forEach((caveat) => badges.push(makeBadge(humanizeBadge(caveat), 'caveat')));
  return badges;
}

function makeBadge(label, className = '') {
  const span = document.createElement('span');
  span.className = `badge ${className}`.trim();
  span.textContent = label;
  return span;
}

function joinList(values) {
  return values?.length ? values.join(', ') : '';
}

function formatStrength(strength) {
  if (!strength) return '';
  if (strength.display) return strength.display;
  const parts = [];
  if (strength.abvDisplay) parts.push(strength.abvDisplay);
  if (strength.note) parts.push(strength.note);
  return parts.join(' · ');
}

const displayKeyMap = {
  spices_flavor_companions: 'Spices / Flavor Companions',
  proteins: 'Proteins',
  cheeses: 'Cheeses',
  cuisines: 'Cuisines',
};

function startCase(value) {
  if (displayKeyMap[value]) return displayKeyMap[value];
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function humanizeBadge(key) {
  return badgeLabelMap[key] || startCase(key);
}

function saveScroll(position) {
  sessionStorage.setItem(SCROLL_KEY, String(position));
}

function restoreScroll() {
  const saved = Number(sessionStorage.getItem(SCROLL_KEY) || 0);
  requestAnimationFrame(() => window.scrollTo({ top: saved, behavior: 'auto' }));
}
