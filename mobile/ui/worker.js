importScripts('lib/wanakana.js', 'lib/kuromoji.js', 'lib/matching.js');
let ready;
async function prepare() {
  const [songs, tokenizer] = await Promise.all([
    fetch('catalog.json').then(r => r.json()),
    new Promise((resolve, reject) => kuromoji.builder({ dicPath: 'dict' }).build((err,t) => err ? reject(err) : resolve(t))),
  ]);
  const reading = TJMatching.makeReader(tokenizer);
  return { reading, index: TJMatching.indexCatalog(songs, reading) };
}
self.onmessage = async event => {
  try {
    ready ||= prepare().catch(e => { ready = null; throw e; });
    const { index, reading } = await ready;
    const songs = event.data.rows;
    const rows = songs.map(song => {
      const result = TJMatching.selectSong(song, index, reading);
      const concise = row => ({ number: row.karaoke_numbers.tj, title: row.title_primary, artist: row.artist_primary });
      return { id: song.id, title: song.title, artist: song.artists?.[0] || '',
        channel: song.uploader || song.channels?.[0] || '',
        art: song.art, private: song.availability === 'private', original: result.status === '원곡 반주',
        aliases: [...(song.titles || []), ...(song.artists || []), result.row?.title_ko, result.row?.artist_ko].filter(Boolean),
        match: result.row && concise(result.row) };
    });
    self.postMessage({ rows });
  } catch (error) { self.postMessage({ error: error.message || String(error) }); }
};
