const fs = require('node:fs');
const path = require('node:path');
const {titleParts,key} = require('./matching');
const data = path.resolve(__dirname,'../data');

async function main() {
  const [feedFile, dictionaryFile]=process.argv.slice(2);
  if (!dictionaryFile) throw Error('사용법: node src/update_catalog_metadata.js <일본곡 스냅샷 또는 fresh> <JMdict 영어 JSON>');
  let snapshot;
  if (feedFile==='fresh') {
    const {searchNumbers}=require('./update_tj_catalog');
    const songs=[];
    for (let first=0;first<=9;first++) {
      const found=await searchNumbers(String(first),'JPN');
      for (const [number,row] of found) songs.push([number,row.title,row.artist,row.composer]);
    }
    songs.sort((a,b)=>Number(a[0])-Number(b[0]));
    snapshot={country:'JPN',songs};
  } else snapshot=JSON.parse(fs.readFileSync(feedFile));
  if (snapshot.country!=='JPN' || !Array.isArray(snapshot.songs) || !snapshot.songs.length ||
      snapshot.songs.some(([n,t,a])=>!/^\d+$/u.test(n) || !t || !a) ||
      new Set(snapshot.songs.map(r=>r[0])).size!==snapshot.songs.length) throw Error('일본곡 스냅샷을 확인해 주세요.');
  const japanese=require('../data/tj_catalog.json').songs;
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
  for (const [file,obj] of [['tj_releases.json',snapshot],['loanwords.json',aliases]]) {
    const dest=path.join(data,file);
    fs.writeFileSync(dest+'.tmp',JSON.stringify(obj));fs.renameSync(dest+'.tmp',dest);
  }
  console.log('TJ JPN',snapshot.songs.length,'JMdict',dict.dictDate,'loanwords',Object.keys(aliases).length);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
