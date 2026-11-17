// Autoclip link server (for Render.com or any Docker host).
// It downloads videos from links with yt-dlp, measures the sound (ffmpeg) and streams the video to the app.
const http=require("http"),fs=require("fs"),os=require("os"),path=require("path"),crypto=require("crypto"),{spawn}=require("child_process");
const PORT=process.env.PORT||8080,MEDIA=process.env.MEDIA_DIR||path.join(__dirname,"media");
const YT=process.env.YTDLP||"yt-dlp",FF=process.env.FFMPEG||"ffmpeg";
const ORIGIN=process.env.ALLOW_ORIGIN||"*",KEY=process.env.ACCESS_KEY||"",MAXMB=+process.env.MAX_MB||1500,MAXJOBS=+process.env.MAX_JOBS||2;
let COOKIES=null;
if(process.env.YT_COOKIES){COOKIES=path.join(os.tmpdir(),"cookies.txt");fs.writeFileSync(COOKIES,process.env.YT_COOKIES.replace(/\\n/g,"\n"),{mode:0o600})}
fs.mkdirSync(MEDIA,{recursive:true});
const jobs={},cache={},ID=/^[A-Za-z0-9_-]{1,40}$/;let running=0;
const json=(res,code,o)=>{res.writeHead(code,{"Content-Type":"application/json"});res.end(JSON.stringify(o))};
const readBody=req=>new Promise(r=>{let d="";req.on("data",c=>{d+=c;if(d.length>1e5)req.destroy()});req.on("end",()=>{try{r(JSON.parse(d||"{}"))}catch(e){r({})}})});
const fileOf=id=>ID.test(id)?["mp4","webm","mkv"].map(e=>path.join(MEDIA,id+"."+e)).find(fs.existsSync):null;

function niceErr(err){const t=(err||"").trim(),last=(t.split("\n").pop()||"").replace(/^ERROR:\s*/,"");
  if(/not installed/.test(t))return t;
  if(/confirm you.re not a bot|Sign in to confirm/i.test(t))return "YouTube blocked this server. Add YouTube cookies on the server (see README), or choose the video file instead.";
  if(/login required|rate-limit reached|log in|cookies/i.test(t))return "This site needs a login. Add cookies on the server (see README), or choose the video file instead.";
  if(/Unsupported URL/i.test(t))return "That link is not supported.";
  if(/Private video|unavailable|not available/i.test(t))return "That video is private or not available.";
  if(/File is larger than max-filesize/i.test(t))return "That video is too large for the server.";
  return last||"Could not fetch that link"}

function runYt(id,j,url,useJs){return new Promise(done=>{
  const a=["--no-playlist","--no-warnings","--newline","--progress",...(useJs?["--js-runtimes","node"]:[]),...(COOKIES?["--cookies",COOKIES]:[]),
    "--max-filesize",MAXMB+"M","-f","bv*[height<=1080][vcodec^=avc1]+ba[ext=m4a]/b[height<=1080][ext=mp4]/bv*[height<=1080]+ba/b",
    "--merge-output-format","mp4","--progress-template","download:P:%(progress._percent_str)s",
    "--print","after_move:T:%(title)s","--print","after_move:D:%(duration)s","-o",path.join(MEDIA,id+".%(ext)s"),"--",url];
  const p=spawn(YT,a);let err="";
  p.stdout.on("data",b=>String(b).split("\n").forEach(l=>{
    if(l.startsWith("P:")){const n=parseFloat(l.slice(2));if(!isNaN(n))j.pct=n}
    else if(l.startsWith("T:"))j.title=l.slice(2).trim();
    else if(l.startsWith("D:"))j.duration=parseFloat(l.slice(2))||0}));
  p.stderr.on("data",b=>err+=b);
  p.on("error",()=>done({code:-1,err:"yt-dlp is not installed on the server"}));
  p.on("close",code=>done({code,err}))})}
function startJob(url){
  const id=crypto.randomBytes(6).toString("hex"),j=jobs[id]={state:"run",pct:0,title:"",duration:0,t:Date.now()};running++;
  (async()=>{let r=await runYt(id,j,url,true);
    if(r.code!==0&&/no such option|unrecognized arguments|js-runtimes/i.test(r.err))r=await runYt(id,j,url,false);
    running--;if(r.code===0&&fileOf(id)){j.state="done";j.pct=100}else{j.state="error";j.error=niceErr(r.err)}})();
  return id}

// One audio pass: loudness per second + a laughter/reaction score per second.
function features(fr){
  const n=Math.floor(fr.length/50),rms=[],laugh=[];
  for(let i=0;i<n;i++){let a=0;for(let k=i*50;k<i*50+50;k++)a+=fr[k]*fr[k];rms.push(Math.sqrt(a/50))}
  const med=a=>{const t=[...a].sort((x,y)=>x-y);return t[t.length>>1]||0};
  for(let i=0;i<n;i++){
    const w=fr.slice(Math.max(0,i*50-25),Math.min(fr.length,i*50+75));let mx=0,mean=0;for(const x of w){mx=Math.max(mx,x);mean+=x}mean/=w.length||1;
    const base=med(rms.slice(Math.max(0,i-15),Math.min(n,i+16)))+1e-4,pp=[];
    for(let k=1;k<w.length-1;k++)if(w[k]>w[k-1]&&w[k]>=w[k+1]&&w[k]>.45*mx&&w[k]>.008&&(!pp.length||k-pp[pp.length-1]>=5))pp.push(k);
    let reg=0;if(pp.length>=3){let g=0;for(let j=1;j<pp.length;j++){const d=pp[j]-pp[j-1];if(d>=8&&d<=20)g++}reg=g/(pp.length-1)}
    const loud=Math.max(0,Math.min(1,(mean/base-1)/1.5));
    laugh.push(+(reg*Math.min(1,pp.length/5)*(.3+.7*loud)).toFixed(3))}
  return{rms,laugh}}
