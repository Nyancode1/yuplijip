// TJ 번호책의 가수 → 일본어 위키백과의 가수 항목 → Wikidata의 해당 가수가 부른 작품.
const fs=require('node:fs'), path=require('node:path'), {createHash}=require('node:crypto');
const {key,titleParts,artistForms}=require('./matching');
const catalog=require('../data/tj_catalog.json').songs;
const dir=path.resolve(__dirname,'../mobile/build/wikidata');
const headers={'User-Agent':'Yuplijip/1.5 (https://github.com/Nyancode1/yuplijip)'};
const distinct=items=>[...new Set(items.filter(Boolean))];
async function json(url) {
  const file=path.join(dir,createHash('sha256').update(url).digest('hex')+'.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file));
  let last;
  for (let tryNo=1;tryNo<=4;tryNo++) {
    await new Promise(r=>setTimeout(r,1000*tryNo));
    try {
      const res=await fetch(url,{headers,signal:AbortSignal.timeout(60000)});
      if (!res.ok) throw Error('HTTP '+res.status);
      const data=await res.json();
      if (data.error) throw Error(data.error.info);
      fs.writeFileSync(file,JSON.stringify(data));return data;
    } catch (e) {last=e;}
  }
  throw last;
}
async function main() {
  fs.mkdirSync(dir,{recursive:true});
  const artists=new Map(),groups=new Map(),out=[];
  for (const row of catalog) {
    const [name]=artistForms(row.artist_primary);
    if (!name || /[[\]{}|#<>]/u.test(name)) continue;
    const songs=artists.get(name)||[];
    songs.push(row);artists.set(name,songs);
  }
  const requested=new Map();
  for (const [name,songs] of artists) if (songs.length>=2) {
    requested.set(name,name);
    if (/^[A-Za-z -]+$/u.test(name)) requested.set(name+' (歌手)',name);
  }
  const names=[...requested.keys()].sort();
  for (let i=0;i<names.length;i+=50) {
    const batch=names.slice(i,i+50);
    const query=new URLSearchParams({action:'query',format:'json',prop:'pageprops',ppprop:'wikibase_item|disambiguation',redirects:'1',titles:batch.join('|')});
    const {pages,redirects=[],normalized=[]}=(await json('https://ja.wikipedia.org/w/api.php?'+query)).query;
    const redirect=new Map([...normalized,...redirects].map(x=>[x.from,x.to]));
    for (const original of batch) {
      let name=original;
      for (let depth=0;depth<5 && redirect.has(name);depth++) name=redirect.get(name);
      const page=Object.values(pages).find(p=>p.title===name),id=page?.pageprops?.wikibase_item;
      if (!/^Q\d+$/u.test(id||'') || page.pageprops.disambiguation!==undefined) continue;
      const rows=groups.get(id)||new Set();
      for (const r of artists.get(requested.get(original))) rows.add(r);
      groups.set(id,rows);
    }
  }
  const ids=[...groups.keys()].sort();
  console.log('Wikidata artists',ids.length);
  for(let i=0;i<ids.length;i+=20){
    const values=ids.slice(i,i+20).map(q=>'wd:'+q).join(' ');
    const query='SELECT DISTINCT ?artist ?item ?ja ?name ?singer WHERE { VALUES ?artist { '+values+' } '+
      '?item wdt:P175 ?artist; wdt:P31 ?kind; rdfs:label ?ja . FILTER(lang(?ja)="ja") '+
      'VALUES ?kind { wd:Q7366 wd:Q134556 wd:Q7302866 wd:Q105543609 wd:Q921048 } '+
      '?item (rdfs:label|skos:altLabel) ?name . FILTER(lang(?name) IN ("en","ko","ja")) '+
      '?artist rdfs:label ?singer . FILTER(lang(?singer) IN ("en","ja","ko")) }';
    const data=await json('https://query.wikidata.org/sparql?'+new URLSearchParams({format:'json',query}));
    const items=new Map();
    for(const b of data.results.bindings){
      const artist=b.artist.value.split('/').pop(), qid=b.item.value.split('/').pop();
      const jp=b.ja.value.replace(/(?:\s+\([^()]*の(?:曲|楽曲)\))$/u,'');
      const matches=[...groups.get(artist)].filter(r=>key(titleParts(r.title_primary).base)===key(jp));
      if(matches.length!==1)continue;
      const number=matches[0].karaoke_numbers.tj,id=number+'/'+qid;
      const item=items.get(id)||{number,qid,titles:new Set(),artists:new Set()};
      item.titles.add(b.name.value.replace(/\s+\((?:[^()]*\s)?(?:song|single)\)$/iu,''));
      item.artists.add(b.singer.value);items.set(id,item);
    }
    for(const item of items.values())out.push({...item,titles:distinct([...item.titles]),artists:[...item.artists],ids:[]});
  }
  const credits=new Map(require('./catalog')().filter(r=>!r.supplement).map(r=>[r.karaoke_numbers.tj,
    (r.composer||'').split(/[,、]/u).map(key)]));
  const byItem=Map.groupBy(out,r=>r.qid);
  const itemIds=[...byItem.keys()].sort();
  for(let i=0;i<itemIds.length;i+=100) {
    const values=itemIds.slice(i,i+100).map(q=>'wd:'+q).join(' ');
    const query='SELECT DISTINCT ?item ?ja ?name WHERE { VALUES ?item { '+values+' } '+
      '?item wdt:P86 ?composer . ?composer rdfs:label ?ja, ?name . FILTER(lang(?ja)="ja" && lang(?name) IN ("ja","en","ko")) }';
    const data=await json('https://query.wikidata.org/sparql?'+new URLSearchParams({format:'json',query}));
    for(const b of data.results.bindings) for(const work of byItem.get(b.item.value.split('/').pop())||[]) {
      if(credits.get(work.number)?.includes(key(b.ja.value)))
        work.composers=distinct([...(work.composers||[]),b.name.value]);
    }
  }
  fs.writeFileSync(path.resolve(__dirname,'../data/recording_aliases.json'),JSON.stringify(out));
  console.log('Wikidata works:',out.length);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
