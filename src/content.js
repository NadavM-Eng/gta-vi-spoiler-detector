// Finds video cards on YouTube, reads their title and channel, and hides the ones the matcher flags.
(() => {
  'use strict';

  const ATTR_ACTIVE = 'data-gsb-active'; // on <html>: blocker is on
  const ATTR_CHECKED = 'data-gsb-checked'; // on a card: title has been read
  const ATTR_HIDDEN = 'data-gsb-hidden'; // on a card's container: matched, hide it
  const ATTR_HIDDEN_SHELF = 'data-gsb-hidden-shelf'; // on a shelf: heading matched or every card is hidden

  // One entry per kind of video card. Keep in sync with the list in content.css.
  const UNIT_SELECTORS = [
    'yt-lockup-view-model', // current card used on home, subscriptions, search, watch sidebar
    'ytm-shorts-lockup-view-model-v2',
    'ytm-shorts-lockup-view-model',
    'ytd-video-renderer', // older card types YouTube still serves in places
    'ytd-compact-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-rich-grid-media',
    'ytd-playlist-renderer',
    'ytd-radio-renderer',
    'ytd-compact-radio-renderer',
    'ytd-compact-playlist-renderer',
    'ytd-reel-item-renderer',
    '.ytp-videowall-still', // suggestions shown inside the player when a video ends
  ].join(',');

  // Grid cells that wrap a card. Hiding the cell (not just the card) is what lets the grid reflow.
  const GRID_ITEM = 'ytd-rich-item-renderer';
  const WRAPPER_SELECTORS = `${GRID_ITEM}, .ytGridShelfViewModelGridShelfItem`;

  // Groups of cards with their own heading. Hidden entirely when the heading matches
  // or once all their cards are hidden, so no empty titled row is left behind.
  const SHELF_SELECTORS = [
    'ytd-rich-section-renderer',
    'ytd-shelf-renderer',
    'ytd-reel-shelf-renderer',
    'grid-shelf-view-model',
    'yt-official-card-view-model', // the game/channel banner at the top of search results
  ].join(',');

  const SHELF_HEADING_SELECTORS = 'h1, h2, #title';
  const TITLE_SELECTORS = 'h3, #video-title, .ytLockupMetadataViewModelTitle, .ytp-videowall-still-info-title';

  // The home/subscriptions grid. YouTube marks the first cell of each row with this attribute
  // and gives it a different margin, so after hiding cells the marks have to be reassigned.
  const GRID_SELECTOR = 'ytd-rich-grid-renderer';
  const FIRST_COLUMN_ATTR = 'is-in-first-column';
  const PER_ROW_VAR = '--ytd-rich-grid-items-per-row';

  // Shorts cards are their own area, wherever they appear.
  const SHORTS_UNIT_SELECTORS = 'ytm-shorts-lockup-view-model-v2, ytm-shorts-lockup-view-model, ytd-reel-item-renderer';
  const SHORTS_LINK_SELECTOR = 'a[href^="/shorts/"]';

  // YouTube keeps each page type in its own container; the first match gives a card's page area.
  const PAGE_AREAS = [
    ['ytd-search', 'search'],
    ['ytd-browse[page-subtype="home"]', 'home'],
    ['ytd-browse[page-subtype="subscriptions"]', 'subscriptions'],
  ];

  const root = document.documentElement;
  let isSpoiler = GSBMatcher.buildMatcher([]);
  let areas = { ...GSBSettings.DEFAULTS.areas };
  // Last area + text seen per card. YouTube reuses card elements for different videos,
  // so a card is re-judged whenever either changes.
  let lastText = new WeakMap();
  let layoutDirty = false;
  const adjustedGrids = new WeakSet();
  // Videos this tab has already reported as hidden, and ones waiting to be sent.
  const reportedVideos = new Set();
  let unreportedVideos = [];
  let settingsLoaded = false;

  function outermostUnit(unit) {
    let current = unit;
    for (;;) {
      const parent = current.parentElement && current.parentElement.closest(UNIT_SELECTORS);
      if (!parent) return current;
      current = parent;
    }
  }

  function unitAround(node) {
    const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    const unit = el && el.closest(UNIT_SELECTORS);
    return unit ? outermostUnit(unit) : null;
  }

  function pageAreaOf(el) {
    for (const [selector, area] of PAGE_AREAS) {
      if (el.closest(selector)) return area;
    }
    return 'other'; // watch page, channel pages, playlists...
  }

  function isShortsCard(unit) {
    return unit.matches(SHORTS_UNIT_SELECTORS) || unit.querySelector(SHORTS_LINK_SELECTOR) !== null;
  }

  function areaOf(unit) {
    return isShortsCard(unit) ? 'shorts' : pageAreaOf(unit);
  }

  function hideTarget(unit) {
    let target = unit.closest(WRAPPER_SELECTORS) || unit;
    // Step out of anonymous single-child wrapper divs so no empty box is left behind.
    for (let i = 0; i < 2; i++) {
      const parent = target.parentElement;
      if (!parent || parent.tagName !== 'DIV' || parent.id || parent.childElementCount !== 1) break;
      target = parent;
    }
    return target;
  }

  // Collects everything a card says about itself: title, channel name, handle, labels.
  // Pieces are joined with " | " so separate fields can never merge into a false match.
  function readCard(unit) {
    const parts = new Set();
    let titleElements = 0;
    let hasTitle = false;

    for (const el of unit.querySelectorAll(TITLE_SELECTORS)) {
      titleElements++;
      const attr = el.getAttribute('title');
      const text = el.textContent.trim();
      if (attr) parts.add(attr);
      if (text) parts.add(text);
      if (attr || text) hasTitle = true;
    }

    const ownLabel = unit.getAttribute('aria-label');
    if (ownLabel) parts.add(ownLabel);

    for (const link of unit.querySelectorAll('a')) {
      const label = link.getAttribute('aria-label') || link.getAttribute('title');
      if (label) parts.add(label);
      const href = link.getAttribute('href') || '';
      if (href.startsWith('/@')) {
        try {
          parts.add('@' + decodeURIComponent(href.slice(2).split(/[/?#]/)[0]));
        } catch {
          // malformed handle, ignore
        }
      }
    }

    const walker = document.createTreeWalker(unit, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.nodeValue.trim();
      if (text) parts.add(text);
    }

    // A card with a title element that is still empty is mid-render: wait for it.
    const ready = titleElements > 0 ? hasTitle : parts.size > 0;
    return { text: [...parts].join(' | '), ready };
  }

  function setChecked(unit, checked) {
    unit.toggleAttribute(ATTR_CHECKED, checked);
    for (const nested of unit.querySelectorAll(UNIT_SELECTORS)) nested.toggleAttribute(ATTR_CHECKED, checked);
  }

  function evaluate(unit) {
    if (!unit.isConnected) return;
    const { text, ready } = readCard(unit);

    if (!ready) {
      lastText.delete(unit);
      setChecked(unit, false);
      return;
    }
    const area = areaOf(unit);
    const seen = `${area}\n${text}`;
    if (lastText.get(unit) === seen && unit.hasAttribute(ATTR_CHECKED)) return;

    lastText.set(unit, seen);
    const hide = areas[area] && isSpoiler(text);
    hideTarget(unit).toggleAttribute(ATTR_HIDDEN, hide);
    // Count only once the saved settings are in: until then hiding runs on defaults.
    if (hide && settingsLoaded && root.hasAttribute(ATTR_ACTIVE)) noteHidden(unit, text);
    setChecked(unit, true);
    layoutDirty = true;
  }

  // Identifies the video behind a card, so the session total counts each video once.
  function videoKey(unit, text) {
    for (const link of [unit, ...unit.querySelectorAll('a[href]')]) {
      const match = /(?:[?&]v=|\/shorts\/)([\w-]{6,})/.exec(link.getAttribute('href') || '');
      if (match) return match[1];
    }
    return text.slice(0, 120); // no video link (rare): fall back to the card's text
  }

  function noteHidden(unit, text) {
    const key = videoKey(unit, text);
    if (reportedVideos.has(key)) return;
    reportedVideos.add(key);
    unreportedVideos.push(key);
  }

  // Sends newly hidden videos to the background worker, which keeps the session total.
  function reportHidden() {
    if (unreportedVideos.length === 0) return;
    const ids = unreportedVideos;
    unreportedVideos = [];
    try {
      chrome.runtime.sendMessage({ type: 'gsb:hidden', ids }).catch(() => {});
    } catch {
      // The extension was reloaded while this tab stayed open; the count resumes after a page reload.
    }
  }

  function readShelfHeading(shelf) {
    const parts = [];
    for (const heading of shelf.querySelectorAll(SHELF_HEADING_SELECTORS)) {
      if (heading.closest(UNIT_SELECTORS)) continue; // a card's own title, not the shelf's
      const text = heading.textContent.trim();
      if (text) parts.push(text);
    }
    return parts.join(' | ');
  }

  function tidyShelves() {
    for (const shelf of document.querySelectorAll(SHELF_SELECTORS)) {
      const units = [...shelf.querySelectorAll(UNIT_SELECTORS)].filter((u) => outermostUnit(u) === u);
      const allHidden = units.length > 0 && units.every((u) => hideTarget(u).hasAttribute(ATTR_HIDDEN));
      // A shelf counts as Shorts only when all its cards are; a mixed shelf follows its page.
      const area = units.length > 0 && units.every(isShortsCard) ? 'shorts' : pageAreaOf(shelf);
      const headingMatches = areas[area] && isSpoiler(readShelfHeading(shelf));
      shelf.toggleAttribute(ATTR_HIDDEN_SHELF, allHidden || headingMatches);
    }
  }

  // Re-marks which visible cells start a row, so every row keeps YouTube's own alignment.
  function tidyGrids() {
    const active = root.hasAttribute(ATTR_ACTIVE);
    for (const grid of document.querySelectorAll(GRID_SELECTOR)) {
      const contents = grid.querySelector(':scope > #contents');
      if (!contents) continue;
      const hasHidden = contents.querySelector(`:scope > [${ATTR_HIDDEN}]`) !== null;
      if (!hasHidden && !adjustedGrids.has(grid)) continue; // untouched grid: YouTube's marks are right
      const perRow = parseInt(getComputedStyle(grid).getPropertyValue(PER_ROW_VAR), 10);
      if (!perRow) continue;

      adjustedGrids.add(grid);
      let position = 0;
      for (const cell of contents.children) {
        if (cell.localName !== GRID_ITEM) {
          position = 0; // a full-width section starts a new row
          continue;
        }
        if (active && cell.hasAttribute(ATTR_HIDDEN)) continue;
        const isFirst = position % perRow === 0;
        if (cell.hasAttribute(FIRST_COLUMN_ATTR) !== isFirst) cell.toggleAttribute(FIRST_COLUMN_ATTR, isFirst);
        position++;
      }
    }
  }

  function tidyLayoutIfNeeded() {
    if (!layoutDirty) return;
    layoutDirty = false;
    tidyShelves();
    tidyGrids();
  }

  function scanAll() {
    for (const unit of document.querySelectorAll(UNIT_SELECTORS)) {
      if (outermostUnit(unit) === unit) evaluate(unit);
    }
    tidyLayoutIfNeeded();
    reportHidden();
  }

  // Runs before the browser paints, so a matched card is hidden in the same frame it appears.
  function onMutations(records) {
    const touched = new Set();

    for (const record of records) {
      if (record.type === 'attributes' && record.attributeName === FIRST_COLUMN_ATTR) {
        layoutDirty = true; // YouTube re-laid out the grid (e.g. window resize)
        continue;
      }

      const unit = unitAround(record.target);
      if (unit) {
        touched.add(unit); // something changed inside a card
        continue;
      }
      if (record.type !== 'childList') continue;

      for (const added of record.addedNodes) {
        if (added.nodeType !== Node.ELEMENT_NODE) continue;
        if (added.matches(UNIT_SELECTORS)) touched.add(outermostUnit(added));
        for (const inner of added.querySelectorAll(UNIT_SELECTORS)) touched.add(outermostUnit(inner));
      }
    }

    for (const unit of touched) evaluate(unit);
    tidyLayoutIfNeeded();
    reportHidden();
  }

  function applySettings(settings) {
    root.toggleAttribute(ATTR_ACTIVE, settings.enabled);
    isSpoiler = GSBMatcher.buildMatcher(settings.extraKeywords);
    areas = settings.areas;
    settingsLoaded = true;
    lastText = new WeakMap(); // keywords or areas may have changed: judge every card again
    layoutDirty = true;
    scanAll();
  }

  // Start blocking immediately with defaults; saved settings arrive a moment later.
  root.toggleAttribute(ATTR_ACTIVE, true);

  new MutationObserver(onMutations).observe(document, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['title', 'href', 'aria-label', FIRST_COLUMN_ATTR],
  });

  document.addEventListener('DOMContentLoaded', scanAll);
  document.addEventListener('yt-navigate-finish', scanAll); // YouTube's in-page navigation
  document.addEventListener('yt-page-data-updated', scanAll);

  GSBSettings.load().then(applySettings);
  chrome.storage.onChanged.addListener((changes, storageArea) => {
    if (storageArea === 'sync') GSBSettings.load().then(applySettings);
  });
})();
