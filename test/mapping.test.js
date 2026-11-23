const { before, test } = require('node:test');
const assert = require('node:assert/strict');
const { createReader, indexCatalog, selectSong, addSavedAliases } = require('../src/tj_search');
const { mergeLocales } = require('../src/playlist');
const mobilePlaylist = require('../mobile/ui/playlist');
const youtube = require('../mobile/ui/youtube');

test('공유 링크의 목록 ID만 사용하고 외부 호스트 및 영상 단독 링크는 거절한다', () => {
  assert.equal(youtube.playlistId('https://music.youtube.com/playlist?list=PL_example&si=tracking'), 'PL_example');
  assert.equal(youtube.playlistId('https://youtu.be/aaaaaaaaaaa?list=PL_example'), 'PL_example');
  for (const link of ['https://youtube.com.example.org/playlist?list=PL_ok','https://www.youtube.com/watch?v=abcdefghijk','http://music.youtube.com/?list=PL_ok'])
    assert.throws(() => youtube.playlistId(link));
});

test('공식 응답을 페이지 끝까지 읽고 영상 ID로 원제와 설명을 연결하며 중복과 비공개 자리를 보존한다', async () => {
  const a = 'a'.repeat(11), b = 'b'.repeat(11), missing = 'c'.repeat(11), calls = [];
  const item = id => ({snippet:{title:id, resourceId:{videoId:id}, videoOwnerChannelTitle:'채널'}});
  const get = async (resource, id, page) => {
    calls.push([resource, id, page]);
    if (resource === 'playlists') return {items:[{snippet:{title:'내 플리'}}]};
    if (resource === 'videos') return {items:id.split(',').filter(i => i !== missing).reverse().map(i => ({
      id:i, snippet:{title:i, localized:{title:'원제 ' + i}, description:'원곡 설명'},
    }))};
    return page ? {items:[item(a), item(missing)]} : {items:[item(a),item(b)], nextPageToken:'p2'};
  };
  const book = await youtube.load('PL_test', get);
  assert.deepEqual(book.rows.map(r => r.id), [a,b,a,missing]);
  assert.equal(book.rows[0].titles[1], '원제 ' + a);
  assert.equal(book.rows[0].description, '원곡 설명');
  assert.equal(book.rows[3].availability, 'private');
  assert.equal(calls.filter(r => r[0] === 'playlistItems').length, 2);
  assert.equal(youtube.expired(book, book.fetchedAt + 29 * 86400000), false);
  assert.equal(youtube.expired(book, book.fetchedAt + 30 * 86400000), true);
  await assert.rejects(youtube.load('PL_test', (r, id, page) => {
    if (page) throw Error('quotaExceeded');
    return get(r, id, page);
  }), /quotaExceeded/);
});

test('한국어 커버의 설명에 원제만 있으면 일본어 제목을 검색하되 원곡 가수까지 확정하지 않는다', () => {
  const songs = [row('73','星の手紙','虹')];
  const result = match({title:'별의 편지 커버', description:'원제: 星の手紙'}, songs);
  assert.equal(result.row, undefined);
  assert.equal(result.titleCandidate?.karaoke_numbers.tj, '73');
});

let read;
before(async () => { read = await createReader(); });

function row(number, title, artist, extra = {}) {
  return { karaoke_numbers: { tj: number }, title_primary: title, artist_primary: artist, ...extra };
}

function match(input, rows) {
  return selectSong(input, indexCatalog(rows, read), read);
}

test('커버의 괄호 안 원제와 가수 쌍이 유일해야 원곡 반주를 제시한다', () => {
  const rows = [row('43', '青空', '花子'), row('44', '青空', '虹'), row('45', '飛行艇', 'Band')];
  for (const title of ['푸른 하늘 [青空 / 花子] / 홍길동 Cover', '푸른 하늘(花子 - 青空)ㅣ홍길동 Cover']) {
    const result = match({ title }, rows);
    assert.equal(result.status, '원곡 반주');
    assert.equal(result.row.karaoke_numbers.tj, '43');
  }
  for (const title of ['푸른 하늘 [青空 / 다른 가수] / 커버', '메들리 [青空 / 花子] Cover',
    '두 곡 [青空 / 花子] [飛行艇 / Band] Cover']) {
    assert.equal(match({ title }, rows).row, undefined);
  }
});

