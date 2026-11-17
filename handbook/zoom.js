/* Vanaheim illustrated-book zoom v1. Loaded between geometry and reader boot. */
(() => {
  'use strict';
  if (window.VanaheimBookZoom) return;
  const geometry=window.VanaheimBookGeometry, viewport=document.getElementById('reader-viewport');
  if (!geometry || !viewport) return;
  const root=document.documentElement;
  let slots=[],pages=[];
  function refresh(){slots=[...viewport.querySelectorAll('.page-slot')];pages=slots.map(s=>s.querySelector('.book-page'));}
  refresh();
  const key='vanaheim-handbook-combined-v01-zoom', original=geometry.layout;
  const min=.1,max=3,clamp=v=>Math.min(max,Math.max(min,v));
  let scale=null, live=null, currentView=null;
  try { const v=Number(localStorage.getItem(key));if(v>=min&&v<=max)scale=v; } catch(_){}
  const bar=document.createElement('div');bar.className='book-zoom-controls';bar.setAttribute('role','group');bar.setAttribute('aria-label','Book zoom');
  bar.innerHTML='<button type="button" class="zoom-step" id="book-zoom-out" aria-label="Zoom out" title="Zoom out (Ctrl −)">−</button><output id="book-zoom-value" aria-live="polite" aria-label="Page zoom">100%</output><button type="button" class="zoom-step" id="book-zoom-in" aria-label="Zoom in" title="Zoom in (Ctrl +)">+</button><button type="button" id="book-zoom-fit" title="Fit page or spread (Ctrl 0)">Fit</button>';
  document.body.append(bar);
  const out=bar.querySelector('output'),minus=bar.querySelector('#book-zoom-out'),plus=bar.querySelector('#book-zoom-in');
  function controls(){out.value=Math.round((scale||1)*100)+'%';out.textContent=out.value;minus.disabled=scale<=min;plus.disabled=scale>=max;root.dataset.bookZoom=String(scale);}
  function save(){try{localStorage.setItem(key,String(scale));}catch(_){}}
  const padding=()=>{const s=getComputedStyle(viewport);return{left:parseFloat(s.paddingLeft)||0,right:parseFloat(s.paddingRight)||0,top:parseFloat(s.paddingTop)||0,bottom:parseFloat(s.paddingBottom)||0};};
  geometry.layout=function(view,width,height,active,count){
    const value=original(view,width,height,active,count);
    if(scale===null)scale=clamp(value.scale);
    currentView=view;
    Object.assign(value,{scale,width:geometry.PAGE_WIDTH*scale,height:geometry.PAGE_HEIGHT*scale,rowHeight:geometry.PAGE_HEIGHT*scale});
    live=value;controls();return value;
  };
  function anchor(point){
    refresh();
    const v=viewport.getBoundingClientRect(),x=point?.x??v.left+v.width/2,y=point?.y??v.top+v.height/2;
    let best=null,d=Infinity;
    for(const page of pages){const r=page.getBoundingClientRect();const distance=Math.max(r.top-y,0,y-r.bottom)*4+Math.max(r.left-x,0,x-r.right);if(distance<d){d=distance;best={page,r};}}
    return best?{page:best.page,x:(x-best.r.left)/best.r.width,y:(y-best.r.top)/best.r.height,screenX:x,screenY:y}:null;
  }
  function draw(){
    refresh();
    if(!live)return;
    Object.assign(live,{scale,width:geometry.PAGE_WIDTH*scale,height:geometry.PAGE_HEIGHT*scale,rowHeight:geometry.PAGE_HEIGHT*scale});
    slots.forEach((slot,i)=>{slot.style.width=live.width+'px';slot.style.height=live.rowHeight+'px';pages[i].style.top='0px';pages[i].style.transform='scale('+scale+')';});
  }
  function set(value,point){
    const mark=anchor(point);scale=clamp(value);draw();controls();save();
    if(mark){const r=mark.page.getBoundingClientRect();viewport.scrollLeft+=r.left+r.width*mark.x-mark.screenX;viewport.scrollTop+=r.top+r.height*mark.y-mark.screenY;}
    viewport.dispatchEvent(new Event('scroll'));
  }
  function fit(){refresh();const p=padding(),view=root.dataset.view||currentView||'spread';const v=original(view,Math.max(40,viewport.clientWidth-p.left-p.right),Math.max(40,viewport.clientHeight-p.top-p.bottom),0,pages.length);set(v.scale);}
  const step=direction=>set(Math.round(((scale||1)+direction*.1)*100)/100);
  minus.addEventListener('click',()=>step(-1));plus.addEventListener('click',()=>step(1));bar.querySelector('#book-zoom-fit').addEventListener('click',fit);
  document.addEventListener('keydown',event=>{
    if(!(event.ctrlKey||event.metaKey)||event.altKey||document.querySelector('dialog[open]'))return;
    const k=event.key;
    if(['+','=','-','_','0'].includes(k)||['NumpadAdd','NumpadSubtract','Numpad0'].includes(event.code)){
      event.preventDefault();event.stopImmediatePropagation();
      if(k==='0'||event.code==='Numpad0')fit();else step(k==='-'||k==='_'||event.code==='NumpadSubtract'?-1:1);
    }
  },true);
  viewport.addEventListener('wheel',event=>{if(!event.ctrlKey&&!event.metaKey)return;event.preventDefault();set((scale||1)*Math.exp(-event.deltaY*.002),{x:event.clientX,y:event.clientY});},{passive:false});
  // Leave middle-button events to the browser's native autoscroll behaviour.
  window.VanaheimBookZoom={version:1,get scale(){return scale;},set,fit};
})();
