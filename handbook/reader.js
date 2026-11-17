(async () => {
  'use strict';
  const response=await fetch('handbook/book.json');
  if(!response.ok)throw new Error('The handbook index could not be loaded.');
  const book=await response.json();
  const root = document.documentElement;
  const geometry = window.VanaheimBookGeometry;
  const viewport = document.getElementById('reader-viewport');
  let slots=[],pages=[];
  function refreshPages(){slots=[...document.querySelectorAll('.page-slot')];pages=slots.map(slot=>slot.querySelector('.book-page'));}
  refreshPages();
  const viewButtons = [...document.querySelectorAll('[data-set-view]')];
  const previous = document.getElementById('previous-page');
  const next = document.getElementById('next-page');
  const counter = document.getElementById('page-count');
  const themeButton = document.getElementById('mode-button');
  const sidebar = document.getElementById('handbook-sidebar');
  const toolbar = document.getElementById('reader-toolbar');
  const navToggle = document.getElementById('toggle-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  const options = document.getElementById('reader-options');
  const pageInput = document.getElementById('page-number');
  const mobile = window.matchMedia('(max-width: 760px)');
  const toc = document.querySelector('.toc');
  const navLinks = [...document.querySelectorAll('.toc a[href^="#"]')];
  function bookmarkRow(node, title, number, group=false) {
    const label=document.createElement('span');label.className='bookmark-label';label.textContent=title;
    node.replaceChildren(label);node.classList.add(group?'bookmark-group':'bookmark-link');
    if(number){const badge=document.createElement('span');badge.className='bookmark-page';badge.textContent=number;badge.setAttribute('aria-hidden','true');node.append(badge);}
    if(!group)node.setAttribute('aria-label',title+(number?', page '+number:''));
    let depth=0;
    for(let parent=group?node.parentElement.parentElement:node.parentElement;parent&&parent!==toc;parent=parent.parentElement){
      if(parent.tagName==='DETAILS'||parent.matches('li>ul,li>ol'))depth++;
    }
    node.style.setProperty('--bookmark-depth',Math.min(depth,4));
  }
  function bookmarkTitle(node){const copy=node.cloneNode(true);copy.querySelectorAll('[aria-hidden="true"],.toc-number,.toc-entry-count').forEach(n=>n.remove());return copy.textContent.replace(/\s+/g,' ').trim();}
  navLinks.forEach(link=>{
    const title=bookmarkTitle(link);link.dataset.bookmarkTitle=title;
    bookmarkRow(link,title,book.anchors[link.hash.slice(1)]);
  });
  toc.querySelectorAll('summary').forEach(summary=>{
    const first=summary.parentElement.querySelector('a[href^="#"]');
    bookmarkRow(summary,bookmarkTitle(summary),summary.parentElement.dataset.startPage||(first&&book.anchors[first.hash.slice(1)]),true);
  });
  let sections=[];
  const search = document.getElementById('chapter-search');
  const results = document.getElementById('search-results');
  const searchStatus = document.getElementById('search-status');
  const clear = document.getElementById('clear-search');
  let searchData=null,searchPending=null;
  function loadSearch(){return searchPending ||= fetch(book.search).then(r=>{if(!r.ok)throw Error('Search could not load.');return r.json();}).then(data=>searchData=data).catch(error=>{searchPending=null;throw error;});}
  const key = 'vanaheim-handbook-combined-v01-';
  const read = name => { try { return localStorage.getItem(key + name); } catch (_) { return null; } };
  const write = (name, value) => { try { localStorage.setItem(key + name, value); } catch (_) {} };
  const views = ['single', 'spread', 'wide'];
  let device = mobile.matches ? 'mobile-' : 'desktop-';
  let view = read(mobile.matches ? 'mobile-view' : 'view');
  if (!views.includes(view)) view = mobile.matches ? 'wide' : 'spread';
  let zoomMode = read(device+'zoom-mode') === 'manual' ? 'manual' : 'fit';
  const zoom=window.VanaheimBookZoom, zoomSet=zoom.set.bind(zoom), zoomFit=zoom.fit.bind(zoom);
  const zoomBar=document.querySelector('.book-zoom-controls');
  document.getElementById('reader-zoom-slot').append(zoomBar);
  const zoomOutput=document.getElementById('book-zoom-value');
  const zoomReset=document.createElement('button');zoomReset.type='button';zoomReset.id='book-zoom-reset';
  zoomReset.title='Reset zoom to fit (Ctrl 0)';zoomReset.setAttribute('aria-label','Reset zoom to fit');
  zoomOutput.before(zoomReset);zoomReset.append(zoomOutput);
  const saveZoom = () => {write(device+'zoom-mode',zoomMode);write(device+'zoom-scale',String(zoom.scale));};
  const manualZoom = () => {zoomMode='manual';requestAnimationFrame(saveZoom);};
  zoom.set=(value,point)=>{zoomMode='manual';zoomSet(value,point);saveZoom();};
  zoom.fit=()=>{zoomMode='fit';zoomFit();saveZoom();};
  zoomReset.addEventListener('click',()=>zoom.fit());
  zoomBar.addEventListener('click',e=>{if(e.target.closest('.zoom-step'))manualZoom();},true);
  window.addEventListener('keydown',e=>{
    if(!(e.ctrlKey||e.metaKey)||e.altKey)return;
    if(e.key==='0'||e.code==='Numpad0'){zoomMode='fit';requestAnimationFrame(saveZoom);}
    else if(['+','=','-','_'].includes(e.key)||['NumpadAdd','NumpadSubtract'].includes(e.code))manualZoom();
  },true);
  viewport.addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey)manualZoom();},{capture:true,passive:true});
  function restoreZoom(){const scale=Number(read(device+'zoom-scale'));if(zoomMode==='manual'&&scale>=.1&&scale<=3)zoomSet(scale);else zoomMode='fit';}
  let position = { page: 0, fraction: 0 };
  let sizing = null;
  let selectedTarget = null;
  let resizeFrame = 0, scrollFrame = 0;
  let anchoredPosition=null;
  const chapterScopes=[...document.querySelectorAll('.chapter-scope')];
  const stage=document.getElementById('book-stage');
  const scopeByKey=new Map(chapterScopes.map(s=>[s.dataset.chapter,s]));
  const emptyChapters=new Map(chapterScopes.map(s=>[s.dataset.chapter,s.innerHTML]));
  const mounted=new Set(), pending=new Map(), chapterCache=new Map();
  const loading=document.getElementById('chapter-loading'), retry=document.getElementById('retry-chapter');
  let desired=new Set(), navigating=false, navigationToken=0, requestedHash='', printMode=false;
  let rememberTimer=0, visibilityRequest=null;
  const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const chapterFor=number=>book.pages[number]?.chapter;
  function loadingState(message,error=false){loading.hidden=!message;loading.querySelector('span').textContent=message||'';retry.hidden=!error;viewport.setAttribute('aria-busy',String(!!message&&!error));}
  function refreshSections(){
    refreshPages();
    navLinks.forEach(link=>{const target=document.getElementById(link.hash.slice(1));if(target&&!target.closest('[data-placeholder]')){target.dataset.navTarget='true';if(!target.hasAttribute('tabindex'))target.tabIndex=-1;}});
    sections=[...document.querySelectorAll('[data-nav-target]')];
  }
  function chapterHtml(key){
    if(chapterCache.has(key))return Promise.resolve(chapterCache.get(key));
    if(pending.has(key))return pending.get(key);
    const chapter=book.chapters.find(c=>c.key===key);
    const promise=fetch(chapter.url).then(r=>{if(!r.ok)throw Error('Chapter request failed: '+r.status);return r.text();}).then(text=>{
      chapterCache.delete(key);chapterCache.set(key,text);
      while(chapterCache.size>3)chapterCache.delete(chapterCache.keys().next().value);
      return text;
    }).finally(()=>pending.delete(key));
    pending.set(key,promise);return promise;
  }
  async function ensureChapters(keys){
    desired=new Set(keys);
    const needed=[...desired];
    const payloads=await Promise.all(needed.map(async key=>[key,mounted.has(key)?null:await chapterHtml(key)]));
    for(const [key,text] of payloads){
      if(!desired.has(key)||mounted.has(key)||!text)continue;
      const template=document.createElement('template');template.innerHTML=text;
      const scope=template.content.querySelector('.chapter-scope');
      const chapter=book.chapters.find(c=>c.key===key);
      if(scope?.dataset.chapter!==key||scope.querySelectorAll('.book-page').length!==chapter.end-chapter.start+1)throw Error('Incomplete chapter.');
      scopeByKey.get(key).replaceChildren(...scope.childNodes);mounted.add(key);
    }
    if(!printMode)for(const key of [...mounted])if(!desired.has(key)){scopeByKey.get(key).innerHTML=emptyChapters.get(key);mounted.delete(key);}
    refreshSections();syncScopes();
  }
  function visibleNumbers(pad=0){
    const box=viewport.getBoundingClientRect(),found=[];
    slots.forEach((slot,i)=>{const r=slot.getBoundingClientRect();if(r.width&&r.bottom>=box.top-pad&&r.top<=box.bottom+pad)found.push(i);});
    return found.length?found:[position.page];
  }
  async function hydrate(numbers){
    const promises=[];
    for(const number of numbers){
      const page=pages[number];if(!page||page.closest('[data-placeholder]'))continue;
      for(const image of page.querySelectorAll('[data-hb-asset]')){
        const attribute=image.dataset.hbAttribute||'src',url=book.assets[image.dataset.hbAsset];
        if(!url)throw Error('Missing illustration.');
        if(image.getAttribute(attribute)!==url)image.setAttribute(attribute,url);
        if(image.tagName==='IMG'){image.decoding='async';promises.push(image.decode());}
      }
    }
    await Promise.all(promises);
  }
  async function ensureVisible(){
    if(navigating||printMode)return;
    const numbers=visibleNumbers(),keys=new Set(numbers.map(chapterFor));
    const signature=[...keys].join(',');
    if(visibilityRequest?.signature===signature)return;
    const request={signature};visibilityRequest=request;
    try{
      if([...keys].some(k=>!mounted.has(k))||[...mounted].some(k=>!keys.has(k))){
        loadingState('Loading '+book.chapters.find(c=>c.key===chapterFor(position.page)).title+'…');
        const mark=rememberPosition();await ensureChapters(keys);
        if(navigating||visibilityRequest!==request)return;
        await document.fonts.ready;layout(mark);
      }
      if(navigating)return;
      await hydrate(visibleNumbers(Math.max(200,sizing?.rowHeight||0)));
      if(!navigating&&visibilityRequest===request){loadingState('');window.HandbookReady=true;}
    }catch(error){console.error(error);if(!navigating)loadingState('This chapter could not load. Check the connection and retry.',true);}
    finally{if(visibilityRequest===request)visibilityRequest=null;}
  }
  function rememberHistory(){
    const mark=rememberPosition();write('position',JSON.stringify(mark));
    const anchor=decodeURIComponent(location.hash.slice(1));
    const id=book.anchors[anchor]===mark.page?anchor:book.pages[mark.page].id;
    requestedHash=id;
    try{history.replaceState({hb:{position:mark,revision:book.revision}},'','#'+id);}catch(_){}
  }
  function scheduleRemember(){clearTimeout(rememberTimer);rememberTimer=setTimeout(()=>{if(!navigating)rememberHistory();},180);}
  window.addEventListener('pagehide',()=>{if(!navigating)rememberHistory();});
  retry.addEventListener('click',()=>{if(requestedHash)void goAnchor(requestedHash,false,'replace');else void ensureVisible();});
  const groups=[...toc.querySelectorAll('details')];
  try{for(const index of JSON.parse(read('bookmark-groups')||'[]'))if(groups[index])groups[index].open=true;}catch(_){}
  groups.forEach(group=>group.addEventListener('toggle',()=>write('bookmark-groups',JSON.stringify(groups.flatMap((g,i)=>g.open?[i]:[])))));
  async function preparePrint(){
    printMode=true;navigating=true;loadingState('Preparing the full book…');
    await ensureChapters(book.chapters.map(c=>c.key));
    await document.fonts.ready;layout();await hydrate(book.pages.map(p=>p.number));
    loadingState('');navigating=false;window.HandbookReady=true;
    return true;
  }
  async function printBook(){
    const mark=rememberPosition();
    try{await preparePrint();await frame();window.print();}
    catch(error){console.error(error);loadingState('The full book could not load for printing. Please retry.',true);}
    finally{printMode=false;navigating=false;layout(mark);void ensureVisible();}
  }
  document.getElementById('print-book')?.addEventListener('click',()=>void printBook());
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='p'){event.preventDefault();void printBook();}},true);

  function syncScopes(){chapterScopes.forEach(s=>{s.dataset.mode=root.dataset.mode;s.dataset.theme=root.dataset.mode;s.dataset.view=root.dataset.view;});}
  const pad = number => String(number).padStart(2, '0');
  const padding = () => {
    const style = getComputedStyle(viewport);
    return { left: parseFloat(style.paddingLeft) || 0, right: parseFloat(style.paddingRight) || 0, top: parseFloat(style.paddingTop) || 0, bottom: parseFloat(style.paddingBottom) || 0 };
  };
  function rememberPosition() {
    // Browser scroll offsets are rounded, and the final spread can be clamped
    // above its ideal row origin. Keep explicit destinations stable until the
    // reader actually scrolls away from them.
    if(anchoredPosition&&Math.abs(viewport.scrollTop-anchoredPosition.scrollTop)<1){position={...anchoredPosition.mark};return {...position};}
    anchoredPosition=null;
    if (sizing) {
      position = geometry.bookmark(viewport.scrollTop+.5, sizing.rowHeight, pages.length, view, position.page);
      if(viewport.scrollHeight-viewport.clientHeight-viewport.scrollTop<1)position.page=pages.length-1;
    }
    return { ...position };
  }
  function updateControls() {
    viewButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.setView === view)));
    const first = view === 'spread' ? Math.floor(position.page / 2) * 2 : position.page;
    const last = view === 'spread' ? Math.min(first + 1, pages.length - 1) : first;
    counter.textContent = (first===last ? pages[first].dataset.pageLabel : first===0 ? 'Cover · 1' : pages[first].dataset.pageLabel+'–'+pages[last].dataset.pageLabel)+' / '+pages.at(-1).dataset.pageLabel;
    if(document.activeElement!==pageInput)pageInput.value=String(position.page||1);
    pageInput.title=counter.textContent;
    previous.disabled = first === 0;
    next.disabled = last >= pages.length - 1;
    previous.setAttribute('aria-label', view === 'spread' ? 'Previous spread' : 'Previous page');
    next.setAttribute('aria-label', view === 'spread' ? 'Next spread' : 'Next page');
    previous.title = previous.getAttribute('aria-label');
    next.title = next.getAttribute('aria-label');
    const chapter=book.chapters.find(c=>position.page>=c.start&&position.page<=c.end);
    document.querySelector('.toolbar-title').textContent=chapter?.title||'Core Rulebook';
  }
  function markNavigation(id) {
    [...navLinks,...results.querySelectorAll('a')].forEach(link => {
      if (link.getAttribute('href') === '#' + id) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }
  function selectTarget(target = null) {
    if (selectedTarget) selectedTarget.removeAttribute('data-reader-selected');
    selectedTarget = sections.includes(target) ? target : null;
    if (selectedTarget) selectedTarget.setAttribute('data-reader-selected', 'true');
  }
  function layout(mark = rememberPosition()) {
    position = { ...mark };
    root.dataset.view = view;
    syncScopes();
    if(zoomMode==='fit')zoomFit();
    const p = padding();
    sizing = geometry.layout(view, Math.max(40, viewport.clientWidth - p.left - p.right), Math.max(40, viewport.clientHeight - p.top - p.bottom), position.page, pages.length);
    slots.forEach((slot, index) => {
      slot.hidden = !sizing.visible.includes(index);
      slot.style.width = sizing.width + 'px';
      slot.style.height = sizing.rowHeight + 'px';
      pages[index].style.top = (sizing.rowHeight - sizing.height) / 2 + 'px';
      pages[index].style.transform = 'scale(' + sizing.scale + ')';
    });
    const top = geometry.scrollPosition(position, sizing.rowHeight, view);
    viewport.scrollTo({ top, left: 0, behavior: 'instant' });
    anchoredPosition={scrollTop:viewport.scrollTop,mark:{...position}};
    updateControls();
  }
  function setView(value) {
    if (!views.includes(value) || value === view) return;
    const mark = rememberPosition();
    view = value;
    write(mobile.matches?'mobile-view':'view', view);
    zoomMode='fit';write(device+'zoom-mode',zoomMode);
    layout(mark);
  }
  function goPage(delta){
    const current=rememberPosition(),base=view==='spread'?Math.floor(current.page/2)*2:current.page;
    const number=geometry.clamp(base+delta*(view==='spread'?2:1),0,book.count);
    if(number===base)return;
    void goAnchor(book.pages[number].id,false,chapterFor(number)===chapterFor(current.page)?'replace':'push');
  }
  async function goAnchor(id,focus=true,historyMode='push',saved=null){
    if(!(id in book.anchors)){loadingState('That bookmark is not in this edition.',true);return false;}
    const token=++navigationToken;
    if(historyMode==='push'&&!navigating)rememberHistory();
    navigating=true;window.HandbookReady=false;requestedHash=id;
    const number=saved?.page>=0&&saved.page<=book.count?saved.page:book.anchors[id];
    const mark=saved?{page:number,fraction:saved.fraction||0}:{page:number,fraction:0};
    if(mobile.matches)setNavOpen(false);
    loadingState(mounted.has(chapterFor(number))?'':'Loading '+book.chapters.find(c=>c.key===chapterFor(number)).title+'…');
    try{
      layout(mark);
      const keys=new Set(visibleNumbers().map(chapterFor));keys.add(chapterFor(number));
      await ensureChapters(keys);if(token!==navigationToken)return false;
      await document.fonts.ready;if(token!==navigationToken)return false;
      layout(mark);await frame();
      const target=document.getElementById(id)|| (saved?document.getElementById(book.pages[number].id):null);
      if(!target||target.closest('[data-placeholder]'))throw Error('The bookmark did not load.');
      if(view==='wide'&&!saved){
        const top=viewport.scrollTop+target.getBoundingClientRect().top-viewport.getBoundingClientRect().top-25;
        viewport.scrollTo({top:Math.max(0,top),behavior:'instant'});
        const found=geometry.bookmark(viewport.scrollTop+.5,sizing.rowHeight,pages.length,view,number);
        position={page:number,fraction:found.page===number?found.fraction:0};
        anchoredPosition={scrollTop:viewport.scrollTop,mark:{...position}};
      }
      await hydrate(visibleNumbers(Math.max(200,sizing.rowHeight)));
      if(token!==navigationToken)return false;
      if(focus){if(!target.hasAttribute('tabindex'))target.tabIndex=-1;target.focus({preventScroll:true});}
      selectTarget(target);markNavigation(id);reveal('#'+id);updateControls();
      const state={hb:{position:{...position},revision:book.revision}};
      if(historyMode!=='none')try{history[historyMode==='push'&&location.hash!=='#'+id?'pushState':'replaceState'](state,'','#'+id);}catch(_){}
      write('position',JSON.stringify(position));loadingState('');window.HandbookReady=true;
      return true;
    }catch(error){console.error(error);if(token===navigationToken)loadingState('This chapter could not load. Check the connection and retry.',true);return false;}
    finally{if(token===navigationToken){navigating=false;void ensureVisible();}}
  }
  function theme() {
    const dark = root.dataset.mode === 'dark';
    syncScopes();
    themeButton.setAttribute('aria-pressed', String(dark));
    themeButton.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
    themeButton.setAttribute('aria-label',themeButton.title);
    document.getElementById('theme-label').textContent=dark?'Dark':'Light';
  }
  viewButtons.forEach(button => button.addEventListener('click', () => setView(button.dataset.setView)));
  previous.addEventListener('click', () => goPage(-1));
  next.addEventListener('click', () => goPage(1));
  themeButton.addEventListener('click', () => { root.dataset.mode = root.dataset.mode === 'dark' ? 'light' : 'dark'; write('theme', root.dataset.mode); theme(); });
  document.addEventListener('click',event=>{
    const link=event.target.closest('a[href^="#"]');if(!link)return;
    const id=decodeURIComponent(link.hash.slice(1));if(!(id in book.anchors))return;
    event.preventDefault();void goAnchor(id);
  });
  window.addEventListener('popstate',event=>{const mark=event.state?.hb?.position;void goAnchor(decodeURIComponent(location.hash.slice(1))||book.pages[mark?.page||1].id,false,'none',mark);});
  window.addEventListener('hashchange',()=>{const id=decodeURIComponent(location.hash.slice(1));if(id!==requestedHash)void goAnchor(id,false,'none');});
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    // Navigation keys inside the contents belong to that independently scrolling pane.
    if (event.target.closest('.sidebar,.reader-toolbar')) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); goPage(event.key === 'ArrowRight' ? 1 : -1); }
    else if (event.key === 'PageDown' || event.key === 'PageUp') {
      event.preventDefault();
      const delta = event.key === 'PageDown' ? 1 : -1;
      viewport.scrollBy({ top: delta * viewport.clientHeight * .88, behavior: 'instant' });
    }
    else if ((event.key === 'Home' || event.key === 'End') && !event.target.closest('button,summary,a')) {
      event.preventDefault();
      selectTarget();
      void goAnchor(event.key==='Home'?'inside-cover':'page-'+book.count,false);
    }
  });
  viewport.addEventListener('scroll', () => {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      rememberPosition();
      updateControls();
      scheduleRemember();
      if(!navigating&&!printMode)void ensureVisible();
      // Keep an explicit sidebar/search choice selected during passive scrolling.
      if (selectedTarget) { markNavigation(selectedTarget.id); return; }
      const edge = viewport.getBoundingClientRect().top + viewport.clientHeight * .25;
      const candidates = sections.filter(section => section.closest('.book-page') === pages[position.page] && !section.hasAttribute('data-mastery-for'));
      const current = candidates.filter(section => section.getBoundingClientRect().top <= edge).pop() || candidates[0];
      if (current) markNavigation(current.id);
    });
  }, { passive: true });
  let searchGeneration=0;
  async function runSearch() {
    const generation=++searchGeneration;
    const query = search.value.trim().toLocaleLowerCase();
    results.replaceChildren();
    clear.hidden = !query;
    results.hidden = !query;
    toc.hidden=!!query;
    if (!query) { searchStatus.textContent = ''; reveal(location.hash); return; }
    searchStatus.textContent='Searching the handbook…';
    try{await loadSearch();}catch(error){if(generation===searchGeneration)searchStatus.textContent='Search could not load. Type again to retry.';return;}
    if(generation!==searchGeneration)return;
    const searchIndex=searchData.sections,pageSearch=searchData.pages;
    const words = query.split(/\s+/);
    const found = searchIndex.filter(item => words.every(word => (item.title+' '+item.text).toLocaleLowerCase().includes(word)));
    const covered=new Set(found.map(item=>item.page));
    found.push(...pageSearch.filter(item=>!covered.has(item.page)&&words.every(word=>item.text.includes(word))));
    for (const item of found) {
      const li = document.createElement('li'), link = document.createElement('a');
      link.href = '#' + item.id;
      bookmarkRow(link,item.title,item.page);
      li.append(link);
      results.append(li);
    }
    searchStatus.textContent = found.length ? found.length + (found.length === 1 ? ' result found' : ' results found') : 'No matches in the handbook.';
  }
  search.addEventListener('focus',()=>{void loadSearch().catch(()=>{});});
  search.addEventListener('input', runSearch);
  search.addEventListener('keydown', event => {
    if (event.key === 'Escape'&&search.value) { event.stopPropagation(); search.value = ''; runSearch(); }
    if (event.key === 'Enter') results.querySelector('a')?.click();
  });
  clear.addEventListener('click', () => { search.value = ''; runSearch(); search.focus(); });
  let navOpen=false;
  function setNavOpen(open, focus=false) {
    navOpen=open;root.dataset.navOpen=String(open);navToggle.setAttribute('aria-expanded',String(open));
    sidebar.inert=!open;sidebar.setAttribute('aria-hidden',String(!open));
    const modal=open&&mobile.matches;
    backdrop.hidden=!modal;toolbar.inert=modal;document.querySelector('.reader-main').inert=modal;
    if(modal){sidebar.setAttribute('role','dialog');sidebar.setAttribute('aria-modal','true');}
    else {sidebar.removeAttribute('role');sidebar.removeAttribute('aria-modal');}
    if(!mobile.matches)write('sidebar-open',String(open));
    if(open){options.open=false;if(focus)document.getElementById('close-sidebar').focus({preventScroll:true});reveal(location.hash);}
    else if(sidebar.contains(document.activeElement))navToggle.focus({preventScroll:true});
  }
  navToggle.addEventListener('click',()=>setNavOpen(!navOpen,true));
  document.getElementById('close-sidebar').addEventListener('click',()=>setNavOpen(false));
  backdrop.addEventListener('click',()=>setNavOpen(false));
  options.addEventListener('toggle',()=>options.querySelector('summary').setAttribute('aria-expanded',String(options.open)));
  document.addEventListener('pointerdown',e=>{if(options.open&&!options.contains(e.target))options.open=false;});
  document.addEventListener('focusin',e=>{if(options.open&&!options.contains(e.target))options.open=false;});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){
      if(options.open){options.open=false;options.querySelector('summary').focus();e.preventDefault();}
      else if(navOpen){setNavOpen(false);e.preventDefault();}
    }
    if(e.key==='Tab'&&navOpen&&mobile.matches){
      const focusable=[...sidebar.querySelectorAll('a,button,input,summary,[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length&&!el.closest('details:not([open]) > :not(summary)'));
      const first=focusable[0],last=focusable.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    }
  });
  mobile.addEventListener('change',()=>{
    const mark=rememberPosition();device=mobile.matches?'mobile-':'desktop-';
    view=read(mobile.matches?'mobile-view':'view');if(!views.includes(view))view=mobile.matches?'wide':'spread';
    zoomMode=read(device+'zoom-mode')==='manual'?'manual':'fit';restoreZoom();
    setNavOpen(!mobile.matches&&read('sidebar-open')!=='false');layout(mark);
  });
  setNavOpen(!mobile.matches&&read('sidebar-open')!=='false');restoreZoom();
  const resize = () => {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => { resizeFrame = 0; layout(); });
  };
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(viewport);
  else window.addEventListener('resize', resize);
  root.dataset.mode=read('theme')==='dark'?'dark':'light';
  theme();
  const saved=history.state?.hb?.position||JSON.parse(read('position')||'null');
  const first=decodeURIComponent(location.hash.slice(1))||book.pages[Math.min(book.count,Math.max(0,saved?.page||0))].id;
  await goAnchor(first,false,'replace',location.hash?(history.state?.hb?.position||null):saved);
  document.getElementById('page-jump').addEventListener('submit',event=>{
    event.preventDefault();
    if(pageInput.checkValidity()&&pageInput.value) {const id='page-'+Number(pageInput.value);pageInput.blur();void goAnchor(id);}
  });
  pageInput.addEventListener('focus',()=>pageInput.select());
  pageInput.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();pageInput.blur();updateControls();}});
  function reveal(hash){
    const link=navLinks.find(a=>a.hash===hash);if(!link)return;
    for(let n=link.parentElement;n&&!n.classList.contains('toc');n=n.parentElement)if(n.tagName==='DETAILS')n.open=true;
    const panel=link.closest('.sidebar-content');if(panel){const r=link.getBoundingClientRect(),p=panel.getBoundingClientRect();if(r.bottom>p.bottom)panel.scrollTop+=r.bottom-p.bottom+8;else if(r.top<p.top)panel.scrollTop-=p.top-r.top+8;}
  }
  document.addEventListener('click',e=>{const a=e.target.closest('a[href^="#"]');if(a)reveal(a.hash);});
  addEventListener('hashchange',()=>reveal(location.hash));
  if(location.hash)reveal(location.hash);
  window.VanaheimHandbook={goAnchor,setView,preparePrint,get position(){return {...position};},get view(){return view;},get mountedChapters(){return [...mounted];},book};
  if(new URLSearchParams(location.search).get('print')==='all')await preparePrint();
})().catch(error=>{console.error(error);const status=document.getElementById('chapter-loading');status.hidden=false;status.querySelector('span').textContent='The handbook could not load. Please retry.';const retry=document.getElementById('retry-chapter');retry.hidden=false;retry.onclick=()=>location.reload();});
