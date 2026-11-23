const el = id => document.getElementById(id);
const filters = [['전체','all'],['번호 있음','available'],['번호 미확인','unknown']];
let current, lastPlaylist, selected = 'all', entries = [], worker;
let currentId, lastId, pendingDelete, artTarget;
const savedEntries = new Map();
const matchingRevision = 9;
let pickPool = new Map(), pickHistory = [];
const pickSheet = el('recommendation');
const pickStorageKey = id => 'tj-picks:' + id;
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
function trackCredit(row) {
  return row.channel && row.artist && fold(row.channel) !== fold(row.artist) ?
    row.artist + ' · ' + row.channel : row.artist || row.channel || '';
}
function matchLabel(row) {
  if (!row.match) return 'TJ 후보';
  return row.original || row.status === '원곡 반주' ? '같은 곡 TJ' : 'TJ';
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
  if (pickSheet.open) pickSheet.close();
  pickPool = PlaylistReader.recommendationPool(playlist, matchingRevision);
  if (id !== currentId) {
    pickHistory = [];
    if (id) try {
      const saved = JSON.parse(localStorage.getItem(pickStorageKey(id)));
      if (Array.isArray(saved)) pickHistory = saved;
    } catch {}
  }
  el('randomSong').hidden = !pickPool.size;
  current = playlist;
  visibleTitles.disconnect();
  titleSizes.disconnect();
  currentId = id;
  selected = 'all';
  el('search').value = '';
  el('return').hidden = !lastPlaylist || currentId === lastId;
  el('collection').hidden = !playlist;
  el('source').hidden = !playlist?.youtubeId;
  el('rescan').hidden = !playlist?.rows?.length;
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
    const credit = trackCredit(row);
    if (credit) name.append(element('small','',credit));
    const cover = element('button','coverButton');
    cover.type = 'button';
    cover.setAttribute('aria-label', row.title + ' 썸네일 선택');
    cover.append(picture(row)); cover.onclick = () => chooseArt(row);
    song.append(cover,name);
    const displayed = playlist.matchingRevision===matchingRevision && (row.match || row.candidate);
    const tag = element(displayed ? 'button' : 'span','tag');
    if (displayed) {
      const label = matchLabel(row);
      tag.append(element('em','',label),element('b','',displayed.number));
      tag.setAttribute('aria-label', label + ' ' + displayed.number + ' 복사');
      tag.onclick = () => copyNumber(displayed.number);
    } else {
      tag.textContent = row.parts?.length ? '메들리' : row.private || row.status === '스킵' ? '비공개' : '번호 미확인';
    }
    node.append(song,tag); list.append(node);
    const numbers = displayed ? [displayed] : [];
    const text = [row.title, row.artist, row.channel, ...(playlist.matchingRevision===matchingRevision ? row.aliases || [] : []),
      ...numbers.flatMap(m => [m.title, m.artist, 'TJ ' + m.number])].map(fold).join('\n');
    return { node, line, text, available: Boolean(displayed && row.match) };
  });
  const empty = element('p','empty'); empty.id = 'empty'; empty.setAttribute('role','status'); list.append(empty);
  el('tracks').replaceChildren(list);
  el('tools').hidden = false;
  applySearch();
  for (const entry of entries) visibleTitles.observe(entry.line);
}
function copyNumber(number) {
  if (window.Songbook) Songbook.copyNumber(String(number));
  else navigator.clipboard.writeText(String(number));
}
function drawRecommendation() {
  const pick = PlaylistReader.drawNumber(pickPool, pickHistory);
  if (!pick) return;
  pickHistory = pick.history;
  if (currentId) try { localStorage.setItem(pickStorageKey(currentId), JSON.stringify(pickHistory)); } catch {}
  const row = pickPool.get(pick.number);
  el('pickArt').replaceChildren(picture(row));
  el('pickTitle').firstElementChild.textContent = row.title;
  el('pickCredit').textContent = trackCredit(row);
  const number = el('pickNumber'), label = matchLabel(row);
  number.firstElementChild.textContent = label;
  number.lastElementChild.textContent = pick.number;
  number.setAttribute('aria-label', label + ' ' + pick.number + ' 복사');
  number.onclick = () => copyNumber(pick.number);
  el('pickAgain').hidden = pickPool.size < 2;
  if (!pickSheet.open) pickSheet.showModal();
  sizeTitle(el('pickTitle'));
  titleSizes.observe(el('pickTitle'));
}
el('randomSong').onclick = el('pickAgain').onclick = drawRecommendation;
el('closePick').onclick = () => pickSheet.close();
let swipeStart;
pickSheet.onpointerdown = e => {
  if (e.isPrimary && e.pointerType === 'touch') swipeStart = { id:e.pointerId, x:e.clientX, y:e.clientY };
};
pickSheet.onpointerup = e => {
  if (swipeStart?.id !== e.pointerId) return;
  const dy = e.clientY - swipeStart.y, dx = e.clientX - swipeStart.x;
  swipeStart = undefined;
  if (dy > 50 && dy > Math.abs(dx)) pickSheet.close();
};
pickSheet.onpointercancel = () => { swipeStart = undefined; };
pickSheet.onclose = () => {
  swipeStart = undefined;
  if (!pickSheet.open) titleSizes.unobserve(el('pickTitle'));
};
pickSheet.onclick = e => {
  if (e.target !== pickSheet) return;
  const { top, left, right, bottom } = pickSheet.getBoundingClientRect();
  if (e.clientY < top || e.clientY > bottom || e.clientX < left || e.clientX > right) pickSheet.close();
};
window.handleBack = () => {
  if (pickSheet.open) { pickSheet.close(); return true; }
  if (el('policy').open) { el('policy').close(); return true; }
  if (el('books').open) {
    if (el('register').disabled) return true;
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
  el('randomSong').disabled = busy;
  el('bookSearch').disabled = busy;
  el('more').disabled = busy;
  el('register').disabled = busy;
  el('rescan').disabled = busy;
}
function personalBooks() {
  return [...savedEntries.values()].filter(book => !book.removed).sort((a,b) => b.savedAt - a.savedAt);
}
async function readBook(entry) {
  if (YouTubePlaylist.expired(entry)) return fetchBook(entry.youtubeId, entry.savedAt);
  const book = await SongbookLibrary.get(entry.id);
  if (!book?.rows || book.matchingRevision === matchingRevision) return book;
  try { return await rematch(book,entry); } catch { return book; }
}
async function rematch(book,entry) {
  const inputs=book.rows.map((row,i)=>row.parts?.length || !row.title?.trim()
    ? {title:'[Private video]',availability:'private'}
    : {...PlaylistReader.songInput(row,i),savedMatch:undefined});
  const results=await match(inputs);
  if (results.length!==book.rows.length) throw Error('목록을 끝까지 확인하지 못했습니다.');
  const rows=book.rows.map((row,i)=>({...row, match:results[i].match, candidate:results[i].candidate,
    original:results[i].original, aliases:results[i].aliases, status:row.parts?.length ? row.status : undefined}));
  const playlist={...book,rows,matchingRevision};
  savedEntries.set(entry.id,await SongbookLibrary.save(entry.id,playlist,entry.savedAt));
  return playlist;
}
el('rescan').onclick = async () => {
  const entry=savedEntries.get(currentId);
  if (!entry || el('rescan').disabled || !current?.rows) return;
  setBusy(true);
  el('message').textContent='TJ 번호를 다시 찾는 중…';
  const term=el('search').value, filter=selected;
  try {
    const book=YouTubePlaylist.expired(entry) ? await fetchBook(entry.youtubeId,entry.savedAt) :
      await rematch(await YouTubePlaylist.refreshOriginals(current).catch(()=>current),entry);
    if (entry.id===lastId) lastPlaylist=book;
    showPlaylist(book,entry.id);
    selected=filter; el('search').value=term; applySearch();
    el('message').textContent='재탐색 완료 · '+book.rows.length+'곡 중 '+book.rows.filter(r=>r.match).length+'곡에서 TJ 번호를 찾았습니다.';
  } catch (e) { el('message').textContent=e.message || '재탐색하지 못했습니다. 다시 시도해 주세요.'; }
  finally { setBusy(false); }
};
function drawCard(open,book) {
  const covers=book.covers || [];
  const art=element('span','bookArt');
  art.dataset.tiles=String(covers.length);
  art.setAttribute('aria-hidden','true');
  if (covers.length) art.append(...covers.map(url=>picture({art:url})));
  else art.append(element('span','art','♫'));
  const details = element('span','bookDetails');
  details.append(element('strong','bookName',book.name));
  if (Number.isInteger(book.count)) details.append(element('small','bookCount',book.count+'곡'));
  open.replaceChildren(art,details);
}
function drawBooks() {
  const links = el('bookLinks');
  links.replaceChildren();
  const personal = personalBooks();
  const terms = el('bookSearch').value.trim().split(/\s+/u).map(fold).filter(Boolean);
  for (const book of personal) {
      if (!terms.every(term=>fold(book.name).includes(term))) continue;
      const row = element('div','bookRow'), open = element('button','bookOpen');
      drawCard(open,book);
      if (book.count==null && !YouTubePlaylist.expired(book)) SongbookLibrary.get(book.id).then(playlist=>{
        if (open.isConnected && savedEntries.get(book.id)===book) {
          Object.assign(book,SongbookLibrary.preview(playlist)); drawCard(open,book);
        }
      }).catch(()=>{});
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
  if (!links.childElementCount) links.append(element('p','libraryEmpty',personal.length ?
    '일치하는 플레이리스트가 없습니다.' : '저장된 플레이리스트가 없습니다.'));
}
async function changeBook(book, remove) {
  if (el('register').disabled) return;
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
      localStorage.removeItem(pickStorageKey(book.id));
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
  pendingDelete = null; el('bookMessage').textContent = ''; el('bookSearch').value = '';
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
el('bookSearch').oninput = () => { pendingDelete=null; drawBooks(); };
el('bookSearchForm').onsubmit = e => { e.preventDefault(); el('bookSearch').blur(); };
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
    if (book?.rows) localStorage.removeItem(pickStorageKey(entry.id));
    if (lastId === entry.id) lastPlaylist = null;
    if (currentId === entry.id) showPlaylist(null);
  }
}
document.addEventListener('visibilitychange', async () => {
  if (document.hidden || el('register').disabled) return;
  setBusy(true);
  try { await expireBooks(); if (el('books').open) drawBooks(); }
  finally { setBusy(false); }
});
function chooseArt(row) {
  if (el('rescan').disabled) return;
  artTarget = { row, id:currentId, playlist:current };
  el('artFile').click();
}
el('artFile').onchange = async e => {
  const file = e.target.files[0]; e.target.value = '';
  const target = artTarget; artTarget = null;
  if (!file || !target || el('register').disabled) return;
  setBusy(true);
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas'), size = Math.min(bitmap.width, bitmap.height);
    canvas.width = canvas.height = 240;
    canvas.getContext('2d').drawImage(bitmap,(bitmap.width-size)/2,(bitmap.height-size)/2,size,size,0,0,240,240);
    bitmap.close();
    const art = canvas.toDataURL('image/jpeg', .86);
    const updated = { ...target.playlist, rows:target.playlist.rows.map(r=>r===target.row ? {...r,art} : r) };
    savedEntries.set(target.id, await SongbookLibrary.save(target.id, updated));
    if (lastId === target.id) lastPlaylist = updated;
    if (currentId === target.id) showPlaylist(updated, target.id);
  } catch { el('message').textContent = '선택한 이미지를 저장하지 못했습니다.'; }
  finally { setBusy(false); }
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
