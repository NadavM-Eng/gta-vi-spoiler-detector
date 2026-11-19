# Architecture

How GTA VI Spoiler Detector works, and why it is built the way it is. For what it does from a user's
point of view, see the [README](README.md).

## Overview

The extension is a Manifest V3 browser extension with no dependencies and no build step for
development. It has four parts:

```
YouTube tab                          Extension
+-------------------------------+    +------------------------------+
| content.css   hiding rules    |    | background.js                |
| matcher.js    is this GTA VI? |    |   session total of hidden    |
| settings.js   saved settings  |    |   videos, across all tabs    |
| content.js    find cards,     |--->|                              |
|               hide matches    |    | popup/                       |
+-------------------------------+    |   on/off, areas, keywords,   |
        ^                            |   shows the session total    |
        |  settings (storage.sync)   +------------------------------+
        +---------------------------------------+
```

| File | Job |
|---|---|
| `manifest.json` | Chromium manifest. Also the base for the Firefox one. |
| `manifest.firefox.json` | The keys Firefox needs differently, merged over the base at build time. |
| `src/matcher.js` | Decides whether a piece of text is about GTA VI. Pure logic. |
| `src/settings.js` | Defaults and loading of saved settings. Shared by content script and popup. |
| `src/content.js` | Finds video cards, reads them, hides matches, keeps the layout tidy. |
| `src/content.css` | The rules that actually hide things. |
| `src/background.js` | Keeps the per-session count of hidden videos. |
| `popup/` | The toolbar popup. |
| `icons/` | The extension icon in the sizes browsers ask for. |
| `scripts/build.js` | Builds the release zips. |
| `scripts/make-icons.js` | Draws the icon and writes the PNG files. |
| `test/` | Node tests for the matcher and the counter. |

Internal names use the prefix `gsd` (attributes such as `data-gsd-hidden`, globals such as `GSDMatcher`).

## Matching: what counts as GTA VI

`matcher.js` builds one regular expression and tests it against a card's text, lower-cased and
normalised with NFKC (which also folds the single-glyph roman numeral into `VI`).

| Rule | Reason |
|---|---|
| `gta` then `6`, `vi`, `six` or `שש` | The core case. |
| `grand theft auto` then the same numbers | The long form. |
| Between name and number: spaces only, or one of `-` `_` `.` | `GTA-6` matches. `GTA: 6 things you missed` does not. |
| `6` must not be followed by a digit, but may be followed by letters | `#gta6leaks` matches. `GTA 60fps` does not. |
| `vi` and `six` must end at a word boundary | `GTA Vice City` and `GTA videos` do not match. |
| The name must start at a word boundary | Avoids matches inside longer words. |
| Handles: `@...gta6...` anywhere in the handle | Catches channels such as `@TheGTA6Guy`. |
| Hebrew spellings of the name | For Hebrew titles. |

Extra keywords from the popup are plain case-insensitive substring checks on top of this.

The matcher has no DOM or extension API in it, so it runs unchanged in Node, where
`test/matcher.test.js` holds a list of titles that must be hidden and a list that must be kept.

## Finding video cards

YouTube builds its pages from custom elements. A video "card" is one of a fixed set of them, listed in
`UNIT_SELECTORS` in `content.js`. As of November 2026 the main one is `yt-lockup-view-model`, used on
home, subscriptions, search and the watch-page sidebar. Shorts use `ytm-shorts-lockup-view-model-v2`.
Older `ytd-*-renderer` cards are still listed because YouTube serves them in places.

Some cards are nested inside each other (the two Shorts elements), so the code always works on the
outermost matching element.

## Reading a card

`readCard` gathers everything the card says about itself:

- the title element's text and its `title` attribute
- `aria-label` and `title` attributes of links (these often hold the full, untruncated title)
- channel handles taken from links that start with `/@`
- every text node inside the card

The pieces are joined with ` | `. That separator matters: joining with nothing could glue a title
ending in "GTA" to a neighbouring "6 days ago" and produce a false match.

A card whose title element exists but is still empty is treated as "not ready" and is looked at again
when its text arrives.

## Hiding without leaving holes

Hiding only the card would leave an empty cell in the grid. Instead `hideTarget` walks up to the grid
cell that wraps the card (`ytd-rich-item-renderer`, or the Shorts shelf cell) and marks that with
`data-gsd-hidden`. `content.css` gives it `display: none`, which takes it out of the layout, and
YouTube's own flex layout moves the following cards up.

Two follow-ups keep the result clean:

- **Shelves.** A titled row of cards (for example a Shorts shelf, or the game banner at the top of
  search results) is hidden completely when all its cards are hidden or when its heading matches.
  Otherwise a heading would be left above an empty row.
- **Row alignment.** YouTube marks the first cell of each row with an `is-in-first-column` attribute
  and gives it a different margin. After cells are removed, the marks no longer line up with the
  cells that now start each row, and rows end up offset by a few pixels. `tidyGrids` recomputes the
  marks for the visible cells, using YouTube's own `--ytd-rich-grid-items-per-row` value. It only
  touches grids where something was hidden, and it redoes the work if YouTube rewrites the marks
  (for example on window resize).

## No flash of spoilers

