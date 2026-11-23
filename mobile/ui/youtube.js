const YouTubePlaylist = (() => {
  const lifetime = 30 * 24 * 60 * 60 * 1000;
  function playlistId(link) {
    let url;
    try { url = new URL(link.trim()); } catch {}
    const id = url?.searchParams.get('list') || '';
    if (url?.protocol !== 'https:' || url.port || url.username || url.password ||
        !['youtube.com','www.youtube.com','music.youtube.com','m.youtube.com','youtu.be'].includes(url.hostname) ||
        !/^[A-Za-z0-9_-]{2,128}$/.test(id)) throw Error('유튜브 또는 유튜브 뮤직의 플레이리스트 링크를 입력해 주세요.');
    return id;
  }
  async function request(resource, id, token) {
    const query = new URLSearchParams({ id });
    if (token) query.set('pageToken', token);
    let res;
    try { res = await fetch('youtube/' + resource + '?' + query, { cache:'no-store' }); } catch {}
    if (!res) throw Error('인터넷 연결을 확인하고 다시 시도해 주세요.');
    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data.items)) return data;
    if (['quotaExceeded','dailyLimitExceeded','rateLimitExceeded','userRateLimitExceeded'].includes(data.reason) || res.status === 429)
      throw Error('YouTube 조회 한도에 도달했습니다. 나중에 다시 시도해 주세요.');
    if (res.status === 404 || ['playlistItemsNotAccessible','playlistForbidden','playlistNotFound'].includes(data.reason))
      throw Error('이 플레이리스트를 열 수 없습니다. 링크와 공개 설정을 확인해 주세요.');
    if (res.status === 403 || data.reason === 'keyMissing') throw Error('앱의 YouTube API 연결 설정을 확인해야 합니다.');
    throw Error('YouTube에서 목록을 받지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.');
  }
  function originalVideo(description) {
    const lines = (description || '').split(/\r?\n/);
    const ids = new Set();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!/^[^\p{L}\p{N}]*(?:original(?:\s+(?:song|music|work|video))?\b|원곡(?:자|\s*영상)?|(?:ご|御)?本家(?:様)?|原曲)(?=[^\p{L}\p{N}]|$)/iu.test(line)) continue;
      let block = line;
      // 크레딧 아래의 URL 줄만 읽어 다음 가수나 홍보 링크를 섞지 않는다.
      for (let j=i+1;j<Math.min(i+5,lines.length);j++) {
        const next=lines[j].trim();
        if (!next) continue;
        if (!/^(?:(?:유튜브|youtube|니코동|니코니코)(?:\s*(?:투고|업로드|영상))?\s*[:：]\s*)?https?:\/\//iu.test(next)) break;
        block += ' ' + next;
      }
      for (const m of block.matchAll(/https?:\/\/[^\s<>"「」]+/giu)) {
        let url;
        try { url = new URL(m[0]); } catch { continue; }
        const host = url.hostname;
        if (url.username || url.password || url.port) continue;
        const id = host === 'youtu.be' ? url.pathname.slice(1) :
          ['youtube.com','www.youtube.com','music.youtube.com','m.youtube.com'].includes(host) &&
          url.pathname === '/watch' ? url.searchParams.get('v') : '';
        if (/^[\w-]{11}$/.test(id)) ids.add(id);
      }
    }
    return ids.size === 1 ? [...ids][0] : undefined;
  }
  const titlesOf = item => [...new Set([item?.snippet?.title, item?.snippet?.localized?.title,
    item?.localizations?.ja?.title, item?.localizations?.ko?.title].filter(Boolean))];

  async function load(id, get = request, progress = () => {}) {
    const header = await get('playlists', id);
    if (!header.items[0]) throw Error('플레이리스트를 찾을 수 없습니다. 링크와 공개 설정을 확인해 주세요.');
    const rows = [], seen = new Set(), videos = new Map();
    let token;
    do {
      const page = await get('playlistItems', id, token);
      const ids = [...new Set(page.items.map(i => i.snippet?.resourceId?.videoId).filter(v => /^[\w-]{11}$/.test(v)))];
      const details = ids.length ? (await get('videos', ids.join(','))).items : [];
      for (const v of details) videos.set(v.id, v);
      for (const item of page.items) {
        const s = item.snippet || {}, videoId = s.resourceId?.videoId, metadata = videos.get(videoId), video = metadata?.snippet;
        const artwork = s.thumbnails || {};
        rows.push({ id:videoId, title:s.title || video?.title || '재생할 수 없는 영상',
          titles:titlesOf(metadata), uploader:s.videoOwnerChannelTitle || video?.channelTitle || '',
          description:video?.description, availability:video ? undefined : 'private',
          art:artwork.medium?.url || artwork.default?.url || artwork.high?.url });
      }
      progress(rows.length);
      token = page.nextPageToken;
      if (token && seen.has(token)) throw Error('목록을 끝까지 읽지 못했습니다. 다시 시도해 주세요.');
      seen.add(token);
    } while (token);
    const originalIds = [...new Set(rows.map(s => originalVideo(s.description)).filter(ref => ref && !videos.has(ref)))];
    for (let i=0;i<originalIds.length;i+=50) {
      const result=await get('videos', originalIds.slice(i,i+50).join(','));
      for (const v of result.items) videos.set(v.id,v);
    }
    const channels=new Map();
    const channelIds=[...new Set([...videos.values()].map(v=>v.snippet?.channelId).filter(id=>/^UC[\w-]{22}$/.test(id)))];
    for (let i=0;i<channelIds.length;i+=50) {
      const result=await get('channels',channelIds.slice(i,i+50).join(','));
      for (const c of result.items) channels.set(c.id,titlesOf(c));
    }
    for (const row of rows) {
      row.channels=channels.get(videos.get(row.id)?.snippet?.channelId) || [];
      const ref=originalVideo(row.description), original=videos.get(ref);
      if (ref !== row.id && original) row.originalVideo={title:original.snippet.title, titles:titlesOf(original),
        uploader:original.snippet.channelTitle, channels:channels.get(original.snippet.channelId) || []};
    }
    return { name:header.items[0].snippet.title, rows, youtubeId:id, fetchedAt:Date.now() };
  }
  function expired(entry, now = Date.now()) {
    return Boolean(entry.youtubeId && (!entry.fetchedAt || now - entry.fetchedAt >= lifetime));
  }
  return { playlistId, load, expired, originalVideo };
})();
if (typeof module !== 'undefined') module.exports = YouTubePlaylist;
