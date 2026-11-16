const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
const worker=fs.readFileSync(path.join(root,'docs/service-worker.js'),'utf8'),files=JSON.parse(worker.match(/const FILES=(\[[\s\S]*?\]);/)[1]);
if(!/^\d+\.\d+\.\d+$/.test(version)||!fs.readFileSync(path.join(root,'docs/index.html'),'utf8').includes('boot.js?v='+version))throw Error('Release versions disagree');
const assets=Object.fromEntries(files.map(file=>{const bytes=fs.readFileSync(path.join(root,'docs',file)),content=/\.(png|woff2)$/.test(file)?bytes:bytes.toString('utf8').replace(/\r\n/g,'\n');return[file,crypto.createHash('sha256').update(content).digest('hex')];}));
fs.writeFileSync(path.join(root,'docs/release.json'),JSON.stringify({version,assets},null,2)+'\n');
console.log('Generated verified static release '+version+' ('+files.length+' assets)');
