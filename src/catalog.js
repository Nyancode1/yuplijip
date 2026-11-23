const japanese=require('../data/tj_catalog.json').songs;
const releases=require('../data/tj_releases.json');

function catalog() {
  const rows=new Map(japanese.map(row=>[row.karaoke_numbers.tj,{...row}]));
  for (const [number,title,artist,composer] of releases) {
    const row=rows.get(number);
    if (row) {
      if (row.artist_primary.normalize('NFKC').replace(/\s+/g,'')===artist.normalize('NFKC').replace(/\s+/g,''))
        row.composer=composer;
    } else rows.set(number,{karaoke_numbers:{tj:number},title_primary:title,artist_primary:artist,composer,supplement:true});
  }
  return [...rows.values()];
}
module.exports=catalog;
