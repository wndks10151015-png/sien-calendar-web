const http=require("node:http"),fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"../docs"),port=Number(process.env.PORT||4173);
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".svg":"image/svg+xml",".woff2":"font/woff2",".webmanifest":"application/manifest+json"};
http.createServer((req,res)=>{
  const url=new URL(req.url,"http://localhost"),target=path.resolve(root,"."+decodeURIComponent(url.pathname));
  if(target!==root&&!target.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  const file=target===root?path.join(root,"index.html"):target;
  if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
  res.writeHead(200,{"Content-Type":mime[path.extname(file)]||"application/octet-stream","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});fs.createReadStream(file).pipe(res);
}).listen(port,"127.0.0.1",()=>console.log("Sien Calendar preview http://127.0.0.1:"+port));
