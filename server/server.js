const http=require('http'),fs=require('fs'),path=require('path'),os=require('os');
const DIR=path.resolve(process.argv[2]||path.join(os.homedir(),'Music')),PORT=process.env.PORT||3000;
const EXT=/\.(mp3|flac|m4a|aac|ogg|opus|wav)$/i;
const MIME={'.mp3':'audio/mpeg','.flac':'audio/flac','.m4a':'audio/mp4','.aac':'audio/aac','.ogg':'audio/ogg','.opus':'audio/ogg','.wav':'audio/wav'};
const LOG=path.join(__dirname,'events.jsonl');
let files=[];
function scan(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())scan(p);else if(EXT.test(e.name))files.push(p)}}
try{scan(DIR)}catch(e){console.log('Папку не знайдено:',DIR)}
const tracks=files.map((file,id)=>{const n=path.basename(file).replace(EXT,'');const m=n.match(/^(.+?)\s[-–—]\s(.+)$/);
  return{id,file,artist:m?m[1].trim():path.basename(path.dirname(file)),title:m?m[2].trim():n}});
const clients=new Set();let state=null;
const sse=(res,ev,d)=>res.write(`event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`);
const bc=(ev,d)=>clients.forEach(r=>sse(r,ev,d));
setInterval(()=>clients.forEach(r=>r.write(':\n\n')),20000);
const body=req=>new Promise(r=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>{try{r(JSON.parse(b))}catch{r({})}})});
function audio(req,res,id){
  const t=tracks[id];if(!t){res.writeHead(404);return res.end()}
  const st=fs.statSync(t.file),mime=MIME[path.extname(t.file).toLowerCase()]||'audio/mpeg';
  let s=0,e=st.size-1;const r=req.headers.range&&/bytes=(\d*)-(\d*)/.exec(req.headers.range);
  if(r){if(r[1]){s=+r[1];if(r[2])e=Math.min(+r[2],e)}else if(r[2]){s=Math.max(0,st.size-+r[2])}}
  const h={'Content-Type':mime,'Accept-Ranges':'bytes','Content-Length':e-s+1};
  if(r)h['Content-Range']=`bytes ${s}-${e}/${st.size}`;
  res.writeHead(r?206:200,h);fs.createReadStream(t.file,{start:s,end:e}).pipe(res);
}
function readEvents(){
  try{return fs.readFileSync(LOG,'utf8').split('\n').filter(Boolean).map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(Boolean)}catch{return[]}
}
const HISTORY=`<!DOCTYPE html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Історія YouTube Music</title><style>
body{font:14px system-ui,sans-serif;background:#121212;color:#fff;margin:0;padding:16px;max-width:760px;margin:auto}
h1{color:#1db954;font-size:20px}h2{font-size:15px;color:#b3b3b3;margin:20px 0 8px}
.row{display:flex;gap:10px;padding:7px 8px;border-bottom:1px solid #222;align-items:baseline}
.tm{color:#777;width:62px;flex:none}.ty{width:92px;flex:none;font-weight:600}.sm{color:#b3b3b3}
.track_change{color:#1db954}.skip_next,.skip_prev{color:#f5a623}.pause{color:#8ab4f8}.play{color:#fff}.seek{color:#c58af9}
.st{display:flex;gap:16px;flex-wrap:wrap}.st div{background:#1e1e1e;border-radius:8px;padding:10px 14px}.st b{display:block;font-size:20px}
</style></head><body><h1>♫ Історія YouTube Music (телефон)</h1><div class="st" id="st"></div>
<h2>Топ треків</h2><div id="top"></div><h2>Усі дії (нові зверху)</h2><div id="ev">Завантаження…</div>
<script>
const L={track_change:'Новий трек',play:'Грати',pause:'Пауза',skip_next:'Пропуск ⏭',skip_prev:'Назад ⏮',seek:'Перемотка'};
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const f=s=>Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');
async function load(){
  const e=await (await fetch('/api/events')).json();
  const c=t=>e.filter(x=>x.type===t).length;
  document.getElementById('st').innerHTML=[['Треків',c('track_change')],['Пропусків',c('skip_next')+c('skip_prev')],['Пауз',c('pause')],['Перемоток',c('seek')]].map(a=>'<div><b>'+a[1]+'</b>'+a[0]+'</div>').join('');
  const m={};e.filter(x=>x.type==='track_change'&&x.title).forEach(x=>{const k=x.artist+' — '+x.title;m[k]=(m[k]||0)+1});
  document.getElementById('top').innerHTML=Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,10).map(a=>'<div class="row"><span class="ty">'+a[1]+'×</span><span>'+esc(a[0])+'</span></div>').join('')||'<p class="sm">Поки порожньо</p>';
  document.getElementById('ev').innerHTML=e.slice().reverse().slice(0,300).map(x=>{
    const d=new Date(x.ts);
    return '<div class="row"><span class="tm">'+d.toLocaleTimeString('uk',{hour:'2-digit',minute:'2-digit'})+'</span><span class="ty '+esc(x.type)+'">'+esc(L[x.type]||x.type)+'</span><span>'+esc(x.title)+' <span class="sm">'+esc(x.artist)+(x.type==='seek'||x.type==='pause'?' · '+f((x.pos||0)/1000):'')+'</span></span></div>'
  }).join('')||'<p class="sm">Подій ще немає. Увімкни щось у YouTube Music на телефоні.</p>';
}
load();setInterval(load,5000);
</script></body></html>`;
http.createServer(async(req,res)=>{
  const u=req.url.split('?')[0];let m;
  if(u==='/ping'){console.log('ping від',req.socket.remoteAddress);res.writeHead(200,{'Content-Type':'text/plain'});return res.end('ok')}
  if(u==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return fs.createReadStream(path.join(__dirname,'index.html')).pipe(res)}
  if(u==='/history'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(HISTORY)}
  if(u==='/api/events'&&req.method==='POST'){
    const e=await body(req);
    if(e&&e.type){e.ts=e.ts||Date.now();fs.appendFileSync(LOG,JSON.stringify(e)+'\n');console.log('Подія:',e.type,'|',e.artist,'-',e.title)}
    res.writeHead(200);return res.end('ok')}
  if(u==='/api/events'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(readEvents().slice(-2000)))}
  if(u==='/api/tracks'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(tracks.map(({id,artist,title})=>({id,artist,title}))))}
  if(u==='/events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache',Connection:'keep-alive'});
    clients.add(res);console.log('Клієнт підключився:',req.socket.remoteAddress);if(state)sse(res,'state',state);return req.on('close',()=>clients.delete(res))}
  if((m=u.match(/^\/audio\/(\d+)$/)))return audio(req,res,+m[1]);
  if(u==='/api/cmd'&&req.method==='POST'){bc('cmd',await body(req));return res.end('ok')}
  if(u==='/api/state'&&req.method==='POST'){state=await body(req);bc('state',state);return res.end('ok')}
  res.writeHead(404);res.end();
}).listen(PORT,'0.0.0.0',()=>{
  console.log('Музика:',DIR,'| треків:',tracks.length);
  console.log('ПК:      http://localhost:'+PORT);
  console.log('Історія: http://localhost:'+PORT+'/history');
  for(const l of Object.values(os.networkInterfaces()).flat())if(l.family==='IPv4'&&!l.internal)console.log('Телефон: http://'+l.address+':'+PORT);
});
