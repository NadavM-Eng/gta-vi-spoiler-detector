# GTA 6 Spoiler Blocker

Browser extension that hides GTA 6 videos on YouTube. Videos about other GTA games stay visible.

## What it does

- Reads each video card's title, channel name and channel handle, and hides the card when they mention GTA 6
  (`GTA 6`, `GTA6`, `GTA VI`, `Grand Theft Auto 6/VI`, `#gta6...`, and Hebrew spellings).
- Works on every YouTube page that shows video cards: home, subscriptions, search, channel pages, Shorts shelves.
- Hides the whole grid cell, so the remaining videos close the gap.
- Cards stay invisible until their title has been checked, so a spoiler does not flash on screen.
- The popup has an on/off switch, a running count of videos hidden this session, and a list of extra
  words or channel names to hide. The count covers all tabs, counts each video once, and resets when
  the browser is closed.
- The popup also has a switch per area: Home, Subscriptions, Search, Shorts, and Other pages (watch page,
  channels). The page switches cover regular videos on that page; the Shorts switch covers Shorts cards
  on any page.

It only looks at text on the card. A video with a neutral title and a spoiler thumbnail is not caught.

## Install in Brave or Chrome

1. Open `brave://extensions` (or `chrome://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and pick this folder.
4. Reload any YouTube tabs that were already open.

After editing the code, click the reload icon on the extension's card, then reload YouTube.

## Tests

```bash
node --test test/matcher.test.js test/background.test.js
```

## Layout

- `src/matcher.js` decides whether a piece of text is about GTA 6.
- `src/settings.js` holds the saved settings and their defaults.
- `src/content.js` finds cards on the page, hides matches and keeps the grid aligned.
- `src/background.js` keeps the session total of hidden videos.
- `src/content.css` holds the hiding rules.
- `popup/` is the toolbar popup.
