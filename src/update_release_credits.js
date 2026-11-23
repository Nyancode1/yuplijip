// 배포 전 공개 음원 표기만 수집한다. 플레이리스트 행이나 TJ 정답 번호는 입력하지 않는다.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { key, titleParts, artistForms } = require('./matching');
const root = path.resolve(__dirname, '..');
const cache = path.join(root, 'mobile/build/release-credits');
const seeds = require('../data/credit_sources.json');
const base = title => key(titleParts(title).base.replace(/\s*\([^()]*\bfrom\b[^()]*\)\s*$/iu, ''));
const titles = new Map();
for(const row of require('./catalog')().filter(r=>!r.supplement)){
  const t=base(row.title_primary);
  titles.set(t,[...(titles.get(t)||[]),row]);
}
const wait = n => new Promise(resolve=>setTimeout(resolve,n));
let lastStoreRequest = 0;
async function download(url) {
  const name = path.join(cache, createHash('sha256').update(url).digest('hex'));
  if (fs.existsSync(name)) return fs.readFileSync(name,'utf8');
  for(let attempt=0;attempt<3;attempt++) {
    if(url.startsWith('https://itunes.apple.com/')) {
      await wait(Math.max(0,3100-(Date.now()-lastStoreRequest)));
      lastStoreRequest=Date.now();
    }
    const response=await fetch(url,{signal:AbortSignal.timeout(30000),
      headers:{'User-Agent':'Yuplijip/1.5.9 (https://github.com/Nyancode1/yuplijip)'}});
    if(response.ok) {
      const body=await response.text();
      fs.writeFileSync(name,body);return body;
    }
    if(attempt===2 || (response.status!==429 && response.status<500)) throw Error('Metadata HTTP '+response.status+' at '+new URL(url).hostname);
    await wait(15000*(attempt+1));
  }
}
const store = async (endpoint,params) => JSON.parse(await download('https://itunes.apple.com/'+endpoint+'?'+new URLSearchParams(params))).results;
async function releaseWriters(id){
  const file=path.join(cache,'track-writers-'+id+'.json');
  if(fs.existsSync(file))return JSON.parse(fs.readFileSync(file,'utf8'));
  const response=await fetch('https://music.apple.com/jp/song/'+id,{signal:AbortSignal.timeout(25000)});
  if(response.status===404)return [];
  if(!response.ok)throw Error('Apple track credit HTTP '+response.status);
  const page=await response.text();
  const json=page.match(/<script[^>]+id="serialized-server-data"[^>]*>([\s\S]*?)<\/script>/u);
  if(!json)return [];
  const track=JSON.parse(json[1]).data?.find(entry=>
    String(entry.intent?.contentDescriptor?.identifiers?.storeAdamID)===String(id));
  const people=track?.data?.sections?.find(section=>section.id==='composer-and-lyrics')?.items||[];
  const composers=people.filter(p=>p.roleNames?.some(r=>/^(?:作曲(?:者)?|コンポーザー|Composer)$/iu.test(r)));
  const soleWriter=people.length===1&&people[0].roleNames?.some(r=>/^(?:ソングライター|Songwriter)$/iu.test(r));
  const names=[...new Set((composers.length?composers:soleWriter?people:[]).map(p=>p.name).filter(Boolean))];
  fs.writeFileSync(file,JSON.stringify(names));return names;
}
async function recordings(){
  const japan=new Map();
  for(const artist of seeds.artists){
    const tracks=await store('search',{term:artist,country:'JP',lang:'ja_jp',entity:'song',limit:'200'});
    for(const t of tracks)if(t.kind==='song'&&titles.has(base(t.trackName)))japan.set(t.trackId,t);
  }
  const ids=[...japan.keys()].sort((a,b)=>a-b),localized=new Map();
  for(let i=0;i<ids.length;i+=100){
    const idsInBatch=ids.slice(i,i+100);
    const tracks=await store('lookup',{id:idsInBatch.join(','),country:'US',entity:'song',limit:'200'});
    for(const track of tracks){
      const jp=japan.get(track.trackId);
      if(!jp||!idsInBatch.includes(track.trackId)||track.artistId!==jp.artistId||!track.trackName||!track.artistName)continue;
      localized.set(track.trackId,{localTitle:track.trackName,localArtist:track.artistName});
    }
  }
  const singers=new Set(seeds.artists.map(key)), unique=new Map();
  for(const id of ids){
    const jp=japan.get(id), foreign=localized.get(id)||{localTitle:jp.trackName,localArtist:jp.artistName};
    const row={id,title:jp.trackName,artist:jp.artistName,...foreign};
    const fingerprint=[row.title,row.artist,row.localTitle,row.localArtist].map(key).join('|');
    if(!unique.has(fingerprint))unique.set(fingerprint,row);
  }
  const records=[...unique.values()], pending=records.filter(t=>singers.has(key(t.artist))&&
    !titles.get(base(t.title)).some(r=>artistForms(r.artist_primary).some(a=>key(a)===key(t.artist))));
  let cursor=0;
  async function worker(){
    while(cursor<pending.length){
      const r=pending[cursor++];
      const writers=await releaseWriters(r.id);
      if(writers.length)r.composers=writers;
      await wait(250);
    }
  }
  await Promise.all(Array.from({length:3},worker));
  return records.filter(r=>r.composers||key(r.title)!==key(r.localTitle)||key(r.artist)!==key(r.localArtist));
}
const decode = s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;|&#39;/g,"'").replace(/&amp;/g,'&');
async function animeCredits(){
  const entries=[];
  for(const id of seeds.series){
    const xml=await download('https://cal.syoboi.jp/db.php?Command=TitleLookup&TID='+id);
    const comment=xml.match(/<Comment>([\s\S]*?)<\/Comment>/u)?.[1];
    if(!comment)throw Error('Missing series credits for '+id);
    for(const section of decode(comment).split(/^\*/mu)){
      const title=section.match(/^(?:エンディング|オープニング)テーマ[^\n「]*「([^」\n]+)」/u)?.[1];
      const artist=section.match(/^:歌:([^\r\n]+)/mu)?.[1],composer=section.match(/^:(?:作詞・)?作曲(?:・編曲)?:([^\r\n]+)/mu)?.[1];
      if(title&&artist&&composer)entries.push({series:id,title,artist,composer});
    }
  }
  return entries;
}
async function nicoReferences(){
  const entries=[];
  for(const id of seeds.nico){
    const xml=await download('https://ext.nicovideo.jp/api/getthumbinfo/'+id);
    const description=decode(xml.match(/<description>([\s\S]*?)<\/description>/u)?.[1]||'');
    // 引用元・前作・PV・イラストのリンクは作品の親子関係にしない。
    const parents=new Set([...description.matchAll(/(?:ご|御)?本家(?:様|さま|動画)?[\s:：→/*【]*(?:[（(][^()（）]{1,40}[）)]\s*[【:]*)?(?:https?:\/\/(?:www\.nicovideo\.jp\/watch\/|nico\.ms\/))?(sm\d{5,12})(?!\d)/gu)].map(m=>m[1]));
    if(parents.size===1&&!parents.has(id))entries.push({id,original:[...parents][0]});
  }
  return entries;
}
async function releaseTracklists(){
  const tracks=[];
  for(const id of seeds.releases||[]){
    const release=JSON.parse(await download('https://musicbrainz.org/ws/2/release/'+id+'?fmt=json&inc=recordings+artist-credits'));
    if(release.id!==id)throw Error('Unexpected MusicBrainz release');
    for(const disc of release.media)for(const t of disc.tracks){
      const rec=t.recording,performers=rec['artist-credit'],local=t['artist-credit'];
      if(!titles.has(base(rec.title))||key(rec.title)===key(t.title)||!performers?.length||
          performers.length!==local?.length||!performers.every((p,i)=>p.artist.id===local[i].artist.id))continue;
      const name=list=>list.map(a=>a.name+a.joinphrase).join('');
      tracks.push({id:rec.id,title:rec.title,artist:name(performers),localTitle:t.title,localArtist:name(local)});
    }
  }
  return tracks;
}
async function main(){
  fs.mkdirSync(cache,{recursive:true});
  const [storeTracks,albumTracks,themes,nico]=await Promise.all([recordings(),releaseTracklists(),animeCredits(),nicoReferences()]);
  const tracks=[...storeTracks,...albumTracks];
  const dest=path.join(root,'data/release_credits.json');
  fs.writeFileSync(dest+'.tmp',JSON.stringify({tracks,themes,nico})+'\n');
  fs.renameSync(dest+'.tmp',dest);
  console.log('Recordings',tracks.length,'themes',themes.length,'cover references',nico.length);
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
