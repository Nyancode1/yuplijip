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

function artistKey(name) {
  return key(name.replace(/\p{Script=Latin}/gu, c => c.normalize('NFD').replace(/\p{M}/gu, '')));
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
    .replace(/^(?:\s*[【[(](?:official(?:\s+(?:music\s+)?video)?|MV|オリジナル(?:曲)?|公式MV)[】)\]]\s*)+/iu, '')
    .replace(/\s+\[karaoke\](?=\s*(?:$|[-–—]))/gi, '')
    .replace(/(?:\s*[【[(](?:official\s+(?:music\s+)?video|official\s+audio|MV|歌詞|한글\s*자막)[】\])])+/gi, '')
    .replace(/\s*\((?:[^()]|\([^()]*\))*(?:映画|ドラマ|アニメ|\b(?:OST|OP|ED|CM)\b|主題歌|テーマ(?:曲|ソング)|(?:Opening|Ending) Theme(?: Song)?)(?:[^()]|\([^()]*\))*\)\s*$/i, '')
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
    .replace(/\s*[-–—]\s*(?:Topic|トピック|주제)\s*$/iu, '')
    .replace(/[\s_【([]*(?:official(?:\s+(?:YouTube\s+)?channel)?|YouTube\s+channel)[】)\]]*$/i, '')
    .trim();
}

