const app = document.querySelector('#app');
const libraryTemplate = document.querySelector('#library-template');
const detailTemplate = document.querySelector('#detail-template');
const SCROLL_KEY = 'nightcap-library-scroll';
const PAGE_SIZE = 36;

const state = {
  entries: [],
  query: '',
  family: 'All',
  category: 'All',
  page: 1,
  sort: 'name',
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
    updateMetrics();
    hydrateStateFromUrl();
    render();
  } catch (error) {
    app.innerHTML = `<div class="empty-state">Unable to load the drink library. ${error.message}</div>`;
  }
}

function updateMetrics() {
  const total = state.entries.length;
  const families = new Set(state.entries.map(e => e.family)).size;
  const highConf = state.entries.filter(e => e.research?.confidence === 'High').length;

  const setMetric = (id, value) => {
    const el = document.querySelector(`#${id} .metric-value`);
    if (el) el.textContent = value;
  };
  setMetric('metricTotal', total.toLocaleString());
  setMetric('metricFamilies', families);
  setMetric('metricConfidence', `${Math.round(highConf / total * 100)}%`);
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
    ...(entry.signatureTraits || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const preview = entry.tasting?.aroma?.slice(0, 3).join(' · ')
    || entry.tasting?.flavor?.slice(0, 3).join(' · ')
    || 'Profile available';

  return { ...entry, searchTerms, preview };
}

function hydrateStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  state.query = params.get('q') || '';
  state.family = params.get('family') || 'All';
  state.category = params.get('category') || 'All';
  state.page = parseInt(params.get('page') || '1', 10);
  state.sort = params.get('sort') || 'name';
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
      params.set(key, String(value));
    }
  });
  if (params.get('page') === '1') params.delete('page');
  if (params.get('sort') === 'name') params.delete('sort');
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
      params.set(key, String(value));
    }
  });
  if (params.get('page') === '1') params.delete('page');
  if (params.get('sort') === 'name') params.delete('sort');
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
  const paginationControls = fragment.querySelector('#paginationControls');
  const sortSelect = fragment.querySelector('#sortSelect');

  searchInput.value = state.query;
  sortSelect.value = state.sort;

  let debounceTimer;
  searchInput.addEventListener('input', (event) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      state.query = event.target.value;
      state.page = 1;
      saveScroll(0);
      replaceUrl({ q: state.query, family: state.family, category: state.category, drink: null, page: 1 });
      refreshLibraryResults();
    }, 150);
  });

  sortSelect.addEventListener('change', (event) => {
    state.sort = event.target.value;
    state.page = 1;
    replaceUrl({ q: state.query, family: state.family, category: state.category, sort: state.sort, page: 1 });
    refreshLibraryResults();
  });

  const familyCounts = {};
  familyOrder.forEach(f => { familyCounts[f] = 0; });
  state.entries.forEach(e => {
    if (familyCounts[e.family] !== undefined) familyCounts[e.family]++;
  });
  familyCounts['All'] = state.entries.length;

  buildFilters(familyFilters, familyOrder, state.family, (value) => {
    state.family = value;
    state.category = 'All';
    state.page = 1;
    saveScroll(0);
    replaceUrl({ q: state.query, family: state.family, category: null, drink: null, page: 1 });
    render();
  }, familyCounts);

  const relevantEntries = state.entries.filter(e => state.family === 'All' || e.family === state.family);
  const catCounts = {};
  relevantEntries.forEach(e => {
    catCounts[e.category] = (catCounts[e.category] || 0) + 1;
  });
  const categories = ['All', ...Object.keys(catCounts).sort()];
  catCounts['All'] = relevantEntries.length;

  buildFilters(categoryFilters, categories, state.category, (value) => {
    state.category = value;
    state.page = 1;
    saveScroll(0);
    replaceUrl({ q: state.query, family: state.family, category: state.category, drink: null, page: 1 });
    render();
  }, catCounts);

  const results = sortEntries(filterEntries());
  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  if (state.page > totalPages) state.page = totalPages;
  const pageResults = results.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);

  resultHeading.textContent = state.query ? `Results for "${state.query}"` : 'Browse drinks';
  resultSummary.textContent = `${results.length} profile${results.length !== 1 ? 's' : ''} found`;

  if (!results.length) {
    cardGrid.innerHTML = '<div class="empty-state">No drinks matched that combination. Try a broader category or fewer keywords.</div>';
  } else {
    const frag = document.createDocumentFragment();
    pageResults.forEach(entry => frag.appendChild(createCard(entry)));
    cardGrid.appendChild(frag);
  }

  if (totalPages > 1) {
    buildPagination(paginationControls, state.page, totalPages);
  }

  app.appendChild(fragment);
  restoreScroll();
}

