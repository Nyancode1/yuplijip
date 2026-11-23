const fs = require('node:fs');

// 같은 ID의 다른 언어 메타데이터만 합치고, 원래 순서와 중복은 보존한다.
function mergeLocales(primary, alternate) {
  const byId = new Map(alternate.filter(row => row.id).map(row => [row.id, row]));
  return primary.map(row => {
    const other = byId.get(row.id);
    const rows = other ? [row, other] : [row];
    const unique = list => [...new Set(list.filter(value => typeof value === 'string' && value.trim()))];
    return {
      id: row.id || '',
      title: row.title,
      uploader: row.uploader || row.channel || '',
      titles: unique(rows.map(r => r.title)),
      tracks: unique(rows.map(r => r.track)),
      artists: unique(rows.flatMap(r => r.artists?.length ? r.artists : [r.artist])),
      channels: unique(rows.flatMap(r => [r.uploader, r.channel])),
      availability: row.availability || '',
    };
  });
}

function loadPlaylist(file) {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
    .map(line => {
      if (line.startsWith('{') && line.endsWith('}')) return JSON.parse(line);
      const split = line.lastIndexOf('|||');
      return split < 0 ? { title: line, uploader: '' } :
        { title: line.slice(0, split).trim(), uploader: line.slice(split + 3).trim() };
    });
}

module.exports = { loadPlaylist, mergeLocales };
