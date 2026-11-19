const turnOnButton = document.getElementById('turn-on');
const turnOffButton = document.getElementById('turn-off');
const keywordsInput = document.getElementById('keywords');
const countNumber = document.getElementById('count-number');
const countUnit = document.getElementById('count-unit');
const areasGroup = document.getElementById('areas');
const areaInputs = [...areasGroup.querySelectorAll('input[data-area]')];

let saveTimer = 0;

function parseKeywords(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function readAreas() {
  const areas = {};
  for (const input of areaInputs) areas[input.dataset.area] = input.checked;
  return areas;
}

function showEnabled(enabled) {
  turnOnButton.setAttribute('aria-pressed', String(enabled));
  turnOffButton.setAttribute('aria-pressed', String(!enabled));
  areasGroup.disabled = !enabled;
}

// The total is kept by the background worker: distinct videos hidden since the browser was opened.
async function refreshCount() {
  const { hiddenCount = 0 } = await chrome.storage.session.get('hiddenCount');
  countNumber.textContent = String(hiddenCount);
  countUnit.textContent = hiddenCount === 1 ? 'video' : 'videos';
}

function setEnabled(enabled) {
  showEnabled(enabled);
  chrome.storage.sync.set({ enabled });
}

turnOnButton.addEventListener('click', () => setEnabled(true));
turnOffButton.addEventListener('click', () => setEnabled(false));

areasGroup.addEventListener('change', () => {
  chrome.storage.sync.set({ areas: readAreas() });
});

keywordsInput.addEventListener('input', () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    chrome.storage.sync.set({ extraKeywords: parseKeywords(keywordsInput.value) });
  }, 400);
});

// Keep the number live while the popup is open.
chrome.storage.onChanged.addListener((changes, storageArea) => {
  if (storageArea === 'session' && changes.hiddenCount) refreshCount();
});

GSBSettings.load().then((settings) => {
  showEnabled(settings.enabled);
  for (const input of areaInputs) input.checked = settings.areas[input.dataset.area];
  keywordsInput.value = settings.extraKeywords.join('\n');
});
refreshCount();