function artistForms(name) {
  const clean = cleanChannel(name).replace(/(?:\s*\(\s*|\s+)(?:feat\.?|ft\.)\s*.+$/i, '').trim();
  // 채널의 이중 표기에서 앞쪽 활동명도 이용한다. 일반 단어의 부분 일치는 쓰지 않는다.
  const first = clean.split(/\s+\/\s+/)[0];
  const credit = clean.slice(first.length).replace(/^\s*\/\s*/, '');
  const expanded = credit.toLowerCase().startsWith(first.toLowerCase() + ' ') ? credit : '';
  const bilingual = clean.match(/^([\p{Script=Latin}\s.-]+)\s+([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー ･・]+)$/u)
    || clean.match(/^([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー ･・]+)\s+([\p{Script=Latin}\s.-]+)$/u);
  const credited = clean.match(/^(.+?)\s*\(([^()]+)\)$/u);
  return unique([clean, first, expanded, credited?.[1], ...(bilingual ? bilingual.slice(1) : [])]);
}

function loanwordKey(text) {
  const original = key(text);
  const folded = original.replace(/ゔぁ/g, 'ば').replace(/ゔぃ/g, 'び').replace(/ゔぇ/g, 'べ')
    .replace(/ゔぉ/g, 'ぼ').replace(/ゔ/g, 'ぶ');
  return folded === original ? '' : folded;
}

function shortVowels(romaji) {
  return /^[a-z]+$/i.test(romaji) ? romaji.replace(/ou/g, 'o').replace(/([aiueo])\1/g, '$1') : '';
}

// 한글로 적힌 일본어 독음과 로마자 입력을 비교한다. 원제와 가수의 정확한 표기가 우선한다.
function phoneticKey(romaji) {
  const value = shortVowels(romaji.toLowerCase().replace(/\s/g,''));
  if (value.length < 4) return '';
  return 'ko-reading:' + value.replace(/z/g,'j').replace(/eu/g,'u').replace(/shi/g,'si');
}

function hangulReading(text) {
  const clean = text.replace(/[\s・·!?,.]/gu,'');
  if (!/^[가-힣]+$/u.test(clean)) return '';
  const initials = ['g','kk','n','d','tt','r','m','b','pp','s','ss','','j','jj','ch','k','t','p','h'];
  const vowels = ['a','ae','ya','yae','eo','e','yeo','ye','o','wa','wae','oe','yo','u','wo','we','wi','yu','eu','ui','i'];
  const finals = {0:'',1:'k',4:'n',8:'r',16:'m',17:'p',19:'t',21:'ng'};
  let reading = '';
  for (const syllable of clean) {
    const code = syllable.charCodeAt(0)-0xAC00, tail = finals[code%28];
    if (tail === undefined) return '';
    reading += initials[Math.floor(code/588)] + vowels[Math.floor(code/28)%21] + tail;
  }
  return phoneticKey(reading);
}

function videoEvidence(input) {
  const titles = unique([...(input.tracks || []), input.title, ...(input.titles || [])]);
  const artists = unique(input.artists || []);
  const channels = unique([input.uploader, ...(input.channels || [])]);
  const cover = titles.some(t => /\bcover(?:ed)?\b|커버|歌ってみた|歌った|歌いました|踊ってみた/i.test(t));
  const sourceArtists = cover ? [] : (artists.length ? [...artists] : [...channels]);
  const creditedNames = new Set(sourceArtists.flatMap(artistForms).map(key).filter(Boolean));
  const names = [...titles];
  const description = input.description || '';
  const credit = description.match(/^Provided to YouTube by [^\r\n]+\r?\n\s*\n([^\r\n]+?) · ([^\r\n]+)\r?$/mu);
  if (credit && /Auto-generated by YouTube\.?\s*$/imu.test(description) && !cover) {
    names.push(credit[1].trim());
    const performers = credit[2].split(' · ').map(x => x.trim());
    sourceArtists.push(...performers, performers.join(' & '));
  }
  for (const raw of titles) {
    const title = raw.normalize('NFKC');
    const bilingual = title.match(/^(.+?)\s+[-–—]\s+(.+)$/u);
    if (bilingual && japanese.test(bilingual[1]) !== japanese.test(bilingual[2]) && !cover)
      names.push(bilingual[japanese.test(bilingual[1]) ? 1 : 2].trim());
    // 혼합 언어 제목에서는 괄호 속 원제도 후보로 보존한다.
    if (/[가-힣]/u.test(title)) {
      for (const group of title.matchAll(brackets)) {
        const inside = group.slice(1).find(Boolean).trim();
        for (const part of inside.split(creditSeparator)) if (japanese.test(part)) names.push(part.trim());
      }
      const last = title.match(/[)】\]」』]\s*([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー・]+)$/u);
      if (last) names.push(last[1]);
    }
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
      const songHead = title.replace(/^(?:[☪♪♬☆★]\s*)+/u, '').split(/(?:\s*[／/:：＠]\s*|\s+(?:covered\s+by\b|歌った|歌いました|歌ってみた))/iu)[0];
      if (songHead) names.push(songHead.replace(/\s*[(【\[]cover[)】\]]\s*$/iu,'').trim());
    } else {
      // 슬래시가 곡명에 쓰일 수도 있어, 반대편이 해당 영상의 채널·가수 표기와 일치할 때만 분리한다.
      for (const sep of title.matchAll(/[\/|│┃]/gu)) {
        const left=title.slice(0,sep.index).trim(), right=title.slice(sep.index+1).trim();
        if (right && creditedNames.has(key(left))) names.push(right);
        if (left && creditedNames.has(key(right))) names.push(left);
      }
      // 배급사 채널의 영상도 제목에 표기된 가수·곡명과 TJ 등록 정보로 직접 대조한다.
      const musicVideo = title.match(/^([^「『|/]+?)\s+(?:official\s+)?(?:music\s+video|MV)\s*[「『]([^「」『』]+)[」』]\s*$/iu);
      if (musicVideo) {
        names.push(musicVideo[2].trim());
        sourceArtists.push(musicVideo[1].trim());
      }
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
    const artistKeys = new Set(artistNames.flatMap(s=>[key(s),artistKey(s)]).filter(Boolean));
    const artistReadings = new Set(artistNames.map(reading).filter(Boolean));
    const record = { row, artistKeys, artistReadings, version: titleParts(row.title_primary).version };
    // 원본 데이터가 자동 번역으로 표시한 별칭은 사용하지 않는다.
    const titles = [row.title_primary, row.title_ruby];
    if (row.title_ko_source !== 'llm-translated') titles.push(row.title_ko);
    for (const name of unique(titles)) {
      const { base } = titleParts(name);
      const kanjiReading = kanji.test(base) || (name === row.title_ruby && kanji.test(titleParts(row.title_primary).base));
      const sound = reading(base);
      for (const [term, strength] of [[key(base), 3], [loanwordKey(base), 2], [sound, kanjiReading ? 1 : 2],
        [shortVowels(sound) !== sound ? shortVowels(sound) : '', 1],
        [name === row.title_ko && japanese.test(row.title_primary) ? hangulReading(base) : '', 1]]) {
        if (!term) continue;
        if (!byTitle.has(term)) byTitle.set(term, new Map());
        const bucket = byTitle.get(term);
        bucket.set(record, Math.max(strength, bucket.get(record) || 0));
      }
    }
  }
  return byTitle;
}

