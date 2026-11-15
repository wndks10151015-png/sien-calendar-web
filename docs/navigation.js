// Serialize programmatic Back + immediate opening of another overlay. Otherwise
// the old popstate can accidentally close a newly opened modal on mobile.
const stack=[];let queue=Promise.resolve(),programmatic=false;
export function pushOverlay(onBack){
  const entry={id:crypto.randomUUID(),onBack};stack.push(entry);
  queue=queue.then(()=>{if(stack.includes(entry))history.pushState({sienOverlay:entry.id},"");});
  return entry;
}
export function removeOverlay(entry){
  const index=stack.indexOf(entry);if(index<0)return;stack.splice(index,1);
  queue=queue.then(()=>{
    if(history.state?.sienOverlay!==entry.id)return;
    return new Promise(resolve=>{
      programmatic=true;
      const done=()=>{programmatic=false;resolve();};
      addEventListener("popstate",done,{once:true});history.back();
    });
  });
}
addEventListener("popstate",event=>{
  if(programmatic)return;
  const top=stack.at(-1);
  if(top&&event.state?.sienOverlay!==top.id){stack.pop();top.onBack();}
});