function analyze(file){return new Promise((ok,no)=>{
  const p=spawn(FF,["-v","error","-i",file,"-vn","-ac","1","-ar","8000","-f","s16le","-"]),fr=[];let acc=0,cnt=0,carry=null;
  p.stdout.on("data",b=>{if(carry){b=Buffer.concat([carry,b]);carry=null}const n=b.length&~1;if(n<b.length)carry=b.subarray(n);
    for(let i=0;i<n;i+=2){const s=b.readInt16LE(i)/32768;acc+=s*s;if(++cnt===160){fr.push(Math.sqrt(acc/160));acc=0;cnt=0}}});
  p.on("close",()=>ok(features(fr)));p.on("error",no)})}

function stream(req,res,file){
  const st=fs.statSync(file),ty=file.endsWith(".mp4")?"video/mp4":file.endsWith(".webm")?"video/webm":"video/x-matroska",r=req.headers.range;
  if(r){const m=/bytes=(\d*)-(\d*)/.exec(r)||[];let s=m[1]?+m[1]:0,e=m[2]?+m[2]:st.size-1;
    if(!m[1]&&m[2]){s=Math.max(0,st.size-+m[2]);e=st.size-1}e=Math.min(e,st.size-1);
    if(s>e){res.writeHead(416,{"Content-Range":"bytes */"+st.size});return res.end()}
    res.writeHead(206,{"Content-Type":ty,"Accept-Ranges":"bytes","Content-Range":`bytes ${s}-${e}/${st.size}`,"Content-Length":e-s+1});
    fs.createReadStream(file,{start:s,end:e}).pipe(res)}
  else{res.writeHead(200,{"Content-Type":ty,"Accept-Ranges":"bytes","Content-Length":st.size});fs.createReadStream(file).pipe(res)}}

http.createServer(async(req,res)=>{
  res.setHeader("Access-Control-Allow-Origin",ORIGIN);res.setHeader("Access-Control-Allow-Methods","GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type,Range,X-Access-Key");res.setHeader("Access-Control-Allow-Private-Network","true");
  res.setHeader("Access-Control-Expose-Headers","Content-Length,Content-Range,Accept-Ranges");
  if(req.method==="OPTIONS"){res.writeHead(204);return res.end()}
  try{
    const p=new URL(req.url,"http://x").pathname,authed=!KEY||req.headers["x-access-key"]===KEY;
    if(p==="/api/ping")return json(res,200,{ok:true,locked:!!KEY,authed});
    if(p==="/"||p==="/healthz"){res.writeHead(200,{"Content-Type":"text/plain"});return res.end("Autoclip server is running")}
    if(!authed)return json(res,401,{error:"Wrong or missing access key"});
    let m;
    if(p==="/api/fetch"&&req.method==="POST"){
      const{url}=await readBody(req);let ok=false;try{ok=/^https?:$/.test(new URL(url).protocol)}catch(e){}
      if(!ok)return json(res,400,{error:"That does not look like a valid link"});
      if(running>=MAXJOBS)return json(res,429,{error:"The server is busy. Try again in a minute."});
      return json(res,200,{id:startJob(url)})}
    if((m=p.match(/^\/api\/job\/([\w-]+)$/))){const j=jobs[m[1]];if(j)return json(res,200,j);
      return fileOf(m[1])?json(res,200,{state:"done",pct:100,title:m[1],duration:0}):json(res,404,{state:"error",error:"Unknown job"})}
    if((m=p.match(/^\/api\/(rms|funny)\/([\w-]+)$/))){const f=fileOf(m[2]);if(!f)return json(res,404,{error:"Not found"});
      const A=cache[m[2]]||(cache[m[2]]=await analyze(f));return json(res,200,m[1]==="rms"?A.rms:A.laugh)}
    if((m=p.match(/^\/video\/([\w-]+)$/))){const f=fileOf(m[1]);if(!f){res.writeHead(404);return res.end()}return stream(req,res,f)}
    if((m=p.match(/^\/api\/video\/([\w-]+)$/))&&req.method==="DELETE"){const f=fileOf(m[1]);try{f&&fs.unlinkSync(f)}catch(e){}delete cache[m[1]];delete jobs[m[1]];return json(res,200,{ok:true})}
    res.writeHead(404);res.end("Not found")
  }catch(e){json(res,500,{error:"Server error"})}
}).listen(PORT,"0.0.0.0",()=>console.log("Autoclip server running on port "+PORT));
// The app deletes each video after copying it. This removes anything left behind after 2 hours.
setInterval(()=>{for(const f of fs.readdirSync(MEDIA)){if(f===".keep")continue;const q=path.join(MEDIA,f);try{if(Date.now()-fs.statSync(q).mtimeMs>72e5)fs.unlinkSync(q)}catch(e){}}
  for(const k in jobs)if(Date.now()-jobs[k].t>72e5)delete jobs[k]},36e5);