function refreshLibraryResults() {
  const cardGrid = document.querySelector('#cardGrid');
  const resultSummary = document.querySelector('#resultSummary');
  const resultHeading = document.querySelector('#resultHeading');
  const paginationControls = document.querySelector('#paginationControls');
  if (!cardGrid) return;

  const results = sortEntries(filterEntries());
  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  if (state.page > totalPages) state.page = totalPages;
  const pageResults = results.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);

  resultHeading.textContent = state.query ? `Results for "${state.query}"` : 'Browse drinks';
  resultSummary.textContent = `${results.length} profile${results.length !== 1 ? 's' : ''} found`;

  cardGrid.innerHTML = '';
  if (!results.length) {
    cardGrid.innerHTML = '<div class="empty-state">No drinks matched that combination. Try a broader category or fewer keywords.</div>';
  } else {
    const frag = document.createDocumentFragment();
    pageResults.forEach(entry => frag.appendChild(createCard(entry)));
    cardGrid.appendChild(frag);
  }

  if (paginationControls) {
    paginationControls.innerHTML = '';
    if (totalPages > 1) {
      buildPagination(paginationControls, state.page, totalPages);
    }
  }
}

function buildFilters(container, values, activeValue, onSelect, counts) {
  values.forEach((value) => {
    const button = document.createElement('button');
    button.className = `filter-chip ${value === activeValue ? 'active' : ''}`;
    const count = counts?.[value];
    button.innerHTML = `${value}${count !== undefined ? `<span class="chip-count">${count}</span>` : ''}`;
    button.addEventListener('click', () => onSelect(value));
    container.appendChild(button);
  });
}

function filterEntries() {
  const queryTerms = state.query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return state.entries.filter((entry) => {
    const familyMatch = state.family === 'All' || entry.family === state.family;
    const categoryMatch = state.category === 'All' || entry.category === state.category;
    const queryMatch = !queryTerms.length || queryTerms.every(term => entry.searchTerms.includes(term));
    return familyMatch && categoryMatch && queryMatch;
  });
}

function sortEntries(entries) {
  const sorted = [...entries];
  switch (state.sort) {
    case 'name':
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'name-desc':
      sorted.sort((a, b) => b.name.localeCompare(a.name));
      break;
    case 'family':
      sorted.sort((a, b) => {
        const fi = familyOrder.indexOf(a.family) - familyOrder.indexOf(b.family);
        return fi !== 0 ? fi : a.name.localeCompare(b.name);
      });
      break;
    case 'confidence': {
      const rank = { High: 0, Medium: 1, Low: 2 };
      sorted.sort((a, b) => {
        const cr = (rank[a.research?.confidence] ?? 3) - (rank[b.research?.confidence] ?? 3);
        return cr !== 0 ? cr : a.name.localeCompare(b.name);
      });
      break;
    }
  }
  return sorted;
}

function buildPagination(container, current, total) {
  const prevBtn = document.createElement('button');
  prevBtn.className = 'page-btn nav-btn';
  prevBtn.textContent = '← Prev';
  prevBtn.disabled = current <= 1;
  prevBtn.addEventListener('click', () => goToPage(current - 1));
  container.appendChild(prevBtn);

  const pages = getPaginationRange(current, total);
  pages.forEach(p => {
    if (p === '...') {
      const span = document.createElement('span');
      span.className = 'page-ellipsis';
      span.textContent = '…';
      container.appendChild(span);
    } else {
      const btn = document.createElement('button');
      btn.className = `page-btn ${p === current ? 'active' : ''}`;
      btn.textContent = p;
      btn.addEventListener('click', () => goToPage(p));
      container.appendChild(btn);
    }
  });

  const nextBtn = document.createElement('button');
  nextBtn.className = 'page-btn nav-btn';
  nextBtn.textContent = 'Next →';
  nextBtn.disabled = current >= total;
  nextBtn.addEventListener('click', () => goToPage(current + 1));
  container.appendChild(nextBtn);
}

function getPaginationRange(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [];
  pages.push(1);
  if (current > 3) pages.push('...');
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    pages.push(i);
  }
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}

