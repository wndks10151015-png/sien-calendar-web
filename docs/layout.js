// A period joins its weekly lanes; connected lanes must share one height.
export function equalizePeriodLanes(lanes,pixelRatio=1){
  const parent=lanes.map((_,i)=>i),firstLane=new Map();
  const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  lanes.forEach((lane,i)=>{
    for(const {spanKey}of lane.measured){
      if(!spanKey)continue;
      if(firstLane.has(spanKey))parent[root(i)]=root(firstLane.get(spanKey));
      else firstLane.set(spanKey,i);
    }
  });
  const heights=new Map(),scale=Number.isFinite(pixelRatio)&&pixelRatio>0?pixelRatio:1;
  lanes.forEach((lane,i)=>{const key=root(i);heights.set(key,Math.max(heights.get(key)||20,lane.laneHeight));});
  lanes.forEach((lane,i)=>{if(lane.measured.some(entry=>entry.spanKey))lane.laneHeight=Math.ceil(heights.get(root(i))*scale)/scale;});
}
