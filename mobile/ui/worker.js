importScripts('lib/wanakana.js', 'lib/kuromoji.js', 'youtube.js', 'lib/matching.js');
let ready;
async function prepare() {
  const [songs, tokenizer, loanwords, works, credits] = await Promise.all([
    fetch('catalog.json').then(r => r.json()),
    new Promise((resolve, reject) => kuromoji.builder({ dicPath: 'dict' }).build((err,t) => err ? reject(err) : resolve(t))),
    ...['loanwords.json','work_sources.json','release_credits.json'].map(name=>fetch(name).then(r=>r.json())),
  ]);
  const reading = TJMatching.makeReader(tokenizer);
  return { reading, index: TJMatching.indexCatalog(songs, reading,{loanwords,works,credits}),
    byNumber:new Map(songs.map(row => [row.karaoke_numbers.tj, row])) };
}
self.onmessage = async event => {
  try {
    ready ||= prepare().catch(e => { ready = null; throw e; });
    const { index, reading, byNumber } = await ready;
    const songs = event.data.rows;
    const results=TJMatching.selectPlaylist(songs,index,reading);
    const rows = songs.map((song,i) => {
      const result=results[i];
      const concise = row => ({ number: row.karaoke_numbers.tj, title: row.title_primary, artist: row.artist_primary });
      const saved = song.savedMatch;
      const registered = saved && byNumber.get(String(saved.number));
      const verified = registered && result.status !== '스킵' &&
        typeof saved.title === 'string' && typeof saved.artist === 'string' &&
        TJMatching.key(saved.title) === TJMatching.key(registered.title_primary) &&
        TJMatching.key(saved.artist) === TJMatching.key(registered.artist_primary);
      const matched = result.row || (verified ? registered : undefined);
      return { id: song.id, title: song.title, artist: song.artists?.[0] || '',
        channel: song.uploader || song.channels?.[0] || '',
        art: song.art, private: song.availability === 'private', original: result.status === '원곡 반주' || Boolean(verified && song.original),
        titles:song.titles, tracks:song.tracks, artists:song.artists, description:song.description,
        channels:song.channels, originalVideo:song.originalVideo,
        aliases: [...(song.titles || []), ...(song.artists || []), matched?.title_ko, matched?.artist_ko].filter(Boolean),
        match: matched && concise(matched), candidate: !matched && result.titleCandidate ? concise(result.titleCandidate) : undefined };
    });
    self.postMessage({ rows });
  } catch (error) { self.postMessage({ error: error.message || String(error) }); }
};
