// 공개 작품의 메타데이터만 읽는다. 입력은 TJ 일본곡 번호책과 VocaDB의 평점순 작품 목록이다.
const fs = require('node:fs');
const path = require('node:path');
const {createHash}=require('node:crypto');
const { key, titleParts, artistForms } = require('./matching');
const root = path.resolve(__dirname,'..');
const cache = path.join(root,'mobile/build/work-metadata-v2');
const output = path.join(root,'data/work_sources.json');
const distinct = xs => [...new Set(xs.filter(Boolean))];

// 한자로만 된 원제에 한국 한자음을 부여한다. 중간 글자의 발음이 여러 가지면 추측하지 않는다.
function hanTitleReader() {
  const dir=path.join(root,'mobile/build');
  const readings=new Map(), variants=new Map();
  for (const line of fs.readFileSync(path.join(dir,'Unihan_Readings.txt'),'utf8').split('\n')) {
    const [code,field,values]=line.trim().split('\t');
    if (field==='kHangul' && values && code.startsWith('U+')) readings.set(code,distinct(values.split(' ').map(s=>s.split(':')[0])));
  }
  for (const line of fs.readFileSync(path.join(dir,'Unihan_Variants.txt'),'utf8').split('\n')) {
    const [code,field,value]=line.trim().split('\t');
    if (field==='kTraditionalVariant' && /^U\+[0-9A-F]+$/u.test(value)) variants.set(code,value);
  }
  return title=>{
    if (!/^\p{sc=Han}{3,14}$/u.test(title)) return [];
    let forms=[''];
    for (const c of title) {
      const code='U+'+c.codePointAt(0).toString(16).toUpperCase();
      const syllables=readings.get(code)||readings.get(variants.get(code));
      if (!syllables?.length || syllables.some(s=>!/^[가-힣]$/u.test(s))) return [];
      if (syllables.length>1 && (forms[0] || syllables.length!==2 ||
          (syllables[0].charCodeAt(0)-syllables[1].charCodeAt(0))%588!==0)) return [];
      forms=forms.flatMap(prefix=>syllables.map(s=>prefix+s));
    }
    return forms;
  };
}

async function voicebankKeys() {
  const file=path.join(cache,'vocaloid-names.json');
  if (fs.existsSync(file)) return new Set(JSON.parse(fs.readFileSync(file)));
  const names=new Set();
  for (let start=0,total=1;start<total;start+=100) {
    const args=new URLSearchParams({artistTypes:'Vocaloid',fields:'Names',maxResults:'100',start:String(start),getTotalCount:'true'});
    await new Promise(resolve=>setTimeout(resolve,1200));
    const res=await fetch('https://vocadb.net/api/artists?'+args,{signal:AbortSignal.timeout(30000)});
    if (!res.ok) throw Error('VocaDB voicebanks HTTP '+res.status);
    const data=await res.json();
    total=data.totalCount;
    for (const a of data.items) if (a.artistType==='Vocaloid')
      for (const name of [a.name,...a.names.map(n=>n.value)]) if (name) names.add(key(name));
  }
  fs.writeFileSync(file,JSON.stringify([...names]));
  return names;
}

