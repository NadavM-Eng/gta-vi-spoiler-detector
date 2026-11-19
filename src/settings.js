// Saved settings and their defaults. Shared by the content script and the popup.
(function (root) {
  'use strict';

  // Where hiding applies. "shorts" covers Shorts cards on any page;
  // the page areas cover regular videos on that page.
  // Firefox exposes the extension API as `browser`, Chromium browsers as `chrome`.
  const ext = root.browser || root.chrome;

  const AREAS = ['home', 'subscriptions', 'search', 'shorts', 'other'];

  const DEFAULTS = {
    enabled: true,
    extraKeywords: [],
    areas: { home: true, subscriptions: true, search: true, shorts: true, other: true },
  };

  // Reads saved settings, filling in anything missing (for example an area added in a newer version).
  async function load() {
    const saved = await ext.storage.sync.get(DEFAULTS);
    return {
      enabled: saved.enabled !== false,
      extraKeywords: Array.isArray(saved.extraKeywords) ? saved.extraKeywords : [],
      areas: { ...DEFAULTS.areas, ...(saved.areas || {}) },
    };
  }

  root.GSDSettings = { AREAS, DEFAULTS, load };
})(typeof globalThis !== 'undefined' ? globalThis : this);
