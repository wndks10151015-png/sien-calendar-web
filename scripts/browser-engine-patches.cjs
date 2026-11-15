const assert=require('node:assert/strict');
const replacements=[
 ['unlimited month cards',`    // The month item cutoff follows the Obsidian app platform, not pane width:
    // a narrow desktop pane must still show every item requested by the user.
    const maxVisibleMonthItems = isObsidianMobileApp() ? 5 : null;`,`    // Every screen shows all schedules; weekly rows grow with their contents.
    const maxVisibleMonthItems = null;`],
 ['period card metrics','      for (const { element, height } of measured) {','      for (const { element, height, spanHeight } of measured) {'],
 ['compact month period cards','          element.style?.setProperty?.("--sien-month-lane-height", `${laneHeight}px`);','          const cardHeight = isSpanningFragment && element.parentElement?.classList?.contains("sien-cell-items")\n            ? spanHeight ?? height : laneHeight;\n          element.style?.setProperty?.("--sien-month-lane-height", `${cardHeight}px`);'],
 ['browser layout helper','import * as browserRuntime from "./host.js";','import * as browserRuntime from "./host.js";\nimport {equalizePeriodLanes} from "./layout.js";\nimport {CONNECTION_SIDES,validConnectionSides,writeConnectionSides,connectionPath,installCanvasConnections} from "./project-connections.js";'],
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
 ['side-aware connection validation',`    if (!project?.id) return { error: '프로젝트를 선택해주세요.' };`,`    if (!project?.id) return { error: '프로젝트를 선택해주세요.' };
    if (options.sides && !validConnectionSides(options.sides)) return { error: '연결할 카드 가장자리를 다시 선택해주세요.' };`],
 ['same-edge side reconnection',`(old && fromId === oldFrom && toId === oldTo) || graph.edges.some`,`(old && fromId === oldFrom && toId === oldTo && !options.sides) || graph.edges.some`],
 ['side metadata revision snapshot',`graph: structuredClone([item[DEPENDENCIES], item[DISCONNECTED], item[BRANCHES], item[POSITIONS]]),`,`graph: structuredClone([item[DEPENDENCIES], item[DISCONNECTED], item[BRANCHES], item[POSITIONS], item[CONNECTION_SIDES]]),`],
 ['side metadata stale display guard',`!same(node.item[DISCONNECTED], live[DISCONNECTED]);`,`!same(node.item[DISCONNECTED], live[DISCONNECTED]) || !same(node.item[CONNECTION_SIDES], live[CONNECTION_SIDES]);`],
 ['side metadata concurrent edit guard',`!same(prior.graph, [item[DEPENDENCIES], item[DISCONNECTED], item[BRANCHES], item[POSITIONS]]);`,`!same(prior.graph, [item[DEPENDENCIES], item[DISCONNECTED], item[BRANCHES], item[POSITIONS], item[CONNECTION_SIDES]]);`],
 ['remove old connection sides',`          const target = draft(current.oldTo);
          target[DEPENDENCIES]`,`          const target = draft(current.oldTo);
          writeConnectionSides(target, project.id, current.oldFrom, null);
          target[DEPENDENCIES]`],
 ['save new connection sides',`          const target = draft(current.toId);
          target[DEPENDENCIES]`,`          const target = draft(current.toId);
          if (options.sides) writeConnectionSides(target, project.id, current.fromId, options.sides);
          target[DEPENDENCIES]`],
 ['four-side edge paths','const d=`M${x},${y} C${x+dx},${y} ${tx-dx},${ty} ${tx},${ty}`;edge.path.setAttribute','const d=compact?`M${x},${y} C${x+dx},${y} ${tx-dx},${ty} ${tx},${ty}`:connectionPath(a,b,project.id);edge.path.setAttribute'],
];
function patchBrowserEngine(source){
  for(const[name,before,after]of replacements){assert.equal(source.split(before).length,2,'Browser engine seam changed: '+name);source=source.replace(before,after);}
  const edgeBinding=/    if\(!compact\)for\(const edge of paths\)\{const hit=edge\.path\.cloneNode\(\);[^\n]+svg\.appendChild\(hit\);\}/g;
  assert.equal([...source.matchAll(edgeBinding)].length,1,'Browser engine seam changed: connection event binding');
  source=source.replace(edgeBinding,`    if(!compact)for(const edge of paths){const hit=edge.path.cloneNode();edge.hit=hit;hit.classList.add('sien-project-edge-hit');hit.setAttribute('role','button');hit.setAttribute('tabindex','0');hit.setAttribute('aria-pressed','false');hit.setAttribute('aria-label',\u0060\u0024{graph.nodes.get(edge.from).item.title} → \u0024{graph.nodes.get(edge.to).item.title} 연결 선택\u0060);svg.appendChild(hit);}`);
  const legacyUI=/\(\(\)=>\{const module=\{exports:\{\}\};\nfunction projectConnectionHandlePoints\([\s\S]+?return module\.exports;\}\)\(\)\.installProjectConnectionUI\(projectFeatureDependencies\);/g;
  assert.equal([...source.matchAll(legacyUI)].length,1,'Browser engine seam changed: legacy connection UI');
  source=source.replace(legacyUI,'installCanvasConnections(projectFeatureDependencies);');
  return source;
}
module.exports={patchBrowserEngine};
if(require.main===module){const fs=require('node:fs'),path=require('node:path'),file=path.resolve(__dirname,'../docs/calendar-engine.js');fs.writeFileSync(file,patchBrowserEngine(fs.readFileSync(file,'utf8')));}
