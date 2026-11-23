const PlaylistReader = (() => {
  function localArt(value) {
    return typeof value === 'string' && /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=\s]+$/i.test(value) ? value : '';
  }
  function artwork(value) {
    const embedded = localArt(value);
    if (embedded) return embedded;
    if (typeof value !== 'string' || !value.startsWith('https://') || value.length > 8192) return '';
    try {
      const u = new URL(value);
      if (u.username || u.password || u.port || !/\.(?:ytimg\.com|googleusercontent\.com|ggpht\.com)$/.test(u.hostname)) return '';
      u.hash = '';
      return u.href;
    } catch { return ''; }
  }

  function parse(text, filename) {
    const content = text.replace(/^\uFEFF/, '').trim();
    if (!content) throw Error('빈 곡 목록입니다.');
    let name = filename.replace(/\.[^.]+$/, '') || '내 곡 목록';
    let items;
    if (/\.jsonl$/i.test(filename)) {
      items = content.split(/\r?\n/).filter(s => s.trim()).map(s => JSON.parse(s));
    } else if (/^[{[]/.test(content)) {
      const data = JSON.parse(content);
      items = Array.isArray(data) ? data : data.rows;
      if (typeof data.name === 'string' && data.name.trim()) name = data.name.trim();
    } else {
      items = content.split(/\r?\n/).filter(s => s.trim()).map(s => {
        const [title, artist] = s.split(/\|\|\||\t/);
        return { title, artist };
      });
    }
    if (!Array.isArray(items) || !items.length) throw Error('곡 목록에서 제목을 찾지 못했습니다.');
    return { name, rows:items.map(songInput) };
  }

  const list = v => Array.isArray(v) ? v.filter(t => typeof t === 'string' && t.trim()) : [];
  function songInput(input, i) {
      const row = typeof input === 'string' ? { title: input } : input;
      if (typeof row?.title !== 'string' || !row.title.trim()) throw Error((i + 1) + '번째 곡의 제목이 없습니다.');
      const artist = typeof row.artist === 'string' ? row.artist.trim() : '';
      const uploader = typeof row.uploader === 'string' ? row.uploader.trim() : typeof row.channel === 'string' ? row.channel.trim() : '';
      return { id:typeof row.id === 'string' ? row.id : undefined,
        title:row.title.trim(), artists:[...new Set([...list(row.artists), artist].filter(Boolean))],
        uploader, channels:list(row.channels), titles:list(row.titles), tracks:list(row.tracks),
        description:typeof row.description === 'string' ? row.description : undefined,
          savedMatch:row.match, original:row.original, originalVideo:row.originalVideo &&
            { ...row.originalVideo, id:row.originalVideo.id || (typeof YouTubePlaylist!=='undefined' && YouTubePlaylist.originalVideo(row.description)) || undefined },
        availability:row.private ? 'private' : row.availability, art:artwork(row.art || row.thumbnail || row.thumbnailUrl) };
  }
  function recommendationPool(playlist, revision) {
    const pool = new Map();
    if (playlist?.matchingRevision !== revision) return pool;
    for (const row of playlist.rows || []) {
      const number = String(row.match?.number ?? '');
      if (/^\d{1,8}$/.test(number) && !row.private && !row.parts?.length && row.status !== '스킵' && !pool.has(number))
        pool.set(number, row);
    }
    return pool;
  }

  function drawNumber(pool, history) {
    if (!pool.size) return;
    const seen = new Set(history.filter(number => pool.has(number)));
    let choices = [...pool.keys()].filter(number => !seen.has(number));
    if (!choices.length) {
      const last = history[history.length - 1];
      seen.clear();
      choices = [...pool.keys()].filter(number => pool.size === 1 || number !== last);
    }
    const number = choices[Math.floor(Math.random() * choices.length)];
    return { number, history: [...seen, number] };
  }
  return { parse, artwork, songInput, recommendationPool, drawNumber };
})();
if (typeof module !== 'undefined') module.exports = PlaylistReader;
