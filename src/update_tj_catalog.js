const fs = require('node:fs');
const { CATALOG, applyJapanReleases, saveCatalog } = require('./import_catalog');

const MONTHLY = 'https://www.tjmedia.com/legacy/api/newSongOfMonth';
const SEARCH = 'https://www.tjmedia.com/song/accompaniment_search';
const PAGE_SIZE = 500;

async function request(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error('TJ HTTP ' + response.status + ' ' + url);
  return response;
}

async function monthlyReleases(month, through) {
  const response = await request(MONTHLY, { method: 'POST',
    body: new URLSearchParams({ searchYm: month.replace('-', '') }) });
  const { resultCode, resultData } = await response.json();
  if (String(resultCode) !== '99' || !Array.isArray(resultData?.items) ||
      Number(resultData.itemsTotalCount) !== resultData.items.length) {
    throw new Error('월별 응답의 전체 건수를 확인할 수 없습니다. ' + month);
  }
  // 과거 월을 요청해도 이후 월의 곡까지 반환하므로 실제 공개일로 구분한다.
  const releases = [];
  for (const row of resultData.items) {
    const day = row.publishdate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('공개일 누락 ' + row.pro);
    if (!day.startsWith(month) || day > through) continue;
    const number = String(row.pro);
    if (!/^\d+$/.test(number) || !row.indexTitle?.trim() || !row.indexSong?.trim()) {
      throw new Error('최신곡 번호·제목·가수 누락 ' + number);
    }
    releases.push({ number, title: row.indexTitle.trim(), artist: row.indexSong.trim(), publishedOn: day });
  }
  if (!releases.length && month < through.slice(0, 7)) throw new Error('지난 월의 목록이 비어 있습니다. ' + month);
  return releases;
}

function textOf(html) {
  const entities = { amp: '&', apos: "'", quot: '"', lt: '<', gt: '>', nbsp: ' ' };
  return html.replace(/<[^>]+>/g, '').replace(/&(amp|apos|quot|lt|gt|nbsp|#\d+|#x[\da-f]+);/gi,
    (_, key) => key[0] === '#' ? String.fromCodePoint(Number(key.slice(1).replace(/^x/i, '0x'))) : entities[key.toLowerCase()]).trim();
}

async function searchNumbers(prefix, nation, wanted) {
  const rows = new Map();
  const seenPages = new Set();
  for (let page = 1; ; page++) {
    const query = new URLSearchParams({ pageNo: String(page), pageRowCnt: String(PAGE_SIZE),
      strType: '16', nationType: nation, searchTxt: prefix });
    const html = await (await request(SEARCH + '?' + query)).text();
    if (!html.includes('id="searchTxt"') || !html.includes('<option value="16" selected="selected"') ||
        (nation && !html.includes('<option value="JPN" selected="selected"'))) {
      throw new Error('TJ 곡번호 검색 조건을 확인할 수 없습니다. ' + query);
    }
    const chunks = html.split('class="num2">').slice(1);
    if (!chunks.length && !html.includes('검색 결과를 찾을 수 없습니다')) throw new Error('TJ 검색 응답 형식 변경');
    const numbers = chunks.map(chunk => textOf(chunk.slice(0, chunk.indexOf('</p>'))));
    const signature = numbers.join(',');
    if (seenPages.has(signature)) throw new Error('TJ 검색 페이지 반복 ' + query);
    seenPages.add(signature);
    for (const [i, number] of numbers.entries()) {
      if (!/^\d+$/.test(number)) throw new Error('TJ 검색 결과 번호 누락 ' + query);
      if (!wanted.has(number)) continue;
      const chunk = chunks[i];
      const title = chunk.match(/class="grid-item title3"[\s\S]*?<p class=""><span>([\s\S]*?)<\/p>/)?.[1];
      const artist = chunk.match(/class="grid-item title4 singer"><p>([\s\S]*?)<\/p>/)?.[1];
      if (!title || !artist) throw new Error('TJ 검색 결과 곡명·가수 누락 ' + number);
      const hit = { title: textOf(title), artist: textOf(artist) };
      const prior = rows.get(number);
      if (prior && (prior.title !== hit.title || prior.artist !== hit.artist)) throw new Error('동일 번호의 검색 결과 충돌 ' + number);
      rows.set(number, hit);
    }
    if (chunks.length < PAGE_SIZE) return rows;
  }
}

async function update() {
  const readCatalog = () => JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  const start = readCatalog();
  const through = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
  const from = (start.officialJapan?.through || start.latestSourceDate).slice(0, 7) + '-01';
  if (from > through) throw new Error('곡목 기준일이 현재 날짜보다 늦습니다.');
  const groups = new Map();
  for (const date = new Date(from + 'T00:00:00Z'); date.toISOString().slice(0, 10) <= through; date.setUTCMonth(date.getUTCMonth() + 1)) {
    const month = date.toISOString().slice(0, 7);
    const rows = await monthlyReleases(month, through);
    console.log('%s TJ 최신곡 %d건', month, rows.length);
    for (const row of rows) {
      const prefix = row.number.slice(0, 3);
      if (!groups.has(prefix)) groups.set(prefix, []);
      groups.get(prefix).push(row);
    }
  }
  const verified = new Map();
  for (const [prefix, rows] of groups) {
    // 번호의 앞자리는 검색을 묶는 용도다. 일본곡 여부는 TJ 국가 필터와 전체 번호 일치로 판정한다.
    const wanted = new Set(rows.map(row => row.number));
    const [all, japan] = await Promise.all([searchNumbers(prefix, '', wanted), searchNumbers(prefix, 'JPN', wanted)]);
    for (const row of rows) {
      if (!all.has(row.number)) throw new Error('최신곡 번호가 아직 공식 검색에 없습니다. ' + row.number);
      const hit = japan.get(row.number);
      if (!hit) continue;
      if (hit.title !== row.title || hit.artist !== row.artist || verified.has(row.number)) {
        throw new Error('TJ 공식 자료 간 표기 불일치 또는 번호 중복 ' + row.number);
      }
      verified.set(row.number, row);
    }
  }
  const current = readCatalog();
  const previous = current.officialJapan;
  // 이전 월에 검증한 번호와 GitHub의 상세 표기를 다음 갱신에서도 유지한다.
  const releases = new Map((previous?.releases || []).map(row => [row.number, row]));
  for (const [number, row] of verified) releases.set(number, row);
  const official = { from: previous?.from || from, through: [previous?.through || '', through].sort().at(-1),
    source: 'https://www.tjmedia.com/song/recent_song', search: SEARCH,
    releases: [...releases.values()].sort((a, b) => a.publishedOn.localeCompare(b.publishedOn) || Number(a.number) - Number(b.number)) };
  const merged = applyJapanReleases(current, official);
  saveCatalog(merged);
  console.log('일본곡 검증 %d건, 새 번호 %d건, 전체 %d건 (%s)',
    verified.size, merged.songs.length - current.songs.length, merged.songs.length, official.through);
}

if (require.main === module) update().catch(error => { console.error(error.message); process.exitCode = 1; });
