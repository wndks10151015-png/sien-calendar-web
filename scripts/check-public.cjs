const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const root=path.resolve(__dirname,".."),privateFile=process.argv[2],denied=/^(?:data|calendar|qa-before|fixture|token|credential|secret)(?:[.-]|$)/i;
const forbidden=[/github_pat_[A-Za-z0-9_]{25,}/g,/gh[pousr]_[A-Za-z0-9]{25,}/g,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g];
const allowed=new Set([".gitignore","package.json","README.md"]);
let files=0;const findings=[];
function visit(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if([".git","node_modules"].includes(entry.name))continue;
    const full=path.join(dir,entry.name),rel=path.relative(root,full).replaceAll(path.sep,"/");
    if(entry.isDirectory()){visit(full);continue;}
    if(!rel.startsWith("docs/")&&!rel.startsWith("scripts/")&&!rel.startsWith("tests/")&&!allowed.has(rel))findings.push("Unapproved public file: "+rel);
    if(denied.test(entry.name)&&!["calendar-engine.js","calendar.css"].includes(entry.name))findings.push("Private-data-like filename: "+rel);
    if(/\.(?:woff2|png)$/.test(rel))continue;
    const text=fs.readFileSync(full,"utf8");files++;
    for(const regex of forbidden){regex.lastIndex=0;if(regex.test(text))findings.push("Credential-like content: "+rel);}
    if(privateFile){
      const data=JSON.parse(fs.readFileSync(privateFile,"utf8"));
      const titles=Object.entries(data).filter(([k])=>k.startsWith("item:")).map(([,v])=>v.title).filter(t=>typeof t==="string"&&t.length>=12);
      if(titles.some(title=>text.includes(title)))findings.push("Actual schedule text found: "+rel);
      const urls=(data.config?.externalCalendars||[]).map(c=>c.url).filter(u=>u&&!u.includes("%23holiday%40group.v.calendar.google.com")&&!u.includes("#holiday@group.v.calendar.google.com"));
      if(urls.some(url=>text.includes(url)))findings.push("Actual calendar subscription found: "+rel);
    }
  }
}
visit(root);assert.equal(findings.length,0,findings.join("\n"));
console.log("Public-source gate passed: "+files+" text files; no calendar payloads or credential literals");