async function page(type, start) {
  const search=type==='title' || type==='remaster', derived=type==='derived';
  const name=search?createHash('sha256').update(start).digest('hex'):start;
  const file = path.join(cache,type+'-'+name+'.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file));
  const args = new URLSearchParams(derived ? {fields:'Artists,PVs',lang:'Japanese'} :
    {songTypes:type==='remaster'?'Remaster':'Original', sort:'RatingScore', fields:'Names,Artists,PVs', lang:'Japanese',maxResults:'100',
      ...(search?{query:start,nameMatchMode:'Exact'}:{start:String(start)})});
  const url = 'https://vocadb.net/api/songs' + (derived ? '/'+start+'/derived' : '') + '?' + args;
  let error;
  for (let attempt=0; attempt<4; attempt++) {
    await new Promise(ok=>setTimeout(ok,1200 * (attempt+1)));
    try {
      const response = await fetch(url, {
        headers:{'User-Agent':'Yuplijip metadata builder (github.com/Nyancode1/yuplijip)'},
        signal:AbortSignal.timeout(90000) });
      if (!response.ok) throw Error('VocaDB HTTP '+response.status);
      const data = await response.json();
      const items = derived ? data : data.items;
      if (!Array.isArray(items) || (!derived && !search && !items.length)) throw Error('작품 페이지가 비어 있습니다');
      const records = items.filter(w=>!derived || ['Cover','Remix'].includes(w.songType)).map(w=>({ id:w.id,
        vocaloid:w.artists.some(a=>a.artist?.artistType==='Vocaloid' && a.categories?.includes('Vocalist')),
        titles:distinct([w.defaultName,w.name,...(w.names || []).map(n=>n.value)]),
        artists:distinct(w.artists.filter(a=>!a.isSupport && (derived ?
          a.categories?.includes('Vocalist') && ['Utaite','Vocalist','OtherGroup','Band'].includes(a.artist?.artistType) :
          a.categories?.includes('Vocalist') || a.categories==='Circle' ||
          a.categories?.includes('Producer') && /Composer|Arranger|Default/u.test(a.effectiveRoles)))
          .flatMap(a=>[a.name,a.artist?.name,...(a.artist?.additionalNames || '').split(', ')])),
        ids:distinct(w.pvs.filter(p=>p.pvType==='Original' && ['Youtube','NicoNicoDouga'].includes(p.service)).map(p=>p.service+':'+p.pvId)) }));
      fs.writeFileSync(file,JSON.stringify(records));
      return records;
    } catch (e) { error=e; }
  }
  throw error;
}
async function originalWorks() {
  fs.mkdirSync(cache,{recursive:true});
  const records = require('./catalog')().filter(row=>!row.supplement);
  const titles = new Map();
  for (const row of records) {
    const name=key(titleParts(row.title_primary).base);
    const bucket=titles.get(name)||[];
    bucket.push(row); titles.set(name,bucket);
  }
  const works=new Map();
  const voices=await voicebankKeys();
  const originsByTitle=new Map();
  function add(w) {
      for (const title of w.titles) {
        const term=key(title), origins=originsByTitle.get(term)||new Set();
        origins.add(w.id); originsByTitle.set(term,origins);
      }
      const artists=new Set(w.artists.flatMap(artistForms).map(key));
      const matches = new Set(w.titles.flatMap(t=>titles.get(key(t))||[]).filter(row=>{
        const names=[row.artist_primary,row.artist_ko,...(row.composer||'').split(/[,、]/u)].filter(Boolean).flatMap(artistForms).map(key);
        // 같은 보이스뱅크로 발표한 동명곡은 창작자가 다를 수 있다.
        const creators=names.filter(n=>n && !voices.has(n));
        const comparable=w.vocaloid && creators.length ? creators : names;
        return comparable.some(a=>artists.has(a));
      }));
      const primary=[...matches].filter(r=>key(titleParts(r.title_primary).base)===key(w.titles[0]));
      const selected=primary.length===1?primary[0]:matches.size===1?[...matches][0]:undefined;
      if (selected) works.set(w.id,{...w,number:selected.karaoke_numbers.tj});
  }
  for (let start=0;start<5000;start+=100) for (const w of await page('original-v3',start)) add(w);
  const known=new Set([...works.values()].map(w=>w.number));
  const titlesToFind=distinct(records.filter(r=>!known.has(r.karaoke_numbers.tj) &&
    r.artist_primary.split(/[(（)）,、&]/u).some(a=>voices.has(key(a.replace(/^feat\.?\s*/iu,'')))))
    .map(r=>titleParts(r.title_primary).base)).sort();
  for (const title of titlesToFind) {
    const originals=await page('title',title);
    const versions=originals.length ? originals : await page('remaster',title);
    for (const w of versions) if (w.vocaloid) add(w);
  }
  const result=[...works.values()];
  const hanTitles=hanTitleReader(), byHangul=new Map();
  for (const work of result) if (work.vocaloid) {
    work.distinctTitles=work.titles.filter(t=>originsByTitle.get(key(t))?.size===1);
    work.koreanReadings=hanTitles(work.titles[0]);
    for (const term of work.koreanReadings) {
      const set=byHangul.get(term)||new Set();
      set.add(work.id);byHangul.set(term,set);
    }
  }
  for (const work of result) if (work.koreanReadings) work.koreanReadings=work.koreanReadings.filter(t=>
    byHangul.get(t).size===1 && (!originsByTitle.has(t) || originsByTitle.get(t).has(work.id) && originsByTitle.get(t).size===1));
  return result;
}

function addVersions(original,versions) {
  original.coverArtists=distinct(versions.flatMap(v=>v.artists));
  original.ids=distinct([...original.ids,...versions.flatMap(v=>v.ids)]);
}

async function main() {
  const result=await originalWorks();
  // 원곡 고유 ID에 직접 연결된 파생곡만 사용한다.
  const ranked=result;
  for (let i=0;i<ranked.length;i+=3) {
    await Promise.all(ranked.slice(i,i+3).map(async (original,j)=>{
      if (!fs.existsSync(path.join(cache,'derived-'+original.id+'.json'))) await new Promise(ok=>setTimeout(ok,j*1300));
      addVersions(original,await page('derived',original.id));
    }));
  }
  result.sort((a,b)=>a.id-b.id);
  fs.writeFileSync(output,JSON.stringify(result));
  console.log('VocaDB works:',result.length,'video IDs:',result.reduce((n,w)=>n+w.ids.length,0));
}
module.exports={originalWorks,addVersions};
if (require.main===module) main().catch(e=>{console.error(e.message);process.exitCode=1;});
