// 데스크톱 스크립트와 Android WebView가 같은 곡 식별 규칙을 사용한다.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('wanakana'));
  else root.TJMatching = factory(root.wanakana);
})(typeof self === 'undefined' ? globalThis : self, function ({ toHiragana, toRomaji }) {
const unique = values => [...new Set(values.filter(Boolean))];
const japanese = /[\p{Script=Han}\p{Script=Katakana}\p{Script=Hiragana}]/u;
const kanji = /\p{Script=Han}/u;

function key(text) {
  // 가타카나만 히라가나로 통일한다. 영어를 일본어로 추측 변환하지 않는다.
  return toHiragana((text || '').normalize('NFKC'), { passRomaji: true }).toLowerCase()
    .replace(/[^\p{L}\p{N}+#]/gu, '');
}

function makeReader(tokenizer) {
  const cache = new Map();
  return function reading(text) {
    if (!text || !japanese.test(text)) return '';
    if (cache.has(text)) return cache.get(text);
    const tokens = tokenizer.tokenize(text.normalize('NFKC'));
    const parts = tokens.map(token => token.reading || token.surface_form);
    // 사전에 없는 한자를 발음이 같은 다른 글자로 임의 대체하지 않는다.
    const romaji = parts.some(part => kanji.test(part)) ? '' : key(toRomaji(parts.join('')));
    cache.set(text, romaji);
    return romaji;
  };
}

function titleParts(text) {
  const cleaned = text.normalize('NFKC').trim()
    .replace(/\s+\[karaoke\](?=\s*(?:$|[-–—]))/gi, '')
    .replace(/(?:\s*[【[(](?:official\s+(?:music\s+)?video|official\s+audio|MV|歌詞|한글\s*자막)[】\])])+/gi, '')
    .replace(/\s*\([^()]*(?:映画|ドラマ|アニメ|\b(?:OST|OP|ED|CM)\b|主題歌)[^()]*\)\s*$/i, '')
    .replace(/(?:\s*\((?:feat\.?|ft\.)\s+[^)]*\)|\s+(?:feat\.?|ft\.)\s*.+)$/i, '').trim();
  const suffix = cleaned.match(/(?:\s*\(([^()]+)\)|\s+[-–—]\s+(.+))$/);
  // 이중 언어 제목의 마지막 괄호가 영어 제목 전체보다 먼저 버전을 설명한다.
  const tail = cleaned.match(/\s*\(([^()]+)\)$/) || suffix;
  if (tail && /^(?:re[\s-]?record(?:ing|ed)|再録(?:音)?)(?:\s*(?:version|ver\.?|版))?$/i.test((tail[1] || tail[2]).trim())) {
    return { base: cleaned.slice(0, tail.index).trim(), version: 'rerecording' };
  }
  const label = suffix && (suffix[1] || suffix[2]);
  if (label && /\b(?:ver(?:sion)?|live|remix|acoustic|ballad|edit|instrumental)\b/i.test(label)) {
    const version = key(label.replace(/\b(?:version|ver)\b\.?/gi, '')) || key(label);
    return { base: cleaned.slice(0, suffix.index).trim(), version };
  }
  return { base: cleaned, version: '' };
}

function cleanChannel(name) {
  return (name || '').normalize('NFKC')
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/[\s_【([]*(?:official(?:\s+(?:YouTube\s+)?channel)?|YouTube\s+channel)[】)\]]*$/i, '')
    .trim();
}

function artistForms(name) {
  const clean = cleanChannel(name).replace(/\s*\(\s*(?:feat\.?|ft\.)\s*.+$/i, '');
  // 채널의 이중 표기에서 앞쪽 활동명도 이용한다. 일반 단어의 부분 일치는 쓰지 않는다.
  const first = clean.split(/\s+\/\s+/)[0];
  const credit = clean.slice(first.length).replace(/^\s*\/\s*/, '');
  const expanded = credit.toLowerCase().startsWith(first.toLowerCase() + ' ') ? credit : '';
  const bilingual = clean.match(/^([\p{Script=Latin}\s.-]+)\s+([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー ･・]+)$/u)
    || clean.match(/^([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー ･・]+)\s+([\p{Script=Latin}\s.-]+)$/u);
  return unique([clean, first, expanded, ...(bilingual ? bilingual.slice(1) : [])]);
}

function loanwordKey(text) {
  const original = key(text);
  const folded = original.replace(/ゔぁ/g, 'ば').replace(/ゔぃ/g, 'び').replace(/ゔぇ/g, 'べ')
    .replace(/ゔぉ/g, 'ぼ').replace(/ゔ/g, 'ぶ');
  return folded === original ? '' : folded;
}

function videoEvidence(input) {
  const titles = unique([...(input.tracks || []), input.title, ...(input.titles || [])]);
  const artists = unique(input.artists || []);
  const channels = unique([input.uploader, ...(input.channels || [])]);
  const cover = titles.some(t => /\bcover(?:ed)?\b|커버|歌ってみた|踊ってみた/i.test(t));
  const sourceArtists = cover ? [] : (artists.length ? [...artists] : [...channels]);
  const creditedNames = new Set(sourceArtists.flatMap(artistForms).map(key).filter(Boolean));
  const names = [...titles];
  for (const raw of titles) {
    const title = raw.normalize('NFKC');
    if (cover) {
      // 「곡 (번역) / 원곡 가수」 | Cover by ... 또는 곡 / 원곡 가수 (Covered by ...)
      const credit = title.match(/[「『]([^」』]+?)\s+\/\s+([^/「」『』]+)[」』]\s*[|│｜]?\s*cover\b/i)
        || title.match(/^(.+?)\s+\/\s+([^/()]+?)\s*[(\[]\s*covered\s+by\b/i);
      const parenthetical = title.match(/^(.+?)\s+\(([^()]+)\)\s+\/\s+.+?\bcover\b/i);
      if (credit || parenthetical) {
        const [, song, artist] = credit || parenthetical;
        names.push(song.replace(/\s*\([^()]*[가-힣][^()]*\)\s*$/, '').trim());
        sourceArtists.push(artist.trim());
      }
      const quoted = title.match(/[「『]([^」』]+)[」』]/);
      if (quoted) names.push(quoted[1]);
      const beforeCover = title.match(/^(.+?)\s+[|│/]\s+.+?\bcover\b/i);
      if (beforeCover) names.push(beforeCover[1]);
    } else {
      for (const split of title.matchAll(/\s+[-–—/]\s+/g)) {
        const left = title.slice(0, split.index), right = title.slice(split.index + split[0].length);
        if (creditedNames.has(key(left)) || titles.some(other => key(other) === key(left))) names.push(right);
        if (creditedNames.has(key(right))) names.push(left);
      }
      const quoted = title.match(/^(.*?)[「『]([^「」『』]+)[」』]\s*(?:(?:official\s+)?(?:music\s+video|video|MV))?\s*$/i);
      if (quoted && (!quoted[1].trim() || creditedNames.has(key(quoted[1])))) names.push(quoted[2]);
    }
  }
  return { titles: unique(names), artists: unique(sourceArtists.flatMap(artistForms)) };
}

function indexCatalog(songs, reading) {
  const byTitle = new Map();
  for (const row of songs) {
    const artistNames = unique([row.artist_primary, row.artist_ko, ...(row.artist_aliases || [])]).flatMap(artistForms);
    const artistKeys = new Set(artistNames.map(key).filter(Boolean));
    const artistReadings = new Set(artistNames.map(reading).filter(Boolean));
    const record = { row, artistKeys, artistReadings, version: titleParts(row.title_primary).version };
    // 원본 데이터가 자동 번역으로 표시한 별칭은 사용하지 않는다.
    const titles = [row.title_primary, row.title_ruby];
    if (row.title_ko_source !== 'llm-translated') titles.push(row.title_ko);
    for (const name of unique(titles)) {
      const { base } = titleParts(name);
      const kanjiReading = kanji.test(base) || (name === row.title_ruby && kanji.test(titleParts(row.title_primary).base));
      for (const [term, strength] of [[key(base), 3], [loanwordKey(base), 2], [reading(base), kanjiReading ? 1 : 2]]) {
        if (!term) continue;
        if (!byTitle.has(term)) byTitle.set(term, new Map());
        const bucket = byTitle.get(term);
        bucket.set(record, Math.max(strength, bucket.get(record) || 0));
      }
    }
  }
  return byTitle;
}

function bracketedCoverMatch(titles, index) {
  const matches = new Map();
  for (const title of titles) {
    if (!/\bcover(?:ed)?\b|커버|歌ってみた/i.test(title)) continue;
    for (const group of title.normalize('NFKC').matchAll(/\[([^\[\]()]+)\]|\(([^\[\]()]+)\)|【([^【】]+)】|「([^「」]+)」|『([^『』]+)』/gu)) {
      const pair = group.slice(1).find(Boolean).split(/\s*[/│|ㅣ]\s*|\s+[-–—]\s+/u);
      if (pair.length !== 2 || pair.some(x => !x.trim())) continue;
      for (const [name, artist] of [pair, [pair[1], pair[0]]]) {
        const artistKey = key(artist.trim());
        for (const [record, strength] of index.get(key(name.trim())) || []) {
          if (strength === 3 && !record.version && record.artistKeys.has(artistKey)) {
            matches.set(record.row.karaoke_numbers.tj, record.row);
          }
        }
      }
    }
  }
  return matches;
}

function selectSong(input, index, reading) {
  if (/^\[(?:private|deleted) video\]$/i.test(input.title) || input.availability === 'private') {
    return { status: '스킵', reason: '비공개 또는 삭제된 영상', keywords: [], candidates: [] };
  }
  const evidence = videoEvidence(input);
  const parts = evidence.titles.map(titleParts);
  const versions = unique(parts.map(p => p.version));
  const keywords = unique(parts.map(p => p.base));
  const artists = evidence.artists.map(key).filter(Boolean);
  const artistSounds = evidence.artists.map(reading).filter(Boolean);
  const originalTitles = unique([input.title, ...(input.titles || [])]);
  if (originalTitles.some(t => /메들리|매시업|マッシュアップ|メドレー|\b(?:medley|mashup)\b/i.test(t))) {
    return { status: '확인 필요', reason: '메들리·매시업은 곡별로 확인해야 합니다.', keywords, candidates: [] };
  }
  const coverMatches = bracketedCoverMatch(originalTitles, index);
  if (coverMatches.size > 1) {
    return { status: '확인 필요', reason: '커버 제목에 여러 원곡이 표시됨', keywords, candidates: [...coverMatches.values()] };
  }
  const hits = new Map();
  for (const name of keywords) {
    for (const [term, strength] of [[key(name), 3], [loanwordKey(name), 2], [reading(name), kanji.test(name) ? 1 : 2]]) {
      for (const [record, indexedStrength] of index.get(term) || []) {
        // 한자 제목 양쪽을 모두 독음으로 바꿔야만 같아지는 경우는 확인 후보다.
        const rank = strength === 1 && indexedStrength === 1 ? 0 :
          (strength === 3 && indexedStrength === 3 ? 2 : 1);
        if (rank > (hits.get(record) ?? -1)) hits.set(record, rank);
      }
    }
  }
  if (!hits.size && !coverMatches.size) return { status: '목록에서 못 찾음', reason: '일치하는 제목·독음 없음', keywords, candidates: [] };
  const direct = [...hits.keys()].filter(r => artists.some(a => r.artistKeys.has(a)));
  // 두 한자 이름의 발음만 우연히 같을 수 있어 독음은 다른 문자 표기와만 대조한다.
  const sameArtist = direct.length ? direct : [...hits.keys()].filter(r =>
    artists.some(a => r.artistReadings.has(a)) || artistSounds.some(a => r.artistKeys.has(a)));
  const matchingVersion = sameArtist.filter(r => versions.length ? versions.length === 1 && versions[0] === r.version : !r.version);
  const eligible = matchingVersion.filter(r => hits.get(r) > 0);
  if (coverMatches.size === 1) {
    const [row] = coverMatches.values();
    const conflict = eligible.filter(r => r.row.karaoke_numbers.tj !== row.karaoke_numbers.tj);
    if (conflict.length) return { status: '확인 필요', reason: '영상의 원곡 크레딧이 서로 다름', keywords,
      candidates: [row, ...conflict.map(r => r.row)] };
    return { status: '원곡 반주', row, reason: '커버 제목의 곡명·가수 쌍이 TJ 원곡 한 건과 일치', keywords, candidates: [] };
  }
  if (eligible.length) {
    const rank = Math.max(...eligible.map(r => hits.get(r)));
    const best = eligible.filter(r => hits.get(r) === rank);
    if (best.length === 1) return { status: '자동 확정', row: best[0].row, keywords, candidates: [],
      reason: (rank === 2 ? '제목·별칭' : '제목 독음·표기 변형') + ' 및 가수 일치' };
  }
  if (!matchingVersion.length && versions.length === 1 && versions[0] === 'rerecording') {
    const originals = direct.filter(r => !r.version && hits.get(r) === 2);
    if (originals.length === 1) {
      return { status: '원곡 반주', row: originals[0].row, keywords, candidates: [],
        reason: '재녹음 음원입니다. 같은 제목·가수로 등록된 원곡 반주 번호입니다.' };
    }
  }
  const candidates = (sameArtist.length ? sameArtist : [...hits.keys()]).map(r => r.row);
  const reason = !artists.length ? '원곡 가수 근거 없음' : !sameArtist.length ? '가수 불일치' :
    !matchingVersion.length ? '버전 일치 확인 필요' : !eligible.length ? '한자 표기가 다르고 독음만 일치' :
    '동일 가수의 후보 번호 여러 개';
  return { status: '확인 필요', reason, keywords, candidates };
}

// ID가 없는 텍스트 목록은 원래 행을 유지하고, 곡명·가수가 함께 유일할 때만 별칭을 빌린다.
function addSavedAliases(inputs, snapshot, { compareVideos = false } = {}) {
  const byTitle = new Map();
  const spelling = value => value.normalize('NFKC').toLowerCase()
    .replace(/\s+\[karaoke\](?=\s*(?:$|[-–—]))/g, '').trim().replace(/\s+/g, ' ');
  for (const song of snapshot) {
    if (!song.id) continue;
    const titles = unique([song.title, ...(song.titles || []), ...(song.tracks || [])]);
    const attested = new Set(titles.map(spelling));
    const aliases = new Set(attested);
    for (const title of titles) {
      for (const split of title.matchAll(/\s+[-–—]\s+/g)) {
        const left = spelling(title.slice(0, split.index));
        const right = spelling(title.slice(split.index + split[0].length));
        if (attested.has(left)) aliases.add(right);
        if (attested.has(right)) aliases.add(left);
      }
    }
    const artists = unique([song.uploader, ...(song.channels || []), ...(song.artists || [])]);
    const record = { song, titles, artists: new Set(artists.flatMap(artistForms).map(key).filter(Boolean)) };
    for (const alias of aliases) {
      if (!byTitle.has(alias)) byTitle.set(alias, []);
      byTitle.get(alias).push(record);
    }
  }
  return inputs.map(input => {
    if ((input.id && !compareVideos) || !input.uploader) return input;
    if (compareVideos && (input.artists?.length || input.availability === 'private')) return input;
    const names = artistForms(input.uploader).map(key).filter(Boolean);
    const inputTitles = unique([input.title, ...(input.titles || [])]);
    const versions = new Set(inputTitles.map(t => titleParts(t).version));
    const isCover = title => /\bcover(?:ed)?\b|커버|歌ってみた|踊ってみた/i.test(title);
    const matches = (byTitle.get(spelling(input.title)) || []).filter(r =>
      names.some(a => r.artists.has(a)) && (!compareVideos ||
        (r.titles.every(t => !titleParts(t).version || versions.has(titleParts(t).version)) &&
         r.titles.some(isCover) === inputTitles.some(isCover))));
    if (new Set(matches.map(r => r.song.id)).size !== 1) return input;
    const { song, titles } = matches[0];
    return { ...input, ...(!input.id && { artworkId: song.id }), titles: unique([...inputTitles, ...titles]),
      artists: unique([...(input.artists || []), ...(song.artists || [])]) };
  });
}

return { key, makeReader, indexCatalog, selectSong, addSavedAliases };
});
