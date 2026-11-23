// 번호책 공개 페이지의 일본곡 필터와 페이지 이동을 사용한다.
async function exportAlfexJapan() {
  if (location.origin !== 'https://alfex4936.github.io' || !location.pathname.startsWith('/tj-media-karaoke-api/')) {
    throw Error('Alfex4936 번호책 페이지에서 실행해 주세요.');
  }
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function waitFor(check) {
    for (let i = 0; i < 300; i++) {
      if (check()) return;
      await pause(30);
    }
    throw Error('번호책 검색 화면이 바뀌었거나 로딩이 완료되지 않았습니다.');
  }
  const cards = () => [...document.querySelectorAll('li.row .row-main')];
  const number = card => card.querySelector('.led-digits').textContent.trim();
  const sourceDate = document.querySelector('footer.source')?.textContent.match(/\d{4}\.\d{2}\.\d{2}/)?.[0].replaceAll('.', '-');
  if (!sourceDate) throw Error('번호책 데이터 기준일을 확인하지 못했습니다.');
  const radio = document.querySelector('input[name=nation][value=JPN]');
  radio.click();
  document.querySelector('input[name=scope][value=all]').click();
  const input = document.querySelector('input[type=search]');
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  const rows = [];
  const seen = new Set();
  for (const digit of '0123456789') {
    setValue.call(input, digit);
    input.dispatchEvent(new Event('input', { bubbles:true }));
    // 폼을 제출하기 전에 제어 입력의 상태 업데이트를 기다린다.
    await pause(100);
    input.form.requestSubmit();
    await pause(300);
    await waitFor(() => document.querySelector('input[name=nation]:checked')?.value === 'JPN'
      && document.querySelector('h2')?.textContent.includes('검색 결과'));
    const total = Number(document.querySelector('h2 .total')?.textContent.replace(/[^\d]/g, ''));
    if (!Number.isSafeInteger(total)) throw Error('검색 건수를 확인할 수 없습니다.');
    let visited = 0;
    const hits = new Set();
    while (visited < total) {
      const page = cards();
      if (!page.length) throw Error('검색 결과 행이 비어 있습니다.');
      for (const card of page) {
        const no = number(card);
        if (!/^\d+$/.test(no) || hits.has(no)) throw Error('중복 페이지 또는 잘못된 곡번호 ' + no);
        hits.add(no);
        if (!no.startsWith(digit)) continue;
        if (seen.has(no)) throw Error('중복 번호 ' + no);
        const title = card.querySelector('.row-title')?.textContent.trim();
        const artistNode = card.querySelector('.row-sub > span');
        const artist = artistNode && [...artistNode.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join('').trim();
        if (!title || !artist) throw Error('곡명 또는 가수 누락 ' + no);
        const titleReading = card.querySelector('.row-title + .song-reading')?.textContent.trim();
        const artistReading = card.querySelector('.row-sub .song-reading, .row-sub [lang=ko], .row-sub .artist-reading')?.textContent.trim().replace(/^\(|\)$/g, '');
        rows.push({ number:no, title, artist, titleReading, artistReading });
        seen.add(no);
      }
      visited += page.length;
      if (visited === total) break;
      const next = document.querySelector('button[aria-label="다음 페이지"]');
      if (visited > total || !next || next.disabled) throw Error('표시 건수와 페이지 수가 다릅니다.');
      const first = number(page[0]);
      next.click();
      await waitFor(() => cards().length && number(cards()[0]) !== first);
    }
  }
  if (!rows.length) throw Error('일본곡이 없습니다.');
  rows.sort((a,b) => Number(a.number) - Number(b.number));
  return { source:'https://github.com/Alfex4936/tj-media-karaoke-api', sourceDate, country:'JPN', songs:rows };
}
if (typeof module !== 'undefined') module.exports = exportAlfexJapan;
