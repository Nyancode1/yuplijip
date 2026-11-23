const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

const CATALOG = path.join(__dirname, '../data/tj_catalog.json');
const searchUrl = number => 'https://www.tjmedia.com/song/accompaniment_search?' +
  new URLSearchParams({ strType: '16', nationType: 'JPN', searchTxt: number });

function applyJapanReleases(catalog, officialJapan) {
  const byNumber = new Map(catalog.songs.map(song => [String(song.karaoke_numbers.tj), song]));
  for (const { number, title, artist, publishedOn } of officialJapan.releases) {
    const previous = byNumber.get(number);
    // 번호책에 있는 곡은 원제와 한글 독음을 보존한다.
    if (previous && previous.source !== 'tj-monthly') continue;
    byNumber.set(number, {
      id: 'tj-' + number, source: 'tj-monthly', source_url: searchUrl(number),
      title_primary: title, artist_primary: artist, karaoke_numbers: { tj: number },
      tj_published_on: publishedOn,
    });
  }
  const baseSourceDate = catalog.baseSourceDate || catalog.latestSourceDate;
  return { ...catalog, baseSourceDate, latestSourceDate: [baseSourceDate, officialJapan.through].sort().at(-1),
    officialJapan, songs: [...byNumber.values()] };
}

function saveCatalog(catalog) {
  const temp = CATALOG + '.' + randomUUID() + '.tmp';
  try {
    fs.writeFileSync(temp, JSON.stringify(catalog));
    fs.renameSync(temp, CATALOG);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

function importCatalog(input) {
  const raw = fs.readFileSync(input);
  const rows = JSON.parse(raw);
  const source = 'https://github.com/Alfex4936/tj-media-karaoke-api';
  if (rows.source !== source || rows.country !== 'JPN' || !/^\d{4}-\d{2}-\d{2}$/.test(rows.sourceDate)
      || !Array.isArray(rows.songs) || !rows.songs.length) throw Error('번호책 일본곡 파일을 확인해 주세요.');
  const numbers = new Set();
  const songs = rows.songs.map(row => {
    const number = String(row.number);
    const title = row.title?.trim(), artist = row.artist?.trim();
    if (!/^\d+$/.test(number) || numbers.has(number) || !title || !artist) throw Error('잘못된 곡 정보 또는 중복 TJ 번호 ' + number);
    numbers.add(number);
    return { id:'tj-' + number, title_primary:title, artist_primary:artist, karaoke_numbers:{ tj:number },
      title_ko:row.titleReading || undefined, artist_ko:row.artistReading || undefined };
  });
  const catalog = {
    source, sourceFile: 'https://alfex4936.github.io/tj-media-karaoke-api/', baseSourceCount:songs.length,
    sourceSha256: createHash('sha256').update(raw).digest('hex'),
    latestSourceDate: rows.sourceDate,
    songs,
  };
  const official = fs.existsSync(CATALOG) && JSON.parse(fs.readFileSync(CATALOG, 'utf8')).officialJapan;
  const merged = official ? applyJapanReleases(catalog, official) : catalog;
  saveCatalog(merged);
  console.log('로컬 곡목 저장 완료 (%d곡) %s', merged.songs.length, catalog.sourceSha256);
}

module.exports = { CATALOG, applyJapanReleases, saveCatalog };
if (require.main === module) {
  if (!process.argv[2]) throw new Error('사용법: node src/import_catalog.js <songs.json 경로>');
  importCatalog(process.argv[2]);
}
