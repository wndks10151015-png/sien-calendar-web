export const CONNECTION_SIDES='sienProjectConnectionSides';
export const CARD_SIDES=['top','right','bottom','left'];
const NORMAL={top:{x:0,y:-1},right:{x:1,y:0},bottom:{x:0,y:1},left:{x:-1,y:0}};
export function validConnectionSides(sides){return !!sides&&CARD_SIDES.includes(sides.from)&&CARD_SIDES.includes(sides.to);}
export function connectionSides(from,to,projectId){
  const saved=to.item?.[CONNECTION_SIDES]?.[projectId]?.[from.id];
  return validConnectionSides(saved)?saved:{from:'right',to:'left'};
}
export function writeConnectionSides(item,projectId,fromId,sides){
  const all={...item[CONNECTION_SIDES]},project={...all[projectId]};
  if(validConnectionSides(sides))project[fromId]={from:sides.from,to:sides.to};else delete project[fromId];
  if(Object.keys(project).length)all[projectId]=project;else delete all[projectId];
  if(Object.keys(all).length)item[CONNECTION_SIDES]=all;else delete item[CONNECTION_SIDES];
}
export function cardAnchor(node,side){
  const width=node.width||216,height=node.height||132;
  return {x:node.x+(side==='left'?0:side==='right'?width:width/2),y:node.y+(side==='top'?0:side==='bottom'?height:height/2)};
}
export function nearestCardSide(node,point){
  const distances={top:Math.abs(point.y-node.y),right:Math.abs(point.x-node.x-(node.width||216)),bottom:Math.abs(point.y-node.y-(node.height||132)),left:Math.abs(point.x-node.x)};
  return CARD_SIDES.reduce((a,b)=>distances[a]<=distances[b]?a:b);
}
export function connectionCurve(a,b,fromSide='right',toSide='left'){
  const distance=Math.max(32,Math.hypot(b.x-a.x,b.y-a.y)/2),na=NORMAL[fromSide],nb=NORMAL[toSide];
  return `M${a.x},${a.y} C${a.x+na.x*distance},${a.y+na.y*distance} ${b.x+nb.x*distance},${b.y+nb.y*distance} ${b.x},${b.y}`;
}
export function connectionPath(from,to,projectId){
  const sides=connectionSides(from,to,projectId);
  return connectionCurve(cardAnchor(from,sides.from),cardAnchor(to,sides.to),sides.from,sides.to);
}

