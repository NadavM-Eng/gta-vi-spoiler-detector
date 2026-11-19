// Keeps the "videos hidden this session" total. YouTube tabs report the videos they hide;
// each distinct video counts once, across all tabs, until the browser is closed.
// chrome.storage.session is used because it clears itself when the browser session ends.

let queue = Promise.resolve();

async function recordHidden(ids) {
  const { hiddenIds = [] } = await chrome.storage.session.get('hiddenIds');
  const seen = new Set(hiddenIds);
  for (const id of ids) seen.add(id);
  if (seen.size === hiddenIds.length) return;
  await chrome.storage.session.set({ hiddenIds: [...seen], hiddenCount: seen.size });
}

chrome.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== 'gsb:hidden' || !Array.isArray(message.ids)) return;
  // One update at a time, so reports from several tabs cannot overwrite each other.
  queue = queue.then(() => recordHidden(message.ids)).catch(() => {});
});

if (typeof module !== 'undefined' && module.exports) module.exports = { whenIdle: () => queue };
