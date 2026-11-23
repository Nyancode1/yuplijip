const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const assets = path.resolve(process.argv[2]);
const resolve = name => path.join(root, name);

function prepare() {
  fs.mkdirSync(assets, { recursive: true });
  const copies = {
    'mobile/ui': '.',
    'node_modules/wanakana/wanakana.min.js': 'lib/wanakana.js',
    'node_modules/kuromoji/build/kuromoji.js': 'lib/kuromoji.js',
    'node_modules/kuromoji/dict': 'dict',
    'src/matching.js': 'lib/matching.js',
    'node_modules/wanakana/LICENSE': 'licenses/wanakana.txt',
    'node_modules/kuromoji/LICENSE-2.0.txt': 'licenses/kuromoji.txt',
    'node_modules/kuromoji/NOTICE.md': 'licenses/kuromoji-notice.txt',
    'node_modules/async/LICENSE': 'licenses/async.txt',
    'node_modules/doublearray/LICENSE.txt': 'licenses/doublearray.txt',
    'node_modules/lodash/LICENSE': 'licenses/lodash.txt',
    'node_modules/zlibjs/LICENSE': 'licenses/zlibjs.txt',
    'docs/NOTICES.md': 'licenses/NOTICES.md',
    'data/alfex-SOURCE.txt': 'licenses/alfex-source.txt',
  };
  for (const [src, dst] of Object.entries(copies)) {
    fs.cpSync(resolve(src), path.join(assets, dst), { recursive: true });
  }
  const { songs } = JSON.parse(fs.readFileSync(resolve('data/tj_catalog.json'), 'utf8'));
  const fields = ['title_primary', 'title_ruby', 'title_ko', 'title_ko_source', 'artist_primary', 'artist_ko', 'artist_aliases'];
  const records = songs.map(song => ({
    ...Object.fromEntries(fields.map(key => [key, song[key]])), karaoke_numbers: { tj: song.karaoke_numbers.tj },
  }));
  fs.writeFileSync(path.join(assets, 'catalog.json'), JSON.stringify(records));
  console.log('Bundled %d catalog entries.', records.length);
}
prepare();
