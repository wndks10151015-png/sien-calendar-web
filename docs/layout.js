// Share a period's own content height, never the height of unrelated lane cards.
export function equalizePeriodLanes(lanes,pixelRatio=1){
  const heights=new Map(),scale=Number.isFinite(pixelRatio)&&pixelRatio>0?pixelRatio:1;
  for(const {measured}of lanes)for(const {spanKey,height}of measured){
    if(spanKey)heights.set(spanKey,Math.max(heights.get(spanKey)||20,height));
  }
  lanes.forEach(lane=>{
    for(const entry of lane.measured)if(entry.spanKey)entry.spanHeight=Math.ceil(heights.get(entry.spanKey)*scale)/scale;
    // Spacers still reserve enough room for every card in their weekly lane.
    lane.laneHeight=Math.max(lane.laneHeight||20,...lane.measured.map(entry=>entry.spanHeight??entry.height));
  });
}
