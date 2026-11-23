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
  async function load(id, get = request, progress = () => {}) {
    const header = await get('playlists', id);
    if (!header.items[0]) throw Error('플레이리스트를 찾을 수 없습니다. 링크와 공개 설정을 확인해 주세요.');
    const rows = [], seen = new Set();
    let token;
    do {
      const page = await get('playlistItems', id, token);
      const ids = [...new Set(page.items.map(i => i.snippet?.resourceId?.videoId).filter(v => /^[\w-]{11}$/.test(v)))];
      const details = ids.length ? (await get('videos', ids.join(','))).items : [];
      const byId = new Map(details.map(v => [v.id, v.snippet]));
      for (const item of page.items) {
        const s = item.snippet || {}, videoId = s.resourceId?.videoId, video = byId.get(videoId);
        const artwork = s.thumbnails || {};
        rows.push({ id:videoId, title:s.title || video?.title || '재생할 수 없는 영상',
          titles:[video?.title, video?.localized?.title].filter(Boolean), uploader:s.videoOwnerChannelTitle || video?.channelTitle || '',
          description:video?.description, availability:video ? undefined : 'private',
          art:artwork.medium?.url || artwork.default?.url || artwork.high?.url });
      }
      progress(rows.length);
      token = page.nextPageToken;
      if (token && seen.has(token)) throw Error('목록을 끝까지 읽지 못했습니다. 다시 시도해 주세요.');
      seen.add(token);
    } while (token);
    return { name:header.items[0].snippet.title, rows, youtubeId:id, fetchedAt:Date.now() };
  }
  function expired(entry, now = Date.now()) {
    return Boolean(entry.youtubeId && (!entry.fetchedAt || now - entry.fetchedAt >= lifetime));
  }
  return { playlistId, load, expired };
})();
if (typeof module !== 'undefined') module.exports = YouTubePlaylist;
