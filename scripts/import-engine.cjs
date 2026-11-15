// Mechanical port of user-owned engine code only. Runtime data is never copied.
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict"),crypto=require("node:crypto");
const {patchBrowserEngine}=require('./browser-engine-patches.cjs');
const source=process.argv[2],icons=process.argv[3],root=path.resolve(__dirname,"../docs");
assert(source&&icons,"Pass the engine source directory and the installed lucide package directory");
const input=fs.readFileSync(path.join(source,"main.js"),"utf8");
assert.equal(input.split('} = require("obsidian");').length,2);
assert.equal(input.split("module.exports = SienCalendarPlugin;").length,2);
const legacyMerge='const merged = this.mergeSyncthingDocuments([this.internalData || {}, incoming]);';
assert.equal(input.split(legacyMerge).length,2,"The host reload seam changed; review it before importing");
// GitHubSync owns three-way conflict resolution. Re-merging its committed result
// through the old Syncthing revision heuristic would revive a stale local value.
const output='import * as browserRuntime from "./host.js";\n'+input.replace('} = require("obsidian");','} = browserRuntime;')
 .replace(legacyMerge,'const merged = incoming; // Browser storage is already conflict-resolved by GitHubSync.')
 .replace("module.exports = SienCalendarPlugin;","export {SienCalendarPlugin, SienCalendarView, parseIcsCalendar};");
fs.mkdirSync(root,{recursive:true});fs.writeFileSync(path.join(root,"calendar-engine.js"),patchBrowserEngine(output));
fs.copyFileSync(path.join(source,"styles.css"),path.join(root,"calendar.css"));
fs.mkdirSync(path.join(root,"assets/fonts"),{recursive:true});
for(const name of ["PretendardVariable.woff2","LICENSE"])fs.copyFileSync(path.join(source,"assets/fonts",name),path.join(root,"assets/fonts",name));
fs.copyFileSync(path.join(icons,"dist/umd/lucide.js"),path.join(root,"assets/lucide.js"));
fs.copyFileSync(path.join(icons,"LICENSE"),path.join(root,"assets/LUCIDE-LICENSE"));
fs.writeFileSync(path.join(root,"engine-version.json"),JSON.stringify({version:JSON.parse(fs.readFileSync(path.join(source,"manifest.json"))).version,sha256:crypto.createHash("sha256").update(input).digest("hex")},null,2));
console.log("Copied engine, stylesheet, icons and licensed font only; no calendar data files");