function goToPage(page) {
  state.page = page;
  saveScroll(0);
  replaceUrl({ q: state.query, family: state.family, category: state.category, sort: state.sort, page: state.page });
  refreshLibraryResults();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function createCard(entry) {
  const button = document.createElement('button');
  button.className = 'drink-card';

  const confidenceClass = entry.research?.confidence ? `confidence-${entry.research.confidence.toLowerCase()}` : '';
  const strengthDisplay = entry.strength?.abvDisplay || entry.strength?.display || '';

  button.innerHTML = `
    <div class="card-topline">
      <span class="badge">${entry.category}</span>
      <span class="card-family-tag">${entry.family}</span>
    </div>
    <div class="card-body">
      <h3 class="card-title">${escapeHtml(entry.name)}</h3>
      <p class="card-meta">${escapeHtml([entry.subtype || entry.varietal, entry.producer].filter(Boolean).join(' · '))}</p>
    </div>
    <p class="card-preview">${escapeHtml(entry.preview)}</p>
    <div class="card-footer">
      ${buildInlineBadges(entry)}
      ${entry.research?.confidence ? `<span class="badge ${confidenceClass}">${entry.research.confidence}</span>` : ''}
      ${strengthDisplay ? `<span class="card-strength">${escapeHtml(strengthDisplay)}</span>` : ''}
    </div>
  `;
  button.addEventListener('click', () => {
    saveScroll(window.scrollY);
    updateUrl({ q: state.query, family: state.family, category: state.category, sort: state.sort, page: state.page, drink: entry.id });
    render();
    window.scrollTo({ top: 0, behavior: 'auto' });
  });
  return button;
}

function buildInlineBadges(entry) {
  const badges = [];
  if (entry.whiskey?.displayTags?.length) {
    badges.push(...entry.whiskey.displayTags.slice(0, 2));
  }
  if (entry.research?.ambiguityStatus && entry.research.ambiguityStatus !== 'Clear') {
    badges.push('Ambiguous');
  }
  return badges.slice(0, 3).map(tag => `<span class="badge">${escapeHtml(tag)}</span>`).join('');
}

function renderDetail(drinkId) {
  const entry = state.entries.find(item => item.id === drinkId);
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
  buildDetailBadges(entry).forEach(badge => topBadges.appendChild(badge));

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
    div.innerHTML = `<strong>${startCase(key)}</strong><p>${escapeHtml(values.join(', '))}</p>`;
    pairingsGrid.appendChild(div);
  });

  const signatureSection = fragment.querySelector('#signatureSection');
  if (entry.signatureTraits?.length) {
    fragment.querySelector('#signatureTraits').textContent = entry.signatureTraits.join(' ');
  } else {
    signatureSection.remove();
  }

  const researchBadges = fragment.querySelector('#researchBadges');
  createResearchBadges(entry).forEach(badge => researchBadges.appendChild(badge));

  const researchFields = fragment.querySelector('#researchFields');
  [
    ['Confidence level', entry.research?.confidence],
    ['Ambiguity status', entry.research?.ambiguityStatus],
    ['Profile level', entry.research?.profileLevel],
    ['Conflicts found', entry.research?.conflictsFound],
    ['Resolution', entry.research?.resolution],
    ['Source types consulted', joinList(entry.research?.sourceTypesConsulted)],
    ['Source record', entry.sourceRecord?.displayName ? `${entry.sourceRecord.displayName}${entry.sourceRecord.normalizedFrom ? ` (normalized from "${entry.sourceRecord.normalizedFrom}")` : ''}` : null],
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
  div.innerHTML = `<span class="fact-label">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>`;
  return div;
}

function buildDetailBadges(entry) {
  const labels = [...(entry.whiskey?.displayTags || [])];
  if (entry.research?.ambiguityStatus && entry.research.ambiguityStatus !== 'Clear') labels.push('Ambiguous');
  return labels.map(label => {
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
  if (entry.research?.ambiguityStatus) {
    badges.push(makeBadge(
      entry.research.ambiguityStatus === 'Clear' ? 'Clear interpretation' : entry.research.ambiguityStatus,
      entry.research.ambiguityStatus === 'Clear' ? '' : 'ambiguous'
    ));
  }
  (entry.research?.caveats || []).forEach(caveat => badges.push(makeBadge(humanizeBadge(caveat), 'caveat')));
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
  return value.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function humanizeBadge(key) {
  return badgeLabelMap[key] || startCase(key);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function saveScroll(position) {
  sessionStorage.setItem(SCROLL_KEY, String(position));
}

function restoreScroll() {
  const saved = Number(sessionStorage.getItem(SCROLL_KEY) || 0);
  requestAnimationFrame(() => window.scrollTo({ top: saved, behavior: 'auto' }));
}