// 일본어 원제와 원곡자 크레딧을 한 구절 안에서 대조한다.
const brackets = /\[([^\[\]()]+)\]|\(([^()]+)\)|【([^【】]+)】|「([^「」]+)」|『([^『』]+)』|〈([^〈〉]+)〉|《([^《》]+)》/gu;
const creditSeparator = /\s*[/|│┃]\s*|\s+[-–—lI]\s+/u;
function printedTitles(text) {
  const names = [text.trim()];
  for (const group of text.matchAll(brackets)) {
    const inside = group.slice(1).find(Boolean).trim();
    const outside = text.replace(group[0], '').trim();
    if (japanese.test(inside) && /[가-힣]/u.test(outside)) names.push(inside);
    if (/[가-힣]/u.test(inside) && japanese.test(outside)) names.push(outside);
  }
  return unique(names);
}

function explicitOriginals(input) {
  const lines = String(input.description || '').split(/\r?\n/u).map(s => s.trim());
  const originals = [], titles = [], artists = [];
  for (const line of lines) {
    const credit = line.replace(/https?:\/\/\S+.*/iu,'').trim().match(/^[^\p{L}\p{N}]*(원곡(?:명|자)?|원제|원곡\s*가수|원곡\s*제목|原曲|(?:ご|御)?本家(?:様)?|original(?:\s+(?:song|artist|title))?)\s*[^\p{L}\p{N}"「『]{0,8}[:：▶]\s*(.{1,220})$/iu);
    if (!credit) continue;
    if (/원곡자|가수|artist/iu.test(credit[1])) artists.push(credit[2]);
    else {
      originals.push(credit[2]);
      if (!creditSeparator.test(credit[2])) titles.push(credit[2]);
    }
  }
  if (titles.length === 1 && artists.length === 1) originals.push(titles[0] + ' / ' + artists[0]);
  return originals;
}

function printedMatches(titles, index, descriptionCredits, input) {
  const matches = new Map();
  const pair = (name, artist) => {
    for (const candidate of printedTitles(name)) {
      const clean = candidate.replace(/\s+(?:[-–—]\s*)?(?:official\s+(?:music\s+)?video|music\s+video|MV)\s*$/iu,'');
      const { base, version } = titleParts(clean);
      if (version) continue;
      const direct = index.get(key(base));
      for (const [record, strength] of direct || index.get(artistKey(base)) || []) {
        if (strength === 3 && !record.version && artistForms(artist).some(a => record.artistKeys.has(artistKey(a)))) {
          matches.set(record.row.karaoke_numbers.tj, record.row);
        }
      }
    }
  };
  function inspect(text) {
    const parts = text.split(creditSeparator).map(s => s.trim());
    if (parts.length === 2 && parts.every(Boolean)) {
      pair(parts[0], parts[1]); pair(parts[1], parts[0]);
    }
  }
  for (const raw of [...titles, ...descriptionCredits]) {
    const text = raw.replace(/[ㅣᅵ]/g, '|').normalize('NFKC');
    const isCover = /\bcover(?:ed)?\b|커버|歌ってみた/i.test(text);
    if ((!isCover || descriptionCredits.includes(raw)) && !/\b(?:remix|live|acoustic|medley|mashup|ver(?:sion)?\.?)\b|メドレー|メドレイ/iu.test(text)) {
      const clean = text.replace(/^(?:\s*[【\[](?:\d+|(?:official |original |anime |lyric )*(?:music |lyric )?(?:video|MV)|feat\.\s+[^】\]]+)[】\]]\s*)+/iu,'').trim();
      const quoted = clean.match(/^([^「『/【】]+?)(?:\s+(?:MV|Music Video))?\s*[「『]([^「」『』]+)[」』](?=$|\s|MV|Music Video|feat\.|[／/]|[a-z]+\s*\/)/iu);
      if (quoted) pair(quoted[2], quoted[1]);
      const localized = clean.split(/\s*\/\s*(?=【)/u);
      for (const variant of localized) {
        const wrapped = variant.match(/^【([^【】]+)】([^【】]+)【([^【】]+)】$/u);
        if (wrapped) { pair(wrapped[2],wrapped[3]); pair(wrapped[2],wrapped[1]); }
      }
      const trailing = clean.match(/^([^【】]+)【[^【】/]+\/([^【】/]+)】$/u);
      if (trailing) pair(trailing[1],trailing[2]);
      const parts = clean.split(/\s*\/\s*|\s+[-–—]\s+/u);
      if (parts.length === 2) { pair(parts[0],parts[1]); pair(parts[1],parts[0]); }
      const bilingual = clean.match(/^(.+?)\s+[-–—]\s+([\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}ー・]+)\s+[A-Za-z][A-Za-z .'-]*\s+[-–—]\s+.+$/u);
      if (bilingual) pair(bilingual[2],bilingual[1]);
      if (input.linkedOriginal && clean.split('/').length===2) {
        const [name,vocal] = clean.split('/').map(s=>s.trim());
        if (/[【\[](?:オリジナル(?:曲)?|original song)[】\]]\s*$/iu.test(vocal))
          for (const a of [input.uploader,...(input.channels || [])].filter(Boolean)) pair(name,a);
        for (const [record,strength] of index.get(key(name)) || []) {
          const featured = record.row.artist_primary.match(/[(（]Feat\.\s*([^()（）]+)[)）]/iu);
          if (strength === 3 && featured?.[1].split(/[,、&]/u).some(a=>artistKey(a)===artistKey(vocal))) {
            for (const a of [input.uploader,...(input.channels || [])].filter(Boolean)) pair(name,a);
          }
        }
      }
    }
    if (!isCover && !descriptionCredits.includes(raw) && !/[가-힣]/u.test(text)) continue;
    for (const group of text.matchAll(brackets)) inspect(group.slice(1).find(Boolean));
    // 커버 가수 이름을 크레딧에서 먼저 분리한다. 괄호 안의 슬래시는 보존한다.
    const head = isCover ? text.replace(/\s*(?:[【([]\s*covered\s+by\b|[-–—]\s*covered\s+by\b).*$/iu,'').replace(/\s*(?:[|│┃]|\s[-–—/lI]\s)\s*[^|│┃/]*?\bcover(?:ed)?\b.*$/iu, '').trim() : text;
    inspect(head);
    if (descriptionCredits.includes(raw)) {
      const quoted = text.match(/^([^「『]+)[「『]([^」』]+)[」』]$/u);
      if (quoted) pair(quoted[2], quoted[1]);
    }
    const withArtist = head.match(/^(.+?)\s*\(([^()/|]+)\)\s*$/u);
    if (isCover && withArtist) pair(withArtist[1], withArtist[2]);
  }
  const generated = /^Provided to YouTube by .+/mu.test(input.description || '') &&
    /Auto-generated by YouTube\.?\s*$/imu.test(input.description || '');
  if (generated) {
    const song = input.description.match(/^Provided to YouTube by [^\r\n]+\r?\n\s*\n([^\r\n]+?) · /mu)?.[1];
    const writers = [...input.description.matchAll(/^Composer:\s*([^\r\n]+)\r?$/gmu)].map(m=>m[1].trim());
    if (song && writers.length === 1) pair(song.replace(/\s*\(self cover\)$/iu,''),writers[0]);
    if (song && /\s*\(self cover\)$/iu.test(song))
      for (const name of [input.uploader,...(input.channels || [])].filter(Boolean)) pair(song.replace(/\s*\(self cover\)$/iu,''),name);
  }
  return matches;
}

// 곡의 작곡·원곡자 표기만 읽는다. 영상의 보컬·믹싱·일러스트 크레딧은 여기에 포함하지 않는다.
function originalCredits(input, names) {
  const pairs = [];
  const headings = new Set(names);
  for (const title of [input.title,...(input.titles || [])]) {
    const text = title.normalize('NFKC');
    const cover = text.match(/[-–—]\s*([^【】]+?)\s*【歌ってみた】$/u) ||
      text.match(/^\[[^\]]+\]\s*[-–—]\s*(.+?)\s+ver\.\s+\S+/iu);
    if (cover) headings.add(cover[1].trim());
    if (/[가-힣]/u.test(text)) {
      for (const part of text.split(/[|│]/u)) {
        const end = part.trim().match(/\s([\p{sc=Han}\p{sc=Katakana}\p{sc=Hiragana}ー・]+)$/u);
        if (end) headings.add(end[1]);
      }
    }
    const split = text.match(/^.+?\s+[-–—]\s+([^【】[\]]+)$/u);
    if (split) headings.add(split[1].trim());
  }
  for (const raw of (input.description || '').split(/\r?\n/u)) {
    const line = raw.normalize('NFKC').trim();
    const original = line.match(/^[^\p{L}\p{N}]*(?:원곡(?:자|\s*가수)?|原曲|本家様?|original(?:\s+(?:artist|song))?)\s*(?:[:：▶]\s*|\s+by\s+)([^:/|「『【\n]{1,64})\s*$/iu);
    const composer = line.match(/^[^\p{L}\p{N}]*(?:作曲|작곡|노래|Music(?:\s*&\s*Words)?)\s*(?:[:：|]\s*|\s+)([^:@|()/]{1,64}?)(?:\s*@[\w_]+|\s*\((?:mylist\/\d+|https?:\/\/[^)]*)\))?\s*$/iu) ||
      line.match(/(?:作詞作編曲|詞[／/]曲)[\s／/:：]+([^）()／/]{1,48}?)\s*(?:さん|様)(?:[\s）)]|$)/u);
    const artist = (original || composer)?.[1].trim();
    if (!artist) continue;
    for (const credited of (original ? artist.split(/\s+&\s+/u) : [artist]))
      for (const name of headings) pairs.push(name + ' / ' + credited.replace(/様$/u,'').trim());
  }
  return pairs;
}

function selectSong(input, index, reading) {
  const result = selectRecording(input,index,reading);
  const source = input.originalVideo;
  if (!source?.title || result.status === '스킵' || [input.title,...(input.titles || [])].some(t=>/메들리|매시업|マッシュアップ|メドレー|\b(?:medley|mashup)\b/iu.test(t)) ||
      (!result.row && result.candidates.length > 1 && /서로 다름|여러 원곡/u.test(result.reason))) return result;
  const original = selectRecording({...source,linkedOriginal:true},index,reading).row;
  if (!original) return result;
  if (result.row && result.row !== original) return { status:'확인 필요', reason:'영상과 원곡 링크의 TJ 번호가 다름',
    keywords:result.keywords, candidates:[result.row,original] };
  return { ...result, status:'원곡 반주', row:original, candidates:[], reason:'영상에서 지정한 원곡의 제목과 가수가 TJ 등록곡과 일치' };
}

function selectRecording(input, index, reading) {
  if (/^\[(?:private|deleted) video\]$/i.test(input.title) || input.availability === 'private') {
    return { status: '스킵', reason: '비공개 또는 삭제된 영상', keywords: [], candidates: [] };
  }
  const evidence = videoEvidence(input);
  const descriptionCredits = explicitOriginals(input);
  const labeledTitles = descriptionCredits.filter(t => japanese.test(t) && !creditSeparator.test(t) && !/[「『]/u.test(t));
  if (labeledTitles.length === 1) evidence.titles.push(labeledTitles[0]);
  const parts = evidence.titles.map(titleParts);
  const versions = unique(parts.map(p => p.version));
  const keywords = unique(parts.map(p => p.base));
  const artists = evidence.artists.flatMap(s=>[key(s),artistKey(s)]).filter(Boolean);
  const artistSounds = evidence.artists.map(reading).filter(Boolean);
  const originalTitles = unique([input.title, ...(input.titles || [])]);
  if (originalTitles.some(t => /메들리|매시업|マッシュアップ|メドレー|\b(?:medley|mashup)\b/i.test(t))) {
    return { status: '확인 필요', reason: '메들리·매시업은 곡별로 확인해야 합니다.', keywords, candidates: [] };
  }
  const coverMatches = printedMatches(originalTitles, index, [...descriptionCredits,...originalCredits(input,keywords)], input);
  if (coverMatches.size > 1) {
    return { status: '확인 필요', reason: '커버 제목에 여러 원곡이 표시됨', keywords, candidates: [...coverMatches.values()] };
  }
  const hits = new Map();
  for (const name of keywords) {
    for (const [term, strength] of [[key(name), 3], [loanwordKey(name), 2], [reading(name), kanji.test(name) ? 1 : 2],
      [/^[a-z ]+$/i.test(name) ? phoneticKey(name) : '', 2]]) {
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
    if (!eligible.length || /\bcover(?:ed)?\b|커버|歌ってみた|歌った|歌いました/iu.test(input.title))
      return { status: '원곡 반주', row, reason: '표기된 곡명과 음악 크레딧이 TJ 원곡 한 건과 일치', keywords, candidates: [] };
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
  const possible = candidates.length === 1 && !versions.length && !sameArtist.length &&
    keywords.some(k => japanese.test(k) &&
      key(k) === key(titleParts(candidates[0].title_primary).base));
  return { status: '확인 필요', reason, keywords, candidates, titleCandidate: possible ? candidates[0] : undefined };
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
