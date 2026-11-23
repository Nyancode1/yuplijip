const el = id => document.getElementById(id);
const filters = [['전체','all'],['번호 있음','available'],['번호 미확인','unknown']];
let current, lastPlaylist, selected = 'all', entries = [], worker;
let currentId, lastId, pendingDelete, catalogPromise, artTarget;
const savedEntries = new Map();
const matchingRevision = 2;
const element = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
function picture(song) {
  const p = element('span', 'art', '♫');
  const src = PlaylistReader.artwork(song.art);
  if (src) {
    const img = new Image(); img.alt = ''; img.loading = 'lazy';
    img.onerror = () => img.remove();
    img.src = src.startsWith('https:') ? 'thumbnail?url=' + encodeURIComponent(src) : src;
    p.append(img);
  }
  return p;
}
function fold(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/gu, '');
}
function sizeTitle(line) {
  const distance = line.firstChild.scrollWidth - line.clientWidth;
  line.classList.toggle('moving', distance > 1 && line.clientWidth > 0);
  if (distance > 1) {
    line.style.setProperty('--travel', -distance + 'px');
    line.style.setProperty('--duration', Math.max(3, distance / 34 + 1.5) + 's');
  }
}
const titleSizes = new ResizeObserver(changes => changes.forEach(change => sizeTitle(change.target)));
const visibleTitles = new IntersectionObserver(changes => {
  for (const change of changes) {
    const line = change.target;
    if (change.isIntersecting && line.isConnected) { sizeTitle(line); titleSizes.observe(line); }
    else { titleSizes.unobserve(line); line.classList.remove('moving'); }
  }
});
function applySearch() {
  const terms = el('search').value.trim().split(/\s+/u).map(fold).filter(Boolean);
  let shown = 0;
  for (const { node, text, available } of entries) {
    const visible = (selected === 'all' || available === (selected === 'available')) &&
      terms.every(term => text.includes(term));
    node.hidden = !visible;
    if (visible) shown++;
  }
  el('clear').hidden = !el('search').value;
  el('empty').hidden = shown > 0;
  el('empty').textContent = terms.length ? '검색 결과가 없습니다.' : '이 필터에 해당하는 곡이 없습니다.';
  el('count').textContent = selected === 'all' && !terms.length ? entries.length + '곡' : shown + '곡 / 전체 ' + entries.length + '곡';
  for (const b of el('filters').children) b.setAttribute('aria-pressed', String(b.dataset.filter === selected));
  const offset = el('tracks').getBoundingClientRect().top - el('tools').offsetHeight;
  if (offset < 0) window.scrollBy(0, offset);
}
function showPlaylist(playlist, id = lastId) {
  current = playlist;
  visibleTitles.disconnect();
  titleSizes.disconnect();
  currentId = id;
  selected = 'all';
  el('search').value = '';
  el('return').hidden = !lastPlaylist || currentId === lastId;
  el('collection').hidden = !playlist;
  el('source').hidden = !playlist?.youtubeId;
  if (!playlist) {
    entries = []; el('hero').replaceChildren(); el('tracks').replaceChildren();
    el('tools').hidden = true;
    return;
  }
  const rows = current.rows;
  el('title').textContent = current.name;
  const covers = rows.filter(r => PlaylistReader.artwork(r.art)).slice(0, 4);
  el('hero').hidden = !covers.length;
  el('hero').replaceChildren(...covers.map(picture));
  const list = document.createDocumentFragment();
  entries = rows.map(row => {
    const node = element('div','track'), song = element('div','trackSong'), name = element('span','trackText');
    const line = element('strong','titleLine');
    line.append(element('span','',row.title)); name.append(line);
    const credit = row.channel && row.artist && fold(row.channel) !== fold(row.artist) ?
      row.artist + ' · ' + row.channel : row.artist || row.channel;
    if (credit) name.append(element('small','',credit));
    const cover = element('button','coverButton');
    cover.type = 'button';
    cover.setAttribute('aria-label', row.title + ' 썸네일 선택');
    cover.append(picture(row)); cover.onclick = () => chooseArt(row);
    song.append(cover,name);
    const displayed = row.match || row.candidate;
    const tag = element(displayed ? 'button' : 'span','tag');
    if (displayed) {
      const label = !row.match ? 'TJ 후보' : row.original || row.status === '원곡 반주' ? '원곡 TJ' : 'TJ';
      tag.append(element('em','',label),element('b','',displayed.number));
      tag.setAttribute('aria-label', label + ' ' + displayed.number + ' 복사');
      tag.onclick = () => copyNumber(displayed.number);
    } else {
      tag.textContent = row.parts?.length ? '메들리' : row.private || row.status === '스킵' ? '비공개' : '번호 미확인';
    }
    node.append(song,tag); list.append(node);
    const numbers = displayed ? [displayed] : row.parts || [];
    const text = [row.title, row.artist, row.channel, ...(row.aliases || []),
      ...numbers.flatMap(m => [m.title, m.artist, 'TJ ' + m.number])].map(fold).join('\n');
    return { node, line, text, available: Boolean(row.match || row.parts?.length) };
  });
  const empty = element('p','empty'); empty.id = 'empty'; empty.setAttribute('role','status'); list.append(empty);
  el('tracks').replaceChildren(list);
  el('tools').hidden = currentId === 'catalog';
  applySearch();
  for (const entry of entries) visibleTitles.observe(entry.line);
}
function copyNumber(number) {
  if (window.Songbook) Songbook.copyNumber(String(number));
  else navigator.clipboard.writeText(String(number));
}
window.handleBack = () => {
  if (el('policy').open) { el('policy').close(); return true; }
  if (el('books').open) {
    if (el('load').disabled) return true;
    if (pendingDelete) { pendingDelete = null; drawBooks(); } else el('books').close();
    return true;
  }
  if (current && currentId !== lastId) { showPlaylist(lastPlaylist); return true; }
  return false;
};
for (const [label, filter] of filters) {
  const b = element('button', '', label);
  b.dataset.filter = filter; b.onclick = () => { selected = filter; applySearch(); };
  el('filters').append(b);
}
el('search').oninput = () => { if (current) applySearch(); };
el('clear').onclick = () => { el('search').value = ''; applySearch(); el('search').focus(); };
el('return').onclick = () => showPlaylist(lastPlaylist);
function setBusy(busy) {
  el('load').disabled = busy;
  el('more').disabled = busy;
  el('register').disabled = busy;
}
async function readJson(file) {
  const response = await fetch(file);
  if (!response.ok) throw Error('선곡표를 열지 못했습니다.');
  return response.json();
}
function personalBooks() {
  return [...savedEntries.values()].filter(book => !book.removed).sort((a,b) => b.savedAt - a.savedAt);
}
async function readBook(entry) {
  if (YouTubePlaylist.expired(entry)) return fetchBook(entry.youtubeId, entry.savedAt);
  const book = await SongbookLibrary.get(entry.id);
  if (!book?.rows || book.matchingRevision === matchingRevision) return book;
  // 기존 번호, 메들리, 사진, 순서를 유지하고 번호가 없던 행만 새 규칙으로 대조한다.
  const missing = book.rows.filter(r => r.title && !r.match && !r.parts?.length && !r.private);
  try {
    const updated = missing.length ? await match(missing.map(PlaylistReader.songInput)) : [];
    const byRow = new Map(missing.map((row, i) => [row, updated[i]]));
    const playlist = { ...book, matchingRevision, rows:book.rows.map(row => {
      const result = byRow.get(row);
      return result ? { ...row, match:result.match, candidate:result.candidate, original:result.original } : row;
    }) };
    await SongbookLibrary.save(entry.id, playlist, entry.savedAt);
    return playlist;
  } catch { return book; }
}
function drawBooks() {
  const links = el('bookLinks');
  links.replaceChildren();
  const personal = personalBooks();
  for (const book of personal) {
      const row = element('div','bookRow'), open = element('button','bookOpen',book.name);
      open.onclick = () => changeBook(book, false);
      row.append(open);
      const confirming = pendingDelete === book.id;
      if (confirming) {
        const cancel = element('button','','취소');
        cancel.onclick = () => { pendingDelete = null; drawBooks(); };
        row.append(cancel);
      }
      const remove = element('button','deleteBook', confirming ? '삭제하기' : '삭제');
      remove.setAttribute('aria-label', book.name + (confirming ? ' 삭제 확인' : ' 삭제'));
      remove.onclick = () => {
        if (confirming) changeBook(book, true);
        else { pendingDelete = book.id; drawBooks(); }
      };
      row.append(remove); links.append(row);
  }
  if (!links.childElementCount) links.append(element('p','libraryEmpty','저장된 플레이리스트가 없습니다.'));
}
async function changeBook(book, remove) {
  if (el('load').disabled) return;
  setBusy(true); el('bookMessage').textContent = '';
  try {
    if (remove) {
      // 삭제 중인 목록이 마지막으로 불러온 목록이면 다음에 보여 줄 화면을 먼저 준비한다.
      let nextId = lastId, nextList = lastPlaylist;
      if (book.id === lastId) {
        const next = personalBooks().find(item => item.id !== book.id);
        nextId = next && !YouTubePlaylist.expired(next) ? next.id : undefined;
        nextList = nextId ? await readBook(next) : null;
      }
      await SongbookLibrary.remove(book.id);
      lastId = nextId; lastPlaylist = nextList;
      savedEntries.delete(book.id);
      if (currentId === book.id) showPlaylist(lastPlaylist);
      else el('return').hidden = currentId === lastId;
      pendingDelete = null; drawBooks();
    } else {
      const playlist = book.id === lastId && lastPlaylist && !YouTubePlaylist.expired(book) ? lastPlaylist : await readBook(book);
      if (!playlist?.rows) throw Error();
      if (book.id === lastId) lastPlaylist = playlist;
      showPlaylist(playlist, book.id); el('books').close(); el('message').textContent = '';
    }
  } catch (error) { el('bookMessage').textContent = remove ? '삭제하지 못했습니다. 다시 시도해 주세요.' : error.message || '선곡표를 열지 못했습니다.'; }
  finally { setBusy(false); }
}
el('more').onclick = () => {
  pendingDelete = null; el('bookMessage').textContent = '';
  drawBooks(); el('books').showModal();
};
el('closeBooks').onclick = () => el('books').close();
el('books').onclick = e => {
  if (e.target !== el('books')) return;
  const rect = el('books').getBoundingClientRect();
  if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) el('books').close();
};
function match(rows) {
  worker ||= new Worker('worker.js');
  return new Promise((resolve,reject) => {
    worker.onmessage = e => e.data.error ? reject(Error(e.data.error)) : resolve(e.data.rows);
    worker.onerror = () => { worker.terminate(); worker = null; reject(Error('곡목을 읽지 못했습니다. 다시 시도해 주세요.')); };
    worker.postMessage({ rows });
  });
}
el('form').onsubmit = async e => {
  e.preventDefault();
  if (el('load').disabled) return;
  const terms = el('catalogQuery').value.trim().split(/\s+/u).map(fold).filter(Boolean);
  if (!terms.length) return;
  el('books').close();
  setBusy(true); el('catalogQuery').blur(); el('message').textContent = '';
  try {
    catalogPromise ||= readJson('catalog.json').catch(error => { catalogPromise = null; throw error; });
    const songs = await catalogPromise;
    const found = songs.filter(s => {
      const text = [s.karaoke_numbers.tj,s.title_primary,s.title_ruby,s.title_ko,s.artist_primary,s.artist_ko,...(s.artist_aliases || [])].map(fold).join('\n');
      return terms.every(term => text.includes(term));
    });
    const rows = found.slice(0,100).map(s => ({ title: s.title_primary, artist: s.artist_primary,
      match: { number: s.karaoke_numbers.tj, title: s.title_primary, artist: s.artist_primary } }));
    await Promise.all(rows.map(async row => { row.art = await SongbookLibrary.art(row.match.number).catch(() => undefined); }));
    showPlaylist({ name:'검색 결과', rows }, 'catalog');
    if (!found.length) el('empty').textContent = '검색 결과가 없습니다.';
    if (found.length > rows.length) el('message').textContent = found.length + '곡 중 처음 100곡입니다. 검색어를 더 입력해 주세요.';
  } catch { el('message').textContent = '곡목을 읽지 못했습니다.'; }
  finally { setBusy(false); }
};
el('policyFirst').onclick = el('policyMenu').onclick = () => el('policy').showModal();
el('closePolicy').onclick = () => el('policy').close();
el('source').onclick = () => el('tracks').scrollIntoView();
el('consent').hidden = localStorage.getItem('youtubeConsent') === '1';