export function installCanvasConnections({SienCalendarView}){
  const P=SienCalendarView.prototype,escapeBack=P.handleEscapeBackEvent;
  P.handleEscapeBackEvent=function(event,...args){
    if(event?.key==='Escape'&&(this.projectConnectionActive||this.projectConnectionSelected)&&!event.isComposing){
      if(event.__sienProjectNativeMenuEscape||this.nativeEscapeOwner?.(null,event.target,this.containerEl?.ownerDocument?.activeElement)){event.__sienProjectNativeMenuEscape=true;return false;}
      this.projectConnectionEscape?.();this.claimEscapeBackEvent(event);return true;
    }
    return escapeBack.call(this,event,...args);
  };
  P.mountProjectConnections=function({project,graph,canvas,svg,paths,parent}){
    this.projectConnectionCleanup?.();
    const view=this,doc=canvas.ownerDocument,win=doc.defaultView,viewport=canvas.closest('.sien-project-scroll')||parent;
    const hint=viewport.createDiv({cls:'sien-project-connection-hint',attr:{role:'status','aria-live':'polite'}});
    hint.hidden=true;canvas.classList.add('sien-canvas-connections');
    let state=null,selected=null,hovered=null,touchNode=null,touchTap=null,handledTouch=null,handles=[],frame=null,leaveTimer=null,disposed=false;
    const listeners=[],listen=(element,type,fn,options)=>{element.addEventListener(type,fn,options);listeners.push(()=>element.removeEventListener(type,fn,options));};
    const zoom=()=>view.projectCameras.get(project.id)?.zoom||1;
    const eventPoint=event=>{const r=canvas.getBoundingClientRect(),z=zoom();return{x:(event.clientX-r.left)/z,y:(event.clientY-r.top)/z};};
    const suppressClick=()=>{view.projectPanSuppressedUntil=view.projectConnectionClickUntil=Date.now()+300;};
    const hintText=(text,point)=>{
      hint.textContent=text;hint.hidden=!text;
      if(text&&point){const r=viewport.getBoundingClientRect();hint.style.left=Math.max(8,Math.min(point.clientX-r.left+14,viewport.clientWidth-hint.offsetWidth-8))+'px';hint.style.top=Math.max(8,Math.min(point.clientY-r.top+18,viewport.clientHeight-hint.offsetHeight-8))+'px';}
    };
    const clearPort=(node)=>{for(const port of node.card.querySelectorAll('.sien-project-port'))port.classList.remove('is-port-visible');};
    const revealPort=(node,side)=>{clearPort(node);node.card.querySelector(`[data-side="${side}"]`)?.classList.add('is-port-visible');};
    const clearTouchNode=()=>{touchNode?.card.classList.remove('is-connection-selected');touchNode=null;};
    const targetAt=event=>{
      const bounds=viewport.getBoundingClientRect();
      if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)return null;
      const point=eventPoint(event),hit=doc.elementFromPoint(event.clientX,event.clientY),card=hit?.closest('.sien-project-node');
      let node=graph.nodes.get(card?.dataset.itemId||hit?.closest('[data-node-id]')?.dataset.nodeId);
      if(!node){const margin=12/zoom();node=[...graph.nodes.values()].find(n=>point.x>=n.x-margin&&point.x<=n.x+(n.width||216)+margin&&point.y>=n.y-margin&&point.y<=n.y+(n.height||132)+margin);}
      return node?{node,side:nearestCardSide(node,point)}:null;
    };
    const pair=target=>({from:state.end==='from'?target?.node.id:state.from,to:state.end==='to'?target?.node.id:state.to});
    const sides=target=>({from:state.end==='from'?target?.side:state.fromSide,to:state.end==='to'?target?.side:state.toSide});
    const disconnectAt=target=>!!state.replace&&target?.node.id===(state.end==='to'?state.from:state.to);
    const allowed=target=>{
      if(!target)return false;
      const p=pair(target),anchors=sides(target),key=[p.from,p.to,anchors.from,anchors.to].join('|');
      if(!state.allowed.has(key))state.allowed.set(key,!!(p.from&&p.to&&view.projectConnectionAllowed(project,graph.nodes.get(p.from)?.item,graph.nodes.get(p.to)?.item,{replace:state.replace,sides:anchors})));
      return state.allowed.get(key);
    };
    const commit=async(from,to,options={})=>{
      if(view.projectConnectionBusy)return;
      view.projectConnectionBusy=true;
      try{await view.updateProjectConnection(project,graph.nodes.get(from)?.item,graph.nodes.get(to)?.item,options);}
      finally{view.projectConnectionBusy=false;}
    };
    const clearState=()=>{
      if(!state)return;
      const previous=state;state=null;
      previous.preview.remove();previous.source.card.classList.remove('is-connecting');
      previous.edge?.path.classList.remove('is-reconnecting');previous.edge?.hit.classList.remove('is-reconnecting');
      previous.target?.node.card.classList.remove('is-connection-target','is-connection-invalid');
      for(const node of graph.nodes.values())clearPort(node);
      if(previous.capture?.hasPointerCapture?.(previous.pointer))previous.capture.releasePointerCapture(previous.pointer);
      if(frame!==null){win.cancelAnimationFrame(frame);frame=null;}
      canvas.classList.remove('is-connecting');view.projectConnectionActive=false;hintText('');
    };
    const clearHandles=()=>{for(const handle of handles)handle.remove();handles=[];};
    const clearSelection=()=>{
      selected?.path.classList.remove('is-selected');selected?.hit.classList.remove('is-selected');selected?.hit.setAttribute('aria-pressed','false');
      hovered?.path.classList.remove('is-hovered');selected=null;hovered=null;view.projectConnectionSelected=false;clearHandles();
      win.clearTimeout(leaveTimer);leaveTimer=null;
    };
    const abort=()=>{touchTap=null;clearState();clearSelection();clearTouchNode();};
    const paint=()=>{
      frame=null;if(disposed)return;
      for(const edge of paths){const d=connectionPath(graph.nodes.get(edge.from),graph.nodes.get(edge.to),project.id);edge.path.setAttribute('d',d);edge.hit.setAttribute('d',d);}
      if(state){
        const p=pair(state.target),anchors=sides(state.target);
        const a=p.from?cardAnchor(graph.nodes.get(p.from),anchors.from):state.free,b=p.to?cardAnchor(graph.nodes.get(p.to),anchors.to):state.free;
        state.preview.setAttribute('d',connectionCurve(a,b,anchors.from||'right',anchors.to||'left'));
      }
      const edge=selected||hovered;
      if(edge&&handles.length){
        const length=edge.path.getTotalLength(),inset=Math.min(32/zoom(),length*.25);
        for(const handle of handles){const point=edge.path.getPointAtLength(handle.dataset.end==='from'?inset:length-inset);handle.style.left=point.x+'px';handle.style.top=point.y+'px';}
      }
    };
    const schedule=()=>{if(frame===null)frame=win.requestAnimationFrame(paint);};
    const updateTarget=event=>{
      if(!state)return;
      state.target?.node.card.classList.remove('is-connection-target','is-connection-invalid');if(state.target)clearPort(state.target.node);
      state.target=targetAt(event);state.free=eventPoint(event);
      const target=state.target,valid=allowed(target),remove=disconnectAt(target);
      state.preview.classList.toggle('is-invalid',!!target&&!valid&&!remove);
      if(target){target.node.card.classList.add(valid||remove?'is-connection-target':'is-connection-invalid');revealPort(target.node,target.side);}
      hintText(remove?'놓아서 연결 해제':target&&!valid?'자기 자신·중복·순환 연결은 만들 수 없습니다':target?'놓아서 연결':state.replace?'빈 공간에 놓으면 연결 해제 · Esc 취소':'빈 공간에 놓으면 일정 추가 · Esc 취소',event);
      schedule();
    };
    const begin=(event,config)=>{
      if(view.projectConnectionBusy||event&&event.button!==0)return;
      event?.preventDefault();event?.stopPropagation();view.projectNodeMoveCleanup?.();view.closeDetailPopover();view.closeSearchSelect?.();view.projectResourcesPanel?.close();clearState();clearTouchNode();
      const source=graph.nodes.get(config.end==='to'?config.from:config.to);
      if(!source||source.item.readOnly||source.item._readOnly)return;
      const preview=doc.createElementNS(svg.namespaceURI,'path');preview.classList.add('sien-project-connection-preview');svg.appendChild(preview);
      state={...config,source,preview,target:null,pointer:event?.pointerId??null,start:event?{x:event.clientX,y:event.clientY}:null,free:event?eventPoint(event):cardAnchor(source,config.end==='to'?config.fromSide:config.toSide),moved:false,allowed:new Map(),capture:event?.currentTarget};
      if(config.replace){state.edge=paths.find(edge=>edge.from===config.replace.from&&edge.to===config.replace.to);state.edge?.path.classList.add('is-reconnecting');state.edge?.hit.classList.add('is-reconnecting');}
      view.projectConnectionActive=true;source.card.classList.add('is-connecting');canvas.classList.add('is-connecting');
      revealPort(source,config.end==='to'?config.fromSide:config.toSide);
      if(event)try{state.capture?.setPointerCapture(event.pointerId);}catch(_){/* Capture is optional when a pointer ends before dispatch completes. */}
      else hintText('다른 카드 가장자리에 초점을 옮기고 Enter · Esc 취소');
      paint();
    };
    const finish=target=>{
      if(!state)return;
      const current=state,p=pair(target),anchors=sides(target),valid=allowed(target),remove=disconnectAt(target);
      clearState();clearSelection();suppressClick();
      if(remove)void commit(current.replace.from,current.replace.to,{remove:true});
      else if(valid){
        if(current.replace&&p.from===current.replace.from&&p.to===current.replace.to&&anchors.from===current.fromSide&&anchors.to===current.toSide)return;
        void commit(p.from,p.to,{replace:current.replace,sides:anchors});
      }
    };
    const leaveEdge=()=>{win.clearTimeout(leaveTimer);leaveTimer=win.setTimeout(()=>{if(!selected&&!state){hovered?.path.classList.remove('is-hovered');hovered=null;clearHandles();}},100);};
    const showHandles=edge=>{
      win.clearTimeout(leaveTimer);if(state||(selected||hovered)===edge&&handles.length)return;
      clearHandles();hovered?.path.classList.remove('is-hovered');hovered=edge;edge.path.classList.add('is-hovered');
      for(const end of ['from','to']){
        const handle=canvas.createEl('button',{cls:'sien-project-edge-endpoint',attr:{type:'button','data-end':end,'data-from':edge.from,'data-to':edge.to,'data-node-id':edge[end],'aria-label':end==='from'?'연결 시작점 이동':'연결 도착점 이동'}});
        handles.push(handle);
        const start=event=>{const anchors=connectionSides(graph.nodes.get(edge.from),graph.nodes.get(edge.to),project.id);begin(event,{from:edge.from,to:edge.to,fromSide:anchors.from,toSide:anchors.to,end,replace:{from:edge.from,to:edge.to}});};
        handle.addEventListener('pointerenter',()=>win.clearTimeout(leaveTimer));handle.addEventListener('pointerleave',leaveEdge);
        handle.addEventListener('pointerdown',start);handle.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();});
        handle.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();start(null);}});
      }
      paint();
    };
    const select=(edge,event)=>{
      if(state)return;
      event?.preventDefault();event?.stopPropagation();clearSelection();clearTouchNode();showHandles(edge);selected=edge;view.projectConnectionSelected=true;
      edge.path.classList.add('is-selected');edge.hit.classList.add('is-selected');edge.hit.setAttribute('aria-pressed','true');
    };
    for(const edge of paths){
      listen(edge.hit,'pointerenter',event=>{if(event.pointerType!=='touch'&&!selected)showHandles(edge);});listen(edge.hit,'pointerleave',leaveEdge);
      listen(edge.hit,'click',event=>select(edge,event));
      listen(edge.hit,'contextmenu',event=>{select(edge,event);view.openProjectEdgeMenu(event,project,graph.nodes.get(edge.from).item,graph.nodes.get(edge.to).item);});
      listen(edge.hit,'keydown',event=>{if(event.key==='Enter'||event.key===' '){select(edge,event);}else if(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey){event.preventDefault();const r=edge.hit.getBoundingClientRect();view.openProjectEdgeMenu({preventDefault(){},stopPropagation(){},clientX:r.left+r.width/2,clientY:r.top+r.height/2},project,graph.nodes.get(edge.from).item,graph.nodes.get(edge.to).item);}});
    }
    for(const node of graph.nodes.values()){
      for(const side of CARD_SIDES){
        const names={top:'위',right:'오른쪽',bottom:'아래',left:'왼쪽'};
        const port=node.card.createEl('button',{cls:'sien-project-port',attr:{type:'button','data-side':side,'aria-label':`${node.item.title||'일정'} ${names[side]} 가장자리에서 연결`}});
        port.disabled=!!(node.item.readOnly||node.item._readOnly);
        port.addEventListener('pointerdown',event=>{clearSelection();begin(event,{from:node.id,to:null,fromSide:side,toSide:'left',end:'to'});});
        port.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();});
        port.addEventListener('keydown',event=>{if(event.key!=='Enter'&&event.key!==' ')return;event.preventDefault();event.stopPropagation();if(state)finish({node,side});else{clearSelection();begin(null,{from:node.id,to:null,fromSide:side,toSide:'left',end:'to'});}});
      }
      listen(node.card,'pointerleave',()=>{if(!state)clearPort(node);});
    }
    listen(canvas,'pointermove',event=>{
      if(state||event.pointerType==='touch')return;
      const target=targetAt(event),point=eventPoint(event);
      for(const node of graph.nodes.values()){
        if(node!==target?.node){clearPort(node);continue;}
        const anchor=cardAnchor(node,target.side),distance=target.side==='top'||target.side==='bottom'?Math.abs(point.y-anchor.y):Math.abs(point.x-anchor.x);
        if(distance<=12/zoom())revealPort(node,target.side);else clearPort(node);
      }
    });
    const move=event=>{
      if(touchTap?.pointer===event.pointerId&&Math.hypot(event.clientX-touchTap.x,event.clientY-touchTap.y)>5)touchTap=null;
      if(!state||state.pointer!==event.pointerId)return;
      if(!state.moved&&Math.hypot(event.clientX-state.start.x,event.clientY-state.start.y)<5)return;
      state.moved=true;event.preventDefault();updateTarget(event);
    };
    const up=event=>{
      if(touchTap?.pointer===event.pointerId){
        const tap=touchTap;touchTap=null;
        if(Date.now()-tap.time<600&&!tap.node?.card.classList.contains('is-dragging')){
          handledTouch={pointer:event.pointerId,until:Date.now()+400};event.preventDefault();
          if(tap.edge)select(tap.edge,event);
          else if(touchNode===tap.node){clearTouchNode();view.openDetailPopover(tap.node.item,tap.node.card);}
          else{clearTouchNode();clearSelection();touchNode=tap.node;touchNode.card.classList.add('is-connection-selected');}
        }
        return;
      }
      if(!state||state.pointer!==event.pointerId)return;
      if(!state.moved){clearState();return;}
      const target=targetAt(event);if(target){finish(target);return;}
      const current=state,r=viewport.getBoundingClientRect(),inside=event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom;
      clearState();clearSelection();suppressClick();
      if(inside&&current.replace)void commit(current.replace.from,current.replace.to,{remove:true});
      else if(inside)view.openProjectAddMenu(event,project,graph.nodes.get(current.from).item);
    };
    const cancel=event=>{if(touchTap?.pointer===event.pointerId)touchTap=null;if(state?.pointer===event.pointerId){abort();suppressClick();}};
    const click=event=>{
      if(event.pointerType==='touch'&&handledTouch?.pointer===event.pointerId&&Date.now()<handledTouch.until){event.preventDefault();event.stopImmediatePropagation();return;}
      if(event.target.closest('.sien-project-port,.sien-project-edge-endpoint,.sien-project-edge-hit'))return;
      const target=targetAt(event);
      if(state?.pointer===null){event.preventDefault();event.stopImmediatePropagation();if(target)finish(target);else abort();return;}
      if(event.pointerType==='touch'&&target&&Date.now()>=(view.projectPanSuppressedUntil||0)){
        if(touchNode!==target.node){clearTouchNode();clearSelection();touchNode=target.node;touchNode.card.classList.add('is-connection-selected');event.preventDefault();event.stopImmediatePropagation();}
        else clearTouchNode();
      }
    };
    const down=event=>{
      if(!state&&view.projectPanSuppressedUntil===view.projectConnectionClickUntil){view.projectPanSuppressedUntil=0;view.projectConnectionClickUntil=0;}
      if(event.pointerType==='touch'){
        touchTap=null;
        if(event.isPrimary!==false&&!event.target.closest('button,input,textarea,select,a')){
          const path=event.target.closest('.sien-project-edge-hit'),edge=paths.find(edge=>edge.hit===path),node=graph.nodes.get(event.target.closest('.sien-project-node')?.dataset.itemId);
          if(edge||node)touchTap={pointer:event.pointerId,x:event.clientX,y:event.clientY,time:Date.now(),edge,node};
        }
      }
      if(event.target.closest('.sien-project-port,.sien-project-edge-endpoint,.sien-project-edge-hit'))return;
      if(!state)clearSelection();if(!canvas.contains(event.target)||!event.target.closest('.sien-project-node'))clearTouchNode();
    };
    const key=event=>{
      if(event.__sienProjectNativeMenuEscape||event.isComposing||view.nativeEscapeOwner?.(null,event.target,doc.activeElement))return;
      if(event.key==='Escape'&&(state||selected||touchNode)){event.preventDefault();event.stopImmediatePropagation();abort();return;}
      if(selected&&!state&&(event.key==='Delete'||event.key==='Backspace')&&!event.target.closest('input,textarea,[contenteditable=true]')){event.preventDefault();event.stopImmediatePropagation();const edge=selected;clearSelection();void commit(edge.from,edge.to,{remove:true});}
    };
    listen(canvas,'click',click,true);listen(doc,'pointerdown',down,true);listen(doc,'keydown',key,true);
    listen(win,'pointermove',move,{passive:false});listen(win,'pointerup',up);listen(win,'pointercancel',cancel);listen(win,'blur',abort);
    listen(doc,'lostpointercapture',cancel,true);
    view.projectConnectionDragCleanup=()=>{touchTap=null;clearState();};view.projectConnectionEscape=abort;view.projectConnectionReposition=paint;
    const cleanup=()=>{
      if(disposed)return;disposed=true;abort();hint.remove();if(frame!==null)win.cancelAnimationFrame(frame);
      for(const remove of listeners)remove();for(const node of graph.nodes.values())for(const port of node.card.querySelectorAll('.sien-project-port'))port.remove();
      canvas.classList.remove('sien-canvas-connections');
      if(view.projectConnectionCleanup===cleanup){view.projectConnectionCleanup=null;view.projectConnectionDragCleanup=null;view.projectConnectionEscape=null;view.projectConnectionReposition=null;}
    };
    view.projectConnectionCleanup=cleanup;if(!view.projectConnectionRegistered){view.projectConnectionRegistered=true;view.register(()=>view.projectConnectionCleanup?.());}
    return {paint,select};
  };
}
