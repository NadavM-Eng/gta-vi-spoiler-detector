const test = require('node:test');
const assert = require('node:assert');
const { buildMatcher } = require('../src/matcher.js');

const isSpoiler = buildMatcher([]);

const SHOULD_HIDE = [
  'GTA 6',
  'GTA6',
  'gta 6 trailer 3 reaction',
  'GTA VI',
  'GTAVI',
  "LIVE NOW | Launch Day: YouTube's 24 Hour GTAVI Livestream",
  'Grand Theft Auto VI: Out Now',
  'Grand Theft Auto 6 - Part 1 - The Beginning',
  'Grand Theft Auto VI Launch Trailer',
  'grand theft auto six',
  'GTA-6 leaks',
  'GTA_6',
  'GTA Six ending explained',
  'You can literally Throw Animals at NPCs 😂 #gta #gta6 #jason',
  'crazy ending #gta6leaks',
  'GTA 5 vs GTA 6 graphics comparison',
  'GTA Ⅵ',
  'Some title | GTA 6 News | 12K views',
  'Some title | @GTA6Leaks | 12K views',
  'Some title | @TheGTA6Guy',
  "ג'י טי איי 6 סוף סוף כאן",
  'גי טי איי 6',
  'GTA שש',
  'גטא 6',
];

const SHOULD_KEEP = [
  'GTA 5',
  'GTA V',
  'GTA V Online heist guide',
  'Grand Theft Auto V',
  'Grand Theft Auto: San Andreas',
  'GTA Vice City full walkthrough',
  'GTA Vice City Stories',
  'GTA IV',
  'GTA videos compilation',
  'GTA Online',
  'GTA 5 at 60fps',
  'GTA 60 fps mod',
  'GTA: 6 things you missed in San Andreas',
  'Best GTA | 6 days ago',
  'GTA | 6K views',
  'Red Dead Redemption 2',
  'My vacation in Miami',
  'gtavideos',
  '@gtavicecityfan',
  'Some title | @gta60fps',
  'ג\'י טי איי 5',
];

for (const text of SHOULD_HIDE) {
  test(`hides: ${text}`, () => assert.strictEqual(isSpoiler(text), true));
}

for (const text of SHOULD_KEEP) {
  test(`keeps: ${text}`, () => assert.strictEqual(isSpoiler(text), false));
}

test('extra keywords match case-insensitively', () => {
  const custom = buildMatcher(['Leonida', '  ', 'Some Channel']);
  assert.strictEqual(custom('Exploring LEONIDA for 10 hours'), true);
  assert.strictEqual(custom('Video | some channel | 3 days ago'), true);
  assert.strictEqual(custom('GTA 5 funny moments'), false);
});
