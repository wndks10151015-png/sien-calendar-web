const assert=require('node:assert/strict');
const replacements=[
 ['unlimited month cards',`    // The month item cutoff follows the Obsidian app platform, not pane width:
    // a narrow desktop pane must still show every item requested by the user.
    const maxVisibleMonthItems = isObsidianMobileApp() ? 5 : null;`,`    // Every screen shows all schedules; weekly rows grow with their contents.
    const maxVisibleMonthItems = null;`],
 ['period card metrics','      for (const { element, height } of measured) {','      for (const { element, height, spanHeight } of measured) {'],
 ['compact month period cards','          element.style?.setProperty?.("--sien-month-lane-height", `${laneHeight}px`);','          const cardHeight = isSpanningFragment && element.parentElement?.classList?.contains("sien-cell-items")\n            ? spanHeight ?? height : laneHeight;\n          element.style?.setProperty?.("--sien-month-lane-height", `${cardHeight}px`);'],
 ['browser layout helper','import * as browserRuntime from "./host.js";','import * as browserRuntime from "./host.js";\nimport {equalizePeriodLanes} from "./layout.js";'],
 ['retained month fragments','  syncMonthWeekLaneHeights(cells = []) {',`  syncMonthWeekLaneHeights(cells = []) {
    if (cells.some(cell => cell.classList?.contains("sien-day-cell"))) {
      // A newly appended week can continue a period in an already cached row.
      cells = [...this.contentEl.querySelectorAll(".sien-day-cell[data-month-week]")];
    }`],
 ['period cache scope',`    cells = dirty;
    if (!cells.length) return;
    const laneElements = new Map();`,`    const scopeOwners = [...groups.keys()];
    const sameScope = this.monthLaneSyncOwners?.length === scopeOwners.length
      && scopeOwners.every((owner, index) => owner === this.monthLaneSyncOwners[index]);
    if (!dirty.length && sameScope) return;
    this.monthLaneSyncOwners = scopeOwners;
    const laneElements = new Map();`],
 ['period identity for shared heights',`        height: this.monthLaneElementHeight(element),`,`        height: this.monthLaneElementHeight(element),
        spanKey: element.dataset?.monthSpan === "true" ? String(element.dataset.monthSpanKey || "") : "",`],
 ['join weekly period lanes',`    // Read every natural card height before stretching any lane.`,`    const scale = Number(cells[0]?.closest?.(".sien-month-wrap")?.dataset?.mobileMonthZoom || 1);
    equalizePeriodLanes(measuredLanes, (window.devicePixelRatio || 1) * scale);
    // Read every natural card height before stretching any lane.`],
 ['attachment layout capability',`const definitions = [...this.plugin.allProperties().filter(p => p.key !== "title"), { key: "sienAttachments", type: "files" }];`,`const definitions = [...this.plugin.allProperties().filter(p => p.key !== "title"), ...(this.app.supportsAttachments === false ? [] : [{ key: "sienAttachments", type: "files" }])];`],
 ['attachment editor capability',`renderDetails.call(this,panel);const item=this.selectedItem(),properties=panel.querySelector('.sien-properties');if(!item||!properties)return;`,`renderDetails.call(this,panel);const item=this.selectedItem(),properties=panel.querySelector('.sien-properties');if(this.app.supportsAttachments===false||!item||!properties)return;`],
 ['project attachment capability',`const kinds=[['links','링크'],['notes','메모'],['files','파일']];`,`const kinds=[['links','링크'],['notes','메모'],...(v.app.supportsAttachments===false?[]:[['files','파일']])];`],
];
function patchBrowserEngine(source){
  for(const[name,before,after]of replacements){assert.equal(source.split(before).length,2,'Browser engine seam changed: '+name);source=source.replace(before,after);}
  return source;
}
module.exports={patchBrowserEngine};
if(require.main===module){const fs=require('node:fs'),path=require('node:path'),file=path.resolve(__dirname,'../docs/calendar-engine.js');fs.writeFileSync(file,patchBrowserEngine(fs.readFileSync(file,'utf8')));}