test('기존 유튜브 목록의 원문과 중복을 유지하며 제목과 업로더가 일치할 때만 다국어 제목을 빌린다', () => {
  const song = { title: 'Blue Morning', uploader: 'Singer A - Topic' };
  const other = { title: 'Blue Morning', uploader: 'Singer C' };
  const live = { title: 'Blue Morning (Live)', uploader: 'Singer A' };
  const inputs = [other, song, live, song];
  const metadata = [
    { id: 'b', title: '朝 - Blue Morning', titles: ['朝'], artists: ['Singer B'] },
    { id: 'a', title: '青い朝 - Blue Morning', titles: ['青い朝'], artists: ['Singer A'] },
  ];
  const enriched = addSavedAliases(inputs, metadata);
  assert.deepEqual(enriched.map(({ title, uploader }) => ({ title, uploader })), inputs);
  assert.equal(enriched[0], other);
  assert.equal(enriched[2], live);
  assert.equal(enriched[1].id, undefined);
  assert.deepEqual(enriched[1], enriched[3]);
  assert.equal(match(enriched[1], [row('11', '青い朝', 'Singer A')]).row.karaoke_numbers.tj, '11');
  assert.equal(addSavedAliases([song], [...metadata, { ...metadata[1], id: 'c' }])[0], song);
});

test('새 곡의 한자 제목을 로마자 입력으로 찾아 같은 이름의 다른 가수와 구분한다', () => {
  const songs = [row('99', '秘密の約束', 'Singer A'), row('98', '秘密の約束', 'Singer B')];
  const result = match({ title: 'Himitsu no Yakusoku', uploader: 'Singer B - Topic' }, songs);
  assert.equal(result.row.karaoke_numbers.tj, '98');
  assert.equal(match({ title: 'ひみつのやくそく', uploader: 'Singer A' }, songs).row.karaoke_numbers.tj, '99');
});

test('서로 번역 관계인 두 표기는 영상 ID로 연결한다. 항목 순서와 중복은 보존한다', () => {
  const a = { id: 'a', title: 'Daybreak', artist: 'Some Artist' };
  const b = { id: 'b', title: 'Daybreak', artist: 'Another Artist' };
  const songs = mergeLocales([a, b, a], [
    { id: 'b', title: '朝の秘密', artist: '別人' }, { id: 'a', title: '星の手紙', artist: '歌手' },
    { id: 'extra', title: '無関係', artist: '歌手' },
  ]);
  assert.deepEqual(songs.map(s => s.id), ['a', 'b', 'a']);
  assert.deepEqual(songs[0].titles, ['Daybreak', '星の手紙']);
  const found = match(songs[0], [row('42', '星の手紙', '歌手'), row('41', 'Daybreak', 'Another Artist')]);
  assert.equal(found.row.karaoke_numbers.tj, '42');
});

test('가수가 충돌하거나 곡명이 일부분만 같으면 확정하지 않는다', () => {
  assert.equal(match({ title: 'No Regret', uploader: 'wacci' },
    [row('1', 'No Regret', '倖田來未')]).status, '확인 필요');
  assert.equal(match({ title: 'DIE (feat. KZHI)', uploader: 'KOTA' },
    [row('2', 'die die die', 'KOTA')]).status, '목록에서 못 찾음');
  assert.equal(match({ title: 'W / X / Y', uploader: 'Band' }, [row('3', 'W', 'Band')]).row, undefined);
});

test('재녹음은 같은 버전을 우선하고, 원제·가수가 같은 유일한 일반 반주를 구분해 표시한다', () => {
  const original = row('11', '夏の手紙', 'Singer');
  const recorded = row('12', '夏の手紙 (再録)', 'Singer');
  const song = { title: '夏の手紙 (Re-Recording) - Summer Letter (Re-Recording)',
    titles: ['夏の手紙 (Re-Recording)'], artists: ['Singer'] };
  const fallback = match(song, [original]);
  assert.equal(fallback.status, '원곡 반주');
  assert.equal(fallback.row.karaoke_numbers.tj, '11');
  const exact = match(song, [original, recorded]);
  assert.equal(exact.status, '자동 확정');
  assert.equal(exact.row.karaoke_numbers.tj, '12');
  assert.equal(match(song, [original, { ...original, karaoke_numbers: { tj: '13' } }]).row, undefined);
  assert.equal(match({ ...song, artists: ['Other'] }, [original]).row, undefined);
  assert.equal(match({ title: 'Natsu no Tegami - Re-Recording', artists: ['Singer'] }, [original]).row, undefined);
  assert.equal(match(song, [row('14', '夏の手紙 (Live)', 'Singer')]).row, undefined);
});

