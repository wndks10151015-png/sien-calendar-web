import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),read=file=>readFileSync(new URL(file,root));
const manifest=JSON.parse(read('docs/release.json')),pkg=JSON.parse(read('package.json'));
test('the bootstrap, worker fallback and published manifest agree on the release',()=>{
  assert.equal(manifest.version,pkg.version);
  assert.match(read('docs/index.html').toString(),new RegExp('boot\\.js\\?v='+pkg.version.replaceAll('.','\\.')));
  assert.ok(read('docs/service-worker.js').toString().includes("||'"+pkg.version+"'"));
  assert.ok(read('docs/boot.js').toString().includes("||'"+pkg.version+"'"));
});
test('every offline asset has a fresh hash and the release contains no runtime data',()=>{
  const files=JSON.parse(read('docs/service-worker.js').toString().match(/const FILES=(\[[\s\S]*?\]);/)[1]);
  assert.deepEqual(Object.keys(manifest.assets),files);
  for(const [file,digest]of Object.entries(manifest.assets)){
    assert.ok(!/calendar\.json|credential|token|release\.json|\.\./i.test(file));
    const bytes=read('docs/'+file),content=/\.(png|woff2)$/.test(file)?bytes:bytes.toString('utf8').replace(/\r\n/g,'\n');
    assert.equal(createHash('sha256').update(content).digest('hex'),digest,file+' changed; regenerate npm run release');
  }
});