Hiding a card after it has been painted would show the spoiler for a moment. Two things prevent that:

1. The content script and its CSS load at `document_start`, before YouTube draws anything.
2. The CSS makes every card `visibility: hidden` until `content.js` marks it `data-gsd-checked`. The
   card keeps its space, so nothing jumps when it is revealed.

There is a failsafe: a CSS animation reveals any card that has not been checked within two seconds.
If YouTube changes its markup and the script stops recognising titles, videos appear late rather
than never. All the CSS is gated on `html[data-gsd-active]`, which only the script sets, so if the
script does not run at all, nothing is hidden.

## Keeping up with YouTube

YouTube is a single-page app. It loads more cards as you scroll, swaps pages without reloading, keeps
old pages in the DOM marked `hidden`, and reuses card elements for different videos.

- One `MutationObserver` on the document watches added nodes, text changes and changes to `title`,
  `href` and `aria-label`. Each change is traced back to the card it belongs to, and that card is
  judged again. Mutation callbacks run before the next paint, so a matching card is hidden in the
  same frame it appears.
- Because elements are reused, a "checked" flag alone would go stale. The script remembers the text
  (and area) it last judged for each card, and re-judges whenever that changes.
- `yt-navigate-finish` and `yt-page-data-updated`, events YouTube fires itself, trigger a full rescan
  as a safety net.

## Areas

The popup has a switch per area. A card's area is decided from the DOM, not from the URL, because old
pages stay in the document after navigation:

- inside `ytd-search`: search
- inside `ytd-browse[page-subtype="home"]`: home
- inside `ytd-browse[page-subtype="subscriptions"]`: subscriptions
- anything else: other pages (watch page, channels, playlists)

Shorts are a kind of card, not a page: a Shorts element, or any card linking to `/shorts/`, belongs
to the Shorts area wherever it appears. A shelf follows the Shorts switch only when all its cards are
Shorts; a mixed shelf follows its page.

## Session counter

The popup shows how many videos were hidden this session, across all tabs. A single tab cannot know
what other tabs did, so the count lives in the background script:

1. When the content script hides a card, it takes the video ID from the card's link
   (`?v=...` or `/shorts/...`) and sends IDs it has not reported before to the background script.
2. The background script adds them to a set stored in `storage.session` and saves the set's size.
   `storage.session` empties itself when the browser closes, which is what defines a session.
3. Updates are chained in a promise queue, so two tabs reporting at once cannot overwrite each other.
4. The popup reads the number and listens for changes while it is open.

Counting by video ID means the same video seen on three pages counts once. Nothing is counted while
the detector, or the card's area, is switched off.

## Settings

Settings live in `storage.sync`: `enabled`, `areas` and `extraKeywords`. `settings.js` fills in
anything missing from defaults, so adding a new area later does not break existing installs. The
content script listens for storage changes and re-judges every card, so the popup's switches take
effect immediately, without a page reload.

## Popup

Plain HTML, CSS and JavaScript. Its look follows a small design language: warm off-white page,
hairline borders instead of shadows, pill-shaped controls, one green accent for "on", and the count
as a large number with a small muted unit. It follows the system light or dark setting.

## Browser differences

The same source runs in Chromium browsers and Firefox. The differences are small:

| Difference | Handling |
|---|---|
| Firefox has no background service workers | `manifest.firefox.json` declares `background.scripts` instead of `service_worker`. |
| Firefox needs an add-on ID | Set under `browser_specific_settings.gecko`. |
| Firefox calls the API `browser`, Chromium `chrome` | Each script uses `const ext = globalThis.browser \|\| globalThis.chrome`. |
| Zip entry paths | `scripts/build.js` writes the zip itself so paths always use `/`, which Firefox requires. |

`node scripts/build.js` copies `src/`, `popup/` and `icons/` into `dist/chromium` and `dist/firefox`, writes the
right manifest into each, and zips them.

Safari is not supported. A Safari build has to be converted and signed with Xcode on a Mac.

## Testing

- **Unit tests** (`node --test ...`) cover the matcher and the session counter, including overlapping
  reports from two tabs.
- **Live pages.** The DOM handling was developed against real YouTube pages: the page structure was
  inspected first, then the content script's files were run on live search and channel pages with the
  extension APIs stubbed, checking which cards were hidden, that kept cards were visible, that grid
  columns stayed aligned, and that each area switch did what it says. The screenshots in the README
  come from those runs: the page and the popup are real captures, placed together in one image
  with a plain browser frame drawn around them.

Not covered by any of this: the signed-in home and subscriptions feeds, the watch-page sidebar, and
Firefox.

## Known limits and next steps

- **Text only.** A neutral title with a spoiler thumbnail gets through. The planned next layer looks up
  each video's description and tags by ID and matches those as well. After that, reading text in
  thumbnails is possible but heavier and less precise.
- **Shorts player.** The full-screen Shorts feed shows one video at a time, so there is nothing to
  hide; skipping would be a separate feature.
- **YouTube changes.** When YouTube renames its elements, the lists at the top of `content.js`
  (`UNIT_SELECTORS`, `WRAPPER_SELECTORS`, `SHELF_SELECTORS`, `PAGE_AREAS`) and the matching list in
  `content.css` are the places to update.