test('원곡 크레딧이 있는 커버만 자동 확정한다', () => {
  const rows = [row('51', '未知の星', '作曲者'), row('52', '未知の星', 'カバー歌手')];
  assert.equal(match({ title: '「未知の星(미지의 별) / 作曲者」 | Cover by X', uploader: 'カバー歌手' },
    rows).row.karaoke_numbers.tj, '51');
  const unknown = match({ title: '「未知の星」 | X Cover', artists: ['カバー歌手'] }, rows);
  assert.equal(unknown.status, '확인 필요');
  assert.equal(unknown.candidates.length, 2);
});

test('일반 영상은 가수와 일치하는 구분자 양쪽 및 인용 제목을 읽는다', () => {
  const rows = [row('11', 'One / Two', 'Band')];
  for (const title of ['Band - One / Two [MV]', 'One / Two / Band', 'Band「One / Two」Official Music Video']) {
    assert.equal(match({ title, uploader: 'Band Official Channel' }, rows).row?.karaoke_numbers.tj, '11');
  }
});

test('배급사 채널 영상은 MV 앞의 가수와 인용된 곡명이 TJ의 같은 행과 일치해야 한다', () => {
  const songs = [row('71','春の果て','歌手A'), row('72','春の果て','歌手B')];
  const song = { title:'歌手A MV 『春の果て』', uploader:'배급사 채널' };
  assert.equal(match(song, songs).row?.karaoke_numbers.tj, '71');
  assert.equal(match({ ...song, title:'다른 가수 MV 『春の果て』' }, songs).row, undefined);
  assert.equal(match({ ...song, title:'歌手A MV 『春の果て』 Cover' }, songs).row, undefined);
});

test('한국어 설명과 기호 사이에 적힌 원제·가수는 한 쌍으로 대조한다', () => {
  const songs = [row('12', '風の音', 'Band'), row('13', '風の音', 'Other')];
  for (const title of ['Band - 바람 소리（風の音）｜ 가수 Cover', '바람 소리【風の音】 – Band / 가수 cover',
    '바람 소리 [風の音ㅣBand] / 가수 커버']) {
    assert.equal(match({ title }, songs).row?.karaoke_numbers.tj, '12');
  }
  assert.equal(match({ title:'바람 소리 Cover', description:'Original：Band「風の音」' }, songs).row?.karaoke_numbers.tj, '12');
  assert.equal(match({ title:'바람 소리 Cover', description:'가사: Band「風の音」' }, songs).row, undefined);
  const text = { title:'바람 소리(風の音) | 가수 Cover' };
  assert.equal(match(text, songs).titleCandidate, undefined);
  assert.equal(match(text, songs.slice(0,1)).row, undefined);
  assert.equal(match(text, songs.slice(0,1)).titleCandidate?.karaoke_numbers.tj, '12');
});

test('명시된 버전이 다르거나 같은 근거로 번호가 둘이면 확인 대상으로 둔다', () => {
  const rows = [row('1', 'Sky', 'Night'), row('2', 'Sky (Live ver.)', 'Night')];
  assert.equal(match({ title: 'Sky - Live version', uploader: 'Night' }, rows).row.karaoke_numbers.tj, '2');
  assert.equal(match({ title: 'Sky (Acoustic Version)', uploader: 'Night' }, rows).status, '확인 필요');
  assert.equal(match({ title: 'Sky', uploader: 'Night' }, [...rows, row('3', 'Sky (アニメ ED)', 'Night')]).status, '확인 필요');
});

test('가수가 없는 제목, 비공개 영상, 자동 번역으로 표시된 외부 별칭을 확정하지 않는다', () => {
  const songs = [row('4', 'かなた', 'Band', { title_ko: '먼 저편', title_ko_source: 'llm-translated' })];
  assert.equal(match({ title: 'かなた' }, songs).status, '확인 필요');
  assert.equal(match({ title: '[Private video]' }, songs).status, '스킵');
  assert.equal(match({ title: '먼 저편', uploader: 'Band' }, songs).row, undefined);
});

