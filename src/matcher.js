// Decides whether a piece of card text (title, channel name, handle) is about GTA 6.
// Pure logic with no DOM or extension APIs, so it runs in the content script and in Node tests.
(function (root) {
  'use strict';

  const START = '(?<![\\p{L}\\p{N}])'; // not glued to a preceding letter or digit
  const END = '(?![\\p{L}\\p{N}])'; // not glued to a following letter or digit
  // Between the name and the number: spaces only, or one joiner. "GTA: 6 things..." must not match.
  const GAP = '(?:\\s*|[-_.])';
  // "6" may be followed by letters (#gta6leaks) but not digits (GTA 60fps).
  // "VI" / "six" need a hard stop so "GTA Vice City" and "GTA videos" stay visible.
  const NUMBER = `(?:6(?!\\d)|(?:vi|six|שש)${END})`;
  const WORD_GAP = '[\\s\\-_.]+';

  const CORE_PATTERNS = [
    `${START}gta${GAP}${NUMBER}`,
    `${START}grand${WORD_GAP}theft${WORD_GAP}auto${GAP}${NUMBER}`,
    // Hebrew spellings: ג'י טי איי 6, גי.טי.איי 6, גטא 6
    `${START}ג['׳’]?י${WORD_GAP}?טי${WORD_GAP}?איי?${GAP}${NUMBER}`,
    `${START}גטא${GAP}${NUMBER}`,
    // Channel handles such as @GTA6Leaks or @TheGTA6Guy
    `@[\\w.\\-]*gta[-_.]?6(?!\\d)`,
  ];

  const CORE_REGEX = new RegExp(CORE_PATTERNS.join('|'), 'iu');

  function normalize(text) {
    return String(text)
      .normalize('NFKC') // folds lookalikes, e.g. the single-glyph roman numeral Ⅵ into "VI"
      .replace(/[​-‏⁠﻿]/g, '') // zero-width characters
      .toLowerCase();
  }

  function cleanKeywords(keywords) {
    return (keywords || []).map((k) => normalize(k).trim()).filter(Boolean);
  }

  // Returns a function: text -> true when the text should be hidden.
  function buildMatcher(extraKeywords) {
    const extras = cleanKeywords(extraKeywords);
    return function isSpoiler(text) {
      const normalized = normalize(text);
      if (CORE_REGEX.test(normalized)) return true;
      return extras.some((keyword) => normalized.includes(keyword));
    };
  }

  const api = { buildMatcher, normalize };
  root.GSDMatcher = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
