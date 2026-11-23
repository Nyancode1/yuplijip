const japanese=require('../data/tj_catalog.json').songs;
const releases=require('../data/tj_releases.json');
const {key}=require('./matching');

function catalog() {
  if (releases.country!=='JPN') throw Error('TJ 일본곡 번호책이 필요합니다.');
  const readings=new Map(japanese.map(row=>[row.karaoke_numbers.tj,row]));
  return releases.songs.map(([number,title,artist,composer])=>{
    const old=readings.get(number);
    const same=old && key(old.title_primary)===key(title) && key(old.artist_primary)===key(artist);
    return {...(same ? old : {}), karaoke_numbers:{tj:number},title_primary:title,artist_primary:artist,composer};
  });
}
module.exports=catalog;
