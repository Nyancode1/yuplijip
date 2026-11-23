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
  const normal = (text || '').normalize('NFKC');
  return (/\p{sc=Katakana}/u.test(normal) ? toHiragana(normal, { passRomaji: true }) : normal).toLowerCase()
    .replace(/[^\p{L}\p{N}+#]/gu, '');
}

function artistKey(name) {
  return key(name.replace(/\p{Script=Latin}/gu, c => c.normalize('NFD').replace(/\p{M}/gu, '')));
}

function singleMissingLetter(left,right) {
  if (!/^[a-z]{14,}$/u.test(left) || !/^[a-z]{14,}$/u.test(right) || Math.abs(left.length-right.length)!==1) return false;
  const [long,short]=left.length>right.length ? [left,right] : [right,left];
  let i=0;
  while (i<short.length && long[i]===short[i]) i++;
  return long.slice(i+1)===short.slice(i);
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
  const korean=clean.match(/^([가-힣 ][가-힣 ]+)\s+([a-z][a-z0-9 .'-]+)$/iu) || clean.match(/^([a-z][a-z0-9 .'-]+)\s+([가-힣][가-힣 ]*)$/iu);
  return unique([clean, first, expanded, credited?.[1], ...(bilingual ? bilingual.slice(1) : []),...(korean?korean.slice(1).map(s=>s.trim()):[])]);
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
  if (input.linkedOriginal) {
    const labeled=description.match(/^Title\s*[:：]\s*([^(\r\n]+?)(?:\s*\([^\r\n()]+\))?\s*$/imu);
    const author=description.match(/^(?:Author|Composer)\s*[:：]\s*([^\r\n(:]+?)(?:\s*\([^()\r\n]+\))?(?:\s+https?:\/\/\S+)?\s*$/imu);
    if (labeled && author) { names.push(labeled[1].trim()); sourceArtists.push(author[1].trim()); }
  }
  if (credit && /Auto-generated by YouTube\.?\s*$/imu.test(description) && !cover) {
    names.push(credit[1].trim());
    const performers = credit[2].split(' · ').map(x => x.trim());
    sourceArtists.push(...performers, performers.join(' & '));
  }
  for (const raw of titles) {
    const title = raw.normalize('NFKC');
    const clip=title.match(/^[【\[](?:歌ってみた|cover)[】\]]\s*([^/【|]+?)(?=\s*[/【|]|$)/iu);
    if (clip) names.push(clip[1].trim());
    if (/[가-힣]/u.test(title)) for (const phrase of title.matchAll(/(?:^|[^\p{sc=Latin}])([A-Za-z]+(?:\s+[A-Za-z]+){1,6})(?=[^A-Za-z]|$)/gu)) {
      if (key(phrase[1]).length>=8) names.push(phrase[1].trim());
    }
    if (/^(?:music|composer|作曲|作詞作曲|작곡)\s*[:：]/imu.test(description))
      for (const m of title.matchAll(/\(([\p{sc=Han}\p{sc=Katakana}\p{sc=Hiragana}ー・ ]+)\)/gu)) names.push(m[1]);
    const subtitled=title.replace(/^\s*(?:\[(?:한글|한국어|자막)[^\]]*\]\s*)+/u,'')
      .replace(/\s*[\[(](?:한글|고화질|고음질|자막|가사|발음|독음|해석|1080[ph])[^)\]]*[)\]]\s*$/iu,'');
    for (const section of subtitled.split(/\s+[–—-]\s+|(?<=[가-힣])-(?=\S)/u)) {
      if (section !== title) names.push(section.trim());
      const embedded=section.match(/^.+?\(([a-z][a-z '-]{2,40})\)\s*$/iu);
      if (embedded) names.push(embedded[1]);
    }
    const bilingualTitle=title.match(/^([^()]+?)\s*\(([^()]+)\)\s*$/u);
    if (!cover && bilingualTitle && /[가-힣]/u.test(bilingualTitle[1]) !== /[가-힣]/u.test(bilingualTitle[2]) &&
      /^[a-z .'-]+$/iu.test(/[가-힣]/u.test(bilingualTitle[1])?bilingualTitle[2]:bilingualTitle[1])) names.push(...bilingualTitle.slice(1));
    const character=title.match(/^(.+?)\s+\([^()]+\s+from\s+[^()]+\)$/iu);
    if (!cover && character) names.push(character[1]);
    const bilingual = title.match(/^(.+?)\s+[-–—]\s+(.+)$/u);
    if (bilingual && japanese.test(bilingual[1]) !== japanese.test(bilingual[2]) && !cover)
      names.push(bilingual[japanese.test(bilingual[1]) ? 1 : 2].trim());
    // 혼합 언어 제목에서는 괄호 속 원제도 후보로 보존한다.
    if (/[가-힣]/u.test(title) || cover) {
      for (const group of title.matchAll(/\(([\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}ー・ ]+)\)/gu)) names.push(group[1]);
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

function indexCatalog(songs, reading, {loanwords={},works=[]}={}) {
  const byTitle = new Map();
  const extra=new Map(), extraRecords=new WeakMap(), numbers=new Map(), pvs=new Map();
  const aliases=new Map(), workNames=new Map(), vocalTitles=new Map(), hanReadings=new Set();
  const koreanCredits=new Map(), composerNames=new Map();
  for (const row of songs) numbers.set(row.karaoke_numbers.tj,row);
  for (const row of songs) if (!row.supplement && row.artist_ko) {
    const name=artistKey(artistForms(row.artist_primary)[0]||''), korean=artistKey(artistForms(row.artist_ko)[0]||'');
    if (!name || !korean) continue;
    const names=koreanCredits.get(name)||new Set(); names.add(korean); koreanCredits.set(name,names);
  }
  for (const work of works) {
    const row=numbers.get(work.number);
    if (work.composers?.length && row?.composer && !/[,、/&]/u.test(row.composer)) {
      const group=key(artistForms(row.artist_primary)[0])+'|'+key(row.composer);
      const names=composerNames.get(group)||new Set();
      for (const alias of work.composers) names.add(artistKey(alias));
      composerNames.set(group,names);
    }
    const list=aliases.get(work.number)||[];
    list.push(work); aliases.set(work.number,list);
    const names=workNames.get(work.number)||new Set();
    for (const title of work.titles) names.add(key(title));
    workNames.set(work.number,names);
    for (const title of work.koreanReadings || []) hanReadings.add(key(title));
    if (work.vocaloid) for (const title of [...(work.distinctTitles || []),...(work.koreanReadings || [])]) {
      const term=key(title);
      if (!term) continue;
      const records=vocalTitles.get(term)||new Set();
      records.add(work.number); vocalTitles.set(term,records);
    }
    for (const id of work.ids) {
      const refs=pvs.get(id)||new Set(); refs.add(work.number); pvs.set(id,refs);
    }
  }
  for (const row of songs) {
    const num=row.karaoke_numbers.tj;
    if (row.supplement) {
      const base=titleParts(row.title_primary).base;
      const forms=[base], translated=base.match(/^(.+?)\s*\(([^()]+)\)$/u);
      if (translated && /[가-힣]/u.test(translated[1]) &&
          (/^[A-Za-z][A-Za-z .'-]+$/u.test(translated[2]) || key(translated[2]).startsWith(key(translated[1])+'x'))) {
        forms.push(translated[1]);
        if (/^[a-z]/iu.test(translated[2])) forms.push(translated[2]);
      }
      for (const term of unique(forms.map(key))) {
        const bucket=extra.get(term)||[];
        bucket.push(row); extra.set(term,bucket);
      }
      continue;
    }
    const artistNames = unique([row.artist_primary, row.artist_ko, ...(row.artist_aliases || [])]).flatMap(artistForms);
    const artistKeys = new Set(artistNames.flatMap(s=>[key(s),artistKey(s)]).filter(Boolean));
    const artistReadings = new Set(artistNames.map(reading).filter(Boolean));
    const composers=(row.composer||'').split(/[,、/&]/u).filter(Boolean);
    const composerKeys=new Set(composers.map(artistKey));
    for (const name of composers) for (const alias of composerNames.get(key(artistForms(row.artist_primary)[0])+'|'+key(name))||[])
      composerKeys.add(alias);
    const record = { row, artistKeys, artistReadings, composerKeys, coverArtists:new Set(), version: titleParts(row.title_primary).version };
    // 원본 데이터가 자동 번역으로 표시한 별칭은 사용하지 않는다.
    const titles = [row.title_primary, row.title_ruby];
    if (row.title_ko_source !== 'llm-translated') titles.push(row.title_ko);
    for (const name of unique(titles)) {
      const { base } = titleParts(name);
      const kanjiReading = kanji.test(base) || (name === row.title_ruby && kanji.test(titleParts(row.title_primary).base));
      const sound = reading(base);
      let converted=false;
      const borrowed = base.replace(/[\p{sc=Katakana}ー・]+/gu,part=>{
        const english=loanwords[key(part)];
        if (!english) return part;
        converted=true; return ' '+english+' ';
      });
      const romanized=converted ? borrowed.replace(/[\p{sc=Han}\p{sc=Katakana}\p{sc=Hiragana}ー]+/gu,s=>reading(s)||s) : '';
      for (const [term, strength] of [[key(base), 3], [loanwordKey(base), 2], [sound, kanjiReading ? 1 : 2],
        [key(romanized),2],
        [shortVowels(sound) !== sound ? shortVowels(sound) : '', 1],
        [name === row.title_ko && japanese.test(row.title_primary) ? hangulReading(base) : '', 1]]) {
        if (!term) continue;
        if (!byTitle.has(term)) byTitle.set(term, new Map());
        const bucket = byTitle.get(term);
        bucket.set(record, Math.max(strength, bucket.get(record) || 0));
      }
    }
    for (const work of aliases.get(num)||[]) {
      for (const composer of work.composers || []) record.composerKeys.add(artistKey(composer));
      for (const artist of work.artists) record.artistKeys.add(artistKey(artist));
      for (const artist of work.coverArtists || []) {
        const name=artistKey(artist);
        record.coverArtists.add(name);
        const korean=koreanCredits.get(name);
        if (korean?.size===1) record.coverArtists.add([...korean][0]);
      }
      for (const title of work.titles) {
        const k=key(title);
        if (!k) continue;
        const bucket=byTitle.get(k)||new Map();
        bucket.set(record,Math.max(bucket.get(record)||0,2)); byTitle.set(k,bucket);
      }
    }
  }
  return { numbers,pvs,workNames,vocalTitles,hanReadings,get(term) {
    if (!term) return undefined;
    const additional=extra.get(term);
    if (additional) {
      const bucket=byTitle.get(term)||new Map();
      for (const row of additional) {
        let record=extraRecords.get(row);
        if (!record) {
          const names=artistForms(row.artist_primary);
          record={row,version:titleParts(row.title_primary).version,artistKeys:new Set(names.map(artistKey)),
            artistReadings:new Set(names.map(hangulReading).filter(Boolean))};
          extraRecords.set(row,record);
        }
        bucket.set(record,3);
      }
      byTitle.set(term,bucket); extra.delete(term);
    }
    return byTitle.get(term);
  }};
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
      const spellings=unique([key(base),artistKey(base)]);
      for (const [record, strength] of spellings.flatMap(t=>[...(index.get(t)||[])])) {
        const knownTitle=strength===3 || index.workNames.get(record.row.karaoke_numbers.tj)?.has(key(base));
        if (knownTitle && !record.version && artistForms(artist).some(a => record.artistKeys.has(artistKey(a)))) {
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
    // 자막 영상의 '가수 - 번역 제목(원제)' 구절을 실제 표기 쌍으로 검증한다.
    const caption=text.replace(/^.*?[:：]\s+(?=[^:：]+\s[-–—]\s)/u,'')
      .replace(/\s*[\[【(](?:가사|한글|자막|해석|독음|발음|고화질|1080[ph])[^)\]】]*[)\]】].*$/iu,'').trim();
    const credit=caption.match(/^(.{1,70}?)\s+[-–—]\s+(.{1,100})$/u);
    if (credit) {
      const name=credit[2].replace(/\s*\[[^\]]+\s(?:OP|ED)\b[^\]]*\].*$/iu,'').replace(/(?<=\p{sc=Han})\([가-힣 ]+\)\s*/gu,' ');
      const nested=name.match(/^.+?\(([a-z][a-z '-]{2,40})\)$/iu);
      for (const term of [name,nested?.[1]].filter(Boolean)) {
        if (!term || !key(term)) continue;
        for (const [r,rank] of index.get(key(term))||[]) {
          const artist=artistKey(credit[1]);
          if (rank>=2 && !r.version && (r.artistKeys.has(artist) || rank===3 &&
              key(term).length>=7 && [...r.artistKeys].some(a=>singleMissingLetter(a,artist))))
            matches.set(r.row.karaoke_numbers.tj,r.row);
        }
      }
    }
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
    if (!isCover || descriptionCredits.includes(raw)) {
      const credit=text.match(/^(?:\[[^\]]+\]\s*)*([^'"“”|]+?)\s*(?:\|\s*)?['"“]([^'"“”]+)['"”](?:\s*(?:Live Video|M\/V|Music Video)\b.*)?$/iu);
      if (credit) pair(credit[2],credit[1].trim());
      const voice=text.match(/^[^'"]*?\s+feat\.\s+([^()]+?)\s*\(([^()]+)\)\s+[-–—]\s+(.+?)(?:\s+\((?:MR|inst)\s+[^()]*\))?$/iu);
      if (voice) pair(voice[3],voice[1]);
      const by=text.match(/[“"]([^"”]+)[”"]\s+by\s+([^|]+?)\s*\|\s*(?:official\s+)?music video$/iu);
      if (by && input.linkedOriginal) {
        for (const [record,strength] of index.get(key(by[1]))||[]) {
          if (strength===3 && !record.version && record.row.artist_primary.split(',').some(a=>artistKey(a)===artistKey(by[2])))
            matches.set(record.row.karaoke_numbers.tj,record.row);
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

function sourceIds(input) {
  const ids=new Set();
  if (/^[\w-]{11}$/u.test(input.id||'')) ids.add('Youtube:'+input.id);
  if (input.originalVideo?.id) ids.add('Youtube:'+input.originalVideo.id);
  const lines=(input.description || '').split(/\r?\n/u);
  for (let i=0;i<lines.length;i++) {
    const line=lines[i].trim();
    const originalNico=line.match(/(?:御|ご)本家(?:動画)?様?\s*[/：:]\s*((?:sm|so)\d{5,10})(?!\d)/u);
    if (originalNico) ids.add('NicoNicoDouga:'+originalNico[1]);
    const alternate=/\b(?:singers?|vocalists?)\b/iu.test(input.title) && /^VOCALOIDS?(?:\s+ver\.?)?\s*(?=https?:\/\/|[:：→])/iu.test(line);
    const credit=line.match(/^([\p{L}\p{N}]{3,20})\s*[-:：]\s*https?:\/\//u);
    const performer=credit && key(input.title).includes(key(credit[1])) && !/출처|그림|가사|일러|翻訳|자막|inst|mix/iu.test(credit[1]);
    if (!alternate && !performer && !/^[^\p{L}\p{N}]*(?:(?:(?:[LR]|남자버전|여자버전)\s*)?(?:원곡|원본|본가(?:\s*주소)?|(?:음원\s*)?출처|原曲|(?:ご|御)?本家|original(?:\s+(?:song|video))?)|[^:：]{1,18}\s+본가)(?=[^\p{L}\p{N}]|様|$)/iu.test(line)) continue;
    const block=[line];
    for (let j=i+1;j<Math.min(i+5,lines.length);j++) {
      const next=lines[j].trim();
      if (!next) continue;
      if (!/^(?:(?:니코동|니코니코|niconico|유튜브|youtube)(?:\s*(?:투고|업로드|영상))?\s*[:：]\s*|[^:：/]{1,45}(?:様|さん|님)\s*[/／:：]\s*)?(?:https?:\/\/|sm\d)/iu.test(next)) break;
      block.push(next);
    }
    for (const text of block) {
      for (const m of text.matchAll(/https?:\/\/[^\s<>"「」]+/giu)) {
        let url; try {url=new URL(m[0]);} catch {continue;}
        if (url.username || url.password || url.port) continue;
        const yt=url.hostname==='youtu.be'?url.pathname.slice(1):
          /^(?:www\.|m\.|music\.)?youtube\.com$/u.test(url.hostname) && url.pathname==='/watch'?url.searchParams.get('v'):'';
        if (/^[\w-]{11}$/u.test(yt||'')) ids.add('Youtube:'+yt);
        const nico=/^(?:www\.|sp\.)?nicovideo\.jp$/u.test(url.hostname)?url.pathname.match(/^\/watch\/((?:sm|so)\d+)\/?$/u):
          url.hostname==='nico.ms'?url.pathname.match(/^\/((?:sm|so)\d+)\/?$/u):null;
        if (nico) ids.add('NicoNicoDouga:'+nico[1]);
      }
      const bare=text.replace(/https?:\/\/\S+/gu,'');
      for (const m of bare.matchAll(/(?:^|[\s:：])((?:sm|so)\d{5,10})(?!\d)/gu)) ids.add('NicoNicoDouga:'+m[1]);
    }
  }
  return ids;
}
function resolveWork(input, index, reading) {
  const result = selectRecording(input,index,reading);
  const source = input.originalVideo;
  if (result.status === '스킵' || [input.title,...(input.titles || [])].some(t=>/메들리|매시업|マッシュアップ|メドレー|\b(?:medley|mashup)\b/iu.test(t)) ||
      (!result.row && result.candidates.length > 1 && /서로 다름|여러 원곡/u.test(result.reason))) return result;
  const linkResult=source?.title && selectRecording({...source,linkedOriginal:true},index,reading);
  const linked=linkResult?.row;
  const registered=new Set();
  const versioned=input.title.normalize('NFKC').match(/^([^([【]+?)\s*[(\[【](?=.*\b(?:ver(?:sion)?|remix)\b)/iu);
  const official=/^Provided to YouTube by /mu.test(input.description||'') && /Auto-generated by YouTube\.\s*$/iu.test(input.description||'');
  if (!result.row && versioned && official) {
    const term=key(versioned[1]);
    const writers=[...(input.description||'').matchAll(/^Composer:\s*([^\r\n]+)/gmu)].flatMap(m=>artistForms(m[1]).map(artistKey));
    for (const [r,strength] of index.get(term)||[]) {
      if (strength===3 && !r.version && key(titleParts(r.row.title_primary).base)===term && writers.some(a=>r.composerKeys?.has(a)))
        registered.add(r.row);
    }
  }
  if (source?.title && /^Provided to YouTube by /mu.test(source.description||'') &&
      /Auto-generated by YouTube\./u.test(source.description||'')) {
    for (const credit of explicitOriginals(input)) {
      const pair=credit.normalize('NFKC').match(/^([^()]+?)\s*\(([^()]+)\)\s*$/u);
      if (!pair || !japanese.test(pair[1]) || key(pair[2]).length<6 || key(pair[2])!==key(source.title)) continue;
      const rows=[...(index.get(key(pair[1]))||[])].filter(([r,strength])=>
        strength===3 && !r.version && key(titleParts(r.row.title_primary).base)===key(pair[1]));
      if (rows.length===1) registered.add(rows[0][0].row);
    }
  }
  const ids=sourceIds(input);
  if (source?.title) for (const id of sourceIds(source)) ids.add(id);
  for (const id of ids) for (const number of index.pvs.get(id)||[]) registered.add(index.numbers.get(number));
  registered.delete(undefined);
  if (linked) registered.add(linked);
  if (!registered.size) {
    if (!result.row && source?.title) {
      const spelling=source.title.normalize('NFKC').trim().toLowerCase();
      const exact=linkResult.candidates.filter(r=>titleParts(r.title_primary).base.toLowerCase()===spelling);
      if (exact.length===1 && (!result.candidates.length || result.candidates.includes(exact[0])))
        return {...result,status:'확인 필요',reason:'원곡 링크의 표기가 일치하나 등록 가수 미확인',candidates:exact,titleCandidate:exact[0]};
    }
    return result;
  }
  if (result.row) registered.add(result.row);
  if (registered.size>1) return {status:'확인 필요',reason:'영상과 원곡 크레딧이 서로 다름',keywords:result.keywords,candidates:[...registered]};
  if (result.status==='자동 확정' && !linked && result.row && !input.originalVideo &&
      !/\bcover(?:ed)?\b|커버|歌ってみた/iu.test(input.title)) return result;
  return {...result,status:'원곡 반주',row:[...registered][0],titleCandidate:undefined,candidates:[],
    reason:linked?'영상에서 지정한 원곡의 제목과 가수가 TJ 등록곡과 일치':'공개 작품 자료의 영상 ID와 TJ 등록곡의 곡명·제작진이 일치'};
}

function selectSong(input,index,reading) {
  const result=resolveWork(input,index,reading);
  if (result.row || result.status==='스킵' || /메들리|매시업|서로 다름|여러 원곡|번호 여러 개/u.test(result.reason)) return result;
  // 제목 필드의 완결된 단어만 대조한다. 소개문·가사에 우연히 들어간 작품명은 사용하지 않는다.
  const headings=unique([input.title,...(input.titles||[]),...(input.tracks||[])]);
  const titleText=headings.map(key).join(' ');
  const description=input.description||'';
  const composers=/^Provided to YouTube by /mu.test(description) && /Auto-generated by YouTube\.\s*$/iu.test(description)
    ? [...description.matchAll(/^Composer:\s*([^\r\n]+)/gmu)].flatMap(m=>artistForms(m[1]).map(artistKey)) : [];
  for (const line of (input.description||'').split(/\r?\n/u).slice(0,18)) {
    if (line.length>180 || /https?:/iu.test(line)) continue;
    const credit=line.match(/^.{1,55}?\s+[-–—]\s+(.{3,100})$/u);
    if (credit && credit[1].split(/\s/u).some(w=>key(w).length>=4 && titleText.includes(key(w)))) headings.push(credit[1]);
  }
  const tagLines=(input.description||'').split(/\r?\n/u).slice(0,8).filter(l=>l.trim().startsWith('#'));
  const repeated=tagLines.some(l=>[...l.matchAll(/#([가-힣]{4,})/gu)].some(m=>titleText.includes(key(m[1]))));
  const tagged=tagLines.map(l=>l.match(/^#[^\s#]+\s+[-–—]\s+#([\p{sc=Han}\p{sc=Katakana}\p{sc=Hiragana}ー・]{4,})(?:\s|$)/u)?.[1]).filter(Boolean);
  if (repeated && tagged.length===1 && /\bcover\b|커버|歌ってみた/iu.test(input.title)) headings.push(tagged[0]);
  const sourceWork=new Map();
  const performed=headings.some(t=>/cover|커버|歌っ|歌い|歌唱|합창|우타이테|자막|한글화|프로세카|좌우음향|\bvocal\b|singers?\s+ver|\s[-–—]\s/iu.test(t)) ||
    /^Provided to YouTube by /mu.test(input.description||'') || /자막입니다|歌わせて|cover by/iu.test((input.description||'').slice(0,240));
  for (const heading of headings) {
    const outer=heading.normalize('NFKC').replace(/\s+(?:(?:한국어|한글)\s*자막|자막\s+가사|lyrics\s+가사)(?:\s.*)?$/iu,'')
      .replace(/\s+(?:歌いました|歌ってみた|歌った)(?=\s|【|$)/gu,'|');
    const segments=outer.split(/[【】「」『』()[\]|／/：:]|\s+[-–—]\s*|(?<=\S)[–—-](?=\s)|(?<=[가-힣])-(?=\S)|\s{2,}/u).map(s=>s.trim()).filter(Boolean);
    for (const segment of segments) {
      const words=segment.match(/[\p{sc=Hangul}]+|[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}ー]+|[\p{sc=Latin}\d]+/gu)||[];
      for (let i=0;i<words.length;i++) {
        let term='';
        for (let j=i;j<Math.min(words.length,i+12);j++) {
          term+=key(words[j]);
          const numbers=index.vocalTitles.get(term);
          if (numbers?.size!==1) continue;
          const [num]=numbers;
          const row=index.numbers.get(num);
          const canonical=key(titleParts(row.title_primary).base)===term;
          if ([...(index.get(term)||[])].some(([r,strength])=>strength>=(canonical?3:2) && r.row.karaoke_numbers.tj!==num)) continue;
          const bucket=sourceWork.get(num)||{forms:new Set(),distinctive:false,complete:false};
          bucket.forms.add(term);
          const full=i===0 && j===words.length-1;
          const jpSpan=term.length>=6 && japanese.test(term) && words.slice(i,j+1).every(w=>japanese.test(w)) &&
            !japanese.test(words[i-1]||'') && !japanese.test(words[j+1]||'') && /[가-힣]/u.test(heading);
          const min=/[가-힣]/u.test(term) || japanese.test(term) ? 4 : 9;
          if (full && (term.length>=min || /^[가-힣]{3}$/u.test(term) && /\s[-–—]\s/u.test(heading))) bucket.complete=true;
          if (performed && (full || jpSpan) && term.length>=min) bucket.distinctive=true;
          if (full && index.hanReadings.has(term) && /\s[-–—]\s/u.test(heading)) bucket.distinctive=true;
          if (full && composers.length && (row.composer||'').split(/[,、]/u).some(a=>a && composers.includes(artistKey(a))))
            bucket.distinctive=true;
          sourceWork.set(num,bucket);
        }
      }
    }
  }
  if (sourceWork.size!==1) return result;
  const [[number,hit]]=sourceWork;
  const scripts=new Set([...hit.forms].map(t=>/[가-힣]/u.test(t)?'ko':japanese.test(t)?'ja':'latin'));
  const row=index.numbers.get(number);
  if (result.candidates.length && !result.candidates.includes(row)) return result;
  if (!hit.distinctive && scripts.size<2) return hit.complete ?
    {...result,status:'확인 필요',reason:'공개 작품과 제목이 일치하나 영상 크레딧 부족',candidates:[row],titleCandidate:row} : result;
  return {...result,status:'원곡 반주',row,titleCandidate:undefined,candidates:[],reason:'등록된 보컬로이드 원곡과 커버 영상의 작품 표기가 일치'};
}

function selectPlaylist(songs,index,reading) {
  const results=songs.map(song=>selectSong(song,index,reading));
  const byOriginal=new Map();
  for (let i=0;i<songs.length;i++) {
    const id=songs[i].originalVideo?.id;
    if (!id || !results[i].row) continue;
    const pool=byOriginal.get(id)||new Set(); pool.add(results[i].row); byOriginal.set(id,pool);
  }
  return results.map((r,i)=>{
    const rows=byOriginal.get(songs[i].originalVideo?.id);
    if (r.row || rows?.size!==1 || r.status==='스킵' || /메들리|매시업|서로 다름|여러 원곡|등록 보컬/u.test(r.reason)) return r;
    const row=[...rows][0];
    if (!r.candidates.includes(row)) return r;
    return {...r,status:'원곡 반주',row,candidates:[],titleCandidate:undefined,reason:'같은 원곡 영상과 곡명 후보가 동일 번호를 가리킴'};
  });
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
  const latinArtists=evidence.artists.filter(s=>/^[a-z .-]+$/iu.test(s)).map(phoneticKey).filter(Boolean);
  const originalTitles = unique([input.title, ...(input.titles || [])]);
  if (originalTitles.some(t => /메들리|매시업|マッシュアップ|メドレー|\b(?:medley|mashup)\b/i.test(t))) {
    return { status: '확인 필요', reason: '메들리·매시업은 곡별로 확인해야 합니다.', keywords, candidates: [] };
  }
  const coverMatches = printedMatches(originalTitles, index, [...descriptionCredits,...originalCredits(input,keywords)], input);
  const cited=(input.description||'').match(/^([^\r\n「『:：]{1,50}?)(?:さん|様)の[「『]([^「」『』]+)[」』]を歌(?:わせて|った|いました)/mu);
  if (cited && !versions.length) {
    for (const [r,strength] of index.get(key(cited[2])) || []) {
      if (strength===3 && !r.version && (r.row.composer||'').split(/[,、]/u).some(a=>artistKey(a)===artistKey(cited[1])))
        coverMatches.set(r.row.karaoke_numbers.tj,r.row);
    }
  }
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
  const distribution=(input.description||'').match(/^Provided to YouTube by [^\r\n]+\r?\n\s*\n([^\r\n]+?) · [^\r\n]+\r?\n\s*\n([^\r\n]+)/mu);
  if (distribution && /Auto-generated by YouTube\.\s*$/iu.test(input.description) && key(distribution[1])!==key(distribution[2])) {
    const writers=unique([...input.description.matchAll(/^Composer:\s*([^\r\n]+)/gmu)]
      .map(m=>artistKey(m[1].replace(/\s+\([^()]+\)$/u,'')))).sort();
    const possible=writers.length>=2 ? [...(index.get(key(distribution[2]))||[])].filter(([r,strength])=>
      strength===3 && !r.version && unique((r.row.composer||'').split(/[,、]/u).map(artistKey)).sort().join('|')===writers.join('|')) : [];
    if (possible.length===1 && !coverMatches.size && ![...hits].some(([r])=>artists.some(a=>r.artistKeys.has(a)))) {
      const row=possible[0][0].row;
      return {status:'확인 필요',reason:'배급사의 앨범명과 작곡진 전체 일치, 개별 트랙의 번역명 미확인',keywords,candidates:[row],titleCandidate:row};
    }
  }
  if (!hits.size && !coverMatches.size) return { status: '목록에서 못 찾음', reason: '일치하는 제목·독음 없음', keywords, candidates: [] };
  const direct = [...hits.keys()].filter(r => artists.some(a => r.artistKeys.has(a)));
  // 두 한자 이름의 발음만 우연히 같을 수 있어 독음은 다른 문자 표기와만 대조한다.
  const sameArtist = direct.length ? direct : [...hits.keys()].filter(r =>
    artists.some(a => r.artistReadings.has(a)) || artistSounds.some(a => r.artistKeys.has(a)) ||
    (hits.get(r)===2 && latinArtists.some(a=>r.artistReadings.has(a))));
  const matchingVersion = sameArtist.filter(r => versions.length ? versions.length === 1 && versions[0] === r.version : !r.version);
  const eligible = matchingVersion.filter(r => hits.get(r) > 0);
  if (!eligible.length && !versions.length) {
    const labels=unique([...artists,...originalTitles.flatMap(t=>t.replace(/[\[(](?:자막|한글|고화질|가사|독음|발음)[^)\]]*[)\]].*$/u,'')
      .split(/\s+[-–—]\s+|(?<=[가-힣])-(?=\S)|[【】「」|]/u).map(s=>artistKey(s.trim())))]).filter(Boolean);
    for (const [r,rank] of hits) {
      if (rank>0 && !r.version && labels.some(a=>r.coverArtists?.has(a)))
        coverMatches.set(r.row.karaoke_numbers.tj,r.row);
    }
  }
  if (!eligible.length && !versions.length) {
    const composerLines=(input.description||'').matchAll(/^(?=[^:\r\n]{0,100}\bComposer\b)[\w, -]+:\s*([^\r\n]+)/gimu);
    const declared=/^Provided to YouTube by /mu.test(input.description||'') && /Auto-generated by YouTube\./u.test(input.description||'')
      ? [...composerLines].map(m=>artistKey(m[1])) : [];
    const workCredits=[...(input.description||'').matchAll(/^[^\p{L}\p{N}\r\n]*(?:Music|Composer|作曲|作詞作曲|작곡)\s*[:：]\s*([^\r\n:：/]{1,65})$/gimu)]
      .map(m=>artistKey(m[1].trim().replace(/(?:様|さん)$/u,''))).filter(Boolean);
    const texts=originalTitles.map(t=>key(t));
    const corroborated=[...hits].filter(([r,rank])=>{
      if (r.version) return false;
      const credited=r.composerKeys || new Set((r.row.composer||'').split(/[,、/&]/u).map(artistKey));
      const base=titleParts(r.row.title_primary).base;
      const exactReading=rank>0 && !kanji.test(base) && keywords.some(k=>/^[a-z ]{5,}$/iu.test(k) && key(k)===reading(base));
      if ((rank===2 || exactReading) && declared.length && declared.every(a=>a && credited.has(a))) return true;
      if (rank!==2) return false;
      if (workCredits.some(a=>credited.has(a))) return true;
      const author=[...input.title.normalize('NFKC').matchAll(/\s\/\s*([^/【]+?)\s*【covered\s+by\b/giu)].map(m=>artistKey(m[1]));
      if (author.some(a=>a && credited.has(a))) return true;
      const tie=r.row.title_primary.normalize('NFKC').match(/\(([^()]+?)\s+(OP|ED)\s*\)$/iu);
      return tie && key(tie[1]).length>=4 && texts.some(t=>t.includes(key(tie[1]+tie[2])));
    }).map(([r])=>r.row);
    if (corroborated.length===1) coverMatches.set(corroborated[0].karaoke_numbers.tj,corroborated[0]);
  }
  if (coverMatches.size>1) return {status:'확인 필요',reason:'크레딧이 여러 원곡을 가리킴',keywords,candidates:[...coverMatches.values()]};
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
  const possible = candidates.length === 1 && !versions.length && !sameArtist.length && keywords.some(k=>{
    const row=candidates[0], term=key(k);
    return japanese.test(k) && term===key(titleParts(row.title_primary).base) ||
      /^[가-힣]{3,}$/u.test(term) && row.title_ko_source!=='llm-translated' && term===key(row.title_ko) ||
      /[가-힣]/u.test(input.title) && /^[a-z]+(?: [a-z]+)+$/iu.test(k) && term.length>=8 && term===key(titleParts(row.title_primary).base) ||
      term.length>=5 && index.workNames.get(row.karaoke_numbers.tj)?.has(term);
  });
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

return { key, titleParts, artistForms, makeReader, indexCatalog, selectSong, selectPlaylist, addSavedAliases };
});
