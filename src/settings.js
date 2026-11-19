// Saved settings and their defaults. Shared by the content script and the popup.
(function (root) {
  'use strict';

  // Where hiding applies. "shorts" covers Shorts cards on any page;
  // the page areas cover regular videos on that page.
  const AREAS = ['home', 'subscriptions', 'search', 'shorts', 'other'];

  const DEFAULTS = {
    enabled: true,
    extraKeywords: [],
    areas: { home: true, subscriptions: true, search: true, shorts: true, other: true },
  };

  // Reads saved settings, filling in anything missing (for example an area added in a newer version).
  async function load() {
    const saved = await chrome.storage.sync.get(DEFAULTS);
    return {
      enabled: saved.enabled !== false,
      extraKeywords: Array.isArray(saved.extraKeywords) ? saved.extraKeywords : [],
      areas: { ...DEFAULTS.areas, ...(saved.areas || {}) },
    };
  }

  root.GSBSettings = { AREAS, DEFAULTS, load };
})(typeof globalThis !== 'undefined' ? globalThis : this);
