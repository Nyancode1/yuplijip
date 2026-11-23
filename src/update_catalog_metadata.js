const fs = require('node:fs');
const path = require('node:path');
const {titleParts,key} = require('./matching');
const data = path.resolve(__dirname,'../data');

async function main() {
  const [feedFile, dictionaryFile]=process.argv.slice(2);
  if (!dictionaryFile) throw Error('사용법: node src/update_catalog_metadata.js <TJ 응답 파일 또는 fresh> <JMdict 영어 JSON>');
  let feed;
  if (feedFile==='fresh') {
    const response=await fetch('https://www.tjmedia.com/legacy/api/newSongOfMonth',{
      method:'POST',body:new URLSearchParams({searchYm:'197001'}),signal:AbortSignal.timeout(90000)});
    if (!response.ok) throw Error('TJ HTTP '+response.status);
    const {resultCode,resultData}=await response.json();
    if (String(resultCode)!=='99' || resultData.items.length!==Number(resultData.itemsTotalCount)) throw Error('TJ 응답 누락');
    feed=resultData.items;
  } else feed=JSON.parse(fs.readFileSync(feedFile));
  if (feed.length<50000 || new Set(feed.map(r=>r.pro)).size!==feed.length) throw Error('불완전하거나 중복된 TJ 피드');
  const monthly=feed.filter(r=>r.indexTitle?.trim() && r.indexSong?.trim()).map(r=>
    [String(r.pro),r.indexTitle.trim(),r.indexSong.trim(),r.com?.trim() || '']).sort((a,b)=>Number(a[0])-Number(b[0]));
  const japanese=require('../data/tj_catalog.json').songs;
  const combined=new Map(monthly.map(r=>[r[0],r]));
  const missing=japanese.filter(r=>{
    const current=combined.get(r.karaoke_numbers.tj);
    return !current?.[3] || key(current[2])!==key(r.artist_primary);
  });
  const {searchNumbers}=require('./update_tj_catalog');
  for (const [prefix,group] of Map.groupBy(missing,r=>r.karaoke_numbers.tj.slice(0,2))) {
    const wanted=new Set(group.map(r=>r.karaoke_numbers.tj));
    const found=await searchNumbers(prefix,'JPN',wanted);
    for (const row of group) {
      const number=row.karaoke_numbers.tj, official=found.get(number);
      if (official?.composer && key(official.title)===key(row.title_primary) && key(official.artist)===key(row.artist_primary))
        combined.set(number,[number,official.title,official.artist,official.composer]);
    }
  }
  const songs=[...combined.values()].sort((a,b)=>Number(a[0])-Number(b[0]));
  const chunks=s=>s.normalize('NFKC').match(/[\p{sc=Katakana}ー・]+/gu)||[];
  const needed=new Set(japanese.flatMap(r=>chunks(titleParts(r.title_primary).base)).map(key));
  const dict=JSON.parse(fs.readFileSync(dictionaryFile));
  const loanwords={};
  for (const word of dict.words) {
    const sense=word.sense[0];
    const gloss=sense?.gloss?.[0]?.text.replace(/\s*\([^()]*\)\s*$/u,'').trim();
    if (!gloss || !/^[a-z][a-z '-]{1,48}$/iu.test(gloss) || sense.languageSource?.some(s=>s.wasei)) continue;
    for (const kana of word.kana) {
      if (!/^[\p{sc=Katakana}ー・]+$/u.test(kana.text) || !needed.has(key(kana.text))) continue;
      const k=key(kana.text);
      (loanwords[k] ||= new Set()).add(gloss);
    }
  }
  // 복수의 서로 다른 사전 표제에 대응하는 가타카나는 단일 영어 별칭으로 만들지 않는다.
  const aliases=Object.fromEntries(Object.entries(loanwords).filter(([,v])=>v.size===1).map(([k,v])=>[k,[...v][0]]));
  for (const [file,obj] of [['tj_releases.json',songs],['loanwords.json',aliases]]) {
    const dest=path.join(data,file);
    fs.writeFileSync(dest+'.tmp',JSON.stringify(obj));fs.renameSync(dest+'.tmp',dest);
  }
  console.log('TJ',songs.length,'JMdict',dict.dictDate,'loanwords',Object.keys(aliases).length);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