function customPictures(book) {
  if (book?.customArt) return book.customArt;
  return Object.fromEntries((book?.rows || []).filter(r => r.id && r.art?.startsWith('data:image/')).map(r => [r.id, r.art]));
}
async function fetchBook(youtubeId, savedAt) {
  const source = await YouTubePlaylist.load(youtubeId, undefined, n => {
    el('message').textContent = n + '곡을 읽었습니다…';
  });
  el('message').textContent = 'TJ 번호를 찾는 중…';
  const id = 'youtube:' + youtubeId;
  const art = customPictures(await SongbookLibrary.get(id));
  const rows = await match(source.rows.map(song => ({ ...song, art:art[song.id] || PlaylistReader.artwork(song.art) })));
  const playlist = { ...source, rows, matchingRevision };
  savedEntries.set(id, await SongbookLibrary.save(id, playlist, savedAt));
  el('message').textContent = '';
  return playlist;
}
el('registerForm').onsubmit = async e => {
  e.preventDefault();
  if (el('register').disabled) return;
  setBusy(true);
  try {
    const youtubeId = YouTubePlaylist.playlistId(el('playlistLink').value);
    if (!el('consent').hidden) {
      if (!el('accept').checked) { el('accept').focus(); throw Error('등록하려면 이용약관과 개인정보 처리방침을 확인하고 동의해 주세요.'); }
      localStorage.setItem('youtubeConsent', '1'); el('consent').hidden = true;
    }
    el('playlistLink').blur();
    el('message').textContent = '곡 목록을 읽는 중…';
    const playlist = await fetchBook(youtubeId);
    lastId = 'youtube:' + youtubeId; lastPlaylist = playlist; showPlaylist(playlist);
    el('playlistLink').value = '';
  } catch (error) { el('message').textContent = error.message || '플레이리스트를 읽지 못했습니다.'; }
  finally { setBusy(false); }
};
async function expireBooks() {
  for (const entry of savedEntries.values()) {
    if (!entry.fetchedAt || !YouTubePlaylist.expired(entry)) continue;
    const book = await SongbookLibrary.get(entry.id);
    const stub = { youtubeId:entry.youtubeId, name:'YouTube 플레이리스트 · ' + entry.youtubeId.slice(-6), customArt:customPictures(book) };
    savedEntries.set(entry.id, await SongbookLibrary.save(entry.id, stub, entry.savedAt));
    if (lastId === entry.id) lastPlaylist = null;
    if (currentId === entry.id) showPlaylist(null);
  }
}
document.addEventListener('visibilitychange', async () => {
  if (document.hidden || el('load').disabled) return;
  setBusy(true);
  try { await expireBooks(); if (el('books').open) drawBooks(); }
  finally { setBusy(false); }
});
function chooseArt(row) {
  artTarget = { row, id:currentId, playlist:current };
  el('artFile').click();
}
el('artFile').onchange = async e => {
  const file = e.target.files[0]; e.target.value = '';
  const target = artTarget; artTarget = null;
  if (!file || !target) return;
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas'), size = Math.min(bitmap.width, bitmap.height);
    canvas.width = canvas.height = 240;
    canvas.getContext('2d').drawImage(bitmap,(bitmap.width-size)/2,(bitmap.height-size)/2,size,size,0,0,240,240);
    bitmap.close();
    const art = canvas.toDataURL('image/jpeg', .86);
    if (target.id === 'catalog') await SongbookLibrary.setArt(target.row.match.number, art);
    else {
      const updated = { ...target.playlist, rows:target.playlist.rows.map(r=>r===target.row ? {...r,art} : r) };
      savedEntries.set(target.id, await SongbookLibrary.save(target.id, updated));
      if (lastId === target.id) lastPlaylist = updated;
      if (currentId === target.id) showPlaylist(updated, target.id);
      return;
    }
    target.row.art = art;
    if (currentId === target.id) showPlaylist(target.playlist, target.id);
  } catch { el('message').textContent = '선택한 이미지를 저장하지 못했습니다.'; }
};
(async () => {
  setBusy(true);
  let legacy;
  try { legacy = JSON.parse(localStorage.getItem('lastList')); } catch {}
  try {
    for (const entry of await SongbookLibrary.list()) savedEntries.set(entry.id, entry);
    await expireBooks();
    if (legacy?.rows?.length) {
      if (!savedEntries.has('previous')) savedEntries.set('previous', await SongbookLibrary.save('previous', legacy));
      localStorage.removeItem('lastList');
    }
    const latest = personalBooks()[0];
    if (latest) { lastPlaylist = await readBook(latest); lastId = latest.id; }
  } catch (error) { lastPlaylist = legacy; el('message').textContent = error.message || '저장한 목록을 열지 못했습니다.'; }
  showPlaylist(lastPlaylist);
})().catch(() => { el('message').textContent = '저장된 목록을 열지 못했습니다.'; }).finally(() => setBusy(false));
