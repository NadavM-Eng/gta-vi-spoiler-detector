// Builds the installable packages into dist/:
//   dist/chromium/  and a zip for Chrome, Brave and Edge
//   dist/firefox/   and a zip for Firefox
// Usage: node scripts/build.js
// No dependencies. The zip files are written by hand so entry paths always use forward
// slashes, which Firefox requires (zip tools on Windows often write backslashes).

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SHIPPED_FOLDERS = ['src', 'popup'];

const baseManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const firefoxOverrides = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.firefox.json'), 'utf8'));

const TARGETS = [
  { folder: 'chromium', label: 'chrome-brave-edge', manifest: baseManifest },
  // Firefox has no background service workers, and needs an add-on ID.
  { folder: 'firefox', label: 'firefox', manifest: { ...baseManifest, ...firefoxOverrides } },
];

function listFiles(dir, prefix = '') {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...listFiles(path.join(dir, entry.name), relative));
    else files.push(relative);
  }
  return files;
}

function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

// Minimal zip writer: deflate-compressed entries, UTF-8 names, no zip64.
function writeZip(sourceDir, zipPath) {
  const { time, day } = dosDateTime(new Date());
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const name of listFiles(sourceDir)) {
    const data = fs.readFileSync(path.join(sourceDir, ...name.split('/')));
    const compressed = zlib.deflateRawSync(data, { level: 9 });
    const nameBytes = Buffer.from(name, 'utf8');
    const crc = zlib.crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // flags: UTF-8 names
    local.writeUInt16LE(8, 8); // method: deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28); // extra field length

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // central directory signature
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42); // where this entry's local header starts

    localParts.push(local, nameBytes, compressed);
    centralParts.push(central, nameBytes);
    offset += local.length + nameBytes.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const entryCount = centralParts.length / 2;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory signature
  end.writeUInt16LE(entryCount, 8);
  end.writeUInt16LE(entryCount, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);

  fs.writeFileSync(zipPath, Buffer.concat([...localParts, centralDirectory, end]));
  return entryCount;
}

fs.rmSync(DIST, { recursive: true, force: true });

for (const target of TARGETS) {
  const outDir = path.join(DIST, target.folder);
  fs.mkdirSync(outDir, { recursive: true });
  for (const folder of SHIPPED_FOLDERS) {
    fs.cpSync(path.join(ROOT, folder), path.join(outDir, folder), { recursive: true });
  }
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(target.manifest, null, 2) + '\n');

  const zipName = `gta-vi-spoiler-detector-v${baseManifest.version}-${target.label}.zip`;
  const entries = writeZip(outDir, path.join(DIST, zipName));
  console.log(`${zipName}: ${entries} files`);
}
