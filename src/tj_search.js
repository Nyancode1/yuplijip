const fs = require('node:fs');
const path = require('node:path');
const kuromoji = require('kuromoji');
const { makeReader, indexCatalog, selectSong, selectPlaylist, addSavedAliases } = require('./matching');
const { loadPlaylist } = require('./playlist');

async function createReader() {
  const dicPath = path.join(path.dirname(require.resolve('kuromoji/package.json')), 'dict');
  const tokenizer = await new Promise((resolve, reject) =>
    kuromoji.builder({ dicPath }).build((err, result) => err ? reject(err) : resolve(result)));
  return makeReader(tokenizer);
}

function describe(row) {
  return [row.karaoke_numbers.tj, row.title_primary, '(' + row.artist_primary + ')'].join(' ');
}

async function run() {
  const personal = path.join(__dirname, '../private/pc/data');
  const original = path.join(personal, 'playlist.txt');
  const file = process.argv[2] || (fs.existsSync(original) ? original : path.join(personal, 'playlist.jsonl'));
  const snapshot = path.join(path.dirname(file), 'playlist.jsonl');
  if (!fs.existsSync(file)) throw Error('목록 파일을 지정해 주세요. npm run match -- <파일>');
  const source = loadPlaylist(file);
  const inputs = path.basename(file) === 'playlist.txt' && fs.existsSync(snapshot)
    ? addSavedAliases(source, loadPlaylist(snapshot)) : source;
  const songs = require('./catalog')();
  const reading = await createReader();
  const works = [...require('../data/work_sources.json'), ...require('../data/recording_aliases.json')];
  const index = indexCatalog(songs, reading, { works, loanwords:require('../data/loanwords.json') });
  const results=selectPlaylist(inputs,index,reading);
  const csv = [['플레이리스트 곡명', '검색어', 'TJ 곡번호', 'TJ 곡제목', 'TJ 가수명', '비고', '업로더', '영상 ID', '상태', '확인 후보', '입력 가수']];
  const summary = [];
  const counts = {};
  for (const [i,input] of inputs.entries()) {
    const { status, keywords, candidates, reason, row } = results[i];
    const options = candidates.map(describe).join(' | ');
    csv.push([input.title, keywords.join(' | '), row?.karaoke_numbers.tj, row?.title_primary,
      row?.artist_primary, reason, input.uploader, input.id, status, options, (input.artists || []).join(' | ')]);
    summary.push('[' + (summary.length + 1) + '] ' + status + ' | ' + input.title + ' (' +
      (input.uploader || input.artists?.join(' / ') || '가수 미상') + ') | ' + reason +
      (row ? ' → ' + describe(row) : options ? ' | 후보 ' + options : ''));
    counts[status] = (counts[status] || 0) + 1;
  }
  const text = csv.map(row => row.map(cell => '"' + String(cell ?? '').replace(/"/g, '""') + '"').join(',')).join('\r\n');
  fs.mkdirSync(personal, { recursive: true });
  fs.writeFileSync(path.join(personal, 'tj_playlist.csv'), '\uFEFF' + text);
  fs.writeFileSync(path.join(personal, 'result_with_orig.txt'), summary.join('\n'));
  console.log('입력: %s (%d행), 저장된 별칭으로 보완한 행: %d', path.resolve(file), source.length,
    inputs.filter((row, i) => row !== source[i]).length);
  console.log('로컬 곡목 %d곡, 입력 %d곡', songs.length, inputs.length, counts);
}

module.exports = { createReader, indexCatalog, selectSong, addSavedAliases };
if (require.main === module) run().catch(err => { console.error(err.message); process.exitCode = 1; });