test('같은 가수라도 뜻이 다른 한자 제목의 발음만으로 자동 확정하지 않는다', () => {
  const result = match({ title: '恋', uploader: 'Band' }, [row('1', '鯉', 'Band', { title_ruby: 'コイ' })]);
  assert.equal(result.status, '확인 필요');
});

test('기기 곡 목록은 제목과 가수, 순서 및 중복을 보존한다', () => {
  const file = mobilePlaylist.parse('星|||Band\n海\tVocal\n星|||Band', '내 목록.txt');
  assert.equal(file.name, '내 목록');
  assert.deepEqual(file.rows.map(row => [row.title, ...row.artists]), [['星','Band'],['海','Vocal'],['星','Band']]);
  assert.throws(() => mobilePlaylist.parse('{"rows":[]}', 'empty.json'));
});

test('가타카나 외래어 변형은 가수가 같아야 하며 정확한 원제가 우선한다', () => {
  const v = row('16', 'ラヴレター', 'Artist A');
  const b = row('17', 'ラブレター', 'Artist A');
  const input = { title: 'ラブレター [Karaoke]', artists: ['Artist A'] };
  assert.equal(match(input, [v]).row.karaoke_numbers.tj, '16');
  assert.equal(match(input, [v, b]).row.karaoke_numbers.tj, '17');
  assert.equal(match({ ...input, artists: ['Artist B'] }, [v]).status, '확인 필요');
});

test('채널의 공동 명의와 일치하는 저장된 영상에서만 현지화 제목을 얻는다', () => {
  const input = { title: 'Sea Breeze', uploader: 'Singer / Singer with Group' };
  const snapshot = [{ id: 'a', title: '潮風 - Sea Breeze', titles: ['潮風'], artists: ['Singer with Group'] }];
  const [joined] = addSavedAliases([input], snapshot);
  assert.equal(joined.artworkId, 'a');
  assert.equal(match(joined, [row('4', '潮風', 'Singer with Group')]).row.karaoke_numbers.tj, '4');
  const other = { ...input, uploader: 'Channel / Singer with Group' };
  assert.equal(addSavedAliases([other], snapshot)[0], other);
});

test('곡 목록은 기기 이미지와 저장된 썸네일 주소만 허용한다', () => {
  const input = [{title:'A', artist:'Band', art:'data:image/png;base64,aGVsbG8='},
    {title:'B', art:'https://example.org/cover.jpg'}];
  const { rows } = mobilePlaylist.parse(input.map(row => JSON.stringify(row)).join('\n'), 'songs.jsonl');
  assert.equal(rows[0].art, input[0].art);
  assert.equal(rows[1].art, '');
  assert.equal(mobilePlaylist.artwork('data:image/svg+xml;base64,aGVsbG8='), '');
  assert.equal(mobilePlaylist.artwork('https://i.ytimg.com/vi/example/1.jpg'), 'https://i.ytimg.com/vi/example/1.jpg');
  assert.equal(mobilePlaylist.artwork('https://i.ytimg.com.example.org/cover.jpg'), '');
});

test('같은 목록의 다른 영상에서는 작품 표기만 빌리고 원본 영상과 버전을 지킨다', () => {
  const video = { id: 'original', title: 'Coast', uploader: 'Band', art: 'original.jpg' };
  const song = { id: 'album', title: '海辺 - Coast', titles: ['海辺'], artists: ['Band'] };
  const enrich = references => addSavedAliases([video], references, { compareVideos: true })[0];
  const joined = enrich([song]);
  assert.equal(joined.id, video.id);
  assert.equal(joined.art, video.art);
  assert.equal(joined.artworkId, undefined);
  assert.ok(joined.titles.includes('海辺'));
  assert.equal(enrich([song, { ...song, id: 'other' }]), video);
  assert.equal(enrich([{ ...song, artists: ['Another Band'] }]), video);
  assert.equal(enrich([{ ...song, titles: ['海辺','Coast (Live Ver.)'] }]), video);
  assert.equal(enrich([{ ...song, titles: ['海辺','Coast (Cover)'] }]), video);
});
