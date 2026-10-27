// ===================== GENERIC POPUP MODAL (used by Docs Hub + Interview Q&A add/edit flows) =====================
let appModalInstance = null;
function openModal(html){
  const body = document.getElementById('appModalBody');
  body.innerHTML = html;
  if(!appModalInstance){
    const mEl = document.getElementById('appModal');
    appModalInstance = new bootstrap.Modal(mEl);
    mEl.addEventListener('hide.bs.modal', ()=>draftFlush());      // keep what was typed if the dialog is closed by accident
    mEl.addEventListener('hidden.bs.modal', ()=>{ _draft = null; });
  }
  appModalInstance.show();
}
function closeModal(){
  if(appModalInstance) appModalInstance.hide();
}

// ===================== SHARED UPLOAD HELPERS =====================
// Put a File into an <input type=file> and fire its normal change handler (used by drag & drop and paste).
function feedFileInput(input, file){
  try{ const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files; }
  catch(err){ alert('Drag & drop / paste is not supported in this browser — please click to choose the file.'); return false; }
  input.dispatchEvent(new Event('change', {bubbles:true}));
  return true;
}
function fileKind(file){
  if(!file) return null;
  if(/^image\//.test(file.type)) return 'Image';
  if(file.type==='application/pdf' || /\.pdf$/i.test(file.name||'')) return 'PDF';
  return null;
}
function fileTitle(name){ return String(name||'Untitled').replace(/\.[^.]+$/,'').replace(/_+/g,' ').trim().slice(0,120) || 'Untitled'; }
function clipText(s,n){ s = String(s||'').replace(/<[^>]*>/g,'').trim(); return s.length>(n||40) ? s.slice(0,(n||40))+'…' : s; }
function toastStack(){
  let stack = document.getElementById('toast-stack');
  if(!stack){ stack = document.createElement('div'); stack.id = 'toast-stack'; stack.className = 'toast-stack'; document.body.appendChild(stack); }
  return stack;
}
// Sticky toast with a spinner for long-running uploads.
function progressToast(text){
  const t = document.createElement('div'); t.className = 'toast-item';
  t.innerHTML = '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span><span class="toast-label"></span>';
  const label = t.querySelector('.toast-label'); label.textContent = text;
  toastStack().appendChild(t);
  return {set(x){ label.textContent = x; }, close(){ t.remove(); }};
}
// "Deleted … [Undo]" toast. onExpire runs once the undo window closes (used to really delete the stored file).
function toastUndo(msg, onUndo, onExpire, ms){
  const t = document.createElement('div'); t.className = 'toast-item has-act';
  t.innerHTML = '<i class="bi bi-trash3"></i><span class="toast-label"></span><button type="button" class="toast-act">Undo</button>';
  t.querySelector('.toast-label').textContent = msg;
  let settled = false, timer = null;
  const finish = ()=>{ if(settled) return; settled = true; clearTimeout(timer); t.remove(); if(onExpire){ try{ onExpire(); }catch(e){ console.error(e); } } };
  t.querySelector('.toast-act').onclick = ()=>{ if(settled) return; settled = true; clearTimeout(timer); t.remove(); onUndo(); };
  timer = setTimeout(finish, ms || 8000);
  window.addEventListener('pagehide', finish, {once:true});
  toastStack().appendChild(t);
}
// Disables the form's Save button and shows upload progress on it. Returns {progress(0..1), done()}.
function busyStart(){
  const btn = document.querySelector('#appModalBody .btn-primary, #adv-form-slot .btn-primary');
  if(!btn) return {progress(){}, done(){}};
  const html = btn.innerHTML, spin = '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>';
  btn.disabled = true; btn.innerHTML = spin + 'Saving…';
  return {progress(f){ btn.innerHTML = spin + 'Uploading ' + Math.round(Math.max(0,Math.min(1,f))*100) + '%'; }, done(){ btn.disabled = false; btn.innerHTML = html; }};
}
function downloadBlob(blob, name){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 5000);
}

// ---- Drag & drop: onto any upload box, or straight onto a Docs Hub author / Q&A topic / Advanced+ list ----
// ---- Paste: Ctrl/Cmd+V an image (or PDF) while an upload box is open ----
(function(){
  const hasFiles = e => e.dataTransfer && [...(e.dataTransfer.types||[])].includes('Files');
  const closest = (e, sel) => (e.target && e.target.closest) ? e.target.closest(sel) : null;
  function zoneInfo(e){
    const box = closest(e,'.media-drop'); if(box) return {kind:'box', el:box};
    const au = closest(e,'.author-card'); if(au && au.dataset.authorId) return {kind:'author', el:au};
    const qa = closest(e,'#qa-items-container > .phase-card'); if(qa && qa.dataset.catName!==undefined) return {kind:'qa', el:qa};
    const adv = closest(e,'#adv-container'); if(adv) return {kind:'adv', el:adv};
    return null;
  }
  let lastZone = null;
  const mark = el => { if(lastZone && lastZone!==el) lastZone.classList.remove('drag-active'); el.classList.add('drag-active'); lastZone = el; };
  const clearMark = () => { if(lastZone){ lastZone.classList.remove('drag-active'); lastZone = null; } };
  // capture phase: item rows stop propagation of their own (reorder) drag events, and must never see a file drag
  document.addEventListener('dragover', e=>{
    if(!hasFiles(e)) return;
    const edz = closest(e,'.rte-editor');
    if(edz){ e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; mark(edz); return; }
    const z = zoneInfo(e);
    if(z){ e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; mark(z.el); }
    else { clearMark(); if(closest(e,'#appModal')) e.preventDefault(); }
  }, true);
  document.addEventListener('dragleave', e=>{ if(lastZone && (!e.relatedTarget || !lastZone.contains(e.relatedTarget))) clearMark(); }, true);
  document.addEventListener('dragend', clearMark, true);
  document.addEventListener('drop', e=>{
    if(!hasFiles(e)) return;
    const edz = closest(e,'.rte-editor');
    if(edz){ e.preventDefault(); e.stopPropagation(); clearMark(); rteDropFiles(edz, e); return; }
    const z = zoneInfo(e);
    if(!z){ if(closest(e,'#appModal')) e.preventDefault(); return; }
    e.preventDefault(); e.stopPropagation(); clearMark();
    const files = [...e.dataTransfer.files];
    if(!files.length) return;
    if(z.kind==='box'){
      const input = z.el.querySelector('input[type=file]'); if(!input) return;
      const f = files[0], accept = input.accept || '';
      if(input.multiple){
      const imgs = files.filter(x=>/^image\//.test(x.type));
      if(!imgs.length){ alert('Please drop image files.'); return; }
        try{ const dt = new DataTransfer(); imgs.forEach(x=>dt.items.add(x)); input.files = dt.files; }catch(err){ alert('Drag & drop is not supported in this browser — please click to choose the files.'); return; }
        input.dispatchEvent(new Event('change', {bubbles:true})); return;
      }
      const ok = accept.startsWith('image/') ? /^image\//.test(f.type) : accept==='application/pdf' ? fileKind(f)==='PDF' : true;
      if(!ok){ alert(accept.startsWith('image/') ? 'Please drop an image file.' : 'Please drop a PDF file.'); return; }
      feedFileInput(input, f);
    }
    else if(z.kind==='author') bulkAddDocs(z.el.dataset.authorId, files);
    else if(z.kind==='qa') bulkAddQA(z.el.dataset.catName, files);
    else if(z.kind==='adv') bulkAddAdv(files);
  }, true);
  document.addEventListener('paste', e=>{
    const f = e.clipboardData && e.clipboardData.files && e.clipboardData.files[0];
    if(!f || (e.target.closest && e.target.closest('[contenteditable="true"]'))) return;   // the rich-text editor handles its own pastes
    const kind = fileKind(f); if(!kind) return;
    const modal = document.getElementById('appModal');
    const scope = (modal && modal.classList.contains('show')) ? modal : document.getElementById('adv-form-slot');
    if(!scope) return;
    const input = [...scope.querySelectorAll('.media-drop input[type=file]')].find(i=> kind==='Image' ? (i.accept||'').startsWith('image/') : i.accept==='application/pdf');
    if(!input) return;
    e.preventDefault();
    const ext = (f.type.split('/')[1]||'png').replace('jpeg','jpg');
    const named = (f.name && f.name!=='image.png') ? f : new File([f], 'pasted-'+Date.now()+'.'+ext, {type:f.type});
    if(feedFileInput(input, named) && window.UI) UI.toast('Pasted ' + (kind==='Image'?'image':'PDF') + ' attached');
  });
})();

// Several dropped files at once: each becomes its own item. makeItem receives {kind,key,name,title,idx}.
async function runBulkUpload(files, keyPrefix, makeItem, afterAll){
  const list = [...files], ok = list.filter(fileKind), skipped = list.length - ok.length;
  if(!ok.length){ alert('Only PDF and image files can be dropped here.'); return; }
  const pt = progressToast('Uploading 1 of '+ok.length+'…');
  let added = 0, n = 0;
  try{
    for(const f of ok){
      n++; pt.set('Uploading '+n+' of '+ok.length+': '+clipText(f.name,28));
      const up = await readUpload(f); if(!up) continue;
      const key = keyPrefix + Date.now() + '-' + Math.random().toString(36).slice(2,8);
      const nn = n;
      await idbPut(key, up.dataUrl, p=>pt.set('Uploading '+nn+' of '+ok.length+' · '+Math.round(p*100)+'%'));
      makeItem({kind:fileKind(f), key, name:up.name||f.name, title:fileTitle(f.name), idx:n});
      added++;
    }
  } finally { pt.close(); }
  if(added) afterAll();
  if(window.UI) UI.toast(added ? 'Added '+added+' file'+(added===1?'':'s')+(skipped?' · skipped '+skipped+' unsupported':'') : 'Nothing was added');
}
function bulkAddDocs(authorId, files){
  if(!getAllAuthors().some(a=>a.id===authorId)) return;
  const section = activeDocsSection==='resources' ? 'community' : activeDocsSection;
  return runBulkUpload(files, 'media-', info=>{
    insertDocsItem(authorId, {id: authorId+'-'+Date.now()+'-'+info.idx, type:info.kind, title:info.title, badgeColor:TYPE_COLOR[info.kind], section, summary:'', mediaKey:info.key, mediaName:info.name});
  }, renderAuthorPosts);
}
function bulkAddQA(catName, files){
  const section = activeQASection;
  return runBulkUpload(files, 'media-qa-', info=>{
    customQA.unshift({id:'qa-custom-'+Date.now()+'-'+info.idx, section, cat:catName, q:info.title, type:info.kind, badgeColor:TYPE_COLOR[info.kind], summary:'', mediaKey:info.key, mediaName:info.name});
    localStorage.setItem('dotnet_custom_qa', JSON.stringify(customQA));
  }, renderInterview);
}
function bulkAddAdv(files){
  return runBulkUpload(files, 'media-adv-', info=>{
    advCustom.push({id:'adv-custom-'+Date.now()+'-'+info.idx, type:info.kind, title:info.title, badgeColor:TYPE_COLOR[info.kind], summary:'', mediaKey:info.key, mediaName:info.name});
    localStorage.setItem('dotnet_adv_custom', JSON.stringify(advCustom));
  }, renderAdvanced);
}


// Best-effort page count: reads the PDF's page tree (works for most PDFs; returns null if it can't tell).
function pdfPageCount(dataUrl){
  try{
    const bin = atob(String(dataUrl).split(',')[1] || '');
    let max = 0, m; const re = /<<[^<>]*\/Type\s*\/Pages[^<>]*>>/g;
    while((m = re.exec(bin))){ const c = /\/Count\s+(\d+)/.exec(m[0]); if(c) max = Math.max(max, +c[1]); }
    if(!max){ const pg = bin.match(/\/Type\s*\/Page(?![s\w])/g); max = pg ? pg.length : 0; }
    return max || null;
  }catch(e){ return null; }
}
function fmtBytes(n){ return n>=1048576 ? (n/1048576).toFixed(1)+' MB' : Math.max(1,Math.round(n/1024))+' KB'; }
// ===================== MULTI-IMAGE: helpers, picker, slider =====================
const itemImages = it => (it && it.images && it.images.length) ? it.images
  : (it && it.type==='Image' && it.mediaKey ? [{key:it.mediaKey, name:it.mediaName||''}] : []);
const itemMediaKeys = it => [...new Set([...((it&&it.images)||[]).map(i=>i.key), it&&it.mediaKey].filter(Boolean))];
// delete stored files that the saved item no longer uses
function pruneMedia(oldItem, newData){
  const keep = new Set(itemMediaKeys(newData));
  itemMediaKeys(oldItem).forEach(k=>{ if(!keep.has(k)) idbDelete(k); });
}

// ---- picker (used inside the add/edit forms) ----
const IMGPICK = {};   // pickerId -> [{key,name} (already stored) | {dataUrl,name} (new)]
let _pickDrag = null;
function imgPickerHTML(id, existing){
  IMGPICK[id] = (existing||[]).map(x=>({key:x.key, name:x.name||'image'}));
  return `<div class="img-picker">
    <div class="media-drop" onclick="document.getElementById('${id}-in').click()"><i class="bi bi-images me-1"></i>Choose images or drop them here — as many as you like<input type="file" id="${id}-in" accept="image/*" multiple style="display:none" onclick="event.stopPropagation()" onchange="imgPickerAdd('${id}',this)"></div>
    <div class="img-picker-grid" id="${id}-grid"></div>
    <div class="small text-muted mt-1">Drag thumbnails or use ‹ › to reorder. The first image is the cover.</div>
  </div>`;
}
async function imgPickerAdd(id, input){
  const files = [...input.files].filter(f=>/^image\//.test(f.type)); input.value = '';
  if(!files.length){ alert('Please choose image files.'); return; }
  const list = IMGPICK[id] || (IMGPICK[id] = []), pt = progressToast('Reading images…');
  try{
    for(let n=0;n<files.length;n++){
      pt.set('Reading image '+(n+1)+' of '+files.length+'…');
      try{ list.push({dataUrl: await shrinkImage(files[n]), name: files[n].name}); }
      catch(e){ alert('Could not read "'+files[n].name+'": '+(e.message||e)); }
    }
  } finally { pt.close(); }
  imgPickerRender(id);
}
function imgPickerMove(id, i, d){ const l = IMGPICK[id]; if(!l || i+d<0 || i+d>=l.length) return; [l[i], l[i+d]] = [l[i+d], l[i]]; imgPickerRender(id); }
function imgPickerRemove(id, i){ IMGPICK[id].splice(i,1); imgPickerRender(id); }
function imgPickerRender(id){
  const grid = document.getElementById(id+'-grid'); if(!grid) return;
  const list = IMGPICK[id] || [];
  grid.innerHTML = list.map((x,i)=>`<div class="img-tile" draggable="true" data-i="${i}" title="${escA(x.name||'')}"><img alt="" draggable="false"><span class="img-n">${i+1}</span>
    <div class="img-tile-btns">
      <button type="button" onclick="imgPickerMove('${id}',${i},-1)" aria-label="Move earlier" ${i===0?'disabled':''}><i class="bi bi-chevron-left"></i></button>
      <button type="button" class="rm" onclick="imgPickerRemove('${id}',${i})" aria-label="Remove image"><i class="bi bi-x-lg"></i></button>
      <button type="button" onclick="imgPickerMove('${id}',${i},1)" aria-label="Move later" ${i===list.length-1?'disabled':''}><i class="bi bi-chevron-right"></i></button>
    </div></div>`).join('');
  grid.querySelectorAll('.img-tile').forEach(t=>{
    const i = +t.dataset.i, img = t.querySelector('img');
    if(list[i].dataUrl) img.src = list[i].dataUrl; else idbGet(list[i].key).then(d=>{ if(d) img.src = d; });
    t.addEventListener('dragstart', e=>{ _pickDrag = {id,i}; t.classList.add('dragging'); e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain',''); e.stopPropagation(); });
    t.addEventListener('dragend', ()=>{ t.classList.remove('dragging'); grid.querySelectorAll('.img-tile').forEach(x=>x.classList.remove('drag-over-item')); });
    t.addEventListener('dragover', e=>{ if(_pickDrag && _pickDrag.id===id){ e.preventDefault(); e.stopPropagation(); t.classList.add('drag-over-item'); } });
    t.addEventListener('dragleave', ()=>t.classList.remove('drag-over-item'));
    t.addEventListener('drop', e=>{
      if(!_pickDrag || _pickDrag.id!==id) return;
      e.preventDefault(); e.stopPropagation();
      if(_pickDrag.i!==i){ const [m] = list.splice(_pickDrag.i,1); list.splice(i,0,m); }
      _pickDrag = null; imgPickerRender(id);
    });
  });
}
// uploads the new ones, returns the final ordered [{key,name}]
async function imgPickerCommit(id, prefix, busy){
  const list = IMGPICK[id] || [], todo = list.filter(x=>!x.key), total = todo.length || 1;
  const prog = new Map(); let next = 0;
  const report = ()=> busy.progress([...prog.values()].reduce((a,b)=>a+b,0) / total);
  const worker = async ()=>{
    while(next < todo.length){
      const x = todo[next++];
      const key = prefix + Date.now() + '-' + Math.random().toString(36).slice(2,8);
      await idbPut(key, x.dataUrl, p=>{ prog.set(key, p); report(); });
      prog.set(key, 1); report();
      x.key = key; delete x.dataUrl;
    }
  };
  await Promise.all(Array.from({length: Math.min(3, todo.length)}, worker));
  return list.map(x=>({key:x.key, name:x.name}));
}

// ---- slider (used wherever an Image item is shown) ----
function imageSliderHTML(item){
  const imgs = itemImages(item); if(!imgs.length) return '';
  const many = imgs.length > 1, label = item.title || item.q || 'Image';
  return `<div class="img-slider" data-title="${escA(label)}">
    <div class="img-stage">
      <div class="img-track" tabindex="0" role="group" aria-label="Image slider" onscroll="sliderSync(this)" onkeydown="sliderKey(event,this)">
        ${imgs.map((im,i)=>`<figure class="img-slide"><img data-key="${escA(im.key)}" data-name="${escA(im.name||'')}" draggable="false" alt="${escA(label+' — '+(i+1)+' of '+imgs.length)}" title="Click to enlarge" onclick="openLightbox(this)"></figure>`).join('')}
      </div>
      ${many ? `<button type="button" class="img-nav prev" onclick="sliderGo(this,-1)" aria-label="Previous image"><i class="bi bi-chevron-left"></i></button>
      <button type="button" class="img-nav next" onclick="sliderGo(this,1)" aria-label="Next image"><i class="bi bi-chevron-right"></i></button>
      <span class="img-count">1 / ${imgs.length}</span>` : ''}
    </div>
    ${many ? `<div class="img-dots">${imgs.map((_,i)=>`<button type="button" class="img-dot ${i===0?'on':''}" onclick="sliderDot(this,${i})" aria-label="Go to image ${i+1}"></button>`).join('')}</div>` : ''}
    <div class="item-media-actions">
      <span class="item-media-name img-cap">${esc(imgs[0].name||'')}</span>
      <button type="button" class="btn btn-sm btn-outline-secondary" onclick="sliderDownload(this)"><i class="bi bi-download me-1"></i>Download</button>
      ${many ? `<button type="button" class="btn btn-sm btn-outline-secondary" onclick="sliderDownloadAll(this)"><i class="bi bi-file-earmark-zip me-1"></i>All (.zip)</button>` : ''}
    </div>
  </div>`;
}
function hydrateSliders(scope){
  (scope||document).querySelectorAll('.img-slider img[data-key]:not([src])').forEach(img=>{
    idbGet(img.dataset.key).then(d=>{ if(d) img.src = d; else img.alt = 'Could not load this image'; });
  });
}
const sliderIdx = t => Math.round(t.scrollLeft / Math.max(1, t.clientWidth));
function sliderSync(t){
  const s = t.closest('.img-slider'), i = sliderIdx(t), n = t.children.length;
  const c = s.querySelector('.img-count'); if(c) c.textContent = (i+1)+' / '+n;
  s.querySelectorAll('.img-dot').forEach((d,k)=>d.classList.toggle('on', k===i));
  const im = t.children[i] && t.children[i].querySelector('img'), cap = s.querySelector('.img-cap');
  if(cap && im) cap.textContent = im.dataset.name || '';
}
function sliderTo(s, i, instant){
  const t = s.querySelector('.img-track'), n = t.children.length; i = (i+n)%n;
  t.scrollTo({left:i*t.clientWidth, behavior: instant ? 'auto' : 'smooth'});
}
function sliderGo(btn, d){ const s = btn.closest('.img-slider'); sliderTo(s, sliderIdx(s.querySelector('.img-track'))+d); }
function sliderDot(btn, i){ sliderTo(btn.closest('.img-slider'), i); }
function sliderKey(e, t){
  if(e.key==='ArrowRight'){ e.preventDefault(); sliderTo(t.closest('.img-slider'), sliderIdx(t)+1); }
  else if(e.key==='ArrowLeft'){ e.preventDefault(); sliderTo(t.closest('.img-slider'), sliderIdx(t)-1); }
}
function sliderDownload(btn){
  const t = btn.closest('.img-slider').querySelector('.img-track'), img = t.children[sliderIdx(t)].querySelector('img');
  if(!img || !img.src){ alert('Image is still loading.'); return; }
  downloadBlob(dataUrlToBlob(img.src), img.dataset.name || 'image.jpg');
}
function sliderDownloadAll(btn){
  const s = btn.closest('.img-slider'), imgs = [...s.querySelectorAll('img[data-key]')].filter(i=>i.src);
  if(!imgs.length){ alert('Images are still loading.'); return; }
  const files = imgs.map((im,i)=>({name: String(i+1).padStart(2,'0')+'-'+(im.dataset.name||'image.jpg').replace(/[\\/]/g,'_'), data: dataUrlToBytes(im.src)}));
  downloadBlob(new Blob([zipStore(files)], {type:'application/zip'}), (s.dataset.title||'images').replace(/[^\w.-]+/g,'_')+'.zip');
}
// Full-screen preview, with next/previous when the image belongs to a slider
function openLightbox(img){
  if(!img || !img.src) return;
  const slider = img.closest('.img-slider');
  const list = slider ? [...slider.querySelectorAll('img[src]')] : [img];
  let idx = Math.max(0, list.indexOf(img)); const many = list.length > 1;
  const ov = document.createElement('div'); ov.className = 'lightbox'; ov.setAttribute('role','dialog'); ov.setAttribute('aria-label','Image preview'); ov.tabIndex = -1;
  ov.innerHTML = '<img alt=""><button type="button" class="lightbox-close" aria-label="Close preview"><i class="bi bi-x-lg"></i></button>' +
    (many ? '<button type="button" class="lightbox-nav prev" aria-label="Previous"><i class="bi bi-chevron-left"></i></button><button type="button" class="lightbox-nav next" aria-label="Next"><i class="bi bi-chevron-right"></i></button><span class="lightbox-count"></span>' : '');
  const big = ov.querySelector('img'), cnt = ov.querySelector('.lightbox-count');
  const show = i=>{ idx = (i+list.length)%list.length; big.src = list[idx].src; big.alt = list[idx].alt || ''; if(cnt) cnt.textContent = (idx+1)+' / '+list.length; };
  const onKey = e=>{ if(e.key==='Escape') close(); else if(many && e.key==='ArrowRight') show(idx+1); else if(many && e.key==='ArrowLeft') show(idx-1); };
  const close = ()=>{ ov.remove(); document.removeEventListener('keydown', onKey); if(slider && many) sliderTo(slider, idx, true); };
  ov.addEventListener('click', e=>{ if(e.target===ov || e.target.closest('.lightbox-close')) close(); else if(e.target.closest('.lightbox-nav.prev')) show(idx-1); else if(e.target.closest('.lightbox-nav.next')) show(idx+1); });
  document.addEventListener('keydown', onKey);
  show(idx); document.body.appendChild(ov); ov.focus();
}
// Accepts "example.com/page" as well as full URLs; returns '' for anything that isn't a web link.
function normUrl(u){
  u = String(u||'').trim();
  if(!u) return '';
  if(!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
  return safeUrl(u)==='#' ? '' : u;
}
function authorIdFromName(name){
  const base = String(name||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  if(base) return base;
  let h = 0; for(const ch of String(name||'')) h = (h*31 + ch.codePointAt(0)) >>> 0;   // non-latin names still get a stable, unique id
  return 'author-' + h.toString(36);
}
function initialsOf(name){
  return String(name||'').trim().split(/\s+/).filter(Boolean).map(w=>Array.from(w)[0]).join('').toUpperCase().slice(0,2) || '?';
}

// The data below was written with bright rainbow colours. tone() maps them onto the muted royal palette.
const ROYAL_TONES = {'#4f46e5':'#1f3a7a','#0891b2':'#1f6f78','#059669':'#2f6b4f','#d97706':'#8a6a1f','#dc2626':'#8a2a3a','#7c3aed':'#5b2a6e',
  '#16a34a':'#2f6b4f','#0a66c2':'#1f3a7a','#be123c':'#8a2a3a','#6b7280':'#4b5568','#1f2937':'#1d2744','#a16207':'#8a6a1f'};
const tone = hex => ROYAL_TONES[String(hex||'').toLowerCase()] || (/^#[0-9a-f]{6}$/i.test(hex||'') ? hex : '#1f3a7a');

// ===================== DATA =====================
const TOTAL = 175;

const PHASES = [
  {id:'p1',title:'Phase 1 — C# Fundamentals',color:'#4f46e5',bg:'#ede9fe',weeks:[
    {week:'Week 1',title:'C# Basics',deadline:'Day 7',res:['Kudvenkat C# YouTube','W3Schools C#','dotnet.microsoft.com'],days:[
      {n:1,topic:'Setup & First App',desc:'Install Visual Studio 2022, .NET 8 SDK, create Console App, understand solution/project structure'},
      {n:2,topic:'Variables & Data Types',desc:'int, string, bool, double, decimal, var, const, readonly — value vs reference types, boxing/unboxing'},
      {n:3,topic:'Operators & Conditions',desc:'if/else, switch expressions, ternary, null coalescing (??), null conditional (?.)'},
      {n:4,topic:'Loops',desc:'for, while, do-while, foreach, break, continue, nested loops'},
      {n:5,topic:'Methods & Functions',desc:'Parameters, return types, optional params, named args, out/ref/in, method overloading'},
      {n:6,topic:'Arrays & Strings',desc:'1D/2D arrays, string methods, StringBuilder, string interpolation, verbatim strings'},
      {n:7,topic:'Revision + 10 Problems',desc:'FizzBuzz, palindrome, factorial, fibonacci, prime check, reverse string, anagram, matrix, sorting'},
    ]},
    {week:'Week 2',title:'OOP in C#',deadline:'Day 14',res:['Kudvenkat OOP series','Tim Corey YouTube','C# in Depth book'],days:[
      {n:8,topic:'Classes & Objects',desc:'Class definition, object creation, constructors (default, parameterized, copy), destructor, this keyword'},
      {n:9,topic:'Encapsulation',desc:'Properties, auto-properties, getters/setters, access modifiers (public, private, protected, internal, protected internal)'},
      {n:10,topic:'Inheritance',desc:'Base/derived class, base keyword, constructor chaining, method hiding (new keyword)'},
      {n:11,topic:'Polymorphism',desc:'Virtual/override, method overriding vs overloading, runtime polymorphism'},
      {n:12,topic:'Abstract & Interface',desc:'Abstract class vs interface, when to use which, explicit interface implementation, multiple interfaces'},
      {n:13,topic:'Static, Sealed & Partial',desc:'Static class, static members, sealed class/method, partial class, record types'},
      {n:14,topic:'Mini Project — Bank System',desc:'Bank Account with Savings/Current accounts — OOP, inheritance, encapsulation, interface'},
    ]},
    {week:'Week 3',title:'Advanced C#',deadline:'Day 21',res:['Nick Chapsas YouTube','C# Advanced Topics Udemy','Microsoft Learn C#'],days:[
      {n:15,topic:'Collections',desc:'List<T>, Dictionary<K,V>, Queue, Stack, HashSet, SortedList, LinkedList, ConcurrentDictionary'},
      {n:16,topic:'Generics',desc:'Generic classes, generic methods, constraints (where T:), covariance/contravariance'},
      {n:17,topic:'Exception Handling',desc:'try/catch/finally, custom exceptions, exception filters (when), best practices, AggregateException'},
      {n:18,topic:'Delegates & Events',desc:'Action, Func, Predicate, custom delegates, multicast, events, EventHandler<T>'},
      {n:19,topic:'LINQ',desc:'Where, Select, SelectMany, OrderBy, GroupBy, Join, First/FirstOrDefault, Any, All, Count, Aggregate, ToList, ToDictionary'},
      {n:20,topic:'Async / Await',desc:'Task, async/await, Task.Run, Task.WhenAll, Task.WhenAny, CancellationToken, ConfigureAwait, ValueTask'},
      {n:21,topic:'Mini Project — Student Console App',desc:'Student Management using Collections, LINQ, Exception Handling, File I/O (JSON serialization)'},
    ]},
  ]},
  {id:'p2',title:'Phase 2 — ASP.NET Core Web API',color:'#0891b2',bg:'#e0f7fa',weeks:[
    {week:'Week 4',title:'Web API Basics',deadline:'Day 28',res:['Nick Chapsas ASP.NET','Microsoft Learn ASP.NET','REST API Design guide'],days:[
      {n:22,topic:'REST API Concepts',desc:'HTTP methods (GET/POST/PUT/PATCH/DELETE), status codes, REST principles, idempotency, statelessness'},
      {n:23,topic:'First Web API Project',desc:'Create project, understand Program.cs (minimal hosting), launchSettings.json, appsettings.json, middleware order'},
      {n:24,topic:'Controllers & Routes',desc:'ApiController attribute, Route/HttpGet/HttpPost/HttpPut/HttpDelete attributes, route parameters, query strings'},
      {n:25,topic:'Model Binding & Validation',desc:'FromBody, FromQuery, FromRoute, FromHeader, FromForm, ModelState, DataAnnotations'},
      {n:26,topic:'DTOs & AutoMapper',desc:'Data Transfer Objects why/how, AutoMapper setup, mapping profiles, flattening/projection'},
      {n:27,topic:'Postman + Swagger',desc:'Setup Swagger/OpenAPI (Swashbuckle), test all endpoints, document APIs with XML comments'},
      {n:28,topic:'Mini Project — Product CRUD API',desc:'Full Product CRUD with DTOs, validation, Swagger docs, proper HTTP status codes'},
    ]},
    {week:'Week 5',title:'DI, Middleware & Filters',deadline:'Day 35',res:['Microsoft DI Docs','Serilog docs','Tim Corey DI series'],days:[
      {n:29,topic:'Dependency Injection Deep Dive',desc:'AddSingleton vs AddScoped vs AddTransient — lifetimes, when to use each, service locator anti-pattern'},
      {n:30,topic:'Service Layer Pattern',desc:'Create IProductService, ProductService, inject into controllers, separation of concerns'},
      {n:31,topic:'Middleware Pipeline',desc:'Request/response pipeline, built-in middleware, custom middleware, IMiddleware vs convention-based, short-circuit'},
      {n:32,topic:'Filters',desc:'IActionFilter, IExceptionFilter, IAuthorizationFilter, IResultFilter — order of execution, global vs controller vs action'},
      {n:33,topic:'Configuration & Options Pattern',desc:'appsettings.json, environment-specific configs, IOptions<T>, IOptionsSnapshot<T>, IOptionsMonitor<T>, secrets'},
      {n:34,topic:'Logging with Serilog',desc:'ILogger<T>, Serilog setup, sinks (Console, File, Seq), structured logging, log levels, enrichers'},
      {n:35,topic:'Practice',desc:'Add DI service layer, custom middleware for request logging, global exception filter to Product API'},
    ]},
    {week:'Week 6',title:'Entity Framework Core',deadline:'Day 42',res:['EF Core Docs','IAmTimCorey EF YouTube','Julie Lerman Pluralsight'],days:[
      {n:36,topic:'EF Core Basics',desc:'ORM concept, install EF Core + SQL Server provider, DbContext, DbSet<T>, connection strings'},
      {n:37,topic:'Code First Approach',desc:'Entity classes, DataAnnotations vs Fluent API, OnModelCreating, table/column configuration'},
      {n:38,topic:'Migrations',desc:'Add-Migration, Update-Database, migration files anatomy, data seeding, migration rollback'},
      {n:39,topic:'CRUD Operations',desc:'Add, Find, FindAsync, Update (tracking), Remove, SaveChangesAsync, AsNoTracking for reads'},
      {n:40,topic:'Relationships & Navigation',desc:'One-to-One, One-to-Many, Many-to-Many, cascade delete, navigation properties, foreign keys'},
      {n:41,topic:'Advanced EF Queries',desc:'Include/ThenInclude (eager loading), lazy loading, explicit loading, raw SQL, stored procs, compiled queries'},
      {n:42,topic:'Practice',desc:'Connect Product API to SQL Server with EF Core — full working DB-backed API'},
    ]},
    {week:'Week 7',title:'Security & Auth',deadline:'Day 49',res:['JWT.io docs','IdentityServer docs','OWASP Top 10'],days:[
      {n:43,topic:'Auth Fundamentals',desc:'Authentication vs authorization, cookie vs token auth, session vs JWT, when to use what'},
      {n:44,topic:'JWT Implementation',desc:'Generate/validate JWT, claims (sub, role, email), secret key, token expiry, symmetric vs asymmetric'},
      {n:45,topic:'Role & Policy Authorization',desc:'[Authorize] attribute, roles, claims-based policies, resource-based authorization, IAuthorizationHandler'},
      {n:46,topic:'Refresh Tokens',desc:'Refresh token concept, secure storage, token rotation, revocation, sliding expiry'},
      {n:47,topic:'CORS, Security Headers & HTTPS',desc:'CORS policy configuration, security headers (HSTS, X-Frame-Options, CSP), HTTPS redirection'},
      {n:48,topic:'Global Error Handling',desc:'ProblemDetails RFC 7807, exception middleware, consistent error response, logging errors'},
      {n:49,topic:'Secure API Complete',desc:'Full JWT auth + role-based authorization + refresh tokens + CORS — production-ready API'},
    ]},
  ]},
  {id:'p3',title:'Phase 3 — SQL Server + Database',color:'#059669',bg:'#dcfce7',weeks:[
    {week:'Week 8',title:'SQL Server Fundamentals',deadline:'Day 56',res:['SQLBolt.com','Kudvenkat SQL series','Mode SQL Tutorial'],days:[
      {n:50,topic:'SQL Basics + SSMS',desc:'Install SSMS, CREATE DATABASE/TABLE, data types, INSERT, SELECT, UPDATE, DELETE, constraints'},
      {n:51,topic:'Filtering & Sorting',desc:'WHERE, AND/OR/NOT, LIKE, IN, BETWEEN, IS NULL, ORDER BY, DISTINCT, TOP/LIMIT'},
      {n:52,topic:'Joins',desc:'INNER JOIN, LEFT JOIN, RIGHT JOIN, FULL OUTER JOIN, CROSS JOIN, SELF JOIN — with real examples'},
      {n:53,topic:'Aggregations & Grouping',desc:'GROUP BY, HAVING, COUNT, SUM, AVG, MIN, MAX, ROLLUP, CUBE'},
      {n:54,topic:'Subqueries & CTEs',desc:'Correlated subqueries, EXISTS/NOT EXISTS, Common Table Expressions (WITH), recursive CTEs'},
      {n:55,topic:'Stored Procedures & Functions',desc:'CREATE PROCEDURE, input/output params, EXEC, scalar functions, table-valued functions, triggers'},
      {n:56,topic:'Practice — 25 SQL Problems',desc:'Write queries on HR/Sales database — complex joins, aggregations, window functions, CTEs'},
    ]},
    {week:'Week 9',title:'Database Advanced',deadline:'Day 63',res:['Use The Index Luke','Redis Docs','Dapper GitHub'],days:[
      {n:57,topic:'Indexes & Performance',desc:'Clustered vs non-clustered, covering indexes, index fragmentation, when to add/avoid indexes'},
      {n:58,topic:'Transactions & Concurrency',desc:'BEGIN TRANSACTION, COMMIT, ROLLBACK, ACID properties, isolation levels, deadlocks, optimistic concurrency'},
      {n:59,topic:'Query Optimization',desc:'Execution plan, query cost, N+1 problem, avoid SELECT *, parameterized queries, statistics'},
      {n:60,topic:'Repository + Unit of Work',desc:'Generic repository, specific repositories, Unit of Work pattern, transaction management'},
      {n:61,topic:'Redis Caching',desc:'Caching strategies (cache-aside, write-through), install Redis, StackExchange.Redis, IDistributedCache, TTL'},
      {n:62,topic:'Dapper Micro-ORM',desc:'Install Dapper, Query/Execute/QueryMultiple, dynamic params, multi-mapping, when Dapper over EF'},
      {n:63,topic:'Practice',desc:'Optimize API queries (execution plans), add Redis caching layer, implement Repository+UoW pattern'},
    ]},
  ]},
  {id:'p4',title:'Phase 4 — Angular + TypeScript',color:'#d97706',bg:'#fef3c7',weeks:[
    {week:'Week 10',title:'TypeScript + HTML/CSS',deadline:'Day 70',res:['TypeScript Handbook','CSS Flexbox Froggy','HTML MDN Docs'],days:[
      {n:64,topic:'HTML Essentials',desc:'Semantic HTML5 tags, forms (input types, validation), tables, accessibility basics (aria-*, role)'},
      {n:65,topic:'CSS Essentials',desc:'Box model, flexbox, CSS Grid, responsive design, media queries, CSS variables, BEM naming'},
      {n:66,topic:'TypeScript Basics',desc:'Types (string, number, boolean, any, unknown, never), interfaces, type aliases, union/intersection types'},
      {n:67,topic:'TypeScript OOP',desc:'Classes, access modifiers, readonly, abstract, generics in TS, implements vs extends'},
      {n:68,topic:'TypeScript Advanced',desc:'Decorators, mapped types, conditional types, utility types (Partial, Required, Readonly, Pick, Omit)'},
      {n:69,topic:'ES6+ & Modules',desc:'Arrow functions, destructuring, spread/rest, template literals, Promise, async/await, ES modules (import/export)'},
      {n:70,topic:'Mini Project — TS Todo App',desc:'TypeScript Todo app with local storage, classes, interfaces, strict mode enabled'},
    ]},
    {week:'Week 11',title:'Angular Fundamentals',deadline:'Day 77',res:['Angular.io official docs','Fireship Angular YouTube','Maximilian Udemy Angular'],days:[
      {n:71,topic:'Angular Setup & Architecture',desc:'Install Node 20+, Angular CLI 17+, first project, standalone components concept, folder structure'},
      {n:72,topic:'Components & Lifecycle',desc:'@Component decorator, lifecycle hooks (ngOnInit, ngOnDestroy, ngOnChanges), @Input/@Output, ViewChild'},
      {n:73,topic:'Data Binding',desc:'String interpolation, property binding, event binding, two-way binding [(ngModel)], template reference variables'},
      {n:74,topic:'Directives',desc:'Structural (*ngIf, *ngFor, *ngSwitch), attribute (ngClass, ngStyle), custom attribute directive'},
      {n:75,topic:'Pipes',desc:'Built-in pipes (date, currency, decimal, uppercase, async), pure vs impure, custom pipes'},
      {n:76,topic:'Modules & Standalone',desc:'NgModule vs standalone components (Angular 17+), lazy loading, shared module pattern'},
      {n:77,topic:'Practice — Product List UI',desc:'Product listing app with search, filter, sort using Angular components and pipes'},
    ]},
    {week:'Week 12',title:'Services, HTTP & Routing',deadline:'Day 84',res:['RxJS docs','Angular Router docs','Fireship RxJS'],days:[
      {n:78,topic:'Services & DI',desc:'@Injectable, providedIn root vs module, service singleton, hierarchical injection, token injection'},
      {n:79,topic:'HTTP Client',desc:'HttpClientModule, GET/POST/PUT/DELETE, type-safe responses, error handling with catchError'},
      {n:80,topic:'RxJS Essentials',desc:'Observable, Subject, BehaviorSubject, ReplaySubject, operators (map, filter, switchMap, mergeMap, debounceTime, takeUntil)'},
      {n:81,topic:'Angular Router',desc:'RouterModule, Routes config, router-outlet, routerLink, ActivatedRoute, programmatic navigation'},
      {n:82,topic:'Route Guards & Resolvers',desc:'CanActivate, CanDeactivate, CanLoad, Route Resolvers, lazy loading guards'},
      {n:83,topic:'HTTP Interceptors',desc:'HttpInterceptor, add JWT to requests, refresh token logic, loading spinner, error interceptor'},
      {n:84,topic:'Full Stack Connected!',desc:'Angular app fully connected to .NET API — CRUD with auth, interceptor, guards'},
    ]},
    {week:'Week 13',title:'Angular Advanced',deadline:'Day 91',res:['NgRx docs','Angular Material docs','Angular Performance Guide'],days:[
      {n:85,topic:'Reactive Forms',desc:'FormGroup, FormControl, FormBuilder, validators (built-in + custom), async validators, FormArray'},
      {n:86,topic:'Template-Driven Forms',desc:'NgForm, NgModel, form validation messages, comparing with reactive forms, when to use each'},
      {n:87,topic:'NgRx State Management',desc:'Store, Actions, Reducers, Effects, Selectors, createAction/createReducer, DevTools'},
      {n:88,topic:'Angular Material UI',desc:'Install CDK + Material, use Table (mat-table), Dialog, Snackbar, Paginator, Sort'},
      {n:89,topic:'Performance Optimization',desc:'OnPush change detection, trackBy, async pipe, lazy loading, virtual scrolling, preloading strategies'},
      {n:90,topic:'Angular Signals (v17+)',desc:'signal(), computed(), effect(), toSignal(), toObservable() — new reactivity model'},
      {n:91,topic:'Auth UI Complete',desc:'Login/register pages, JWT stored in memory, refresh token, protected routes, role-based UI'},
    ]},
  ]},
  {id:'p5',title:'Phase 5 — Senior & Advanced Level',color:'#dc2626',bg:'#fee2e2',weeks:[
    {week:'Week 14',title:'Clean Architecture + Patterns',deadline:'Day 98',res:['Jason Taylor Clean Arch GitHub','ardalis.com','Pluralsight Design Patterns'],days:[
      {n:92,topic:'SOLID Principles',desc:'SRP, OCP, LSP, ISP, DIP — C# real-world code examples, common violations, refactoring'},
      {n:93,topic:'Clean Architecture',desc:'Domain layer (entities, value objects), Application (use cases), Infrastructure (EF, external), Presentation (API)'},
      {n:94,topic:'Value Objects & DDD Basics',desc:'Entities vs Value Objects, Aggregates, Aggregate Roots, Domain Services, Bounded Context'},
      {n:95,topic:'Creational Patterns',desc:'Singleton (thread-safe), Factory Method, Abstract Factory, Builder, Prototype — C# examples'},
      {n:96,topic:'Structural Patterns',desc:'Adapter, Decorator, Facade, Proxy, Composite, Bridge — real .NET use cases'},
      {n:97,topic:'Behavioral Patterns',desc:'Strategy, Observer, Command, Mediator, Chain of Responsibility, Template Method, State'},
      {n:98,topic:'Refactor to Clean Arch',desc:'Refactor Product API into Clean Architecture with Domain/Application/Infrastructure/API layers'},
    ]},
    {week:'Week 15',title:'CQRS + MediatR + Event Sourcing',deadline:'Day 105',res:['MediatR GitHub','FluentValidation docs','Greg Young Event Sourcing'],days:[
      {n:99,topic:'CQRS Pattern',desc:'Command Query Responsibility Segregation — when to use, separate read/write models, eventual consistency'},
      {n:100,topic:'MediatR Implementation',desc:'Install MediatR, IRequest/IRequestHandler, INotification, pipeline behaviors, send vs publish'},
      {n:101,topic:'Pipeline Behaviors',desc:'Validation behavior (FluentValidation), logging behavior, performance monitoring, transaction behavior'},
      {n:102,topic:'FluentValidation',desc:'AbstractValidator, RuleFor, custom validators, WithMessage, async validation, DI integration'},
      {n:103,topic:'Event Sourcing Concepts',desc:'Event store, event replay, snapshots, projections, difference from CRUD, EventStoreDB intro'},
      {n:104,topic:'Domain Events',desc:'IDomainEvent, raise events in aggregates, dispatch with MediatR, eventual consistency pattern'},
      {n:105,topic:'Full CQRS App',desc:'Implement CQRS + MediatR + FluentValidation in Clean Architecture — production pattern'},
    ]},
    {week:'Week 16',title:'Microservices Architecture',deadline:'Day 112',res:['dotnet-microservices GitHub','Chris Richardson microservices.io','Udi Dahan talks'],days:[
      {n:106,topic:'Microservices Fundamentals',desc:'Monolith vs SOA vs microservices, 12-factor app, Conway\'s Law, bounded contexts, service autonomy'},
      {n:107,topic:'Sync Communication',desc:'REST between services, gRPC (protocol buffers, streaming), service discovery, Polly resilience (retry, circuit breaker)'},
      {n:108,topic:'API Gateway — Ocelot',desc:'Ocelot setup, routing, aggregation, rate limiting, auth at gateway, YARP alternative'},
      {n:109,topic:'Async — RabbitMQ',desc:'AMQP concepts, exchanges (direct, topic, fanout), queues, RabbitMQ.Client, publish/consume patterns'},
      {n:110,topic:'MassTransit Framework',desc:'MassTransit over RabbitMQ, consumers, fault consumers, Sagas (state machine), outbox pattern'},
      {n:111,topic:'Service Mesh & Patterns',desc:'Sidecar pattern, strangler fig, saga pattern (choreography vs orchestration), outbox/inbox pattern'},
      {n:112,topic:'Practice',desc:'Split into User + Product + Order microservices — REST + RabbitMQ events + Ocelot gateway'},
    ]},
    {week:'Week 17',title:'Docker + Kubernetes + Cloud',deadline:'Day 119',res:['TechWorld with Nana YouTube','Microsoft Azure Learn','Docker docs'],days:[
      {n:113,topic:'Docker Fundamentals',desc:'Container vs VM, Docker architecture, images vs containers, Docker Hub, common commands'},
      {n:114,topic:'Dockerfile for .NET',desc:'Multi-stage builds, COPY, RUN, EXPOSE, ENTRYPOINT, .dockerignore, image size optimization'},
      {n:115,topic:'Docker Compose',desc:'docker-compose.yml — orchestrate API + SQL Server + Redis + RabbitMQ locally, networks, volumes'},
      {n:116,topic:'Kubernetes Basics',desc:'Pods, Deployments, Services (ClusterIP/NodePort/LoadBalancer), ConfigMaps, Secrets, kubectl commands'},
      {n:117,topic:'Azure Services',desc:'Azure Container Registry, AKS (Azure Kubernetes Service), App Service, Azure SQL, Key Vault, Service Bus'},
      {n:118,topic:'CI/CD with GitHub Actions',desc:'Workflow YAML, build/test/push/deploy pipeline, environment secrets, Azure deployment, rollback strategy'},
      {n:119,topic:'Practice — Full Deploy',desc:'Dockerize all microservices + Kubernetes manifests + GitHub Actions CI/CD to AKS'},
    ]},
    {week:'Week 18',title:'Performance, Security & Observability',deadline:'Day 126',res:['BenchmarkDotNet docs','OWASP Top 10','Application Insights docs'],days:[
      {n:120,topic:'Advanced Caching Strategies',desc:'Cache-aside, read-through, write-through, write-behind, cache stampede prevention, distributed cache patterns'},
      {n:121,topic:'Performance & Memory',desc:'BenchmarkDotNet, Span<T>/Memory<T>, ArrayPool<T>, object pooling, GC tuning, async vs sync performance'},
      {n:122,topic:'Rate Limiting',desc:'Fixed window, sliding window, token bucket, concurrency limiter — AspNetCoreRateLimit + built-in .NET 7+'},
      {n:123,topic:'OAuth 2.0 + OIDC + Keycloak',desc:'Authorization Code flow, PKCE, client credentials, Keycloak setup, token introspection, scopes'},
      {n:124,topic:'OWASP Top 10 & Security',desc:'Injection, XSS, CSRF, IDOR, security misconfiguration, secret management, penetration testing basics'},
      {n:125,topic:'Observability — Logs/Metrics/Traces',desc:'OpenTelemetry, distributed tracing, Jaeger, Prometheus + Grafana, Azure Application Insights'},
      {n:126,topic:'Practice',desc:'Add rate limiting, OpenTelemetry tracing, Prometheus metrics, health checks dashboard'},
    ]},
  ]},
  {id:'p6',title:'Phase 6 — Ultra Advanced (Architect Level)',color:'#7c3aed',bg:'#f3e8ff',weeks:[
    {week:'Week 19',title:'System Design & Architecture',deadline:'Day 133',res:['ByteByteGo YouTube','Designing Data-Intensive Applications book','High Scalability blog'],days:[
      {n:127,topic:'Distributed Systems Theory',desc:'CAP theorem, PACELC, consistency models (strong, eventual, causal), two-phase commit, distributed transactions'},
      {n:128,topic:'High Availability & Scalability',desc:'Horizontal vs vertical scaling, load balancing strategies, database sharding, read replicas, connection pooling'},
      {n:129,topic:'Message-Driven Architecture',desc:'Event-driven vs message-driven, event streaming (Kafka basics), event sourcing at scale, CQRS with separate DB'},
      {n:130,topic:'Design Pattern — URL Shortener',desc:'System design: API design, hashing, DB schema, caching layer, rate limiting, analytics — full solution'},
      {n:131,topic:'Design Pattern — Notification System',desc:'Fan-out, message queues, push/pull, real-time (SignalR/WebSocket), delivery guarantees, retry'},
      {n:132,topic:'Design Pattern — E-Commerce Platform',desc:'Product catalog, cart, checkout, payment, order management — distributed, consistent, scalable design'},
      {n:133,topic:'Architecture Review',desc:'Review all designs, trade-off analysis, present solutions like in a real architect interview'},
    ]},
    {week:'Week 20',title:'SignalR, gRPC & Advanced APIs',deadline:'Day 140',res:['SignalR docs','gRPC .NET docs','GraphQL Hot Chocolate'],days:[
      {n:134,topic:'SignalR Real-Time',desc:'Hub setup, groups, client methods, JavaScript client, reconnection, scaling with Redis backplane'},
      {n:135,topic:'gRPC in .NET',desc:'Protocol Buffers (.proto), server/client streaming, bidirectional streaming, interceptors, transcoding to REST'},
      {n:136,topic:'GraphQL with Hot Chocolate',desc:'Schema definition, queries/mutations/subscriptions, DataLoader, filtering/sorting, Hot Chocolate setup'},
      {n:137,topic:'Minimal APIs',desc:'.NET 8 Minimal APIs, endpoint filters, route groups, OpenAPI, performance vs controller-based'},
      {n:138,topic:'Background Services',desc:'IHostedService, BackgroundService, Quartz.NET (job scheduling), Hangfire (recurring jobs, dashboards)'},
      {n:139,topic:'Multi-Tenancy',desc:'Tenant identification, data isolation (separate DB vs schema vs row-level), tenant middleware, SaaS patterns'},
      {n:140,topic:'Practice — Real-Time Notifications',desc:'Add SignalR notifications to microservices — order status updates, real-time dashboard'},
    ]},
    {week:'Week 21',title:'Capstone Project Build',deadline:'Day 147',res:['GitHub portfolio tips','Portfolio project ideas','Azure free tier'],days:[
      {n:141,topic:'Project Architecture Design',desc:'Design full E-Commerce Microservices — service boundaries, DB per service, event flows, API contracts'},
      {n:142,topic:'User + Auth Service',desc:'ASP.NET Core Identity, JWT, refresh tokens, OAuth (Google login), email verification'},
      {n:143,topic:'Product + Catalog Service',desc:'CQRS, EF Core, Redis caching, full-text search (Elasticsearch basics), image upload (Azure Blob)'},
      {n:144,topic:'Order + Payment Service',desc:'Saga orchestration, payment webhook handling, order state machine, MassTransit saga'},
      {n:145,topic:'Notification Service',desc:'Email (SendGrid), SMS, SignalR push, RabbitMQ consumer, notification preferences'},
      {n:146,topic:'Angular Frontend',desc:'Full Angular 17 frontend — login, product browse, cart, checkout, order history, real-time updates'},
      {n:147,topic:'DevOps & Deploy',desc:'Docker Compose locally, K8s manifests, GitHub Actions CI/CD, Azure AKS deployment, monitoring'},
    ]},
    {week:'Week 22',title:'Interview Preparation',deadline:'Day 154',res:['LeetCode','NeetCode.io','Pramp.com mock interviews'],days:[
      {n:148,topic:'C# Advanced Interview Qs',desc:'GC internals, threading (Mutex/Semaphore/Monitor), async internals, IL code, CLR, memory management'},
      {n:149,topic:'ASP.NET + Architecture Qs',desc:'DI internals, middleware pipeline deep dive, CQRS trade-offs, Clean Architecture questions'},
      {n:150,topic:'Database Design Qs',desc:'Normalization (1NF-3NF-BCNF), ER diagrams, indexing strategy, sharding approaches, CAP theorem'},
      {n:151,topic:'Microservices Qs',desc:'Service discovery, circuit breaker, saga vs 2PC, event sourcing vs CRUD, bounded contexts'},
      {n:152,topic:'System Design Practice',desc:'Twitter feed, Uber dispatch, Netflix streaming, WhatsApp — whiteboard design 4 systems'},
      {n:153,topic:'Coding Rounds',desc:'LeetCode Medium: arrays, strings, hash maps, trees, graphs, dynamic programming — 20 problems'},
      {n:154,topic:'Full Mock Interview',desc:'1-hour full mock: system design + coding + behavioural + project walkthrough — YOU ARE READY!'},
    ]},
  ]},
];

// ===================== RESOURCES DATA =====================
const RESOURCES = [
  {phase:'Phase 1 — C# Fundamentals',color:'#4f46e5',bg:'#ede9fe',items:[
    {type:'YouTube',label:'Free',color:'#dc2626',name:'Kudvenkat C# Tutorial Playlist',url:'https://www.youtube.com/watch?v=OXion8hZ9Vo'},
    {type:'YouTube',label:'Free',color:'#dc2626',name:'IAmTimCorey — C# Basics',url:'https://www.youtube.com/c/IAmTimCorey'},
    {type:'Docs',label:'Free',color:'#059669',name:'Microsoft Learn — C# Fundamentals',url:'https://learn.microsoft.com/en-us/dotnet/csharp/'},
    {type:'Website',label:'Free',color:'#0891b2',name:'W3Schools C# Tutorial',url:'https://www.w3schools.com/cs/'},
    {type:'Book',label:'Paid',color:'#7c3aed',name:'C# in Depth by Jon Skeet',url:'https://www.manning.com/books/c-sharp-in-depth-fourth-edition'},
    {type:'Practice',label:'Free',color:'#d97706',name:'LeetCode — Easy C# problems',url:'https://leetcode.com'},
  ]},
  {phase:'Phase 2 — ASP.NET Core Web API',color:'#0891b2',bg:'#e0f7fa',items:[
    {type:'YouTube',label:'Free',color:'#dc2626',name:'Nick Chapsas — ASP.NET Core Series',url:'https://www.youtube.com/@nickchapsas'},
    {type:'YouTube',label:'Free',color:'#dc2626',name:'IAmTimCorey — REST API Tutorial',url:'https://www.youtube.com/c/IAmTimCorey'},
    {type:'Docs',label:'Free',color:'#059669',name:'Microsoft ASP.NET Core Docs',url:'https://learn.microsoft.com/en-us/aspnet/core/'},
    {type:'Course',label:'Paid',color:'#7c3aed',name:'Udemy — Complete ASP.NET Core MVC',url:'https://www.udemy.com'},
    {type:'Tool',label:'Free',color:'#d97706',name:'Postman API Testing Tool',url:'https://www.postman.com'},
    {type:'GitHub',label:'Free',color:'#1f2937',name:'ASP.NET Core sample apps',url:'https://github.com/dotnet/aspnetcore'},
  ]},
  {phase:'Phase 3 — SQL Server',color:'#059669',bg:'#dcfce7',items:[
    {type:'Website',label:'Free',color:'#0891b2',name:'SQLBolt — Interactive SQL',url:'https://sqlbolt.com'},
    {type:'YouTube',label:'Free',color:'#dc2626',name:'Kudvenkat SQL Server Tutorial',url:'https://www.youtube.com/watch?v=s9vBk5ZdvZ4'},
    {type:'Website',label:'Free',color:'#0891b2',name:'Mode SQL Tutorial',url:'https://mode.com/sql-tutorial/'},
    {type:'Book',label:'Free',color:'#7c3aed',name:'Use The Index, Luke!',url:'https://use-the-index-luke.com'},
    {type:'Docs',label:'Free',color:'#059669',name:'Redis Documentation',url:'https://redis.io/docs/'},
    {type:'GitHub',label:'Free',color:'#1f2937',name:'Dapper — lightweight ORM',url:'https://github.com/DapperLib/Dapper'},
  ]},
  {phase:'Phase 4 — Angular + TypeScript',color:'#d97706',bg:'#fef3c7',items:[
    {type:'Docs',label:'Free',color:'#059669',name:'Angular Official Documentation',url:'https://angular.io/docs'},
    {type:'Docs',label:'Free',color:'#059669',name:'TypeScript Handbook',url:'https://www.typescriptlang.org/docs/'},
    {type:'YouTube',label:'Free',color:'#dc2626',name:'Fireship — Angular in 100 Seconds + Series',url:'https://www.youtube.com/@Fireship'},
    {type:'Course',label:'Paid',color:'#7c3aed',name:'Maximilian Schwarzmüller — Angular Udemy',url:'https://www.udemy.com'},
    {type:'Website',label:'Free',color:'#0891b2',name:'Flexbox Froggy — CSS Game',url:'https://flexboxfroggy.com'},
    {type:'Docs',label:'Free',color:'#059669',name:'RxJS Documentation',url:'https://rxjs.dev/'},
  ]},
  {phase:'Phase 5 — Senior & Advanced',color:'#dc2626',bg:'#fee2e2',items:[
    {type:'GitHub',label:'Free',color:'#1f2937',name:'Jason Taylor Clean Architecture Template',url:'https://github.com/jasontaylordev/CleanArchitecture'},
    {type:'Blog',label:'Free',color:'#0891b2',name:'ardalis.com — Clean Architecture Blog',url:'https://ardalis.com'},
    {type:'YouTube',label:'Free',color:'#dc2626',name:'TechWorld with Nana — Docker & Kubernetes',url:'https://www.youtube.com/@TechWorldwithNana'},
    {type:'Docs',label:'Free',color:'#059669',name:'Microsoft Azure Learning Path',url:'https://learn.microsoft.com/en-us/azure/'},
    {type:'Docs',label:'Free',color:'#059669',name:'MassTransit Documentation',url:'https://masstransit.io/'},
    {type:'GitHub',label:'Free',color:'#1f2937',name:'eShopOnContainers — Microsoft microservices',url:'https://github.com/dotnet-architecture/eShopOnContainers'},
  ]},
  {phase:'Phase 6 — Ultra Advanced',color:'#7c3aed',bg:'#f3e8ff',items:[
    {type:'YouTube',label:'Free',color:'#dc2626',name:'ByteByteGo — System Design',url:'https://www.youtube.com/@ByteByteGo'},
    {type:'Book',label:'Paid',color:'#7c3aed',name:'Designing Data-Intensive Applications',url:'https://dataintensive.net/'},
    {type:'Website',label:'Free',color:'#0891b2',name:'microservices.io — Chris Richardson',url:'https://microservices.io'},
    {type:'Practice',label:'Free',color:'#d97706',name:'NeetCode.io — Coding Problems',url:'https://neetcode.io'},
    {type:'Practice',label:'Free',color:'#d97706',name:'Pramp — Free Mock Interviews',url:'https://www.pramp.com'},
    {type:'Blog',label:'Free',color:'#0891b2',name:'High Scalability Blog',url:'http://highscalability.com'},
  ]},
];
let customResourceLinks = lsJSON('dotnet_custom_resources', '[]');
let editingResourceId = null;

// ===================== COMMUNITY CONTENT DATA =====================
// Grouped by author. LinkedIn blocks automated access to post bodies, so 'Post' items
// carry title + link only (open while signed in to read the full post). 'Roadmap' items are
// summarized from the source document itself, which we do have full access to.
const CONTENT_AUTHORS = [
  {
    id:'sandip', name:'Sandip Mhaske', role:'Lead Developer · .NET Stack · AWS · Angular',
    avatar:'SM', linkedin:'https://www.linkedin.com/in/sandip-mhaske',
    items:[
      {id:'sm-pdf', type:'Roadmap', badgeColor:'#7c3aed', title:'30-Day Full-Stack .NET Developer Plan',
        summary:'The original source document this whole tracker is built from — a day-by-day roadmap covering C#, ASP.NET Core, SQL, Angular, Identity Server, Azure, CI/CD, woven together with daily Blind 75 practice.',
        points:[
          'Week 1 — C# & OOP foundations, LINQ, SQL, EF Core (Database First) · Blind 75 Arrays',
          'Week 2 — ASP.NET Core MVC & Web API, JWT auth, repository pattern · Blind 75 Strings',
          'Week 3 — Angular basic → advanced: forms, routing, RxJS, HttpClient · Blind 75 Binary Search / Linked List',
          'Week 4 — Identity Server (OAuth2/OIDC), Azure App Service, CI/CD, final deployment · Blind 75 mix + interview prep'
        ]},
      {id:'sm-1', type:'Post', badgeColor:'#0a66c2', title:'.NET Working with MongoDB',
        summary:'Practical notes on wiring a MongoDB data layer into a .NET application.',
        url:'https://www.linkedin.com/posts/sandip-mhaske_net-working-with-mongodb-activity-7292436771064238080-Q4k9'},
      {id:'sm-2', type:'Post', badgeColor:'#0a66c2', title:'.NET Integration with AWS DynamoDB',
        summary:'Connecting a .NET service to DynamoDB as a NoSQL, cloud-native data store.',
        url:'https://www.linkedin.com/posts/sandip-mhaske_net-integration-with-aws-dynamodb-activity-7312710308203040768-810V'},
      {id:'sm-3', type:'Post', badgeColor:'#0a66c2', title:'AWS DynamoDB & NoSQL',
        summary:'A grounding in DynamoDB fundamentals for developers coming from relational SQL.',
        url:'https://www.linkedin.com/posts/sandip-mhaske_aws-dynamodb-nosql-activity-7283716769712648192-rnVl'},
      {id:'sm-4', type:'Post', badgeColor:'#0a66c2', title:"The Developer's Notebook",
        summary:'A recurring series of day-to-day developer notes and lessons learned.',
        url:'https://www.linkedin.com/posts/sandip-mhaske_the-developers-notebook-activity-7314308345056714752-vre-'}
    ]
  }
];

const TYPE_ICON = {Roadmap:'bi-signpost-split',Post:'bi-linkedin',Link:'bi-link-45deg',Video:'bi-play-btn-fill',Note:'bi-sticky',Paragraph:'bi-text-paragraph',Bullets:'bi-list-ul',Image:'bi-image',PDF:'bi-file-earmark-pdf-fill',Diagram:'bi-diagram-3'};
const TYPE_COLOR = {Roadmap:'#7c3aed',Post:'#0a66c2',Link:'#0891b2',Video:'#be123c',Note:'#6b7280',Paragraph:'#1f2937',Bullets:'#16a34a',Image:'#d97706',PDF:'#dc2626',Diagram:'#4f46e5'};
const ITEM_PAGE_SIZE = 4;
let authorOrder = lsJSON('dotnet_author_order', 'null');
let itemOrders = lsJSON('dotnet_item_orders', '{}');
let customAuthors = lsJSON('dotnet_custom_authors', '[]');
let expandedCount = lsJSON('dotnet_item_expanded', '{}');
let authorCollapsed = lsJSON('dotnet_author_collapsed', '{}');
let itemCollapsed = lsJSON('dotnet_item_collapsed', '{}');
let itemOverrides = lsJSON('dotnet_item_overrides', '{}'); // persisted edits to built-in items
let deletedItemIds = new Set(lsJSON('dotnet_deleted_items', '[]')); // persisted deletes of built-in items
let authorOverrides = lsJSON('dotnet_author_overrides', '{}'); // persisted edits to built-in author profile (name/role/link)
let editingItem = null; // {authorId, itemId} or null when adding new
let editingAuthorId = null; // author id being edited (name/role), or null

// ---- Docs Hub: dynamic, scrollable sub-tabs (Community Docs / Curated Resources are built-in;
// any number of custom ones can be created right from the "Add new content" flow) ----
let docsSections = lsJSON('dotnet_docs_sections', 'null') || [
  {key:'community', label:'Community Docs', icon:'bi-people-fill', builtin:true},
  {key:'resources', label:'Curated Resources', icon:'bi-bookmark-star-fill', builtin:true}
];
let activeDocsSection = localStorage.getItem('dotnet_active_docs_section') || 'community';
if(!docsSections.some(s=>s.key===activeDocsSection)) activeDocsSection = 'community';
function saveDocsSections(){ localStorage.setItem('dotnet_docs_sections', JSON.stringify(docsSections)); }
function slugify(str){ return str.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') || ('section-'+authorIdFromName(str).replace('author-','')); }

// Shared drag-to-reorder for the scrollable sub-tab rows (Docs Hub + Interview Q&A).
// `sectionsArr` is mutated in place via splice, so no return value is needed — both
// callers pass their own live array (docsSections / qaSections) plus how to save + redraw it.
let draggedSubtabKey = null;
function attachSubtabDragEvents(containerId, sectionsArr, saveFn, rerenderFn){
  const container = document.getElementById(containerId);
  if(!container) return;
  container.querySelectorAll('.subtab-pill[data-key]').forEach(pill=>{
    pill.addEventListener('dragstart', ()=>{ draggedSubtabKey = pill.dataset.key; pill.classList.add('dragging'); });
    pill.addEventListener('dragend', ()=>{ pill.classList.remove('dragging'); container.querySelectorAll('.subtab-pill').forEach(p=>p.classList.remove('drag-over-item')); });
    pill.addEventListener('dragover', e=>{ e.preventDefault(); if(draggedSubtabKey && draggedSubtabKey!==pill.dataset.key) pill.classList.add('drag-over-item'); });
    pill.addEventListener('dragleave', ()=> pill.classList.remove('drag-over-item'));
    pill.addEventListener('drop', e=>{
      e.preventDefault(); pill.classList.remove('drag-over-item');
      if(!draggedSubtabKey || draggedSubtabKey===pill.dataset.key) return;
      const fromIdx = sectionsArr.findIndex(s=>s.key===draggedSubtabKey);
      const toIdx = sectionsArr.findIndex(s=>s.key===pill.dataset.key);
      if(fromIdx<0 || toIdx<0) return;
      const [moved] = sectionsArr.splice(fromIdx,1);
      sectionsArr.splice(toIdx,0,moved);
      saveFn();
      rerenderFn();
    });
  });
}
let pendingMedia = null; // {dataUrl, name, mime} staged from file input before save
const MAX_UPLOAD_MB = 8;
// Reads a picked file for upload. Images are shrunk; anything over the limit is refused with a clear message.
async function readUpload(file){
  if(!file) return null;
  if(file.size > MAX_UPLOAD_MB*1024*1024){ alert(`"${file.name}" is ${(file.size/1048576).toFixed(1)} MB. Please choose a file under ${MAX_UPLOAD_MB} MB.`); return null; }
  try{
    if(/^image\//.test(file.type)) return {dataUrl: await shrinkImage(file), name: file.name, mime: file.type};
    const dataUrl = await new Promise((ok,fail)=>{ const r=new FileReader(); r.onload=()=>ok(r.result); r.onerror=()=>fail(r.error); r.readAsDataURL(file); });
    return {dataUrl, name: file.name, mime: file.type};
  }catch(e){ alert('Could not read that file: '+(e.message||e)); return null; }
}

// ---- IndexedDB (local cache for images/PDFs; Firebase Firestore is the real store) ----
const IDB_NAME='dotnet_roadmap_media', IDB_STORE='media';
function idbOpen(){
  return new Promise((res,rej)=>{
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = ()=> req.result.createObjectStore(IDB_STORE);
    req.onsuccess = ()=> res(req.result);
    req.onerror = ()=> rej(req.error);
  });
}
async function idbPutLocal(key, value){ const db = await idbOpen(); return new Promise((res,rej)=>{ const tx=db.transaction(IDB_STORE,'readwrite'); tx.objectStore(IDB_STORE).put(value,key); tx.oncomplete=()=>res(true); tx.onerror=()=>rej(tx.error); }); }
async function idbGetLocal(key){ const db = await idbOpen(); return new Promise((res,rej)=>{ const tx=db.transaction(IDB_STORE,'readonly'); const r=tx.objectStore(IDB_STORE).get(key); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
async function idbDeleteLocal(key){ const db = await idbOpen(); return new Promise((res,rej)=>{ const tx=db.transaction(IDB_STORE,'readwrite'); tx.objectStore(IDB_STORE).delete(key); tx.oncomplete=()=>res(true); tx.onerror=()=>rej(tx.error); }); }
// Images/PDFs: saved in Firestore (source of truth); IndexedDB is only a fast local cache.
async function idbPut(key, value, onProgress){
  await idbPutLocal(key, value);
  if(window.Cloud){ try{ await Cloud.putMedia(key, value, onProgress); }catch(e){ console.error(e); alert('Saved on this device, but uploading to Firebase failed: '+(e.message||e)); } }
  return true;
}
async function idbGet(key){
  let v = await idbGetLocal(key);
  if(v===undefined && window.Cloud){ try{ v = await Cloud.getMedia(key); if(v) await idbPutLocal(key, v); }catch(e){ console.error(e); } }
  return v === null ? undefined : v;
}
async function idbDelete(key){
  await idbDeleteLocal(key);
  if(window.Cloud){ Cloud.deleteMedia(key).catch(e=>console.error(e)); }
  return true;
}

function getAllAuthors(){
  const all = [...CONTENT_AUTHORS, ...customAuthors].map(a=>({
    ...a,
    ...(authorOverrides[a.id]||{}),
    items: a.items.filter(it=>!deletedItemIds.has(it.id)).map(it=> itemOverrides[it.id] ? {...it, ...itemOverrides[it.id]} : it)
  }));
  // items added to a built-in author live in a hidden "-mine" twin: show them inside the author's own card
  const twins = all.filter(a=>a.id.endsWith('-mine') && all.some(b=>b.id===a.id.slice(0,-5)));
  twins.forEach(t=>{ const base = all.find(b=>b.id===t.id.slice(0,-5)); base.items = [...t.items, ...base.items]; });
  const shownAuthors = all.filter(a=>!twins.includes(a));
  shownAuthors.forEach(a=>{
    const ord = itemOrders[a.id];
    if(ord){
      const map = new Map(a.items.map(it=>[it.id,it]));
      const ordered = ord.map(id=>map.get(id)).filter(Boolean);
      a.items.forEach(it=>{ if(!ord.includes(it.id)) ordered.unshift(it); });
      a.items = ordered;
    }
  });
  if(authorOrder){
    const map = new Map(shownAuthors.map(a=>[a.id,a]));
    const ordered = authorOrder.map(id=>map.get(id)).filter(Boolean);
    shownAuthors.forEach(a=>{ if(!authorOrder.includes(a.id)) ordered.push(a); });
    return ordered;
  }
  return shownAuthors;
}
// The stored (custom) author that really holds an item, whichever card it is shown in.
function customOwnerOf(itemId){ return customAuthors.find(a=>a.items.some(i=>i.id===itemId)); }
const STALE_KEYS = ['points','steps','url','mediaKey','mediaName','images'];
function dropStale(obj, data){ STALE_KEYS.forEach(k=>{ if(!(k in data)) delete obj[k]; }); return obj; }
// Puts a new item into an author's stored card (creating the hidden twin for built-in authors).
function insertDocsItem(authorId, item, fallback){
  const custom = customAuthors.find(a=>a.id===authorId);
  const twin = customAuthors.find(a=>a.id===authorId+'-mine');
  const base = getAllAuthors().find(a=>a.id===authorId);
  if(custom) custom.items.unshift(item);
  else if(twin) twin.items.unshift(item);
  else if(base) customAuthors.push({id: authorId+'-mine', name: base.name, role: base.role, avatar: base.avatar, linkedin: base.linkedin || '#', items:[item]});
  else if(fallback) customAuthors.push({id:authorId, name:fallback.name, role:fallback.role, avatar: initialsOf(fallback.name), linkedin: fallback.linkedin || '#', items:[item]});
  else return false;
  persistCustomAuthors();
  return true;
}
function persistCustomAuthors(){ localStorage.setItem('dotnet_custom_authors', JSON.stringify(customAuthors)); }
function saveAuthorOrder(list){ authorOrder = list.map(a=>a.id); localStorage.setItem('dotnet_author_order', JSON.stringify(authorOrder)); }
function saveItemOrder(authorId, items){ itemOrders[authorId] = items.map(i=>i.id); localStorage.setItem('dotnet_item_orders', JSON.stringify(itemOrders)); }
function toggleAuthorCollapse(authorId){ authorCollapsed[authorId] = !authorCollapsed[authorId]; localStorage.setItem('dotnet_author_collapsed', JSON.stringify(authorCollapsed)); renderAuthorPosts(); }
function toggleItemCollapse(itemId){ itemCollapsed[itemId] = !itemCollapsed[itemId]; localStorage.setItem('dotnet_item_collapsed', JSON.stringify(itemCollapsed)); renderAuthorPosts(); }

// Sourced directly from the original 30-Day Full-Stack .NET PDF (Sandip Mhaske).
const ROADMAP_PLAN = [
  {week:'Week 1 — C# & .NET Foundations + SQL + Blind 75 Arrays', days:[
    {n:1,topic:'C# Basics',morning:'Syntax, variables, types.',midday:'Calculator console app.',afternoon:'Blind 75 — Two Sum, Best Time to Buy/Sell Stock.',evening:'Review & notes.'},
    {n:2,topic:'Control Structures & Collections',morning:'Loops, collections.',midday:'Student Management app.',afternoon:'Blind 75 — Contains Duplicate, Product of Array Except Self.',evening:'LINQ basics.'},
    {n:3,topic:'OOP Concepts',morning:'Encapsulation, inheritance, polymorphism.',midday:'Library System app.',afternoon:'Blind 75 — Maximum Subarray, Maximum Product Subarray.',evening:'OOP Q&A.'},
    {n:4,topic:'Advanced C#',morning:'Interfaces, delegates, events.',midday:'Event-driven console app.',afternoon:'Blind 75 — Find Min in Rotated Sorted Array.',evening:'Practice.'},
    {n:5,topic:'LINQ',morning:'Basics & lambda expressions.',midday:'LINQ dataset practice.',afternoon:'Blind 75 — Search in Rotated Sorted Array, 3Sum.',evening:'SQL intro.'},
    {n:6,topic:'SQL Basics',morning:'CRUD, joins.',midday:'Database creation.',afternoon:'Blind 75 — Container With Most Water.',evening:'DB normalization.'},
    {n:7,topic:'Database First Approach',morning:'EF model scaffold.',midday:'CRUD with EF Core.',afternoon:'Blind 75 — Longest Consecutive Sequence.',evening:'Week recap.'},
  ]},
  {week:'Week 2 — ASP.NET Core MVC/API + Blind 75 Strings', days:[
    {n:8,topic:'ASP.NET Core Intro',morning:'Middleware, DI.',midday:'MVC app.',afternoon:'Blind 75 — Valid Anagram, Group Anagrams.',evening:'Middleware review.'},
    {n:9,topic:'MVC in Depth',morning:'Controllers, Views, Razor.',midday:'CRUD.',afternoon:'Blind 75 — Valid Palindrome, Longest Palindromic Substring.',evening:'ViewData/ViewBag.'},
    {n:10,topic:'API Development',morning:'API controllers, CRUD.',midday:'Postman testing.',afternoon:'Blind 75 — Longest Substring Without Repeating Characters.',evening:'Validation.'},
    {n:11,topic:'Advanced API',morning:'DTOs, AutoMapper, filters.',midday:'Repository pattern.',afternoon:'Blind 75 — Minimum Window Substring.',evening:'Auth intro.'},
    {n:12,topic:'Authentication Basics',morning:'JWT.',midday:'Secure API.',afternoon:'Blind 75 — Encode and Decode Strings.',evening:'Claims & roles.'},
    {n:13,topic:'API + SQL Integration',morning:'EF DB First.',midday:'CRUD with repository.',afternoon:'Blind 75 — Longest Repeating Character Replacement.',evening:'Refactor.'},
    {n:14,topic:'MVC + API Integration Project',morning:'Employee CRUD API.',midday:'MVC consumes API.',afternoon:'Blind 75 — Valid Parentheses.',evening:'Week review.'},
  ]},
  {week:'Week 3 — Angular Basic to Advanced + Blind 75 Binary Search / Linked List', days:[
    {n:15,topic:'Angular Setup & Basics',morning:'CLI setup, components.',midday:'Data binding.',afternoon:'Blind 75 — Binary Search problems.',evening:'Angular notes.'},
    {n:16,topic:'Directives, Pipes, Services',morning:'ngIf/ngFor, pipes.',midday:'Services & DI.',afternoon:'Blind 75 — Reverse Linked List, Merge Two Sorted Lists.',evening:'Review.'},
    {n:17,topic:'Forms',morning:'Template & reactive forms.',midday:'Validation.',afternoon:'Blind 75 — Reorder List, Remove Nth Node From End.',evening:'Form Q&A.'},
    {n:18,topic:'Routing',morning:'Router, lazy loading.',midday:'Routing project.',afternoon:'Blind 75 — Linked List Cycle, Intersection of Two Linked Lists.',evening:'Guards intro.'},
    {n:19,topic:'Lifecycle Hooks & State',morning:'ngOnInit, Observables.',midday:'State sharing.',afternoon:'Blind 75 — Validate BST, Lowest Common Ancestor.',evening:'RxJS basics.'},
    {n:20,topic:'API Integration in Angular',morning:'HttpClient.',midday:'Interceptors.',afternoon:'Blind 75 — Tree problems.',evening:'Review.'},
    {n:21,topic:'Angular CRUD Project',morning:'Full CRUD with API.',midday:'UI improvements.',afternoon:'Blind 75 — Graph problems.',evening:'Week recap.'},
  ]},
  {week:'Week 4 — Identity Server, Azure, CI/CD + Blind 75 Mix', days:[
    {n:22,topic:'Identity Server Intro',morning:'OAuth2 & OIDC.',midday:'Setup Identity Server.',afternoon:'Blind 75 — Climbing Stairs, Coin Change.',evening:'Clients & scopes.'},
    {n:23,topic:'Authentication Flow',morning:'Register/Login.',midday:'Secure API.',afternoon:'Blind 75 — Longest Increasing Subsequence.',evening:'Refresh tokens.'},
    {n:24,topic:'Authorization',morning:'Roles, policies, claims.',midday:'Protect Angular routes.',afternoon:'Blind 75 — Word Break.',evening:'Access control tests.'},
    {n:25,topic:'Auth Microservice',morning:'Create Auth microservice.',midday:'Integrate API + Angular.',afternoon:'Blind 75 — House Robber.',evening:'Sessions.'},
    {n:26,topic:'Token Management in Angular',morning:'Store tokens securely.',midday:'Auto-refresh.',afternoon:'Blind 75 — Unique Paths.',evening:'Review.'},
    {n:27,topic:'Azure Basics',morning:'App Service, Azure SQL.',midday:'Deploy API.',afternoon:'Blind 75 — Heap problems.',evening:'Blob storage.'},
    {n:28,topic:'CI/CD in Azure DevOps',morning:'Build pipelines.',midday:'Release pipelines.',afternoon:'Blind 75 — Interval problems.',evening:'Test deployment.'},
    {n:29,topic:'Final Project Deployment',morning:'Deploy API + Angular + Identity Server.',midday:'Testing.',afternoon:'Blind 75 — Backtracking problems.',evening:'Polish portfolio.'},
    {n:30,topic:'Interview Prep',morning:'Revise all concepts.',midday:'Mock interview.',afternoon:'Remaining Blind 75 problems.',evening:'HR/behavioral prep.'},
  ]},
];

function roadmapAccordionHTML(){
  return `<div class="roadmap-embed">${ROADMAP_PLAN.map(w=>`
    <details class="week-details">
      <summary>${esc(w.week)}</summary>
      <div class="days-list">
        ${w.days.map(d=>`<details class="day-details">
          <summary>Day ${d.n} — ${esc(d.topic)}</summary>
          <div class="sessions">
            <div><b>Morning:</b> ${esc(d.morning)}</div>
            <div><b>Midday:</b> ${esc(d.midday)}</div>
            <div><b>Afternoon:</b> ${esc(d.afternoon)}</div>
            <div><b>Evening:</b> ${esc(d.evening)}</div>
          </div>
        </details>`).join('')}
      </div>
    </details>`).join('')}</div>`;
}

function itemBodyHTML(item){
  let html = '';
  // PDF: keep the optional topic/notes text collapsible rather than always shown.
  if(item.type==='PDF' && item.summary){
    html += `<details class="pdf-note-details"><summary>Topic / notes</summary><div class="item-summary mt-1">${rich(item.summary)}</div></details>`;
  } else if(item.summary){
    html += `<div class="item-summary">${rich(item.summary)}</div>`;
  }
  if(item.points) html += `<ul class="item-points">${item.points.map(p=>`<li>${rich(p)}</li>`).join('')}</ul>`;
  if(item.type==='Roadmap') html += roadmapAccordionHTML();
  if(item.type==='Diagram' && item.steps){
    html += `<div class="diagram-flow">${item.steps.map((s,i)=>`<span class="diagram-step">${esc(s)}</span>${i<item.steps.length-1?'<i class="bi bi-arrow-right diagram-arrow" aria-hidden="true"></i>':''}`).join('')}</div>`;
  }
  if(item.type==='Image') html += imageSliderHTML(item);
    if(item.type==='PDF' && item.mediaKey) html += pdfBoxHTML(item);
  if((item.type==='Video' || (item.type==='Link' && getVideoEmbedInfo(item.url))) && item.url){
    const vid = getVideoEmbedInfo(item.url);
    if(vid && vid.kind==='iframe'){
      html += `<div class="item-video-wrap"><iframe src="${escA(vid.src)}" title="${escA(item.title||'Video')}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowfullscreen></iframe></div>`;
    } else if(vid && vid.kind==='video'){
      html += `<div class="item-video-wrap"><video src="${escA(vid.src)}" controls preload="metadata"></video></div>`;
    }
  } else if(item.url){
    const isLinkedIn = /linkedin\.com/i.test(item.url);
    html += `<a class="item-open" href="${escA(safeUrl(item.url))}" target="_blank" rel="noopener noreferrer">${isLinkedIn?'Open on LinkedIn':'Open link'} <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i></a>`;
  }
  return html + tagChipsHTML(item);
}

// Looks up an item's data no matter which board it lives on (Docs Hub author items,
// Advanced+ topics, or Interview Q&A rich answers) — lets Preview/Download work everywhere.
function findAnyItemById(itemId){
  for(const author of getAllAuthors()){
    const it = author.items.find(i=>i.id===itemId);
    if(it) return it;
  }
  const adv = getAllAdvItems().find(i=>i.id===itemId);
  if(adv) return adv;
  const qa = getAllQAItems().find(i=>i.id===itemId);
  if(qa) return qa;
  return null;
}

async function downloadStoredMedia(itemId){
  const item = findAnyItemById(itemId);
  if(!item || !item.mediaKey) return;
  const dataUrl = await idbGet(item.mediaKey);
  if(!dataUrl){ alert('Could not load this file from storage.'); return; }
  const blobUrl = URL.createObjectURL(dataUrlToBlob(dataUrl));
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = item.mediaName || item.title || item.q || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(blobUrl), 5000);
}

function renderAuthorPosts(){
  renderDocsSubtabs();
  const board = document.getElementById('author-board'); board.innerHTML='';
  const authors = getAllAuthors();

  authors.forEach(author=>{
    const sectionItems = author.items.filter(it=>(it.section||'community')===activeDocsSection);
    if(sectionItems.length===0) return;

    const card = document.createElement('div');
    card.className='author-card';
    card.dataset.authorId = author.id;

    const collapsed = !!authorCollapsed[author.id];
    const shown = expandedCount[author.id] || ITEM_PAGE_SIZE;
    const visibleItems = sectionItems.slice(0, shown);
    const hasMore = sectionItems.length > shown;
    const isCustom = customAuthors.some(a=>a.id===author.id);

    card.innerHTML = `
      <div class="author-topbar" draggable="true">
        <button class="collapse-btn ${collapsed?'collapsed':''}" onclick="toggleAuthorCollapse('${escA(author.id)}')" title="Collapse/expand" aria-label="Collapse or expand author"><i class="bi bi-chevron-down"></i></button>
        <i class="bi bi-grip-vertical drag-handle"></i>
        <div class="author-avatar">${esc(author.avatar)}</div>
        <div class="author-meta">
          <p class="name">${esc(author.name)} ${!collapsed?'':`<span class="name-count">· ${sectionItems.length} item${sectionItems.length!==1?'s':''}</span>`}</p>
          <p class="role">${esc(author.role)}</p>
        </div>
        <a class="author-link" href="${escA(safeUrl(author.linkedin)||'#')}" target="_blank" rel="noopener noreferrer"><i class="bi bi-box-arrow-up-right me-1"></i>Profile</a>
        <div class="author-actions">
          <button onclick="addToAuthor('${escA(author.id)}')" title="Add content to this author" aria-label="Add content to this author"><i class="bi bi-plus-lg"></i></button>
          <button onclick="editAuthorMeta('${escA(author.id)}')" title="Edit author" aria-label="Edit author"><i class="bi bi-pencil"></i></button>
          ${isCustom ? `<button onclick="deleteAuthor('${escA(author.id)}')" title="Delete author" aria-label="Delete author"><i class="bi bi-trash"></i></button>` : ''}
        </div>
      </div>
      ${collapsed ? '' : `<div class="item-list" data-author-id="${escA(author.id)}"></div>
      ${hasMore ? `<div class="d-flex pb-3"><button class="btn btn-sm btn-outline-secondary show-more-btn mx-auto" onclick="showMoreItems('${escA(author.id)}')"><i class="bi bi-chevron-down me-1"></i>Show ${sectionItems.length - shown} more</button></div>` : ''}`}
    `;
    board.appendChild(card);

    if(!collapsed){
      const list = card.querySelector('.item-list');
      visibleItems.forEach(item=>{
        const itemClosed = !!itemCollapsed[item.id];
        const el = document.createElement('div');
        el.className='content-item';
        el.draggable = true;
        el.dataset.itemId = item.id;
        el.dataset.type = item.type;
        el.dataset.search = (item.mediaName || '') + ' ' + (item.tags||[]).join(' ');
        el.innerHTML = `
          <i class="bi bi-grip-vertical item-handle"></i>
          <div class="item-body">
            <div class="item-top">
              <span class="item-badge"><i class="bi ${TYPE_ICON[item.type]||'bi-file-text'} me-1" aria-hidden="true"></i>${esc(item.type)}</span>
              <span class="item-title">${esc(item.title)}</span>
              <button class="item-collapse-btn" onclick="toggleItemCollapse('${escA(item.id)}')" title="Collapse/expand" aria-label="Collapse or expand" aria-expanded="${!itemClosed}"><i class="bi bi-chevron-${itemClosed?'down':'up'}"></i></button>
              <div class="item-actions">
                <button class="item-action-btn" onclick="editItem('${escA(author.id)}','${escA(item.id)}')" title="Edit" aria-label="Edit"><i class="bi bi-pencil"></i></button>
                <button class="item-action-btn danger" onclick="deleteItem('${escA(author.id)}','${escA(item.id)}')" title="Delete" aria-label="Delete"><i class="bi bi-trash"></i></button>
              </div>
            </div>
            ${itemClosed ? '' : itemBodyHTML(item)}
          </div>`;
        list.appendChild(el);
        attachItemDragEvents(el, author.id);
        
      });
    }

    attachAuthorDragEvents(card);
  });
  hydrateSliders(board);
  if(board.children.length===0){
    board.innerHTML = `<p class="small text-muted text-center py-4"><i class="bi bi-inbox me-1"></i>Nothing in this section yet — tap "Add new content" above to add something here.</p>`;
  }

  const searchEl = document.getElementById('docs-search-input');
  if(searchEl && (searchEl.value || document.getElementById('docs-type-filter').value)) filterDocsHub();
}

// ---- Dynamic, scrollable Docs Hub sub-tabs ----
function renderDocsSubtabs(){
  const el = document.getElementById('docs-subtabs');
  if(!el) return;
  el.innerHTML = docsSections.map(s=>`
    <button class="subtab-pill ${s.key===activeDocsSection?'active':''}" data-key="${escA(s.key)}" draggable="true" onclick="setDocsSubtab('${escA(s.key)}')">
      <i class="bi bi-grip-vertical grip" aria-hidden="true"></i>
      <i class="bi ${escA(s.icon)}" aria-hidden="true"></i>${esc(s.label)}
      ${!s.builtin ? `<span class="del-section" role="button" tabindex="0" aria-label="Delete this tab" onclick="event.stopPropagation();deleteDocsSection('${escA(s.key)}')" onkeydown="if(event.key==='Enter'){event.stopPropagation();deleteDocsSection('${escA(s.key)}')}"><i class="bi bi-x-circle"></i></span>` : ''}
    </button>`).join('')
    + `<button class="subtab-pill add-pill" onclick="promptNewDocsSection()"><i class="bi bi-plus-lg"></i>New tab</button>`;
  attachSubtabDragEvents('docs-subtabs', docsSections, saveDocsSections, renderDocsSubtabs);
}
function setDocsSubtab(key){
  activeDocsSection = key;
  renderDocsSubtabs();
  localStorage.setItem('dotnet_active_docs_section', key);
  document.getElementById('docs-community-view').style.display = key==='resources' ? 'none' : '';
  document.getElementById('docs-resources-view').style.display = key==='resources' ? '' : 'none';
  if(key==='resources') renderResources(); else renderAuthorPosts();
  filterDocsHub();
}
function promptNewDocsSection(){
  const name = (prompt('Name your new tab (e.g. "Certifications", "Cheat Sheets"):')||'').trim().slice(0,40);
  if(!name) return;
  const key = slugify(name);
  if(docsSections.some(s=>s.key===key)){ setDocsSubtab(key); return; }
  docsSections.push({key, label:name, icon:'bi-folder2', builtin:false});
  saveDocsSections();
  setDocsSubtab(key);
}
function deleteDocsSection(key){
  const sec = docsSections.find(s=>s.key===key);
  if(!sec) return;
  if(!confirm('Delete the "'+sec.label+'" tab? Any items already in it will move back to Community Docs.')) return;
  customAuthors.forEach(author=> author.items.forEach(it=>{ if((it.section||'community')===key) it.section='community'; }));
  persistCustomAuthors();
  CONTENT_AUTHORS.forEach(author=> author.items.forEach(it=>{
    const current = itemOverrides[it.id] ? {...it, ...itemOverrides[it.id]} : it;
    if((current.section||'community')===key) itemOverrides[it.id] = {...(itemOverrides[it.id]||{}), section:'community'};
  }));
  localStorage.setItem('dotnet_item_overrides', JSON.stringify(itemOverrides));
  docsSections = docsSections.filter(s=>s.key!==key);
  saveDocsSections();
  setDocsSubtab('community');
}

// ---- Search + type filter for Docs Hub (Community Docs) ----
function filterDocsHub(){
  const term = (document.getElementById('docs-search-input').value||'').trim().toLowerCase();
  const typeEl = document.getElementById('docs-type-filter');
  const isRes = activeDocsSection==='resources';
  if(typeEl) typeEl.style.display = isRes ? 'none' : '';
  if(isRes){ filterResources(); return; }
  const type = typeEl ? typeEl.value : '';
  let shown = 0;
  const filtering = !!(term || type);
  document.querySelectorAll('.author-card').forEach(card=>{
    // Not filtering: show every card. (A collapsed card has no item rows, so the old code decided it was "empty"
    // and hid it - that is why Community Docs vanished after visiting Curated Resources and coming back.)
    if(!filtering){ card.style.display = ''; card.querySelectorAll('.content-item').forEach(r=>{ r.style.display=''; }); return; }
    let anyVisible = false;
    card.querySelectorAll('.content-item').forEach(row=>{
      const matchesText = !term || (row.textContent + ' ' + (row.dataset.search||'')).toLowerCase().includes(term);
      const matchesType = !type || row.dataset.type===type;
      const show = matchesText && matchesType;
      row.style.display = show ? '' : 'none';
      if(show){ anyVisible = true; shown++; }
    });
    if(!card.querySelector('.content-item') && card.textContent.toLowerCase().includes(term||'\u0000')) anyVisible = true;   // collapsed card: match on its header
    card.style.display = anyVisible ? '' : 'none';
  });
  const empty = document.getElementById('docs-empty-msg');
  if(empty) empty.style.display = (shown===0 && (term||type)) ? '' : 'none';
}

// ---- Search filter for Curated Resources ----
function filterResources(){
  const term = (document.getElementById('docs-search-input').value||'').trim().toLowerCase();
  document.querySelectorAll('#res-container .res-card').forEach(card=>{
    let anyVisible = false;
    card.querySelectorAll('.res-link').forEach(row=>{
      const match = !term || row.textContent.toLowerCase().includes(term);
      row.style.display = match ? '' : 'none';
      if(match) anyVisible = true;
    });
    card.parentElement.style.display = anyVisible ? '' : 'none';
  });
}

// ---- Step 1 of adding content: ask what they want to upload ----
// Step 1 (popup): which section is this going into?
let pendingDocsSection = 'community';
let pendingAuthorForAdd = null; // {id,name,role} when adding straight into an existing author card
let formDraft = null;           // keeps the title when switching the content type while editing
function openAddChooser(){
  editingItem = null; editingAuthorId = null; pendingMedia = null; editingResourceId = null; pendingAuthorForAdd = null; formDraft = null;
  openModal(`
    <div class="author-form docshub-form-compact mb-0">
      <h6 class="form-title"><i class="bi bi-plus-circle me-1"></i>Where should this go?</h6>
      <div class="type-chooser-grid" style="grid-template-columns:repeat(2,1fr)">
        ${docsSections.map(s=>`<button type="button" class="type-chooser-btn" onclick="${s.key==='resources'?`openResourceForm()`:`openContentTypeChooser('${escA(s.key)}')`}"><i class="bi ${escA(s.icon)}" aria-hidden="true"></i><span class="tc-label">${esc(s.label)}</span></button>`).join('')}
      </div>
      <button type="button" class="type-chooser-btn mt-2" style="border-style:dashed;width:100%" onclick="promptNewSectionThenAdd()"><i class="bi bi-plus-lg" style="color:#16a34a"></i><span class="tc-label">Create a new tab</span></button>
      <button class="btn btn-outline-secondary btn-sm mt-2" onclick="closeModal()">Cancel</button>
    </div>`);
}
function promptNewSectionThenAdd(){
  const name = (prompt('Name your new tab (e.g. "Certifications", "Cheat Sheets"):')||'').trim().slice(0,40);
  if(!name) return;
  const key = slugify(name);
  if(!docsSections.some(s=>s.key===key)){
    docsSections.push({key, label:name, icon:'bi-folder2', builtin:false});
    saveDocsSections();
  }
  openContentTypeChooser(key);
}

// Adds new content straight into an existing author card (no need to retype the author).
function addToAuthor(authorId){
  const a = getAllAuthors().find(x=>x.id===authorId);
  if(!a) return;
  editingItem = null; editingAuthorId = null; pendingMedia = null; editingResourceId = null; formDraft = null;
  pendingAuthorForAdd = {id:a.id, name:a.name, role:a.role};
  openContentTypeChooser(activeDocsSection);
}
// While editing: swap the item to another type (e.g. add a PDF/image to a text item) without losing the title.
function switchContentFormType(cat){
  if(!editingItem) return;
  const t = document.getElementById('naf-title');
  formDraft = {title: t ? t.value : ''};
  openContentForm(editingItem.authorId, editingItem.itemId, cat);
}
function typeSwitcherHTML(current, fn){
  const opts = [['PDF','PDF','bi-file-earmark-pdf-fill'],['Image','Image','bi-image'],['Link','Link','bi-link-45deg'],['Content','Text','bi-text-paragraph']];
  return `<div class="col-12"><div class="small text-muted mb-1">Type — switch to attach a different kind of content</div><div class="d-flex gap-1 flex-wrap">${opts.map(([c,l,ic])=>`<button type="button" class="btn btn-sm ${c===current?'btn-dark':'btn-outline-secondary'}" onclick="${fn}('${c}')"><i class="bi ${ic} me-1"></i>${l}</button>`).join('')}</div></div>`;
}

// Step 2a (popup): Community Docs (or any custom tab) — what kind of content?
function openContentTypeChooser(sectionKey){
  pendingDocsSection = sectionKey || pendingDocsSection || 'community';
  openModal(`
    <div class="author-form docshub-form-compact mb-0">
      <h6 class="form-title"><i class="bi bi-plus-circle me-1"></i>What would you like to add?</h6>
      <div class="type-chooser-grid">
        <button type="button" class="type-chooser-btn" onclick="openContentForm(null,null,'PDF')"><i class="bi bi-file-earmark-pdf-fill" style="color:#dc2626"></i><span class="tc-label">PDF</span></button>
        <button type="button" class="type-chooser-btn" onclick="openContentForm(null,null,'Image')"><i class="bi bi-image" style="color:#d97706"></i><span class="tc-label">Image</span></button>
        <button type="button" class="type-chooser-btn" onclick="openContentForm(null,null,'Link')"><i class="bi bi-link-45deg" style="color:#0891b2"></i><span class="tc-label">Link</span></button>
        <button type="button" class="type-chooser-btn" onclick="openContentForm(null,null,'Content')"><i class="bi bi-text-paragraph" style="color:#16a34a"></i><span class="tc-label">Content</span></button>
      </div>
      <div class="d-flex gap-2 mt-2">
        <button class="btn btn-outline-secondary btn-sm" onclick="closeModal()">Cancel</button>
        <button class="btn btn-link btn-sm text-muted p-0 ps-2" onclick="openAddChooser()"><i class="bi bi-arrow-left me-1"></i>Back</button>
      </div>
    </div>`);
}

// Step 2b (popup): Curated Resources — a simple link form
function openResourceForm(resId){
  const isEdit = !!resId;
  editingResourceId = resId || null;
  const res = isEdit ? getAllResourceLinks().find(r=>r.id===resId) : null;
  const existingCats = [...new Set([...RESOURCES.map(r=>r.phase), ...customResourceLinks.map(r=>r.category)])];
  openModal(`
    <div class="author-form docshub-form-compact mb-0">
      <h6 class="form-title"><i class="bi ${isEdit?'bi-pencil-square':'bi-bookmark-star-fill'} me-1"></i>${isEdit?'Edit resource':'Add a curated resource'}</h6>
      <div class="row g-2">
        <div class="col-12"><label>Category</label><input id="res-cat" class="form-control" list="res-cat-list" placeholder="e.g. Phase 1 — C# Fundamentals" value="${escA(isEdit?res.category:'')}"><datalist id="res-cat-list">${existingCats.map(c=>`<option value="${escA(c)}">`).join('')}</datalist></div>
        <div class="col-12"><label>Title <span class="text-danger">*</span></label><input id="res-name" class="form-control" placeholder="e.g. Nick Chapsas — ASP.NET Core Series" value="${escA(isEdit?res.name:'')}"></div>
        <div class="col-12"><label>URL <span class="text-danger">*</span></label><input id="res-url" class="form-control" placeholder="https://..." value="${escA(isEdit?res.url:'')}"></div>
        <div class="col-md-6"><label>Type tag</label><input id="res-type" class="form-control" placeholder="e.g. YouTube, Docs, Course" value="${escA(isEdit?res.type:'')}"></div>
        <div class="col-md-6"><label>Price tag</label><select id="res-label" class="form-select"><option value="Free" ${isEdit&&res.label==='Free'?'selected':''}>Free</option><option value="Paid" ${isEdit&&res.label==='Paid'?'selected':''}>Paid</option></select></div>
      </div>
      <div class="d-flex gap-2 mt-2 flex-wrap">
        <button class="btn btn-primary btn-sm" onclick="submitResourceForm()"><i class="bi bi-check2 me-1"></i>${isEdit?'Save':'Add'}</button>
        <button class="btn btn-outline-secondary btn-sm" onclick="closeModal()">Cancel</button>
        ${!isEdit ? `<button class="btn btn-link btn-sm text-muted p-0 ps-2" onclick="openAddChooser()"><i class="bi bi-arrow-left me-1"></i>Back</button>` : ''}
      </div>
    </div>`);
}
function submitResourceForm(){
  const category = document.getElementById('res-cat').value.trim() || 'My Resources';
  const name = document.getElementById('res-name').value.trim();
  const url = normUrl(document.getElementById('res-url').value);
  const type = document.getElementById('res-type').value.trim().slice(0,20) || 'Link';
  const label = document.getElementById('res-label').value;
  if(!name || !url){ alert('Please add a title and a valid web address (https://…).'); return; }
  const colorByType = {YouTube:'#dc2626',Docs:'#059669',Website:'#0891b2',Book:'#7c3aed',Course:'#7c3aed',Practice:'#d97706',GitHub:'#1f2937',Blog:'#0891b2',Tool:'#d97706'};
  const data = {category, name, url, type, label, color: colorByType[type] || '#0891b2'};
  if(editingResourceId){
    const idx = customResourceLinks.findIndex(r=>r.id===editingResourceId);
    if(idx>-1) customResourceLinks[idx] = {...customResourceLinks[idx], ...data};
  } else {
    customResourceLinks.unshift({id:'res-custom-'+Date.now(), ...data});
  }
  localStorage.setItem('dotnet_custom_resources', JSON.stringify(customResourceLinks));
  closeModal();
  renderResources();
}
function deleteResourceLink(id){
  if(!confirm('Remove this resource?')) return;
  customResourceLinks = customResourceLinks.filter(r=>r.id!==id);
  localStorage.setItem('dotnet_custom_resources', JSON.stringify(customResourceLinks));
  renderResources();
}
function getAllResourceLinks(){
  return customResourceLinks;
}

function dataUrlToBlob(dataUrl){
  const [meta, b64] = dataUrl.split(',');
  const mime = meta.match(/:(.*?);/)[1];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], {type: mime});
}

// ---- PDF: loads only when you click Preview. Same markup + code for Docs Hub, Advanced, Q&A and Feed ----
function pdfBoxHTML(item){
  const id = escA(item.id);
  return `<div class="item-pdf-box"><i class="bi bi-file-earmark-pdf-fill"></i><span class="item-pdf-name">${esc(item.mediaName||'Attached PDF')}</span>
    <button type="button" class="btn btn-sm btn-outline-primary" data-pdf-toggle onclick="togglePdfPreview('${id}',this)"><i class="bi bi-eye me-1"></i>Preview</button>
    <button type="button" class="btn btn-sm btn-outline-danger" onclick="downloadStoredMedia('${id}')"><i class="bi bi-download me-1"></i>Download</button></div><div class="pdf-preview" style="display:none"></div>`;
}
function pdfUnfull(box){
  if(!box) return;
  box.classList.remove('pdf-full'); document.body.classList.remove('pdf-lock');
  if(box._ph){ box._ph.replaceWith(box); box._ph = null; }      // put it back under its card
  const b = box.querySelector('[data-pdf-full]');
  if(b) b.innerHTML = '<i class="bi bi-arrows-fullscreen me-1"></i>Full screen';
}
function pdfClose(box){
  if(!box) return;
  pdfUnfull(box);
  if(box._blobUrl){ URL.revokeObjectURL(box._blobUrl); box._blobUrl = null; }
  box.innerHTML = ''; box.style.display = 'none'; box.dataset.open = '';
  const t = box.previousElementSibling && box.previousElementSibling.querySelector('[data-pdf-toggle]');
  if(t) t.innerHTML = '<i class="bi bi-eye me-1"></i>Preview';
}
function pdfFull(btn){
  const box = btn.closest('.pdf-preview'); if(!box) return;
  if(box.classList.contains('pdf-full')){ pdfUnfull(box); return; }
  const ph = document.createElement('div'); ph.style.display = 'none';
  box.after(ph); box._ph = ph;
  document.body.appendChild(box);                                // move out of the card so nothing can clip it
  box.classList.add('pdf-full'); document.body.classList.add('pdf-lock');
  btn.innerHTML = '<i class="bi bi-fullscreen-exit me-1"></i>Exit full screen';
}
function pdfDragStart(e, grip){
  const box = grip.closest('.pdf-preview'), wrap = box && box.querySelector('.pdf-frame-wrap');
  if(!wrap || box.classList.contains('pdf-full')) return;
  e.preventDefault();
  const startY = e.clientY, startH = wrap.getBoundingClientRect().height;
  box.classList.add('pdf-dragging');
  try{ grip.setPointerCapture(e.pointerId); }catch(_){}
  const move = ev => { wrap.style.height = Math.max(200, Math.min(innerHeight*0.95, startH + ev.clientY - startY)) + 'px'; };
  const up = () => {
    box.classList.remove('pdf-dragging');
    grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up);
  };
  grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
}
document.addEventListener('keydown', e=>{
  if(e.key==='Escape') pdfUnfull(document.querySelector('.pdf-preview.pdf-full'));
});

async function togglePdfPreview(itemId, btn){
  const holder = btn && btn.closest('.item-pdf-box');
  const box = holder && holder.nextElementSibling;
  if(!box || !box.classList.contains('pdf-preview')) return;
  if(box.dataset.open==='1'){ pdfClose(box); return; }
  const item = findAnyItemById(itemId);
  if(!item || !item.mediaKey) return;
  const label = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Loading…';
  let dataUrl = null; try{ dataUrl = await idbGet(item.mediaKey); }catch(e){ console.error(e); }
  btn.disabled = false;
  if(!dataUrl){ btn.innerHTML = label; box.innerHTML = '<div class="small text-danger mt-1">Could not load this PDF from storage.</div>'; box.style.display = 'block'; return; }
  const blobUrl = URL.createObjectURL(dataUrlToBlob(dataUrl));
  box._blobUrl = blobUrl;
  const pages = pdfPageCount(dataUrl), bytes = Math.round(dataUrl.length*0.75);
  box.innerHTML = `<div class="pdf-bar"><span class="pdf-info">${pages ? pages+' page'+(pages===1?'':'s')+' · ' : ''}${fmtBytes(bytes)}</span>
      <button type="button" class="btn btn-sm btn-outline-secondary" data-pdf-full onclick="pdfFull(this)"><i class="bi bi-arrows-fullscreen me-1"></i>Full screen</button>
      <a class="btn btn-sm btn-outline-secondary" href="${blobUrl}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right me-1"></i>New tab</a>
      <button type="button" class="btn btn-sm btn-outline-secondary" onclick="pdfClose(this.closest('.pdf-preview'))"><i class="bi bi-x-lg me-1"></i>Close</button></div>
    <div class="pdf-frame-wrap"><iframe class="pdf-frame" src="${blobUrl}" title="PDF preview"></iframe></div>
        <div class="pdf-grip" onpointerdown="pdfDragStart(event,this)" title="Drag to resize" aria-label="Drag to resize the preview"><span></span></div>
        <div class="pdf-hint">Drag the bar above to resize. Blank on a phone? Use “New tab”.</div>`;
  box.style.display = 'block'; box.dataset.open = '1';
  btn.innerHTML = '<i class="bi bi-eye-slash me-1"></i>Hide';
}

function showMoreItems(authorId){
  expandedCount[authorId] = (expandedCount[authorId]||ITEM_PAGE_SIZE) + 10;
  localStorage.setItem('dotnet_item_expanded', JSON.stringify(expandedCount));
  renderAuthorPosts();
}

// ---- Drag & drop: authors ----
let draggedAuthorId = null;
function attachAuthorDragEvents(card){
  const bar = card.querySelector('.author-topbar');
  bar.addEventListener('dragstart', e=>{ draggedAuthorId = card.dataset.authorId; e.dataTransfer.effectAllowed='move'; setTimeout(()=>card.style.opacity='0.5',0); });
  bar.addEventListener('dragend', ()=>{ card.style.opacity='1'; document.querySelectorAll('.author-card').forEach(c=>c.classList.remove('drag-over')); });
  card.addEventListener('dragover', e=>{ e.preventDefault(); if(draggedAuthorId && draggedAuthorId!==card.dataset.authorId) card.classList.add('drag-over'); });
  card.addEventListener('dragleave', ()=> card.classList.remove('drag-over'));
  card.addEventListener('drop', e=>{
    e.preventDefault(); card.classList.remove('drag-over');
    if(!draggedAuthorId || draggedAuthorId===card.dataset.authorId) return;
    const all = getAllAuthors();
    const fromIdx = all.findIndex(a=>a.id===draggedAuthorId);
    const toIdx = all.findIndex(a=>a.id===card.dataset.authorId);
    const [moved] = all.splice(fromIdx,1);
    all.splice(toIdx,0,moved);
    saveAuthorOrder(all);
    renderAuthorPosts();
  });
}

// ---- Drag & drop: items within an author ----
let draggedItemId = null, draggedItemAuthor = null;
function attachItemDragEvents(el, authorId){
  el.addEventListener('dragstart', e=>{ draggedItemId = el.dataset.itemId; draggedItemAuthor = authorId; e.stopPropagation(); el.classList.add('dragging'); });
  el.addEventListener('dragend', ()=>{ el.classList.remove('dragging'); document.querySelectorAll('.content-item').forEach(i=>i.classList.remove('drag-over-item')); });
  el.addEventListener('dragover', e=>{ e.preventDefault(); e.stopPropagation(); if(draggedItemAuthor===authorId && draggedItemId!==el.dataset.itemId) el.classList.add('drag-over-item'); });
  el.addEventListener('dragleave', ()=> el.classList.remove('drag-over-item'));
  el.addEventListener('drop', e=>{
    e.preventDefault(); e.stopPropagation(); el.classList.remove('drag-over-item');
    if(draggedItemAuthor!==authorId || draggedItemId===el.dataset.itemId) return;
    const author = getAllAuthors().find(a=>a.id===authorId);
    const fromIdx = author.items.findIndex(i=>i.id===draggedItemId);
    const toIdx = author.items.findIndex(i=>i.id===el.dataset.itemId);
    const [moved] = author.items.splice(fromIdx,1);
    author.items.splice(toIdx,0,moved);
    saveItemOrder(authorId, author.items);
    renderAuthorPosts();
  });
}

// ---- CRUD: delete ----
function deleteItem(authorId, itemId){
  const author = getAllAuthors().find(a=>a.id===authorId);
  const item = author && author.items.find(i=>i.id===itemId);
  if(!item) return;
  const owner = customOwnerOf(itemId);
  let idx = -1, removed = null;
  if(owner){ idx = owner.items.findIndex(i=>i.id===itemId); removed = owner.items[idx]; owner.items.splice(idx,1); persistCustomAuthors(); }
  else { deletedItemIds.add(itemId); localStorage.setItem('dotnet_deleted_items', JSON.stringify([...deletedItemIds])); }
  renderAuthorPosts();
  toastUndo('Deleted "'+clipText(item.title)+'"', ()=>{
    if(owner){ owner.items.splice(Math.min(idx, owner.items.length), 0, removed); persistCustomAuthors(); }
    else { deletedItemIds.delete(itemId); localStorage.setItem('dotnet_deleted_items', JSON.stringify([...deletedItemIds])); }
    renderAuthorPosts();
  }, ()=>{ itemMediaKeys(item).forEach(k=>idbDelete(k));  });
      
}

// ---- CRUD: add / edit form ----
function categoryForType(type){
  if(type==='PDF') return 'PDF';
  if(type==='Image') return 'Image';
  if(type==='Link' || type==='Video' || type==='Post') return 'Link';
  return 'Content'; // Paragraph, Bullets, Diagram
}
function openContentForm(authorId, itemId, category){
  editingAuthorId = null;
  const isEdit = !!itemId;
  let item = null, author = null;
  if(isEdit){
    author = getAllAuthors().find(a=>a.id===authorId);
    item = author.items.find(i=>i.id===itemId);
    editingItem = {authorId, itemId};
    if(!category) category = categoryForType(item.type);
  } else {
    editingItem = null;
    if(!category){ openAddChooser(); return; }
  }
  pendingMedia = null;
  const draft = formDraft; formDraft = null;
  const presetAuthor = !isEdit && pendingAuthorForAdd;

  const authorNameVal = isEdit ? author.name : (presetAuthor ? pendingAuthorForAdd.name : '');
  const authorRoleVal = isEdit ? author.role : (presetAuthor ? pendingAuthorForAdd.role : '');

  let typeSpecificHTML = '';
  if(category==='PDF'){
    typeSpecificHTML = `
      <div class="col-12"><label>PDF file ${isEdit && item.mediaKey && item.type==='PDF' ? '' : '<span class="text-danger">*</span>'}</label><div class="media-drop" onclick="document.getElementById('naf-pdf-input').click()"><i class="bi bi-cloud-upload me-1"></i>Choose a PDF or drop it here<input type="file" id="naf-pdf-input" accept="application/pdf" style="display:none" onclick="event.stopPropagation()" onchange="handleMediaFile(event)"></div><div class="media-preview-name" id="naf-media-name-pdf">${esc(isEdit && item.type==='PDF'?(item.mediaName||'Existing PDF kept'):'')}</div></div>
      <div class="col-12"><label>Notes <span class="text-muted fw-normal">(optional, collapsible)</span></label>${rteEditorHTML('naf-para','What\'s inside this PDF, briefly...', isEdit && item.type==='PDF'?item.summary||'':'')}</div>`;
  } else if(category==='Image'){
    typeSpecificHTML = `
      <div class="col-12"><label>Images <span class="text-danger">*</span> <span class="text-muted fw-normal">— add as many as you want, they show as a slider</span></label>${imgPickerHTML('naf-imgs', isEdit && item.type==='Image' ? itemImages(item) : [])}</div>
      <div class="col-12"><label>Description <span class="text-muted fw-normal">(optional)</span></label>${rteEditorHTML('naf-summary','One or two lines of context', isEdit && item.type==='Image'?item.summary||'':'')}</div>`;
  } else if(category==='Link'){
    typeSpecificHTML = `
      <div class="col-12"><label>Link URL <span class="text-danger">*</span> <span class="text-muted fw-normal">— video links play right here</span></label><input id="naf-url" class="form-control" placeholder="https://..." value="${escA(isEdit && item.url?item.url:'')}"></div>
      <div class="col-12"><label>Summary <span class="text-muted fw-normal">(optional)</span></label>${rteEditorHTML('naf-summary','One or two lines of context', isEdit?item.summary||'':'')}</div>`;
  } else { // Content
    typeSpecificHTML = `
      <div class="col-md-5"><label>Content type</label>
        <select id="naf-type" class="form-select" onchange="renderTypeFields()">
          <option value="Paragraph">Paragraph</option>
          <option value="Bullets">Bullets</option>
          <option value="Diagram">Mini Roadmap Diagram</option>
          <option value="Post">Link / Post</option>
        </select>
      </div>
      <div class="col-12 type-field" data-type="Paragraph"><label>Paragraph</label>${rteEditorHTML('naf-para','Write your paragraph here...', isEdit && item.type==='Paragraph'?item.summary||'':'')}</div>
      <div class="col-12 type-field" data-type="Bullets"><label>Bullet points</label>${rteEditorHTML('naf-bullets','Type your points — press Enter for the next bullet', pointsToListHTML(isEdit && item.type==='Bullets' && item.points ? item.points : []))}</div>
      <div class="col-12 type-field" data-type="Diagram"><label>Roadmap steps (one per line)</label><textarea id="naf-steps" class="form-control" rows="3" placeholder="Setup\nBuild API\nAdd Auth\nDeploy">${esc(isEdit && item.type==='Diagram' && item.steps?item.steps.join('\n'):'')}</textarea></div>
      <div class="col-12 type-field" data-type="Post"><label>Link URL</label><input id="naf-url" class="form-control" placeholder="https://..." value="${escA(isEdit && item.url?item.url:'')}"></div>
      <div class="col-12"><label>Summary <span class="text-muted fw-normal">(optional)</span></label>${rteEditorHTML('naf-summary','One or two lines of context', isEdit && item.type!=='Paragraph'?item.summary||'':'')}</div>`;
  }

  const catMeta = {PDF:{icon:'bi-file-earmark-pdf-fill',label:'PDF'},Image:{icon:'bi-image',label:'Image'},Link:{icon:'bi-link-45deg',label:'Link'},Content:{icon:'bi-text-paragraph',label:'Content'}}[category];

  openModal(`
    <div class="author-form docshub-form-compact mb-0">
      <h6 class="form-title"><i class="bi ${isEdit?'bi-pencil-square':catMeta.icon} me-1"></i>${isEdit?'Edit content':'Add '+catMeta.label}</h6>
      <div class="row g-2">
        <div class="col-12"><label>Heading / title <span class="text-danger">*</span></label><input id="naf-title" class="form-control" placeholder="e.g. Minimal APIs in .NET 8" value="${escA(draft ? draft.title : (isEdit?item.title:''))}" oninput="checkTopicOverlap()"><div id="naf-topic-hint"></div></div>
        ${tagFieldHTML('naf-tags', isEdit ? item.tags : [])}
        ${isEdit ? typeSwitcherHTML(category,'switchContentFormType') : ''}
        ${typeSpecificHTML}
        ${isEdit ? `<div class="col-md-6"><label>Move to tab</label><select id="naf-move-section" class="form-select">${docsSections.filter(x=>x.key!=='resources').map(x=>`<option value="${escA(x.key)}" ${x.key===(item.section||'community')?'selected':''}>${esc(x.label)}</option>`).join('')}</select></div>
        <div class="col-md-6"><label>Move to author</label><select id="naf-move-author" class="form-select">${getAllAuthors().map(x=>`<option value="${escA(x.id)}" ${x.id===authorId?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div>` : ''}
        <div class="col-12">
          <button type="button" class="optional-toggle" onclick="toggleOptionalAuthorFields(this)"><i class="bi bi-chevron-right"></i> Author details (optional)</button>
          <div class="optional-fields row g-2 mt-1">
            <div class="col-md-6"><label>Author name</label><input id="naf-author" class="form-control" placeholder="e.g. Nick Chapsas (leave blank for 'You')" value="${escA(authorNameVal)}" ${(isEdit||presetAuthor)?'readonly':''}></div>
            <div class="col-md-6"><label>Role / headline</label><input id="naf-role" class="form-control" placeholder="e.g. .NET Content Creator" value="${escA(authorRoleVal)}" ${(isEdit||presetAuthor)?'readonly':''}></div>
          </div>
        </div>
      </div>
      <div class="d-flex gap-2 mt-2 flex-wrap">
        <button class="btn btn-primary btn-sm" onclick="submitContentForm('${category}')"><i class="bi bi-check2 me-1"></i>${isEdit?'Save changes':'Add'}</button>
        <button class="btn btn-outline-secondary btn-sm" onclick="closeModal()">Cancel</button>
        ${!isEdit ? `<button class="btn btn-link btn-sm text-muted" onclick="openContentTypeChooser()"><i class="bi bi-arrow-left me-1"></i>Back</button>` : ''}
      </div>
      <div class="small text-muted mt-2"><i class="bi bi-hdd me-1"></i>Everything — text, images and PDFs — is saved to your Firebase account, so it follows you to any device.</div>
    </div>`);
  if(category==='Content'){ document.getElementById('naf-type').value = (isEdit && ['Paragraph','Bullets','Diagram','Post'].includes(item.type)) ? item.type : 'Paragraph'; renderTypeFields(); }
  if((isEdit||presetAuthor) && authorNameVal){ const opt = document.querySelector('#appModalBody .optional-fields'); const btn = document.querySelector('#appModalBody .optional-toggle'); if(opt){ opt.classList.add('open'); btn.querySelector('i').className='bi bi-chevron-down'; } }
  draftSetup('docs|'+(isEdit?'e:'+itemId:'n:'+(pendingAuthorForAdd?pendingAuthorForAdd.id:'')+':'+(pendingDocsSection||''))+'|'+category, ()=>openContentForm(authorId,itemId,category));
  if(category==='Image') imgPickerRender('naf-imgs');
}
function toggleOptionalAuthorFields(btn){
  const wrap = btn.nextElementSibling;
  const open = wrap.classList.toggle('open');
  btn.querySelector('i').className = open ? 'bi bi-chevron-down' : 'bi bi-chevron-right';
}
function closeContentForm(){ closeModal(); editingItem=null; pendingMedia=null; formDraft=null; }

// ===================== RICH TEXT EDITOR (shared by Docs Hub + Interview Q&A) =====================
// A small contenteditable-based editor: bold/italic/underline, bullet/numbered lists,
// highlight colour, and inline images — no external library needed.
// Remembers where the caret/selection was in each editor, so toolbar dropdowns/colour pickers (which steal focus) still apply to it.
const RTE_SEL = new Map();
document.addEventListener('selectionchange', ()=>{
  const sel = getSelection(); if(!sel || !sel.rangeCount) return;
  const r = sel.getRangeAt(0), n = r.commonAncestorContainer, host = n.nodeType===1 ? n : n.parentElement;
  const ed = host && host.closest ? host.closest('.rte-editor') : null;
  if(ed && ed.id) RTE_SEL.set(ed.id, r.cloneRange());
  // show the row/column buttons only while the caret is inside a table
  document.querySelectorAll('.rte-toolbar.in-table').forEach(t=>{ if(!ed || t.nextElementSibling!==ed) t.classList.remove('in-table'); });
  if(ed){ const tb = ed.previousElementSibling; if(tb && tb.classList.contains('rte-toolbar')) tb.classList.toggle('in-table', !!(host.closest && host.closest('td,th'))); }
});
function rteFocus(id){
  const el = document.getElementById(id); if(!el) return null;
  const cur = getSelection();
  const alreadyInside = document.activeElement===el && cur && cur.rangeCount && el.contains(cur.getRangeAt(0).commonAncestorContainer);
  if(!alreadyInside){          // focus was taken by a dropdown / colour picker / dialog: put the caret back where it was
    el.focus();
    const r = RTE_SEL.get(id);
    if(r && el.contains(r.commonAncestorContainer)){ const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
  }
  return el;
}
function rteToolbarHTML(id){
  const btn = (call, title, icon) => `<button type="button" tabindex="-1" onmousedown="event.preventDefault()" onclick="${call}" title="${title}" aria-label="${title}"><i class="bi ${icon}"></i></button>`;
  const color = (title, icon, init, fn) => `<label class="rte-color-btn" title="${title}" onmousedown="event.preventDefault()"><i class="bi ${icon}"></i><input type="color" value="${init}" aria-label="${title}" onchange="${fn}('${id}', this.value)" onclick="rteFocus('${id}')"></label>`;
  const sep = '<span class="rte-sep"></span>';
  return `<div class="rte-toolbar">
    ${btn(`rteExec('${id}','undo')`,'Undo','bi-arrow-counterclockwise')}${btn(`rteExec('${id}','redo')`,'Redo','bi-arrow-clockwise')}
    ${sep}
    <select class="rte-select" tabindex="-1" title="Text style" aria-label="Text style" onchange="rteBlock('${id}',this.value);this.selectedIndex=0"><option value="">Style</option><option value="p">Normal</option><option value="h2">Heading</option><option value="h3">Subheading</option><option value="blockquote">Quote</option><option value="pre">Code block</option></select>
    <select class="rte-select" tabindex="-1" title="Text size" aria-label="Text size" onchange="rteSize('${id}',this.value);this.selectedIndex=0"><option value="">Size</option><option value="2">Small</option><option value="3">Normal</option><option value="5">Large</option><option value="6">Huge</option></select>
    ${sep}
    ${btn(`rteExec('${id}','bold')`,'Bold (Ctrl+B)','bi-type-bold')}${btn(`rteExec('${id}','italic')`,'Italic (Ctrl+I)','bi-type-italic')}${btn(`rteExec('${id}','underline')`,'Underline (Ctrl+U)','bi-type-underline')}${btn(`rteExec('${id}','strikeThrough')`,'Strikethrough','bi-type-strikethrough')}
    ${color('Text colour','bi-palette','#d32f2f','rteTextColor')}${color('Highlight colour','bi-brush','#fff59d','rteHighlight')}
    ${sep}
    ${btn(`rteExec('${id}','insertUnorderedList')`,'Bullet points','bi-list-ul')}${btn(`rteExec('${id}','insertOrderedList')`,'Numbered list','bi-list-ol')}
    ${btn(`rteAlign('${id}','justifyLeft')`,'Align left','bi-text-left')}${btn(`rteAlign('${id}','justifyCenter')`,'Align centre','bi-text-center')}${btn(`rteAlign('${id}','justifyRight')`,'Align right','bi-text-right')}
    ${sep}
    ${btn(`rteLink('${id}')`,'Add link (Ctrl+K)','bi-link-45deg')}
    ${btn(`document.getElementById('${id}-img').click()`,'Insert image','bi-image')}
    <input type="file" id="${id}-img" accept="image/*" multiple style="display:none" onchange="rteInsertImage('${id}', event)">
    ${btn(`rteTableInsert('${id}')`,'Insert table','bi-table')}
    <span class="rte-tbl-tools">${['addRow|+ Row|Add a row below','addCol|+ Col|Add a column to the right','delRow|− Row|Delete this row','delCol|− Col|Delete this column','delTable|✕ Table|Delete the whole table'].map(x=>{ const [op,lbl,tip]=x.split('|'); return `<button type="button" class="rte-txt-btn" tabindex="-1" onmousedown="event.preventDefault()" onclick="rteTable('${id}','${op}')" title="${tip}" aria-label="${tip}">${lbl}</button>`; }).join('')}</span>
    ${btn(`rteExec('${id}','insertHorizontalRule')`,'Divider line','bi-dash-lg')}
    ${btn(`rteExec('${id}','removeFormat')`,'Clear formatting','bi-eraser')}
  </div>`;
}
function rteEditorHTML(id, placeholder, existingHTML){
  // existing content may be rich text from the editor OR plain text (older notes, built-in answers such as "List<T>")
  let body = '';
  if(existingHTML) body = isRich(existingHTML) ? sanitizeHTML(existingHTML) : esc(existingHTML).replace(/\n/g,'<br>');
  return `${rteToolbarHTML(id)}<div id="${escA(id)}" class="rte-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-label="${escA(placeholder)}" data-placeholder="${escA(placeholder)}">${body}</div><div class="rte-hint">Paste text, images or links · drop images in · click an image to resize</div>`;
}
function rteExec(id, cmd){
  const el = rteFocus(id); if(!el) return;
  document.execCommand('styleWithCSS', false, false);
  document.execCommand(cmd, false, null);
}
function rteHighlight(id, color){
  if(!rteFocus(id)) return;
  document.execCommand('styleWithCSS', false, true);
  if(!document.execCommand('hiliteColor', false, color)) document.execCommand('backColor', false, color);
  document.execCommand('styleWithCSS', false, false);
}
function rteTextColor(id, color){
  if(!rteFocus(id)) return;
  document.execCommand('styleWithCSS', false, true);
  document.execCommand('foreColor', false, color);
  document.execCommand('styleWithCSS', false, false);
}
function rteAlign(id, cmd){
  if(!rteFocus(id)) return;
  document.execCommand('styleWithCSS', false, true);
  document.execCommand(cmd, false, null);
  document.execCommand('styleWithCSS', false, false);
}
function rteBlock(id, tag){
  if(!tag || !rteFocus(id)) return;
  document.execCommand('formatBlock', false, '<'+tag+'>');
}
function rteSize(id, size){
  if(!size || !rteFocus(id)) return;
  document.execCommand('styleWithCSS', false, false);
  document.execCommand('fontSize', false, size);
}
function rteLink(id){
  if(!rteFocus(id)) return;
  const saved = RTE_SEL.get(id), hasText = !!(saved && saved.toString());
  const raw = prompt('Link address (e.g. https://example.com):', 'https://');
  if(!raw) return;
  const url = normUrl(raw);
  if(!url){ alert('That does not look like a web link.'); return; }
  rteFocus(id);
  if(hasText) document.execCommand('createLink', false, url);
  else document.execCommand('insertHTML', false, `<a href="${escA(url)}">${esc(url)}</a>`);
}
// Insert one or more image files at the caret (shrunk so notes stay small enough to store and sync).
async function rteInsertImageFiles(id, files){
  const el = rteFocus(id); if(!el) return;
  for(const file of files){
    if(!/^image\//.test(file.type)){ continue; }
    try{
      const dataUrl = await shrinkImage(file, 1000, 0.8);
      rteFocus(id);
      document.execCommand('insertImage', false, dataUrl);
    }catch(err){ alert('Could not insert "'+(file.name||'image')+'": '+(err.message||err)); }
  }
}
async function rteInsertImage(id, e){
  const files = [...e.target.files]; e.target.value = ''; if(!files.length) return;
  if(!files.some(f=>/^image\//.test(f.type))){ alert('Please choose an image file.'); return; }
  await rteInsertImageFiles(id, files);
}
// Reads an editor's content back out — empty editors (just a stray <br>) come back as ''.
function rteGetHTML(id){
  const el = document.getElementById(id);
  if(!el) return '';
  // the browser sometimes stamps the editor's own default size onto text it re-wraps: that is not a choice the user made
  const html = sanitizeHTML(el.innerHTML).replace(/font-size:\s*0\.95rem;?\s*/gi,'').replace(/\sstyle=""/g,'').trim();
  return (html==='<br>' || html==='' || stripTags(html).trim()==='' && !/<(img|table|hr)/i.test(html)) ? '' : html;
}
// Bullet-point fields: an editor that holds a list. Stored as an array of strings (plain text, or rich HTML when formatted).
function pointsToListHTML(points){
  const items = (points||[]).map(p=>'<li>'+(isRich(p) ? sanitizeHTML(p) : esc(p))+'</li>').join('');
  return '<ul>'+(items || '<li><br></li>')+'</ul>';
}
function rteGetPoints(id){
  const html = rteGetHTML(id); if(!html) return [];
  const d = document.createElement('div'); d.innerHTML = html;
  let items = [...d.querySelectorAll('li')].filter(li=>!li.parentElement.closest('li')).map(li=>li.innerHTML.replace(/(<br\s*\/?>\s*)+$/i,'').trim());
  if(!items.length){   // no list was used: one point per line / paragraph
    items = html.replace(/<(div|p)[^>]*>/gi,'\n').replace(/<\/(div|p)>/gi,'').replace(/<br\s*\/?>/gi,'\n').split('\n').map(x=>x.trim());
  }
  return items
    .map(x=> /<[a-z]/i.test(x) ? x : (()=>{ const t=document.createElement('div'); t.innerHTML=x; return (t.textContent||'').trim(); })())
    .filter(x=>x && (stripTags(x).trim()!=='' || /<img/i.test(x)));
}

// Pasted web/Word/Docs content brings its own black/white colours, which would be unreadable in dark mode: drop only those.
function rteNormalizePasted(root){
  const rgb = v => { const m = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,\/]+([\d.]+))?/i.exec(v||''); if(m) return [+m[1],+m[2],+m[3], m[4]===undefined?1:+m[4]];
    const h = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((v||'').trim()); if(!h) return null; let x = h[1]; if(x.length===3) x = x.split('').map(c=>c+c).join(''); return [parseInt(x.slice(0,2),16),parseInt(x.slice(2,4),16),parseInt(x.slice(4,6),16),1]; };
  root.querySelectorAll('[style]').forEach(el=>{
    const c = rgb(el.style.color), bg = rgb(el.style.backgroundColor);
    if(c && (Math.max(c[0],c[1],c[2])<=70 || Math.min(c[0],c[1],c[2])>=215)) el.style.removeProperty('color');
    if(bg && (bg[3]===0 || Math.min(bg[0],bg[1],bg[2])>=235)) el.style.removeProperty('background-color');
    if(!el.getAttribute('style')) el.removeAttribute('style');
  });
  return root;
}
document.addEventListener('paste', async e=>{
  const ed = e.target && e.target.closest ? e.target.closest('.rte-editor') : null;
  if(!ed) return;
  e.preventDefault();
  const cd = e.clipboardData || window.clipboardData;
  const imgs = [...(cd.files||[])].filter(f=>/^image\//.test(f.type));
  const html = cd.getData('text/html');
  let clean = '';
  if(html){
    const d = document.createElement('div'); d.innerHTML = sanitizeHTML(html);
    rteNormalizePasted(d); clean = d.innerHTML.trim();
  }
  const hasText = clean && stripTags(clean).trim() !== '';
  if(hasText && clean.length < 2*1024*1024){ document.execCommand('insertHTML', false, clean); return; }   // keeps bold, colours, lists, links, tables, inline images…
  if(imgs.length){ await rteInsertImageFiles(ed.id, imgs); return; }                                        // a screenshot / copied image
  if(clean && /<img/i.test(clean) && clean.length < 2*1024*1024){ document.execCommand('insertHTML', false, clean); return; }
  document.execCommand('insertText', false, cd.getData('text/plain'));
});
// Dropping image files onto a text box inserts them where they land.
async function rteDropFiles(ed, e){
  const imgs = [...e.dataTransfer.files].filter(f=>/^image\//.test(f.type));
  if(!imgs.length){ if(window.UI) UI.toast('Only images can be dropped into a text box — use the upload box for PDFs', 'bi-info-circle-fill'); return; }
  ed.focus();
  try{
    const r = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
    if(r && ed.contains(r.startContainer)){ const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); RTE_SEL.set(ed.id, r.cloneRange()); }
  }catch(_){}
  await rteInsertImageFiles(ed.id, imgs);
}
// Click an image inside a text box to cycle its width: full → 75% → 50% → 25%.
document.addEventListener('click', e=>{
  const img = e.target && e.target.tagName==='IMG' && e.target.closest ? (e.target.closest('.rte-editor') ? e.target : null) : null;
  if(!img) return;
  const sizes = ['100%','75%','50%','25%'], cur = img.getAttribute('width') || '100%';
  const next = sizes[(sizes.indexOf(cur)+1) % sizes.length];
  img.setAttribute('width', next); img.removeAttribute('height');
  if(window.UI) UI.toast('Image width '+next, 'bi-aspect-ratio');
});
function rtePlaceCaret(el){ const r = document.createRange(); r.selectNodeContents(el); r.collapse(true); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
function rteTableInsert(id){
  if(!rteFocus(id)) return;
  const raw = prompt('Table size — rows × columns (e.g. 3x3):', '3x3'); if(!raw) return;
  const m = /(\d+)\s*[x×*,\s]\s*(\d+)/i.exec(raw);
  if(!m){ alert('Please type it like 3x3 (rows × columns).'); return; }
  const rows = Math.min(20, Math.max(1, +m[1])), cols = Math.min(8, Math.max(1, +m[2]));
  let html = '<table><tbody>';
  for(let r=0;r<rows;r++){ const t = r===0 ? 'th' : 'td'; html += '<tr>' + Array.from({length:cols}, ()=>`<${t}><br></${t}>`).join('') + '</tr>'; }
  html += '</tbody></table><p><br></p>';
  rteFocus(id);
  document.execCommand('insertHTML', false, html);
}
function rteCellOf(id){
  const ed = document.getElementById(id), sel = getSelection(); if(!ed || !sel.rangeCount) return null;
  const n = sel.anchorNode, el = n && (n.nodeType===1 ? n : n.parentElement);
  const c = el && el.closest ? el.closest('td,th') : null;
  return c && ed.contains(c) ? c : null;
}
function rteTable(id, op){
  const ed = rteFocus(id); const cell = ed && rteCellOf(id); if(!cell) return;
  const tr = cell.parentElement, table = cell.closest('table'), idx = cell.cellIndex;
  const mk = t => { const c = document.createElement(t); c.innerHTML = '<br>'; return c; };
  let focus = cell;
  if(op==='addRow'){ const n = document.createElement('tr'); [...tr.cells].forEach(()=>n.appendChild(mk('td'))); tr.after(n); focus = n.cells[Math.min(idx, n.cells.length-1)]; }
  else if(op==='addCol'){ [...table.rows].forEach(r=>{ const ref = r.cells[idx], c = mk(ref && ref.tagName==='TH' ? 'th' : 'td'); if(ref) ref.after(c); else r.appendChild(c); }); focus = cell.nextElementSibling; }
  else if(op==='delRow'){ const next = tr.nextElementSibling || tr.previousElementSibling; tr.remove(); if(!table.rows.length){ table.remove(); focus = null; } else focus = next && next.cells[Math.min(idx, next.cells.length-1)]; }
  else if(op==='delCol'){ [...table.rows].forEach(r=>{ if(r.cells[idx]) r.cells[idx].remove(); }); if(![...table.rows].some(r=>r.cells.length)){ table.remove(); focus = null; } else focus = tr.cells[Math.min(idx, tr.cells.length-1)]; }
  else if(op==='delTable'){ table.remove(); focus = null; }
  if(focus) rtePlaceCaret(focus);
  ed.dispatchEvent(new Event('input', {bubbles:true}));
}
document.addEventListener('keydown', e=>{
  const ed = e.target && e.target.closest ? e.target.closest('.rte-editor') : null;
  if(!ed) return;
  if((e.ctrlKey||e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase()==='k'){
    e.preventDefault(); e.stopPropagation();      // Ctrl/⌘+K inside a text box = add link (not the quick-search palette)
    rteLink(ed.id); return;
  }
  if(e.key==='Tab' && !e.ctrlKey && !e.metaKey && !e.altKey){     // Tab / Shift+Tab walks through table cells
    const cell = rteCellOf(ed.id); if(!cell) return;
    e.preventDefault();
    const cells = [...cell.closest('table').querySelectorAll('th,td')], i = cells.indexOf(cell) + (e.shiftKey ? -1 : 1);
    if(i >= cells.length){ rteTable(ed.id, 'addRow'); const nr = cell.parentElement.nextElementSibling; if(nr) rtePlaceCaret(nr.cells[0]); }
    else if(i >= 0) rtePlaceCaret(cells[i]);
  }
});
// the quick-note panel's toolbar lives in index.html: give it the full toolbar too
(function(){ const tb = document.querySelector('#quick-note-form .rte-toolbar'); if(tb) tb.outerHTML = rteToolbarHTML('quick-note-text'); })();

// ===================== DRAFTS: what you typed in a form survives an accidental close / refresh =====================
const DRAFT_KEY = 'dn_drafts';      // device-local on purpose (not synced, not in backups)
let _draft = null, _draftTimer = null;
function draftLoad(){ try{ return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}') || {}; }catch(e){ return {}; } }
function draftWrite(all){
  const keep = Object.keys(all).sort((a,b)=>all[b].t-all[a].t).slice(0,10), out = {};
  keep.forEach(k=>{ out[k] = all[k]; });
  try{ localStorage.setItem(DRAFT_KEY, JSON.stringify(out)); }
  catch(e){ try{ const k = _draft && _draft.key; localStorage.setItem(DRAFT_KEY, JSON.stringify(k && out[k] ? {[k]:out[k]} : {})); }catch(e2){} }   // storage full: keep just this one
}
function draftCollect(root){
  const f = {}, sel = {}, ed = {};
  root.querySelectorAll('input,textarea').forEach(el=>{ if(el.id && !el.readOnly && !/^(file|color|button|checkbox|radio|hidden)$/.test(el.type)) f[el.id] = el.value; });
  root.querySelectorAll('select').forEach(el=>{ if(el.id) sel[el.id] = el.value; });
  root.querySelectorAll('.rte-editor').forEach(el=>{ if(el.id) ed[el.id] = sanitizeHTML(el.innerHTML); });
  return {f, s:sel, e:ed};
}
function draftHasContent(d){
  return Object.values(d.f).some(v=>String(v).trim()) || Object.values(d.e).some(h=>stripTags(h).trim() || /<(img|table|hr)/i.test(h));
}
function draftFlush(){
  clearTimeout(_draftTimer);
  const d = _draft; if(!d || !d.dirty || !d.root || !d.root.isConnected) return;
  const data = draftCollect(d.root), all = draftLoad();
  if(draftHasContent(data)) all[d.key] = {t:Date.now(), ...data}; else delete all[d.key];
  draftWrite(all);
}
function draftClear(){
  clearTimeout(_draftTimer);
  if(_draft){ const all = draftLoad(); delete all[_draft.key]; draftWrite(all); }
  _draft = null;
}
function draftDiscard(){
  if(!_draft) return;
  const re = _draft.reopen, all = draftLoad(); delete all[_draft.key]; draftWrite(all);
  _draft = null;
  if(re) re();
}
function draftApply(root, d){
  Object.entries(d.s||{}).forEach(([id,v])=>{ const el = document.getElementById(id); if(el && root.contains(el) && [...el.options].some(o=>o.value===v)){ el.value = v; el.dispatchEvent(new Event('change', {bubbles:true})); } });
  Object.entries(d.f||{}).forEach(([id,v])=>{ const el = document.getElementById(id); if(el && root.contains(el) && !el.readOnly) el.value = v; });
  Object.entries(d.e||{}).forEach(([id,h])=>{ const el = document.getElementById(id); if(el && root.contains(el)) el.innerHTML = sanitizeHTML(h); });
  const when = new Date(d.t), today = new Date().toDateString()===when.toDateString();
  const label = today ? when.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}) : when.toLocaleDateString([], {day:'numeric', month:'short'});
  const t = root.querySelector('.form-title');
  if(t) t.insertAdjacentHTML('afterend', `<div class="draft-banner" role="status"><i class="bi bi-clock-history me-1" aria-hidden="true"></i>Unsaved draft from ${esc(label)} restored — re-attach any file. <button type="button" class="btn btn-link btn-sm p-0 ms-1 align-baseline" onclick="draftDiscard()">Discard draft</button></div>`);
}
// Call once a form's DOM exists. key identifies the form (what + which item/author/topic + which type).
function draftSetup(key, reopen){
  draftFlush();
  const root = document.querySelector('#appModalBody .author-form') || document.querySelector('#adv-form-slot .author-form');
  _draft = {key, root, reopen, dirty:false};
  if(!root) return;
  const d = draftLoad()[key];
  if(d && Date.now() - d.t < 14*864e5) draftApply(root, d);
}
['input','change'].forEach(ev=>document.addEventListener(ev, e=>{
  if(!_draft || !_draft.root || !_draft.root.contains(e.target)) return;
  _draft.dirty = true; clearTimeout(_draftTimer); _draftTimer = setTimeout(draftFlush, 700);
}, true));
window.addEventListener('pagehide', draftFlush);
document.addEventListener('visibilitychange', ()=>{ if(document.hidden) draftFlush(); });

// ===================== TAGS + SEARCH EVERYTHING =====================
function parseTags(str){
  const out = [];
  String(str||'').split(/[,;\n]+/).forEach(t=>{
    t = t.trim().replace(/^#+/,'').toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9+#._-]/g,'').slice(0,24);
    if(t && !out.includes(t)) out.push(t);
  });
  return out.slice(0,10);
}
function allTags(){
  const m = new Map(), add = it => (it.tags||[]).forEach(t=>m.set(t,(m.get(t)||0)+1));
  getAllAuthors().forEach(a=>a.items.forEach(add)); getAllQAItems().forEach(add); getAllAdvItems().forEach(add);
  return m;
}
function tagFieldHTML(id, tags){
  const opts = [...allTags().keys()].sort().map(t=>`<option value="${escA(t)}">`).join('');
  return `<div class="col-12"><label>Tags <span class="text-muted fw-normal">(optional · comma separated · find it later with search)</span></label><input id="${id}" class="form-control" list="${id}-list" autocomplete="off" placeholder="e.g. ef-core, performance, sql" value="${escA((tags||[]).join(', '))}"><datalist id="${id}-list">${opts}</datalist></div>`;
}
function tagChipsHTML(item){
  const t = item && item.tags;
  if(!t || !t.length) return '';
  return `<div class="item-tags">${t.map(x=>`<button type="button" class="tag-chip" onclick="event.stopPropagation();searchTag('${escA(x)}')" title="Search #${escA(x)}">#${esc(x)}</button>`).join('')}</div>`;
}
function searchTag(t){ if(window.UI && UI.openPalette) UI.openPalette('#'+t); }
function popularTags(){
  return [...allTags().entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,6)
    .map(([t,n])=>({g:'Popular tags', t:'#'+t, s:n+' item'+(n===1?'':'s'), i:'bi-hash', run:()=>searchTag(t)}));
}
// --- jump to a result: switch tab / section, expand it, scroll and flash ---
function goTab(name){ const b = [...document.querySelectorAll('.tab-btn')].find(x=>(x.getAttribute('onclick')||'').includes("showTab('"+name+"'")); if(b) b.click(); }
function flashEl(el){ if(!el) return; el.scrollIntoView({block:'center', behavior:'smooth'}); el.classList.add('search-flash'); setTimeout(()=>el.classList.remove('search-flash'), 2400); }
function jumpToDocsItem(authorId, itemId, section){
  goTab('author');
  if(section && section!==activeDocsSection && docsSections.some(x=>x.key===section)) setDocsSubtab(section);
  const si = document.getElementById('docs-search-input'); if(si) si.value = '';
  authorCollapsed[authorId] = false; itemCollapsed[itemId] = false;
  lsSave('dotnet_author_collapsed', authorCollapsed); lsSave('dotnet_item_collapsed', itemCollapsed);
  renderAuthorPosts(); filterDocsHub();
  setTimeout(()=>flashEl(document.querySelector('.content-item[data-item-id="'+CSS.escape(itemId)+'"]')), 80);
}
function jumpToQAItem(id, section){
  goTab('interview');
  const si = document.getElementById('qa-search-input'); if(si) si.value = '';
  if(section && section!==activeQASection && qaSections.some(x=>x.key===section)) setQASubtab(section); else renderInterview();
  setTimeout(()=>{
    const el = document.querySelector('.interview-q[data-item-id="'+CSS.escape(id)+'"]'); if(!el) return;
    const row = el.querySelector('.qa-row'); if(row && row.getAttribute('aria-expanded')!=='true') row.click();
    flashEl(el);
  }, 80);
}
function jumpToAdvItem(id){
  goTab('projects');
  const b = [...document.querySelectorAll('.proj-subtab')].find(x=>(x.getAttribute('onclick')||'').includes("'advanced'")); if(b) b.click();
  advCollapsed[id] = false; lsSave('dotnet_adv_collapsed', advCollapsed);
  renderAdvanced();
  setTimeout(()=>flashEl(document.querySelector('#adv-list [data-item-id="'+CSS.escape(id)+'"]')), 80);
}
// --- the index behind the Ctrl/⌘+K palette: Docs Hub, Interview Q&A, Advanced+ topics and day notes ---
let _idxCache = null, _idxAt = 0;
function contentIndex(){
  if(_idxCache && Date.now()-_idxAt < 1500) return _idxCache;
  const out = [], plain = h => stripTags(h||'').replace(/\s+/g,' ').trim();
  const body = it => [plain(it.summary), (it.points||[]).map(plain).join(' '), (it.steps||[]).map(x=>typeof x==='string'?x:'').join(' '), plain(it.a)].join(' ').trim();
  getAllAuthors().forEach(a=>a.items.forEach(it=>{
    const sec = docsSections.find(x=>x.key===(it.section||'community'));
    out.push({kind:'Docs Hub', icon:TYPE_ICON[it.type]||'bi-file-text', title:it.title||'Untitled', where:a.name+(sec?' · '+sec.label:''), body:body(it), tags:it.tags||[], file:it.mediaName||'', nav:()=>jumpToDocsItem(a.id, it.id, it.section||'community')});
  }));
  getAllQAItems().forEach(it=>{
    out.push({kind:'Interview Q&A', icon:it.type ? (TYPE_ICON[it.type]||'bi-file-text') : 'bi-patch-question', title:it.q, where:it.cat, body:body(it), tags:it.tags||[], file:it.mediaName||'', nav:()=>jumpToQAItem(it.id, qaSectionOf(it))});
  });
  getAllAdvItems().forEach(it=>{
    out.push({kind:'Advanced topics', icon:TYPE_ICON[it.type]||'bi-lightning-charge', title:it.title, where:'Projects › Advanced', body:body(it), tags:it.tags||[], file:it.mediaName||'', nav:()=>jumpToAdvItem(it.id)});
  });
  Object.entries(dayNotes).forEach(([n,e])=>{
    if(!e) return;
    const text = e.type==='bullets' ? (e.points||[]).join(' ') : plain(e.text);
    out.push({kind:'My notes', icon:'bi-sticky', title:'Day '+n+' note', where:'Notes', body:text, tags:[], file:e.mediaName||'', nav:()=>{ if(window.UI) UI.goToDay(+n, true); }});
  });
  jobApps.forEach(j=>out.push({kind:'Job applications', icon:'bi-briefcase', title:(j.company||'Untitled')+(j.role?' — '+j.role:''), where:jobStatusInfo(j.status)[1], body:[j.location, (j.jd||'').slice(0,400), plain(j.notes)].filter(Boolean).join(' '), tags:[], file:'', nav:()=>jumpToJobApp(j.id)}));
  _idxCache = out; _idxAt = Date.now();
  return out;
}
function contentSearch(q){
  q = String(q||'').trim().toLowerCase(); if(!q) return [];
  const idx = contentIndex();
  const row = (e, sc, toks) => {
    let snip = '';
    if(toks && toks.length){ const i = e.body.toLowerCase().indexOf(toks[0]); if(i>=0) snip = (i>40?'…':'') + e.body.slice(Math.max(0,i-40), i+90).trim() + (e.body.length>i+90?'…':''); }
    if(!snip) snip = e.body.slice(0,110);
    return {g:e.kind, t:e.title, s:(e.where + (snip?' · '+snip:'')).slice(0,170), i:e.icon, r:e.tags[0]?'#'+e.tags[0]:'', run:e.nav, sc};
  };
  if(q[0]==='#'){
    const tag = q.slice(1);
    if(!tag) return popularTags();
    return idx.filter(e=>e.tags.some(t=>t.startsWith(tag))).slice(0,40).map(e=>row(e, 10, null));
  }
  const toks = q.split(/\s+/), rows = [];
  idx.forEach(e=>{
    const t = e.title.toLowerCase(), g = e.tags.join(' '), all = t+' '+g+' '+(e.body+' '+e.file+' '+e.where).toLowerCase();
    if(!toks.every(k=>all.includes(k))) return;
    let sc = 1;
    if(t.includes(q)) sc += 10; if(t.startsWith(q)) sc += 5; if(toks.every(k=>t.includes(k))) sc += 4;
    if(e.tags.includes(q)) sc += 8; else if(toks.every(k=>g.includes(k))) sc += 3;
    rows.push({e, sc});
  });
  rows.sort((a,b)=>b.sc-a.sc);
  const per = {}, res = [];
  rows.forEach(r=>{ per[r.e.kind] = (per[r.e.kind]||0)+1; if(per[r.e.kind] <= 8) res.push(row(r.e, r.sc, toks)); });
  const tagHit = [...allTags().entries()].filter(([t])=>toks.length===1 && t.includes(toks[0])).slice(0,3)
    .map(([t,n])=>({g:'Tags', t:'#'+t, s:n+' item'+(n===1?'':'s')+' tagged', i:'bi-hash', sc:6, run:()=>searchTag(t)}));
  return [...tagHit, ...res];
}



// Lightweight, non-blocking duplicate/overlap check: warns if a new title looks like it
// already exists in the day-by-day Roadmap or elsewhere in Community Content, so you can
// decide to skip it, merge it, or add it anyway.
function checkTopicOverlap(){
  const titleEl = document.getElementById('naf-title');
  const hintEl = document.getElementById('naf-topic-hint');
  if(!titleEl || !hintEl) return;
  const words = titleEl.value.toLowerCase().split(/\W+/).filter(w=>w.length>3);
  if(words.length===0){ hintEl.innerHTML=''; return; }
  let match = null;
  outer:
  for(const phase of PHASES){
    for(const w of phase.weeks){
      for(const d of w.days){
        if(words.some(word=>d.topic.toLowerCase().includes(word))){ match={type:'your Roadmap',label:`Day ${d.n} — ${d.topic}`}; break outer; }
      }
    }
  }
  if(!match){
    for(const author of getAllAuthors()){
      for(const it of author.items){
        if(editingItem && it.id===editingItem.itemId) continue;
        if(words.some(word=>it.title.toLowerCase().includes(word))){ match={type:'Docs Hub',label:it.title}; break; }
      }
      if(match) break;
    }
  }
  hintEl.innerHTML = match ? `<div class="form-hint warn"><i class="bi bi-exclamation-triangle me-1"></i>Looks similar to "<strong>${esc(match.label)}</strong>" already in ${esc(match.type)} — add it anyway, or consider linking to that instead of duplicating.</div>` : '';
}
function renderTypeFields(){
  const type = document.getElementById('naf-type').value;
  document.querySelectorAll('.type-field').forEach(f=> f.classList.toggle('active', f.dataset.type===type));
}
async function handleMediaFile(e){
  const file = e.target.files[0];
  if(!file) return;
  const up = await readUpload(file);
  if(!up){ e.target.value=''; return; }
  pendingMedia = up;
  const nameEl = document.getElementById('naf-media-name') || document.getElementById('naf-media-name-pdf');
  if(nameEl) nameEl.textContent = '✓ ' + file.name + ' (' + Math.round(up.dataUrl.length*0.75/1024) + ' KB)';
}

// Detects YouTube/Vimeo/direct video-file links and returns an embeddable player URL, or null.
function getVideoEmbedInfo(url){
  if(!url) return null;
  try{
    const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{6,})/);
    if(yt) return {kind:'iframe', src:`https://www.youtube.com/embed/${yt[1]}`};
    const vm = url.match(/vimeo\.com\/(\d+)/);
    if(vm) return {kind:'iframe', src:`https://player.vimeo.com/video/${vm[1]}`};
    if(/\.(mp4|webm|ogg)(\?.*)?$/i.test(url) && safeUrl(url)!=='#') return {kind:'video', src:url};
  }catch(e){}
  return null;
}

async function submitContentForm(category){
  const title = document.getElementById('naf-title').value.trim();
  if(!title){ alert('Please fill in a heading / title — that\'s the only required field.'); return; }

  const authorInput = document.getElementById('naf-author');
  const roleInput = document.getElementById('naf-role');
  const displayName = localStorage.getItem('dotnet_display_name');
  let name = authorInput ? authorInput.value.trim() : '';
  let role = roleInput ? roleInput.value.trim() : '';
  if(!name) name = editingItem ? null : (displayName || 'You');
  if(!role) role = 'Community contributor';

  let type;
  if(category==='PDF') type='PDF';
  else if(category==='Image') type='Image';
  else if(category==='Link'){
    const url = normUrl(document.getElementById('naf-url').value);
    type = getVideoEmbedInfo(url) ? 'Video' : 'Link';
  } else {
    type = document.getElementById('naf-type').value;
  }

  const authors = getAllAuthors();
  const authorId = editingItem ? editingItem.authorId : (pendingAuthorForAdd ? pendingAuthorForAdd.id : authorIdFromName(name));
  let author = authors.find(a=>a.id===authorId);

  let itemData = {type, title, badgeColor: TYPE_COLOR[type]};
  if(!editingItem) itemData.section = pendingDocsSection || 'community';
  itemData.summary = rteGetHTML('naf-summary');
  itemData.tags = parseTags((document.getElementById('naf-tags')||{}).value);
  if(type==='Paragraph') itemData.summary = rteGetHTML('naf-para');
  if(type==='PDF') itemData.summary = rteGetHTML('naf-para');
  if(type==='Bullets') itemData.points = rteGetPoints('naf-bullets');
  if(type==='Diagram') itemData.steps = document.getElementById('naf-steps').value.split('\n').map(s=>s.trim()).filter(Boolean);
  if(type==='Post' || type==='Link' || type==='Video') itemData.url = normUrl(document.getElementById('naf-url').value);

  const old = editingItem ? (author && author.items.find(i=>i.id===editingItem.itemId)) : null;
  if(editingItem && !old){ alert('That item no longer exists.'); closeContentForm(); renderAuthorPosts(); return; }
 const isImg = type==='Image', isPDF = type==='PDF';
const keepOldMedia = !!(old && isPDF && !pendingMedia && old.mediaKey && old.type==='PDF');
if(isPDF && !pendingMedia && !keepOldMedia){ alert('Please choose a PDF file to upload.'); return; }
if(isImg && !(IMGPICK['naf-imgs']||[]).length){ alert('Please add at least one image.'); return; }
if((type==='Link'||type==='Video'||type==='Post') && !itemData.url){ alert('Please enter a valid web link (https://…).'); return; }
if(isPDF && pendingMedia){
  const mediaKey = 'media-' + Date.now() + '-' + Math.random().toString(36).slice(2,8);
  const busy = busyStart();
  try{ await idbPut(mediaKey, pendingMedia.dataUrl, busy.progress); } finally { busy.done(); }
  itemData.mediaKey = mediaKey; itemData.mediaName = pendingMedia.name;
} else if(keepOldMedia){ itemData.mediaKey = old.mediaKey; itemData.mediaName = old.mediaName; }
if(isImg){
  const busy = busyStart();
  try{ const imgs = await imgPickerCommit('naf-imgs','media-',busy); itemData.images = imgs; itemData.mediaKey = imgs[0].key; itemData.mediaName = imgs[0].name; } finally { busy.done(); }
}

  let movedNote = '';
  if(editingItem){
    pruneMedia(old, itemData);   // replaced, or type changed away from PDF/Image
    const secEl = document.getElementById('naf-move-section'), autEl = document.getElementById('naf-move-author');
    itemData.section = (secEl && secEl.value) || old.section || 'community';
    const targetId = (autEl && autEl.value) || authorId;
    const moveAuthor = targetId!==authorId && getAllAuthors().some(a=>a.id===targetId);
    const owner = customOwnerOf(old.id);
    if(moveAuthor){
      // move to another author card: take it out of where it is stored, put it into the target
      let moved;
      if(owner){ const i = owner.items.findIndex(x=>x.id===old.id); moved = dropStale({...owner.items[i], ...itemData, id: old.id}, itemData); owner.items.splice(i,1); }
      else { deletedItemIds.add(old.id); localStorage.setItem('dotnet_deleted_items', JSON.stringify([...deletedItemIds])); moved = dropStale({...old, ...itemData, id: old.id+'-m'+Date.now()}, itemData); }
      insertDocsItem(targetId, moved);
      const t = getAllAuthors().find(a=>a.id===targetId);
      movedNote = 'Moved to ' + (t ? t.name : 'another author');
    } else if(owner){
      // edit the REAL stored author - getAllAuthors() hands back copies, so changing those was never saved
      const i = owner.items.findIndex(x=>x.id===old.id);
      if(i>-1) owner.items[i] = dropStale({...owner.items[i], ...itemData, id: old.id}, itemData);
      persistCustomAuthors();
    } else {
      STALE_KEYS.forEach(k=>{ if(!(k in itemData)) itemData[k] = null; });
      itemOverrides[old.id] = itemData; // built-in item: store only the changed fields as an override
      lsSave('dotnet_item_overrides', itemOverrides);
    }
    if(!movedNote && itemData.section !== (old.section||'community')){ const sx = docsSections.find(x=>x.key===itemData.section); movedNote = 'Moved to ' + (sx ? sx.label : 'another tab'); }
  } else {
    const newItem = {id: authorId+'-'+Date.now(), ...itemData};
    insertDocsItem(authorId, newItem, {name, role, linkedin: itemData.url});
  }
  const wasEdit = !!editingItem;
  draftClear();
  closeContentForm();
  if(movedNote && window.UI) UI.toast(movedNote);
  if(!wasEdit && activeDocsSection !== (itemData.section||'community')){
    setDocsSubtab(itemData.section||'community');
  } else {
    renderAuthorPosts();
  }
}

function editItem(authorId, itemId){ openContentForm(authorId, itemId); }

function editAuthorMeta(authorId){
  const author = getAllAuthors().find(a=>a.id===authorId);
  if(!author) return;
  openModal(`
    <div class="author-form mb-0">
      <h6 class="form-title"><i class="bi bi-pencil-square me-1"></i>Edit author</h6>
      <div class="row g-2">
        <div class="col-md-6"><label>Name</label><input id="naf-ea-name" class="form-control" value="${escA(author.name)}"></div>
        <div class="col-md-6"><label>Role / headline</label><input id="naf-ea-role" class="form-control" value="${escA(author.role)}"></div>
        <div class="col-12"><label>LinkedIn / profile URL</label><input id="naf-ea-url" class="form-control" value="${escA(author.linkedin||'')}" placeholder="https://www.linkedin.com/in/..."></div>
      </div>
      <div class="d-flex gap-2 mt-2">
        <button class="btn btn-primary btn-sm" onclick="saveAuthorMeta('${authorId}')"><i class="bi bi-check2 me-1"></i>Save changes</button>
        <button class="btn btn-outline-secondary btn-sm" onclick="closeModal()">Cancel</button>
      </div>
    </div>`);
}
function saveAuthorMeta(authorId){
  const name = document.getElementById('naf-ea-name').value.trim();
  const role = document.getElementById('naf-ea-role').value.trim();
  const linkedin = normUrl(document.getElementById('naf-ea-url').value);
  const avatar = initialsOf(name || getAllAuthors().find(a=>a.id===authorId).name);
  const custom = customAuthors.find(a=>a.id===authorId);
  if(custom){
    custom.name = name || custom.name;
    custom.role = role || custom.role;
    custom.linkedin = linkedin || custom.linkedin;
    custom.avatar = avatar;
    persistCustomAuthors();
  } else {
    // Built-in author (e.g. Sandip Mhaske) — persist as an override so it survives reloads.
    authorOverrides[authorId] = {
      ...(authorOverrides[authorId]||{}),
      ...(name ? {name} : {}),
      ...(role ? {role} : {}),
      ...(linkedin ? {linkedin} : {}),
      avatar
    };
    localStorage.setItem('dotnet_author_overrides', JSON.stringify(authorOverrides));
  }
  closeContentForm();
  renderAuthorPosts();
}

// ===================== PROJECTS DATA =====================
const PROJECTS = [
  {
    name:'Bank Account System',phase:'Phase 1 — Week 2',level:'Beginner',levelColor:'#059669',levelBg:'#dcfce7',
    desc:'Console-based banking system demonstrating OOP fundamentals — the foundation of everything.',
    goal:'Master classes, inheritance, polymorphism, interfaces in C#',
    features:['Create Savings & Current accounts','Deposit, Withdraw, Transfer money','Account statement / history','Interest calculation for Savings','Exception handling for invalid operations'],
    tech:['C#','OOP','Console App','File I/O (JSON)'],
    time:'1 day'
  },
  {
    name:'Student Management Console App',phase:'Phase 1 — Week 3',level:'Beginner',levelColor:'#059669',levelBg:'#dcfce7',
    desc:'Student CRUD system using advanced C# — collections, LINQ, async, file storage.',
    goal:'Master Collections, LINQ, Async/Await, Exception Handling',
    features:['Add/Edit/Delete/Search students','Sort & filter using LINQ','Export to CSV/JSON file','Async file operations','Grade calculator with statistics'],
    tech:['C#','LINQ','Collections','Async/Await','System.Text.Json'],
    time:'1 day'
  },
  {
    name:'Product Management REST API',phase:'Phase 2 — Week 4-7',level:'Intermediate',levelColor:'#d97706',levelBg:'#fef3c7',
    desc:'Full production-ready REST API — the backbone you\'ll keep adding to throughout the course.',
    goal:'Master ASP.NET Core, EF Core, JWT, Repository Pattern',
    features:['Full CRUD for Products, Categories','JWT Authentication + Role-based auth','Refresh token support','Swagger documentation','Global error handling','Serilog logging','Redis caching','SQL Server with EF Core migrations'],
    tech:['ASP.NET Core 8','EF Core','SQL Server','JWT','Redis','Serilog','AutoMapper','FluentValidation'],
    time:'1 week',featured:true
  },
  {
    name:'Full Stack Angular + .NET App',phase:'Phase 4 — Week 12',level:'Intermediate',levelColor:'#d97706',levelBg:'#fef3c7',
    desc:'Connect your Angular frontend to your .NET API — first real full-stack working app!',
    goal:'Master Angular, HTTP Client, RxJS, JWT in browser, Route Guards',
    features:['Login / Register pages','JWT stored securely (memory + refresh)','Product listing with search & filter','Add to cart functionality','Protected routes (auth guards)','HTTP interceptor for tokens','Angular Material UI'],
    tech:['Angular 17','TypeScript','RxJS','NgRx','Angular Material','ASP.NET Core 8'],
    time:'1 week'
  },
  {
    name:'Clean Architecture API',phase:'Phase 5 — Week 14-15',level:'Advanced',levelColor:'#dc2626',levelBg:'#fee2e2',
    desc:'Refactor the Product API into Clean Architecture with CQRS + MediatR — senior-level code.',
    goal:'Master Clean Architecture, CQRS, MediatR, Domain Events, Design Patterns',
    features:['4-layer architecture (Domain/App/Infra/API)','CQRS — separate Commands & Queries','MediatR pipeline behaviors','FluentValidation for all commands','Domain events with MediatR','Repository + Unit of Work','Outbox pattern for events'],
    tech:['Clean Architecture','CQRS','MediatR','FluentValidation','Domain Events','EF Core'],
    time:'1 week'
  },
  {
    name:'E-Commerce Microservices Platform',phase:'Phase 5-6 — Capstone',level:'Expert',levelColor:'#7c3aed',levelBg:'#f3e8ff',
    desc:'The ultimate capstone — a production-grade microservices system that covers everything.',
    goal:'Demonstrate Senior Full Stack .NET Developer skills end-to-end',
    features:['User/Auth Service (Identity, JWT, OAuth Google)','Product/Catalog Service (CQRS, Redis, Search)','Order Service (Saga, state machine)','Payment Service (webhook, idempotency)','Notification Service (Email/SMS/SignalR)','API Gateway (Ocelot, rate limiting)','Angular 17 frontend (full UX)','Docker Compose (local dev)','Kubernetes manifests (production)','GitHub Actions CI/CD to Azure AKS','OpenTelemetry distributed tracing','Prometheus + Grafana monitoring'],
    tech:['ASP.NET Core 8','Angular 17','RabbitMQ','MassTransit','Ocelot','Redis','SQL Server','MongoDB','Docker','Kubernetes','Azure','SignalR','OpenTelemetry'],
    time:'1 week',featured:true
  },
];

// ===================== PROJECT STRUCTURE DATA =====================
const STRUCTURES = [
  {
    name:'Product API — Clean Architecture',
    color:'#dc2626',
    tree:`<span class="dir">ProductAPI.sln</span>
<span class="dir">├── src/</span>
<span class="dir">│   ├── ProductAPI.Domain/</span>
<span class="file">│   │   ├── Entities/</span>
<span class="file">│   │   │   ├── Product.cs</span>
<span class="file">│   │   │   └── Category.cs</span>
<span class="file">│   │   ├── Events/</span>
<span class="file">│   │   │   └── ProductCreatedEvent.cs</span>
<span class="file">│   │   └── Interfaces/</span>
<span class="file">│   │       └── IProductRepository.cs</span>
<span class="dir">│   ├── ProductAPI.Application/</span>
<span class="file">│   │   ├── Products/</span>
<span class="file">│   │   │   ├── Commands/</span>
<span class="file">│   │   │   │   ├── CreateProductCommand.cs</span>
<span class="file">│   │   │   │   └── CreateProductCommandHandler.cs</span>
<span class="file">│   │   │   └── Queries/</span>
<span class="file">│   │   │       ├── GetProductsQuery.cs</span>
<span class="file">│   │   │       └── GetProductsQueryHandler.cs</span>
<span class="file">│   │   ├── Validators/</span>
<span class="file">│   │   │   └── CreateProductValidator.cs</span>
<span class="file">│   │   └── Behaviours/</span>
<span class="file">│   │       ├── ValidationBehaviour.cs</span>
<span class="file">│   │       └── LoggingBehaviour.cs</span>
<span class="dir">│   ├── ProductAPI.Infrastructure/</span>
<span class="file">│   │   ├── Persistence/</span>
<span class="file">│   │   │   ├── ApplicationDbContext.cs</span>
<span class="file">│   │   │   └── Migrations/</span>
<span class="file">│   │   ├── Repositories/</span>
<span class="file">│   │   │   └── ProductRepository.cs</span>
<span class="file">│   │   └── Caching/</span>
<span class="file">│   │       └── RedisCacheService.cs</span>
<span class="dir">│   └── ProductAPI.API/</span>
<span class="file">│       ├── Controllers/</span>
<span class="file">│       │   └── ProductsController.cs</span>
<span class="file">│       ├── Middleware/</span>
<span class="file">│       │   └── ExceptionMiddleware.cs</span>
<span class="file">│       └── Program.cs</span>
<span class="dir">└── tests/</span>
<span class="file">    ├── ProductAPI.UnitTests/</span>
<span class="file">    └── ProductAPI.IntegrationTests/</span>`
  },
  {
    name:'E-Commerce Microservices',
    color:'#7c3aed',
    tree:`<span class="dir">ecommerce-microservices/</span>
<span class="dir">├── src/</span>
<span class="dir">│   ├── Services/</span>
<span class="dir">│   │   ├── UserService/</span>
<span class="file">│   │   │   ├── UserService.API/</span>
<span class="file">│   │   │   ├── UserService.Application/</span>
<span class="file">│   │   │   ├── UserService.Domain/</span>
<span class="file">│   │   │   └── UserService.Infrastructure/</span>
<span class="dir">│   │   ├── ProductService/</span>
<span class="file">│   │   │   ├── ProductService.API/ <span class="comment">(CQRS + Redis)</span></span>
<span class="file">│   │   │   ├── ProductService.Application/</span>
<span class="file">│   │   │   ├── ProductService.Domain/</span>
<span class="file">│   │   │   └── ProductService.Infrastructure/</span>
<span class="dir">│   │   ├── OrderService/</span>
<span class="file">│   │   │   └── <span class="comment">(Saga + MassTransit)</span></span>
<span class="dir">│   │   ├── NotificationService/</span>
<span class="file">│   │   │   └── <span class="comment">(SignalR + RabbitMQ consumer)</span></span>
<span class="dir">│   │   └── PaymentService/</span>
<span class="file">│   │       └── <span class="comment">(Webhook + Idempotency)</span></span>
<span class="dir">│   ├── ApiGateway/</span>
<span class="file">│   │   ├── ocelot.json <span class="comment">(routing config)</span></span>
<span class="file">│   │   └── Program.cs</span>
<span class="dir">│   └── Web/</span>
<span class="file">│       └── ecommerce-angular/ <span class="comment">(Angular 17 app)</span></span>
<span class="dir">├── k8s/</span>
<span class="file">│   ├── deployments/ <span class="comment">(per-service k8s manifests)</span></span>
<span class="file">│   ├── services/</span>
<span class="file">│   └── ingress.yaml</span>
<span class="dir">├── docker/</span>
<span class="file">│   └── docker-compose.yml</span>
<span class="dir">└── .github/</span>
<span class="file">    └── workflows/</span>
<span class="file">        └── ci-cd.yml <span class="comment">(GitHub Actions)</span></span>`
  },
  {
    name:'Angular App Structure',
    color:'#d97706',
    tree:`<span class="dir">ecommerce-angular/</span>
<span class="dir">├── src/</span>
<span class="dir">│   ├── app/</span>
<span class="dir">│   │   ├── core/ <span class="comment">(singleton services, guards)</span></span>
<span class="file">│   │   │   ├── auth/</span>
<span class="file">│   │   │   │   ├── auth.service.ts</span>
<span class="file">│   │   │   │   ├── auth.guard.ts</span>
<span class="file">│   │   │   │   └── auth.interceptor.ts</span>
<span class="file">│   │   │   └── services/</span>
<span class="dir">│   │   ├── shared/ <span class="comment">(reusable components)</span></span>
<span class="file">│   │   │   ├── components/</span>
<span class="file">│   │   │   ├── directives/</span>
<span class="file">│   │   │   └── pipes/</span>
<span class="dir">│   │   ├── features/ <span class="comment">(lazy-loaded modules)</span></span>
<span class="file">│   │   │   ├── auth/</span>
<span class="file">│   │   │   │   ├── login/login.component.ts</span>
<span class="file">│   │   │   │   └── register/register.component.ts</span>
<span class="file">│   │   │   ├── products/</span>
<span class="file">│   │   │   │   ├── product-list/</span>
<span class="file">│   │   │   │   └── product-detail/</span>
<span class="file">│   │   │   ├── cart/</span>
<span class="file">│   │   │   └── orders/</span>
<span class="dir">│   │   └── store/ <span class="comment">(NgRx state)</span></span>
<span class="file">│   │       ├── auth/</span>
<span class="file">│   │       │   ├── auth.actions.ts</span>
<span class="file">│   │       │   ├── auth.reducer.ts</span>
<span class="file">│   │       │   └── auth.effects.ts</span>
<span class="file">│   │       └── products/</span>
<span class="file">│   ├── assets/</span>
<span class="file">│   └── environments/</span>
<span class="file">│       ├── environment.ts</span>
<span class="file">│       └── environment.prod.ts</span>
<span class="file">├── angular.json</span>
<span class="file">└── package.json</span>`
  },
];

// ===================== ADVANCED TOPICS =====================
const ADV_TOPICS = [
  {title:'Span<T> & Memory Optimization',color:'#dc2626',border:'#dc2626',
   desc:'Span<T> and Memory<T> allow zero-copy memory operations. ArrayPool<T> reduces GC pressure. Essential for high-throughput APIs.',
   points:['Span<T> — stack-allocated, slice arrays without copying','Memory<T> — heap-friendly version for async scenarios','ArrayPool<T> — rent/return buffers to avoid allocations','IMemoryOwner<T> for lifetime management','RecyclableMemoryStream for large streams']},
  {title:'Channel<T> & Advanced Async Patterns',color:'#0891b2',border:'#0891b2',
   desc:'Channel<T> is a producer-consumer pipeline built into .NET. Used for high-performance background processing.',
   points:['Channel<T> — bounded/unbounded, backpressure support','IAsyncEnumerable<T> — async streaming of data','ValueTask — avoid heap allocation for hot paths','Parallel.ForEachAsync — parallel async iteration','AsyncLocal<T> — async context propagation']},
  {title:'Source Generators & Reflection',color:'#7c3aed',border:'#7c3aed',
   desc:'Source generators run at compile-time to generate code. They replace reflection for performance-critical scenarios.',
   points:['ISourceGenerator / IIncrementalGenerator API','System.Text.Json source generation (AOT-ready)','Roslyn APIs for code analysis','Expression Trees — build LINQ at runtime','Compile-time validation vs runtime reflection']},
  {title:'gRPC & Protocol Buffers',color:'#059669',border:'#059669',
   desc:'gRPC is 7-10x faster than REST for internal service communication. Protocol Buffers provide strongly-typed contracts.',
   points:['.proto file — service and message definitions','Unary, server streaming, client streaming, bidirectional','gRPC interceptors (middleware equivalent)','Deadlines and cancellation','gRPC transcoding — expose as REST + gRPC']},
  {title:'Kafka / Event Streaming',color:'#d97706',border:'#d97706',
   desc:'Apache Kafka for high-throughput, durable event streaming. Different from RabbitMQ (message broker) — Kafka retains events.',
   points:['Topics, partitions, consumer groups','Confluent.Kafka .NET client','Producer + consumer implementation','Offset management and replay','When Kafka vs RabbitMQ — use case comparison']},
  {title:'Elasticsearch + Full-Text Search',color:'#4f46e5',border:'#4f46e5',
   desc:'Elasticsearch for full-text search, faceted search, and analytics. Common in product catalogs, logs, audit trails.',
   points:['NEST / Elasticsearch.Net .NET client','Index mapping and analyzers','Full-text search queries (match, multi-match)','Aggregations for faceted search','Sync EF Core data to Elasticsearch']},
  {title:'Multi-Tenancy Patterns',color:'#7c3aed',border:'#7c3aed',
   desc:'Multi-tenancy is essential for SaaS products. Three isolation strategies each with different trade-offs.',
   points:['Database per tenant — strongest isolation, highest cost','Schema per tenant — good balance','Row-level (discriminator column) — cost-effective, risk of data leak','Tenant resolution — subdomain, header, JWT claim','EF Core global query filters for row-level']},
  {title:'Vertical Slice Architecture',color:'#dc2626',border:'#dc2626',
   desc:'Alternative to Clean Architecture — organize code by feature (vertical slice) instead of layer. Reduces coupling between features.',
   points:['Feature folder — all code for one feature together','No shared application layer between features','Jimmy Bogard\'s approach (MediatR author)','Trade-offs vs Clean Architecture','When to choose vertical slice over layered']},
];

// ===================== INTERVIEW Q&A =====================
const QA_DATA = [
  {cat:'C# Core',color:'#4f46e5',qs:[
    {q:'What is the difference between value type and reference type?',a:'Value types (int, struct, bool) are stored on the stack and copied on assignment. Reference types (class, string, arrays) store a reference on the stack pointing to heap data. Assignment copies the reference, not the object.'},
    {q:'Explain async/await internals — what happens under the hood?',a:'async/await uses a state machine generated by the compiler. When you await a Task, the method suspends and returns control to the caller. The continuation (rest of method) is registered as a callback. The ThreadPool resumes it when the awaited Task completes — it\'s not blocking a thread while waiting.'},
    {q:'What is the difference between IEnumerable and IQueryable?',a:'IEnumerable executes queries in memory (LINQ to Objects). IQueryable builds an expression tree and executes at the database (LINQ to SQL). Use IQueryable for DB queries to avoid loading all records into memory.'},
    {q:'What are Span<T> and Memory<T> used for?',a:'Span<T> is a stack-allocated, ref struct that provides a window into contiguous memory (array, string, native memory) without copying. Memory<T> is the heap-compatible version usable with async. Both avoid allocations in hot paths.'},
    {q:'Explain the Garbage Collector generations.',a:'GC has 3 generations. Gen 0: short-lived objects, collected most frequently. Gen 1: buffer between Gen0 and Gen2. Gen 2: long-lived objects (static, cached), collected rarely. Large objects (>85KB) go to LOH (Large Object Heap), compacted separately.'},
  ]},
  {cat:'ASP.NET Core',color:'#0891b2',qs:[
    {q:'What is the difference between AddSingleton, AddScoped, and AddTransient?',a:'Singleton: one instance for the entire app lifetime. Scoped: one instance per HTTP request (disposed at end of request). Transient: new instance every time it\'s requested. Never inject Scoped into Singleton — causes captive dependency bug.'},
    {q:'How does the middleware pipeline work?',a:'Middleware forms a chain — each piece wraps the next. Request flows inward (top to bottom), response flows outward (bottom to top). Use() adds middleware that calls next(). Run() is terminal (doesn\'t call next). Map() branches the pipeline.'},
    {q:'What is the difference between Authentication and Authorization?',a:'Authentication = WHO are you? (verifying identity via JWT, cookie, etc.). Authorization = WHAT can you do? (checking permissions after identity is confirmed). In ASP.NET Core, [Authorize] handles both but they are separate middleware.'},
    {q:'Explain CQRS and when you would use it.',a:'CQRS (Command Query Responsibility Segregation) separates read models from write models. Commands mutate state, Queries just read. Use it when reads and writes have very different performance needs, or when domain events are important. Overkill for simple CRUD apps.'},
    {q:'What is Clean Architecture and why use it?',a:'Clean Architecture organizes code into concentric layers — Domain (innermost, no dependencies), Application (use cases), Infrastructure (EF, APIs, external), Presentation (controllers). Dependencies only point inward. Benefits: testability, framework independence, clear separation of concerns.'},
  ]},
  {cat:'Database & EF Core',color:'#059669',qs:[
    {q:'What is the N+1 problem and how do you fix it?',a:'N+1 happens when you load 1 parent record then make N separate queries for each child. In EF Core, fix with .Include() for eager loading, or use .Select() projection. In SQL, fix with JOIN instead of separate queries.'},
    {q:'What is the difference between clustered and non-clustered index?',a:'Clustered index determines the physical order of data on disk — only one per table (usually primary key). Non-clustered index is a separate structure with pointers to the actual rows. Non-clustered is faster for lookups but adds write overhead.'},
    {q:'Explain optimistic vs pessimistic concurrency.',a:'Pessimistic: lock the row when reading so others can\'t modify it (SELECT FOR UPDATE). Optimistic: don\'t lock — check if data changed before saving (using a RowVersion/timestamp column). EF Core supports optimistic concurrency with [Timestamp] or [ConcurrencyCheck] attributes.'},
    {q:'What are ACID properties?',a:'Atomicity: transaction fully completes or fully rolls back. Consistency: DB always stays in valid state. Isolation: concurrent transactions don\'t interfere. Durability: committed data survives crashes. SQL Server supports all ACID properties at different isolation levels.'},
    {q:'When would you use Dapper over Entity Framework Core?',a:'Dapper for: complex reporting queries, bulk operations, stored procedures with complex result mapping, when you need maximum query performance. EF Core for: standard CRUD, domain modeling, migrations, when productivity matters more than raw performance.'},
  ]},
  {cat:'Microservices & Architecture',color:'#dc2626',qs:[
    {q:'How do microservices communicate?',a:'Synchronously: REST (HTTP) for simple request-response, gRPC for high-performance internal calls. Asynchronously: message brokers (RabbitMQ, Kafka, Azure Service Bus) for events/commands. Rule: prefer async to avoid tight coupling and improve resilience.'},
    {q:'What is the Saga pattern?',a:'Saga manages distributed transactions across multiple services without 2-phase commit. Choreography: services emit events and react to each other (decoupled but hard to track). Orchestration: a central saga orchestrator tells each service what to do (easier to track, single point of coordination).'},
    {q:'What is the CAP theorem?',a:'In a distributed system you can only guarantee 2 of 3: Consistency (every read gets latest write), Availability (every request gets a response), Partition tolerance (system works despite network failures). Since network partitions always happen, you choose CP (banks) or AP (e-commerce).'},
    {q:'What is the Outbox Pattern?',a:'Ensures atomicity between saving to DB and publishing an event. Instead of publishing directly to RabbitMQ (which can fail), write the event to an Outbox table in the same DB transaction. A background worker reads the Outbox and publishes to the message broker, guaranteeing at-least-once delivery.'},
    {q:'What is the difference between event-driven and message-driven architecture?',a:'Message-driven: services send messages to specific recipients (point-to-point). Event-driven: services publish events to a bus and any interested service subscribes (pub/sub). Event-driven is more decoupled — the publisher doesn\'t know who consumes.'},
  ]},
  {cat:'System Design',color:'#7c3aed',qs:[
    {q:'How would you design a URL shortener like bit.ly?',a:'API: POST /shorten returns short code. Storage: original URL + short code in DB (SQL for ACID). Code generation: base62 encoding of auto-increment ID or MD5 hash. Redirect: GET /{code} → 302 redirect. Cache: Redis for hot URLs. Scale: read-heavy so cache aggressively, horizontal scaling behind load balancer.'},
    {q:'How would you design a notification system?',a:'Producer services publish notification events to RabbitMQ. Notification service consumes events, checks user preferences, routes to channels (email/SMS/push). Email via SendGrid, SMS via Twilio, push via FCM/APNs. Real-time via SignalR hub. Store notification history in DB for inbox.'},
    {q:'How do you handle distributed transactions without 2PC?',a:'Use Saga pattern with eventual consistency. Each service has a compensating transaction (undo action). Outbox pattern ensures event publishing is atomic with DB save. Accept temporary inconsistency — design UI to handle "processing" states gracefully.'},
  ]},
];

// ===================== SUMMARY DATA =====================
const SUMMARY = {
  timeline:[
    {month:'Month 1',color:'#4f46e5',bg:'#ede9fe',title:'C# + ASP.NET + SQL',skills:['C# OOP & advanced features','ASP.NET Core Web API','EF Core & SQL Server','JWT Authentication','Repository Pattern']},
    {month:'Month 2',color:'#d97706',bg:'#fef3c7',title:'Angular Full Stack',skills:['TypeScript & HTML/CSS','Angular 17 (standalone)','RxJS & NgRx','HTTP interceptors','Full stack integration']},
    {month:'Month 3',color:'#dc2626',bg:'#fee2e2',title:'Senior Architecture',skills:['Clean Architecture','CQRS + MediatR','Microservices','Docker + Kubernetes','Azure deployment']},
    {month:'Month 4',color:'#7c3aed',bg:'#f3e8ff',title:'Expert + Capstone',skills:['System Design','SignalR + gRPC','Capstone project build','Interview preparation','Mock interviews']},
    {month:'Month 5',color:'#059669',bg:'#dcfce7',title:'Ultra Advanced',skills:['Kafka / Event Streaming','Elasticsearch','Multi-tenancy SaaS','Architect-level patterns','Job hunting & offers']},
  ],
  salaries:[], // removed from UI per request; kept as empty array in case other code references SUMMARY.salaries
  dailySchedule:[
    {time:'8:00 – 10:00 AM',task:'Watch tutorial / Read docs (new concept)'},
    {time:'10:00 AM – 12:30 PM',task:'Code implementation / Hands-on practice'},
    {time:'1:30 – 3:00 PM',task:'Build mini project / Solve problems'},
    {time:'3:00 – 4:30 PM',task:'Revision + make notes in notebook'},
    {time:'4:30 – 5:00 PM',task:'GitHub commit + track progress here'},
  ]
};

// ===================== RESUME BUILDER (Profile tab) =====================
// Seeded from the resume the user uploaded — fully editable part-by-part below.
// A neutral, ATS-friendly starting point that suits any role. Replace the [bracketed] text with your own details.
const DEFAULT_RESUME = {
  name: "Your Full Name",
  title: "Your Professional Title",
  email: "you@example.com",
  phone: "+00 00000 00000",
  summary: "[Job title] with [X] years of experience in [industry or field]. Known for [two or three strengths, e.g. problem solving, stakeholder communication, delivering on deadlines]. Proven record of [your biggest measurable result]. Looking to bring this to a [target role] position at [type of organisation].",
  skills: [
    {cat:"Core Skills", items:"[Skill 1], [Skill 2], [Skill 3], [Skill 4]"},
    {cat:"Tools & Software", items:"[Tool 1], [Tool 2], [Tool 3]"},
    {cat:"Methods & Practices", items:"[e.g. Agile, project planning, data analysis, customer service]"},
    {cat:"Soft Skills", items:"Communication, Teamwork, Time management, Attention to detail"}
  ],
  experience: [
    {company:"[Company Name]", role:"[Your Job Title]", date:"Mon YYYY – Present", bullets:[
      "[Action verb] [what you did] by [how], resulting in [measurable result, e.g. 25% faster, 40 clients, $50K saved].",
      "Led or contributed to [project or responsibility], working with [team or stakeholders] to deliver [outcome].",
      "Improved [process, product or metric] by [number or %], by [what you changed].",
      "Managed [scope: people, budget, accounts, systems] and met [target or deadline]."
    ]},
    {company:"[Previous Company Name]", role:"[Previous Job Title]", date:"Mon YYYY – Mon YYYY", bullets:[
      "[Action verb] [task or achievement] that [business impact].",
      "Collaborated with [team] to [goal], achieving [result]."
    ]}
  ],
  projects: [
    {title:"[Project or Portfolio Piece]", tech:"[Tools or methods used]", date:"YYYY", bullets:[
      "Built / designed / organised [what] to solve [problem], achieving [result]."
    ]}
  ],
  education: [
    {degree:"[Degree or Qualification]", school:"[University or Institution]", year:"YYYY", detail:"[Optional: grade, honours, relevant coursework]"}
  ],
  achievements: [
    {title:"[Award or Recognition]", org:"[Organisation]", date:"YYYY", bullets:["[One line on why you received it]"]}
  ],
  certifications: [
    {name:"[Certification Name]", issuer:"[Issuing Body]", date:"YYYY", url:""}
  ],
  languages: [
    {name:"English", level:"Professional working proficiency"}
  ],
  customSections: [], // [{id, title, bullets:[]}] - freeform sections the user names themselves (Volunteering, Publications, Awards, Hobbies, anything)
  sectionOrder: ['summary','skills','experience','projects','education','achievements','certifications','languages','customSections']
};
let resumeData = null;
try{ resumeData = lsJSON('dotnet_resume_data', 'null'); }catch(e){}
if(!resumeData) resumeData = JSON.parse(JSON.stringify(DEFAULT_RESUME));
// Migrate resumes saved before certifications/languages/customSections/sectionOrder existed.
if(!resumeData.certifications) resumeData.certifications = [];
if(!resumeData.languages) resumeData.languages = [];
if(!resumeData.customSections) resumeData.customSections = [];
if(!resumeData.sectionOrder) resumeData.sectionOrder = ['summary','skills','experience','projects','education','achievements','certifications','languages','customSections'];

const RESUME_SECTION_LABELS = {summary:'Summary', skills:'Skills', experience:'Work Experience', projects:'Projects', education:'Education', achievements:'Achievements', certifications:'Certifications', languages:'Languages', customSections:'Custom Sections'};
function moveResumeSection(key, dir){
  const arr = resumeData.sectionOrder;
  const idx = arr.indexOf(key);
  const newIdx = idx + dir;
  if(idx<0 || newIdx<0 || newIdx>=arr.length) return;
  [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
  saveResumeData();
  renderResumeEditor();
  updateResumePreview();
}
function resumeSectionSummary(key, count, extraLabel){
  const idx = resumeData.sectionOrder.indexOf(key);
  const last = resumeData.sectionOrder.length - 1;
  return `<summary>
    <span class="resume-section-reorder">
      <i class="bi bi-caret-up-fill ${idx<=0?'disabled':''}" onclick="event.preventDefault();moveResumeSection('${key}',-1)" title="Move section up"></i>
      <i class="bi bi-caret-down-fill ${idx>=last?'disabled':''}" onclick="event.preventDefault();moveResumeSection('${key}',1)" title="Move section down"></i>
    </span>
    ${RESUME_SECTION_LABELS[key]}${count!==undefined?` (${count})`:''} ${extraLabel?`<span class="text-muted fw-normal" style="font-size:0.68rem">${extraLabel}</span>`:''}
    ${(resumeData.hidden||[]).includes(key) ? '<span class="badge text-bg-secondary ms-1" style="font-size:.62rem">hidden from resume</span>' : ''}
    <i class="bi ${(resumeData.hidden||[]).includes(key)?'bi-eye-slash':'bi-eye'} resume-eye" role="button" tabindex="0" onclick="event.preventDefault();event.stopPropagation();toggleResumeSection('${key}')" title="${(resumeData.hidden||[]).includes(key)?'Show this section on the resume':'Hide this section from the resume'}" aria-label="Show or hide this section"></i>
  </summary>`;
}

// ---- Named resume versions, so you can keep a tailored copy per job application ----
let resumeVersions = lsJSON('dotnet_resume_versions', '[]'); // [{id,name,data,savedAt}]
let activeResumeVersionId = localStorage.getItem('dotnet_resume_active_version') || null;

function saveResumeData(){
  if(!lsSave('dotnet_resume_data', resumeData)) return false;
  const el = document.getElementById('resume-save-status');
  if(el){ el.textContent = 'All changes saved · ' + new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); el.classList.remove('is-dirty'); }
  return true;
}
let _resumeSaveTimer = null;
function saveAndPreview(){
  saveResumeData(); updateResumePreview();
}
// Explicit "Save" button: writes locally, then pushes to the cloud and confirms.
async function saveResumeNow(){
  if(!saveResumeData()) return;
  try{ if(window.Cloud) await Cloud.flush(); }catch(e){}
  if(window.UI) UI.toast('Resume saved');
}
function restoreResumeDefault(){
  if(!confirm('Replace your current resume with the blank starting template?\n\nYour current version is saved first as "Backup before restore", so you can switch back to it from Tailored versions.')) return;
  resumeVersions.push({id:'v'+Date.now(), name:'Backup before restore ' + new Date().toLocaleDateString(), data: JSON.parse(JSON.stringify(resumeData)), savedAt: Date.now()});
  lsSave('dotnet_resume_versions', resumeVersions);
  resumeData = resumeMigrate(JSON.parse(JSON.stringify(DEFAULT_RESUME)));
  activeResumeVersionId = '';
  lsSave('dotnet_resume_active_version', '');
  saveResumeData();
  renderResumeBuilder();
  if(window.UI) UI.toast('Default template restored');
}

function renderResumeBuilder(){
  const wrap = document.getElementById('resume-builder-container');
  if(wrap && !wrap.dataset.built){
    wrap.dataset.built = '1';
    wrap.innerHTML = `
      <div class="docshub-header">
        <div>
          <h5 class="docshub-title">Resume Builder</h5>
          <p class="docshub-sub mb-0">Edit any section, match it against a job description, then download.</p>
        </div>
      </div>

      <div class="phase-card mb-3" style="padding:0.9rem 1rem">
        <h6 class="fw-bold mb-1" style="font-size:0.85rem"><i class="bi bi-collection me-2 text-primary"></i>Tailored versions <span class="text-muted fw-normal">(optional)</span></h6>
        <p class="small text-muted mb-2">Keep a separate saved copy per job — e.g. "Backend-focused", "Full-stack" — and switch between them any time.</p>
        <div class="d-flex gap-2 flex-wrap align-items-center">
          <select id="resume-version-select" class="form-select form-select-sm" style="max-width:220px" onchange="switchResumeVersion(this.value)"></select>
          <button class="btn btn-sm btn-outline-primary" onclick="saveResumeVersion()"><i class="bi bi-save me-1"></i>Save as version</button>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteResumeVersion()"><i class="bi bi-trash me-1"></i>Delete version</button>
        </div>
      </div>

      <div class="phase-card mb-3" style="padding:0.9rem 1rem">
        <h6 class="fw-bold mb-2" style="font-size:0.85rem"><i class="bi bi-briefcase me-2 text-primary"></i>Job applications <span class="text-muted fw-normal">(optional)</span></h6>
        <div id="job-tracker"></div>
      </div>

      <div class="row g-3 mb-3">
        <div class="col-lg-6">
          <div class="phase-card h-100" id="resume-ats-card" style="padding:0.9rem 1rem">
            <h6 class="fw-bold mb-2" style="font-size:0.85rem"><i class="bi bi-bullseye me-2 text-primary"></i>ATS Match Check <span class="text-muted fw-normal">(optional)</span></h6>
            <textarea id="resume-jd-input" class="form-control form-control-sm mb-2" rows="3" placeholder="Paste a job description here to see your keyword match score…" oninput="onJdInput(this.value)"></textarea>
            <div id="resume-ats-result"></div>
          </div>
        </div>
        <div class="col-lg-6">
          <div class="phase-card h-100" style="padding:0.9rem 1rem">
            <h6 class="fw-bold mb-2" style="font-size:0.85rem"><i class="bi bi-heart-pulse me-2 text-primary"></i>Resume health <span class="text-muted fw-normal">(quick checks)</span></h6>
            <div id="resume-health"></div>
          </div>
        </div>
      </div>

      <div class="resume-toolbar">
        <div class="d-flex gap-2 flex-wrap align-items-center">
          <button class="btn btn-sm btn-primary" onclick="saveResumeNow()"><i class="bi bi-check2-circle me-1"></i>Save</button>
          <button class="btn btn-sm btn-outline-secondary" onclick="restoreResumeDefault()"><i class="bi bi-arrow-counterclockwise me-1"></i>Restore default</button>
          <span id="resume-save-status" class="small text-muted" role="status">Changes save automatically</span>
        </div>
        <div class="d-flex gap-2 flex-wrap">
          <button class="btn btn-sm btn-outline-primary" onclick="downloadResumePDF()"><i class="bi bi-file-earmark-pdf me-1"></i>PDF</button>
          <button class="btn btn-sm btn-outline-primary" onclick="downloadResumeDocx()"><i class="bi bi-file-earmark-word me-1"></i>Word</button>
          <button class="btn btn-sm btn-outline-primary" onclick="downloadResumeTxt()"><i class="bi bi-filetype-txt me-1"></i>Text (ATS)</button>
          <button class="btn btn-sm btn-outline-primary" onclick="downloadResumeMd()"><i class="bi bi-markdown me-1"></i>Markdown</button>
          <button class="btn btn-sm btn-outline-primary" onclick="downloadResumeJson()" title="A backup you can import later or on another device"><i class="bi bi-braces me-1"></i>JSON</button>
          <button class="btn btn-sm btn-outline-secondary" onclick="document.getElementById('resume-import-input').click()"><i class="bi bi-upload me-1"></i>Import</button>
          <input type="file" id="resume-import-input" accept="application/json,.json" style="display:none" onchange="importResumeJson(event)">
        </div>
      </div>

      <details class="phase-card mb-3 profile-details">
        <summary class="card-title-sum"><span><i class="bi bi-lightbulb"></i>Writing a resume that works for any job</span><i class="bi bi-chevron-down"></i></summary>
        <ul class="resume-tips">
          <li><b>Lead with a clear title and a 2–3 line summary</b> aimed at the job you want, not everything you have done.</li>
          <li><b>Start every bullet with a strong verb</b> (Led, Built, Reduced, Delivered, Negotiated) and finish with a result.</li>
          <li><b>Use numbers</b>: %, money, team size, volume, time saved. If you cannot measure it, name the scope.</li>
          <li><b>Mirror the job description.</b> Use its exact keywords for skills and tools, then check the match below.</li>
          <li><b>Keep it plain.</b> Standard headings, one column, no tables, images or icons, so recruiters and ATS software read it correctly.</li>
          <li><b>Newest first.</b> Keep dates consistent (Mon YYYY) and aim for one page, two at most with 10+ years of experience.</li>
          <li><b>Proofread</b> for tense (past for old roles, present for current), spelling and a professional email address.</li>
        </ul>
      </details>

      <div class="row g-3">
        <div class="col-lg-6">
          <h6 class="fw-bold mb-2" style="font-size:0.82rem"><i class="bi bi-pencil-square me-2 text-primary"></i>Edit — part by part</h6>
          <div id="resume-editor"></div>
        </div>
        <div class="col-lg-6">
          <h6 class="fw-bold mb-2" style="font-size:0.82rem"><i class="bi bi-eye me-2 text-primary"></i>Live preview</h6>
          <div class="phase-card mb-2" style="padding:.7rem .9rem"><div id="resume-design"></div></div>
          <div id="resume-page-info" class="resume-page-info"></div>
          <div id="resume-paper-box" class="resume-paper-box"><div id="resume-preview" class="resume-doc resume-paper"></div></div>
        </div>
      </div>
    `;
  }
  renderResumeVersionSelect();
  renderResumeEditor();
  renderResumeDesign();
  renderJobTracker();
  const jd = document.getElementById('resume-jd-input'); if(jd) jd.value = resumeData.jd || '';
  updateResumePreview();
  const box = document.getElementById('resume-paper-box');
  if(box && !box.dataset.ro && window.ResizeObserver){ box.dataset.ro = '1'; new ResizeObserver(()=>fitResumePreview()).observe(box); }
}

// ---- Tailored resume versions: save/switch/delete named snapshots of resumeData ----
function renderResumeVersionSelect(){
  const sel = document.getElementById('resume-version-select');
  if(!sel) return;
  sel.innerHTML = `<option value="">Untitled (current)</option>` + resumeVersions.map(v=>`<option value="${escA(v.id)}" ${v.id===activeResumeVersionId?'selected':''}>${esc(v.name)}</option>`).join('');
  if(!activeResumeVersionId) sel.value = '';
}
function saveResumeVersion(){
  const defaultName = activeResumeVersionId ? (resumeVersions.find(v=>v.id===activeResumeVersionId)?.name || '') : '';
  const name = prompt('Name this version (e.g. "Backend-focused", "Startup application"):', defaultName);
  if(!name) return;
  const existing = resumeVersions.find(v=>v.name.toLowerCase()===name.toLowerCase());
  if(existing){
    existing.data = JSON.parse(JSON.stringify(resumeData));
    existing.savedAt = Date.now();
    activeResumeVersionId = existing.id;
  } else {
    const v = {id:'ver-'+Date.now(), name, data: JSON.parse(JSON.stringify(resumeData)), savedAt: Date.now()};
    resumeVersions.push(v);
    activeResumeVersionId = v.id;
  }
  localStorage.setItem('dotnet_resume_versions', JSON.stringify(resumeVersions));
  localStorage.setItem('dotnet_resume_active_version', activeResumeVersionId);
  renderResumeVersionSelect();
  alert('Saved as "'+name+'".');
}
function switchResumeVersion(id){
  if(!id){ activeResumeVersionId = null; localStorage.removeItem('dotnet_resume_active_version'); return; }
  const v = resumeVersions.find(x=>x.id===id);
  if(!v) return;
  resumeData = JSON.parse(JSON.stringify(v.data));
  if(!resumeData.certifications) resumeData.certifications = [];
  if(!resumeData.languages) resumeData.languages = [];
  if(!resumeData.customSections) resumeData.customSections = [];
  if(!resumeData.sectionOrder) resumeData.sectionOrder = ['summary','skills','experience','projects','education','achievements','certifications','languages','customSections'];
  resumeMigrate(resumeData);
  activeResumeVersionId = id;
  localStorage.setItem('dotnet_resume_active_version', activeResumeVersionId);
  saveResumeData();
  renderResumeEditor();
  renderResumeDesign();
  syncJdBox();
  updateResumePreview();
}
function deleteResumeVersion(){
  if(!activeResumeVersionId){ alert('Nothing to delete — you\'re on the untitled current copy.'); return; }
  const v = resumeVersions.find(x=>x.id===activeResumeVersionId);
  if(!v || !confirm('Delete the saved version "'+v.name+'"? This only removes the saved snapshot, not your current edits.')) return;
  resumeVersions = resumeVersions.filter(x=>x.id!==activeResumeVersionId);
  localStorage.setItem('dotnet_resume_versions', JSON.stringify(resumeVersions));
  activeResumeVersionId = null;
  localStorage.removeItem('dotnet_resume_active_version');
  renderResumeVersionSelect();
}

function renderResumeEditor(){
  const c = document.getElementById('resume-editor');
  if(!c) return;
  const d = resumeData;

  const sectionHTML = {
    summary: `<details class="resume-edit-section" open>
      ${resumeSectionSummary('summary')}
      <div class="p-2"><textarea class="form-control form-control-sm" rows="3" aria-label="Professional summary" oninput="resumeData.summary=this.value;saveAndPreview()">${esc(d.summary)}</textarea></div>
    </details>`,

    skills: `<details class="resume-edit-section">
      ${resumeSectionSummary('skills', d.skills.length)}
      <div class="p-2">
        ${d.skills.map((s,i)=>`<div class="resume-entry-row">
          <div class="flex-1">
            <input class="form-control form-control-sm mb-1" placeholder="Category, e.g. Frameworks" value="${escA(s.cat)}" oninput="resumeData.skills[${i}].cat=this.value;saveAndPreview()">
            <input class="form-control form-control-sm" placeholder="Comma-separated skills" value="${escA(s.items)}" oninput="resumeData.skills[${i}].items=this.value;saveAndPreview()">
          </div>
          <div class="resume-entry-btns">
            <button class="btn btn-sm btn-outline-secondary" onclick="resumeData.skills.splice(${i}+1,0,JSON.parse(JSON.stringify(resumeData.skills[${i}])));saveResumeData();renderResumeBuilder()" title="Duplicate"><i class="bi bi-copy"></i></button>
            <button class="btn btn-sm btn-outline-danger" onclick="resumeData.skills.splice(${i},1);saveResumeData();renderResumeBuilder()" title="Remove"><i class="bi bi-trash"></i></button>
          </div>
        </div>`).join('')}
        <button class="btn btn-sm btn-outline-primary mt-1" onclick="resumeData.skills.push({cat:'',items:''});saveResumeData();renderResumeBuilder()"><i class="bi bi-plus-lg me-1"></i>Add skill group</button>
      </div>
    </details>`,

    experience: `<details class="resume-edit-section">
      ${resumeSectionSummary('experience', d.experience.length)}
      <div class="p-2">
        ${d.experience.map((x,i)=>`<div class="resume-entry-block">
          <div class="row g-2">
            <div class="col-md-6"><label>Company</label><input class="form-control form-control-sm" value="${escA(x.company)}" oninput="resumeData.experience[${i}].company=this.value;saveAndPreview()"></div>
            <div class="col-md-6"><label>Role</label><input class="form-control form-control-sm" value="${escA(x.role)}" oninput="resumeData.experience[${i}].role=this.value;saveAndPreview()"></div>
            <div class="col-12"><label>Dates</label><input class="form-control form-control-sm" placeholder="e.g. Jan 2022 – Present" value="${escA(x.date)}" oninput="resumeData.experience[${i}].date=this.value;saveAndPreview()"></div>
            <div class="col-12"><label>Bullet points (one per line)</label><textarea class="form-control form-control-sm" rows="4" oninput="resumeData.experience[${i}].bullets=this.value.split('\\n').map(s=>s.trim()).filter(Boolean);saveAndPreview()">${x.bullets.join('\n')}</textarea></div>
          </div>
          <div class="resume-entry-btns mt-1">
            <button class="btn btn-sm btn-outline-secondary" onclick="resumeData.experience.splice(${i}+1,0,JSON.parse(JSON.stringify(resumeData.experience[${i}])));saveResumeData();renderResumeBuilder()"><i class="bi bi-copy me-1"></i>Duplicate</button>
            <button class="btn btn-sm btn-outline-danger" onclick="resumeData.experience.splice(${i},1);saveResumeData();renderResumeBuilder()"><i class="bi bi-trash me-1"></i>Remove this job</button>
          </div>
        </div>`).join('')}
        <button class="btn btn-sm btn-outline-primary mt-1" onclick="resumeData.experience.push({company:'',role:'',date:'',bullets:[]});saveResumeData();renderResumeBuilder()"><i class="bi bi-plus-lg me-1"></i>Add job</button>
      </div>
    </details>`,

    projects: `<details class="resume-edit-section">
      ${resumeSectionSummary('projects', d.projects.length)}
      <div class="p-2">
        ${d.projects.map((p,i)=>`<div class="resume-entry-block">
          <div class="row g-2">
            <div class="col-md-6"><label>Project title</label><input class="form-control form-control-sm" value="${escA(p.title)}" oninput="resumeData.projects[${i}].title=this.value;saveAndPreview()"></div>
            <div class="col-md-6"><label>Tech stack</label><input class="form-control form-control-sm" value="${escA(p.tech)}" oninput="resumeData.projects[${i}].tech=this.value;saveAndPreview()"></div>
            <div class="col-12"><label>Dates</label><input class="form-control form-control-sm" value="${escA(p.date)}" oninput="resumeData.projects[${i}].date=this.value;saveAndPreview()"></div>
            <div class="col-12"><label>Bullet points (one per line)</label><textarea class="form-control form-control-sm" rows="3" oninput="resumeData.projects[${i}].bullets=this.value.split('\\n').map(s=>s.trim()).filter(Boolean);saveAndPreview()">${p.bullets.join('\n')}</textarea></div>
          </div>
          <div class="resume-entry-btns mt-1">
            <button class="btn btn-sm btn-outline-secondary" onclick="resumeData.projects.splice(${i}+1,0,JSON.parse(JSON.stringify(resumeData.projects[${i}])));saveResumeData();renderResumeBuilder()"><i class="bi bi-copy me-1"></i>Duplicate</button>
            <button class="btn btn-sm btn-outline-danger" onclick="resumeData.projects.splice(${i},1);saveResumeData();renderResumeBuilder()"><i class="bi bi-trash me-1"></i>Remove this project</button>
          </div>
        </div>`).join('')}
        <button class="btn btn-sm btn-outline-primary mt-1" onclick="resumeData.projects.push({title:'',tech:'',date:'',bullets:[]});saveResumeData();renderResumeBuilder()"><i class="bi bi-plus-lg me-1"></i>Add project</button>
      </div>
    </details>`,

    education: `<details class="resume-edit-section">
      ${resumeSectionSummary('education', d.education.length)}
      <div class="p-2">
        ${d.education.map((e,i)=>`<div class="resume-entry-block">
          <div class="row g-2">
            <div class="col-md-6"><label>Degree</label><input class="form-control form-control-sm" value="${escA(e.degree)}" oninput="resumeData.education[${i}].degree=this.value;saveAndPreview()"></div>
            <div class="col-md-4"><label>School</label><input class="form-control form-control-sm" value="${escA(e.school)}" oninput="resumeData.education[${i}].school=this.value;saveAndPreview()"></div>
            <div class="col-md-2"><label>Year</label><input class="form-control form-control-sm" value="${escA(e.year)}" oninput="resumeData.education[${i}].year=this.value;saveAndPreview()"></div>
            <div class="col-12"><label>Detail <span class="text-muted fw-normal">(optional)</span></label><input class="form-control form-control-sm" value="${escA(e.detail||'')}" oninput="resumeData.education[${i}].detail=this.value;saveAndPreview()"></div>
          </div>
          <div class="resume-entry-btns mt-1">
            <button class="btn btn-sm btn-outline-secondary" onclick="resumeData.education.splice(${i}+1,0,JSON.parse(JSON.stringify(resumeData.education[${i}])));saveResumeData();renderResumeBuilder()"><i class="bi bi-copy me-1"></i>Duplicate</button>
            <button class="btn btn-sm btn-outline-danger" onclick="resumeData.education.splice(${i},1);saveResumeData();renderResumeBuilder()"><i class="bi bi-trash me-1"></i>Remove</button>
          </div>
        </div>`).join('')}
        <button class="btn btn-sm btn-outline-primary mt-1" onclick="resumeData.education.push({degree:'',school:'',year:'',detail:''});saveResumeData();renderResumeBuilder()"><i class="bi bi-plus-lg me-1"></i>Add education</button>
      </div>
    </details>`,

    achievements: `<details class="resume-edit-section">
      ${resumeSectionSummary('achievements', d.achievements.length)}
      <div class="p-2">
        ${d.achievements.map((a,i)=>`<div class="resume-entry-block">
          <div class="row g-2">
            <div class="col-md-6"><label>Title</label><input class="form-control form-control-sm" value="${escA(a.title)}" oninput="resumeData.achievements[${i}].title=this.value;saveAndPreview()"></div>
            <div class="col-md-4"><label>Organization</label><input class="form-control form-control-sm" value="${escA(a.org)}" oninput="resumeData.achievements[${i}].org=this.value;saveAndPreview()"></div>
            <div class="col-md-2"><label>Date</label><input class="form-control form-control-sm" value="${escA(a.date)}" oninput="resumeData.achievements[${i}].date=this.value;saveAndPreview()"></div>
            <div class="col-12"><label>Bullet points (one per line)</label><textarea class="form-control form-control-sm" rows="2" oninput="resumeData.achievements[${i}].bullets=this.value.split('\\n').map(s=>s.trim()).filter(Boolean);saveAndPreview()">${a.bullets.join('\n')}</textarea></div>
          </div>
          <div class="resume-entry-btns mt-1">
            <button class="btn btn-sm btn-outline-secondary" onclick="resumeData.achievements.splice(${i}+1,0,JSON.parse(JSON.stringify(resumeData.achievements[${i}])));saveResumeData();renderResumeBuilder()"><i class="bi bi-copy me-1"></i>Duplicate</button>
            <button class="btn btn-sm btn-outline-danger" onclick="resumeData.achievements.splice(${i},1);saveResumeData();renderResumeBuilder()"><i class="bi bi-trash me-1"></i>Remove</button>
          </div>
        </div>`).join('')}
        <button class="btn btn-sm btn-outline-primary mt-1" onclick="resumeData.achievements.push({title:'',org:'',date:'',bullets:[]});saveResumeData();renderResumeBuilder()"><i class="bi bi-plus-lg me-1"></i>Add achievement</button>
      </div>
    </details>`,

    certifications: `<details class="resume-edit-section">
      ${resumeSectionSummary('certifications', d.certifications.length)}
      <div class="p-2">
        ${d.certifications.map((cert,i)=>`<div class="resume-entry-block">
          <div class="row g-2">
            <div class="col-md-6"><label>Certification name</label><input class="form-control form-control-sm" placeholder="e.g. AWS Certified Developer" value="${escA(cert.name)}" oninput="resumeData.certifications[${i}].name=this.value;saveAndPreview()"></div>
            <div class="col-md-4"><label>Issuer</label><input class="form-control form-control-sm" placeholder="e.g. Amazon Web Services" value="${escA(cert.issuer)}" oninput="resumeData.certifications[${i}].issuer=this.value;saveAndPreview()"></div>
            <div class="col-md-2"><label>Date</label><input class="form-control form-control-sm" placeholder="e.g. 2024" value="${escA(cert.date)}" oninput="resumeData.certifications[${i}].date=this.value;saveAndPreview()"></div>
            <div class="col-12"><label>Credential URL <span class="text-muted fw-normal">(optional)</span></label><input class="form-control form-control-sm" placeholder="https://..." value="${escA(cert.url||'')}" oninput="resumeData.certifications[${i}].url=this.value;saveAndPreview()"></div>
          </div>
          <div class="resume-entry-btns mt-1">
            <button class="btn btn-sm btn-outline-secondary" onclick="resumeData.certifications.splice(${i}+1,0,JSON.parse(JSON.stringify(resumeData.certifications[${i}])));saveResumeData();renderResumeBuilder()"><i class="bi bi-copy me-1"></i>Duplicate</button>
            <button class="btn btn-sm btn-outline-danger" onclick="resumeData.certifications.splice(${i},1);saveResumeData();renderResumeBuilder()"><i class="bi bi-trash me-1"></i>Remove</button>
          </div>
        </div>`).join('')}
        <button class="btn btn-sm btn-outline-primary mt-1" onclick="resumeData.certifications.push({name:'',issuer:'',date:'',url:''});saveResumeData();renderResumeBuilder()"><i class="bi bi-plus-lg me-1"></i>Add certification</button>
      </div>
    </details>`,

    languages: `<details class="resume-edit-section">
      ${resumeSectionSummary('languages', d.languages.length)}
      <div class="p-2">
        ${d.languages.map((lang,i)=>`<div class="resume-entry-row">
          <div class="flex-1">
            <input class="form-control form-control-sm mb-1" placeholder="Language, e.g. Spanish" value="${escA(lang.name)}" oninput="resumeData.languages[${i}].name=this.value;saveAndPreview()">
            <input class="form-control form-control-sm" placeholder="Proficiency, e.g. Conversational" value="${escA(lang.level)}" oninput="resumeData.languages[${i}].level=this.value;saveAndPreview()">
          </div>
          <div class="resume-entry-btns">
            <button class="btn btn-sm btn-outline-secondary" onclick="resumeData.languages.splice(${i}+1,0,JSON.parse(JSON.stringify(resumeData.languages[${i}])));saveResumeData();renderResumeBuilder()" title="Duplicate"><i class="bi bi-copy"></i></button>
            <button class="btn btn-sm btn-outline-danger" onclick="resumeData.languages.splice(${i},1);saveResumeData();renderResumeBuilder()" title="Remove"><i class="bi bi-trash"></i></button>
          </div>
        </div>`).join('')}
        <button class="btn btn-sm btn-outline-primary mt-1" onclick="resumeData.languages.push({name:'',level:''});saveResumeData();renderResumeBuilder()"><i class="bi bi-plus-lg me-1"></i>Add language</button>
      </div>
    </details>`,

    customSections: `<details class="resume-edit-section">
      ${resumeSectionSummary('customSections', d.customSections.length, '— Volunteering, Publications, Awards, Hobbies, anything')}
      <div class="p-2">
        ${d.customSections.map((sec,i)=>`<div class="resume-entry-block">
          <div class="row g-2">
            <div class="col-12"><label>Section title</label><input class="form-control form-control-sm" placeholder="e.g. Volunteer Experience" value="${escA(sec.title)}" oninput="resumeData.customSections[${i}].title=this.value;saveAndPreview()"></div>
            <div class="col-12"><label>Bullet points (one per line)</label><textarea class="form-control form-control-sm" rows="3" oninput="resumeData.customSections[${i}].bullets=this.value.split('\\n').map(s=>s.trim()).filter(Boolean);saveAndPreview()">${(sec.bullets||[]).join('\n')}</textarea></div>
          </div>
          <div class="resume-entry-btns mt-1">
            <button class="btn btn-sm btn-outline-secondary" onclick="resumeData.customSections.splice(${i}+1,0,{...JSON.parse(JSON.stringify(resumeData.customSections[${i}])),id:'sec-'+Date.now()});saveResumeData();renderResumeBuilder()"><i class="bi bi-copy me-1"></i>Duplicate</button>
            <button class="btn btn-sm btn-outline-danger" onclick="resumeData.customSections.splice(${i},1);saveResumeData();renderResumeBuilder()"><i class="bi bi-trash me-1"></i>Remove section</button>
          </div>
        </div>`).join('')}
        <button class="btn btn-sm btn-outline-primary mt-1" onclick="resumeData.customSections.push({id:'sec-'+Date.now(),title:'',bullets:[]});saveResumeData();renderResumeBuilder()"><i class="bi bi-plus-lg me-1"></i>Add a new section</button>
      </div>
    </details>`
  };

  const contactHTML = `<details class="resume-edit-section" open>
      <summary>Contact &amp; Title</summary>
      <div class="row g-2 p-2">
        <div class="col-md-6"><label>Full name</label><input class="form-control form-control-sm" value="${escA(d.name)}" oninput="resumeData.name=this.value;saveAndPreview()"></div>
        <div class="col-md-6"><label>Title / role</label><input class="form-control form-control-sm" value="${escA(d.title||'')}" oninput="resumeData.title=this.value;saveAndPreview()"></div>
        <div class="col-md-6"><label>Email</label><input class="form-control form-control-sm" value="${escA(d.email)}" oninput="resumeData.email=this.value;saveAndPreview()"></div>
        <div class="col-md-6"><label>Phone</label><input class="form-control form-control-sm" value="${escA(d.phone)}" oninput="resumeData.phone=this.value;saveAndPreview()"></div>
        <div class="col-12"><label>Location <span class="text-muted fw-normal">(city, country — optional)</span></label><input class="form-control form-control-sm" value="${escA(d.location||'')}" oninput="resumeData.location=this.value;saveAndPreview()"></div>
        <div class="col-12"><label>Links <span class="text-muted fw-normal">(LinkedIn, GitHub, portfolio…)</span></label>
          ${d.links.map((l,i)=>`<div class="d-flex gap-1 mb-1"><input class="form-control form-control-sm" style="max-width:110px" placeholder="Label" aria-label="Link label" value="${escA(l.label)}" oninput="resumeData.links[${i}].label=this.value;saveResumeData()"><input class="form-control form-control-sm" placeholder="linkedin.com/in/you" aria-label="Link address" value="${escA(l.url)}" oninput="setResumeLink(${i},this.value)"><button class="btn btn-sm btn-outline-danger" onclick="removeResumeLink(${i})" aria-label="Remove link"><i class="bi bi-x-lg"></i></button></div>`).join('')}
          <div class="d-flex gap-1 flex-wrap mt-1"><button class="btn btn-sm btn-outline-primary" onclick="addResumeLink('LinkedIn')">+ LinkedIn</button><button class="btn btn-sm btn-outline-primary" onclick="addResumeLink('GitHub')">+ GitHub</button><button class="btn btn-sm btn-outline-primary" onclick="addResumeLink('Portfolio')">+ Portfolio</button><button class="btn btn-sm btn-outline-secondary" onclick="addResumeLink('')">+ Other</button></div>
        </div>
      </div>
    </details>`;

  c.innerHTML = contactHTML
    + resumeData.sectionOrder.map(key => sectionHTML[key] || '').join('')
    + `<button class="btn btn-sm btn-outline-secondary mt-2" onclick="restoreResumeDefault()"><i class="bi bi-arrow-counterclockwise me-1"></i>Restore default template</button>`;
}

function resumePreviewHTML(){
  const d = resumeData;
  const sectionRenderers = {
    summary: () => d.summary ? `<h2>Summary</h2><p>${esc(d.summary)}</p>` : '',
    skills: () => d.skills.length ? `<h2>Skills</h2>${d.skills.filter(s=>s.cat||s.items).map(s=>`<div class="resume-skill-line"><strong>${esc(s.cat)}:</strong> ${esc(s.items)}</div>`).join('')}` : '',
    experience: () => d.experience.length ? `<h2>Work Experience</h2>${d.experience.filter(x=>x.company).map(x=>`<div class="resume-job"><div class="resume-row-head"><strong>${esc(x.company)}</strong><span>${esc(x.date)}</span></div><div class="resume-role">${esc(x.role)}</div><ul>${x.bullets.map(b=>`<li>${esc(b)}</li>`).join('')}</ul></div>`).join('')}` : '',
    projects: () => d.projects.length ? `<h2>Projects</h2>${d.projects.filter(p=>p.title).map(p=>`<div class="resume-job"><div class="resume-row-head"><strong>${esc(p.title)}</strong><span>${esc(p.date)}</span></div>${p.tech?`<div class="resume-role">${esc(p.tech)}</div>`:''}<ul>${p.bullets.map(b=>`<li>${esc(b)}</li>`).join('')}</ul></div>`).join('')}` : '',
    education: () => d.education.length ? `<h2>Education</h2>${d.education.filter(e=>e.degree).map(e=>`<div class="resume-edu"><div class="resume-row-head"><strong>${esc(e.degree)}</strong><span>${esc(e.year)}</span></div><div class="resume-role">${esc(e.school)}</div>${e.detail?`<div class="resume-detail">${esc(e.detail)}</div>`:''}</div>`).join('')}` : '',
    achievements: () => d.achievements.length ? `<h2>Achievements</h2>${d.achievements.filter(a=>a.title).map(a=>`<div class="resume-job"><div class="resume-row-head"><strong>${esc(a.title)}</strong><span>${esc(a.date)}</span></div>${a.org?`<div class="resume-role">${esc(a.org)}</div>`:''}<ul>${a.bullets.map(b=>`<li>${esc(b)}</li>`).join('')}</ul></div>`).join('')}` : '',
    certifications: () => d.certifications.length ? `<h2>Certifications</h2>${d.certifications.filter(cert=>cert.name).map(cert=>`<div class="resume-edu"><div class="resume-row-head"><strong>${esc(cert.name)}</strong><span>${esc(cert.date)}</span></div><div class="resume-role">${esc(cert.issuer)}</div>${cert.url?`<div class="resume-detail">${esc(cert.url)}</div>`:''}</div>`).join('')}` : '',
    languages: () => d.languages.length ? `<h2>Languages</h2>${d.languages.filter(l=>l.name).map(l=>`<div class="resume-skill-line"><strong>${esc(l.name)}:</strong> ${esc(l.level)}</div>`).join('')}` : '',
    customSections: () => (d.customSections||[]).filter(sec=>sec.title).map(sec=>`<h2>${esc(sec.title)}</h2><ul>${(sec.bullets||[]).map(b=>`<li>${esc(b)}</li>`).join('')}</ul>`).join('')
  };
  const contact = [d.email, d.phone, d.location].filter(x=>x && x.trim()).map(esc)
    .concat(d.links.filter(l=>l.url.trim()).map(l=>{ const u = normUrl(l.url); return u ? `<a href="${escA(safeUrl(u))}" target="_blank" rel="noopener noreferrer">${esc(resumeLinkShort(l.url))}</a>` : esc(l.url); }));
  return `
    <h1>${esc(d.name)}</h1>
    ${d.title ? `<div class="resume-headline">${esc(d.title)}</div>` : ''}
    <div class="resume-contact">${contact.join(' &nbsp;•&nbsp; ')}</div>
    ${resumeVisible().map(key => sectionRenderers[key] ? sectionRenderers[key]() : '').join('')}
  `;
}

function updateResumePreview(){
  const p = document.getElementById('resume-preview');
  if(p){ p.innerHTML = resumePreviewHTML(); applyResumeStyle(p); fitResumePreview(); }
  updateATSScore();
  renderResumeHealth();
}

// ===================== RESUME: design, health check, smarter ATS, exports, job tracker =====================
const RESUME_DEFAULT_STYLE = {template:'classic', accent:'#1f3a7a', font:'serif', size:'m', page:'a4'};
const RESUME_ACCENTS = ['#1f3a7a','#0f766e','#7c2d12','#6d28d9','#be123c','#111827'];
const RESUME_ALL_SECTIONS = ['summary','skills','experience','projects','education','achievements','certifications','languages','customSections'];
const RESUME_SCHEMA = {
  skills:['cat','items'], experience:['company','role','date'], projects:['title','tech','date'], education:['degree','school','year','detail'],
  achievements:['title','org','date'], certifications:['name','issuer','date','url'], languages:['name','level'], customSections:['id','title']
};
const RESUME_BULLET_LISTS = ['experience','projects','achievements','customSections'];
// Makes any resume object (old saves, imported JSON) safe and complete: right types, every new field present.
function resumeMigrate(d){
  if(!d || typeof d!=='object') return d;
  Object.entries(RESUME_SCHEMA).forEach(([k,fields])=>{
    d[k] = (Array.isArray(d[k]) ? d[k] : []).filter(x=>x && typeof x==='object').map(x=>{
      fields.forEach(f=>{ x[f] = x[f]==null ? '' : String(x[f]); });
      if(RESUME_BULLET_LISTS.includes(k)) x.bullets = (Array.isArray(x.bullets) ? x.bullets : []).map(b=>String(b));
      return x;
    });
  });
  ['name','title','email','phone','summary','location','jd'].forEach(k=>{ d[k] = d[k]==null ? '' : String(d[k]); });
  d.links = (Array.isArray(d.links) ? d.links : []).filter(l=>l && typeof l==='object').map(l=>({label:String(l.label||''), url:String(l.url||'')})).slice(0,8);
  d.hidden = (Array.isArray(d.hidden) ? d.hidden : []).filter(k=>RESUME_ALL_SECTIONS.includes(k));
  d.sectionOrder = (Array.isArray(d.sectionOrder) ? d.sectionOrder : []).filter(k=>RESUME_ALL_SECTIONS.includes(k));
  RESUME_ALL_SECTIONS.forEach(k=>{ if(!d.sectionOrder.includes(k)) d.sectionOrder.push(k); });
  const st = {...RESUME_DEFAULT_STYLE, ...(d.style && typeof d.style==='object' ? d.style : {})};
  if(!['classic','modern','compact'].includes(st.template)) st.template = 'classic';
  if(!['serif','sans'].includes(st.font)) st.font = 'serif';
  if(!['s','m','l'].includes(st.size)) st.size = 'm';
  if(!['a4','letter'].includes(st.page)) st.page = 'a4';
  if(!/^#[0-9a-f]{6}$/i.test(st.accent)) st.accent = RESUME_DEFAULT_STYLE.accent;
  d.style = st;
  return d;
}
resumeMigrate(resumeData);
const resumeVisible = () => resumeData.sectionOrder.filter(k=>!resumeData.hidden.includes(k));
function toggleResumeSection(key){
  const h = resumeData.hidden, i = h.indexOf(key);
  if(i>=0) h.splice(i,1); else h.push(key);
  saveResumeData(); renderResumeEditor(); updateResumePreview();
}
// ---- contact: location + links ----
function resumeLinkShort(u){ return String(u||'').replace(/^https?:\/\//i,'').replace(/^www\./i,'').replace(/\/$/,''); }
function resumeContactList(){
  const d = resumeData;
  return [d.email, d.phone, d.location, ...d.links.map(l=>resumeLinkShort(l.url))].filter(x=>x && String(x).trim());
}
function addResumeLink(label){
  if(resumeData.links.length >= 8){ alert('You can add up to 8 links.'); return; }
  resumeData.links.push({label:label||'', url:''}); saveResumeData(); renderResumeEditor();
}
function setResumeLink(i, url){ if(resumeData.links[i]){ resumeData.links[i].url = url; saveAndPreview(); } }
function removeResumeLink(i){ resumeData.links.splice(i,1); saveResumeData(); renderResumeEditor(); updateResumePreview(); }

// ---- look & layout ----
function applyResumeStyle(el){
  if(!el) return;
  const st = resumeData.style;
  el.className = el.className.replace(/\b(rt|rf|rs)-\w+/g,'').trim();
  el.classList.add('resume-doc','rt-'+st.template,'rf-'+st.font,'rs-'+st.size);
  el.style.setProperty('--ra', st.accent);
}
function resumePageSpec(){
  const letter = resumeData.style.page==='letter';
  const wMm = letter ? 215.9 : 210, hMm = letter ? 279.4 : 297, mMm = 12, px = mm => mm*96/25.4;
  return {letter, widthPx:px(wMm), marginPx:px(mMm), innerPx:px(hMm-2*mMm), label: letter ? 'Letter' : 'A4'};
}
let _resumePages = null;
// Shows the resume at true paper size (scaled to fit), draws page-break guides and works out the page count.
function fitResumePreview(){
  const paper = document.getElementById('resume-preview'), box = document.getElementById('resume-paper-box');
  if(!paper || !box || !paper.offsetWidth) return;      // tab not visible: nothing to measure yet (re-run when it is shown)
  const spec = resumePageSpec();
  paper.style.width = spec.widthPx + 'px';
  paper.style.padding = spec.marginPx + 'px';
  paper.querySelectorAll('.resume-page-guide').forEach(g=>g.remove());
  const contentH = paper.scrollHeight - 2*spec.marginPx;
  const pages = Math.max(0.05, contentH / spec.innerPx);
  _resumePages = pages;
  for(let k=1; k<Math.ceil(pages-0.02); k++){
    const g = document.createElement('div'); g.className = 'resume-page-guide'; g.style.top = (spec.marginPx + k*spec.innerPx) + 'px';
    g.innerHTML = '<span title="Page '+(k+1)+' starts here">page '+(k+1)+'</span>';
    paper.appendChild(g);
  }
  const k = Math.min(1, (box.clientWidth || spec.widthPx) / spec.widthPx);
  paper.style.transform = 'scale('+k+')';
  box.style.height = (paper.offsetHeight * k) + 'px';
  const info = document.getElementById('resume-page-info');
  if(info){
    const p1 = Math.round(pages*10)/10;
    const cls = pages <= 1.02 ? 'ok' : pages <= 2.02 ? 'warn' : 'bad';
    info.className = 'resume-page-info ' + cls;
    info.innerHTML = `<i class="bi ${cls==='ok'?'bi-check-circle-fill':'bi-file-earmark-text'} me-1"></i>≈ ${p1<=1?'1 page':p1+' pages'} on ${spec.label}` +
      (pages > 1.02 ? ` · <button type="button" class="btn btn-link btn-sm p-0 align-baseline" onclick="autoFitResume()">Fit to one page</button>` : '');
  }
}
function setResumeStyle(key, val){
  resumeData.style[key] = val;
  saveResumeData(); renderResumeDesign(); updateResumePreview();
}
// Tries tighter layouts until the resume fits on one page; leaves it alone if it can't.
function autoFitResume(){
  const st = resumeData.style, orig = {...st};
  if(_resumePages!==null && _resumePages <= 1.02){ if(window.UI) UI.toast('Already fits on one page'); return; }
  const tries = [{size:'m'},{size:'s'},{template:'compact',size:'m'},{template:'compact',size:'s'}];
  for(const t of tries){
    Object.assign(st, orig, t);
    const p = document.getElementById('resume-preview'); if(p){ p.innerHTML = resumePreviewHTML(); applyResumeStyle(p); fitResumePreview(); }
    if(_resumePages <= 1.02){ saveResumeData(); renderResumeDesign(); updateResumePreview(); if(window.UI) UI.toast('Fitted to one page'); return; }
  }
  Object.assign(st, orig); updateResumePreview();
  alert('Even the tightest layout runs over one page. Shorten some bullets, hide a section (the eye icon) or drop older roles.');
}
function renderResumeDesign(){
  const box = document.getElementById('resume-design'); if(!box) return;
  const st = resumeData.style;
  const seg = (key, opts) => `<div class="btn-group btn-group-sm" role="group" aria-label="${key}">${opts.map(([v,l])=>`<button type="button" class="btn ${st[key]===v?'btn-dark':'btn-outline-secondary'}" onclick="setResumeStyle('${key}','${v}')">${l}</button>`).join('')}</div>`;
  box.innerHTML = `
    <div class="d-flex flex-wrap gap-3 align-items-center">
      <div><div class="small text-muted mb-1">Template</div>${seg('template',[['classic','Classic'],['modern','Modern'],['compact','Compact']])}</div>
      <div><div class="small text-muted mb-1">Font</div>${seg('font',[['serif','Serif'],['sans','Sans']])}</div>
      <div><div class="small text-muted mb-1">Text size</div>${seg('size',[['s','Small'],['m','Medium'],['l','Large']])}</div>
      <div><div class="small text-muted mb-1">Paper</div>${seg('page',[['a4','A4'],['letter','Letter']])}</div>
      <div><div class="small text-muted mb-1">Accent colour <span class="text-muted">(Modern)</span></div>
        <div class="d-flex gap-1 align-items-center">${RESUME_ACCENTS.map(c=>`<button type="button" class="resume-swatch ${st.accent.toLowerCase()===c?'on':''}" style="background:${c}" onclick="setResumeStyle('accent','${c}')" aria-label="Accent ${c}"></button>`).join('')}
        <label class="resume-swatch custom" title="Pick any colour"><i class="bi bi-plus"></i><input type="color" value="${escA(st.accent)}" onchange="setResumeStyle('accent',this.value)" aria-label="Custom accent colour"></label></div></div>
    </div>`;
}

// ---- resume health check (rules of thumb, not a verdict) ----
const RESUME_WEAK_STARTS = ['responsible for','worked on','helped','assisted','tasked with','duties included','in charge of','involved in','participated in','handled','dealt with'];
const RESUME_STRONG = new Set(('led built designed developed delivered launched created improved reduced increased managed owned drove implemented optimized optimised automated migrated architected mentored coached negotiated analyzed analysed resolved streamlined established introduced shipped scaled secured simplified trained planned organized organised coordinated generated saved won grew cut boosted achieved earned supported presented wrote tested deployed maintained refactored integrated configured monitored researched evaluated reviewed audited produced processed sold served advised hired onboarded redesigned rebuilt initiated spearheaded executed administered operated prepared leveraged championed collaborated contributed partnered translated unified standardized standardised modernized modernised accelerated eliminated expanded consolidated diagnosed investigated documented facilitated mapped forecasted budgeted recruited supervised directed oversaw cleared closed raised published taught guided assembled drafted').split(' '));
const RESUME_METRIC_RE = /\d|%|[$€£₹]|\b(?:dozens|hundreds|thousands|millions?|billions?|double[ds]?|triple[ds]?|half)\b/i;
function resumeBullets(){
  const d = resumeData, vis = new Set(resumeVisible()), out = [];
  const add = (sec, label, arr) => (arr||[]).forEach(b=>{ if(b && String(b).trim()) out.push({sec, label, text:String(b).trim()}); });
  if(vis.has('experience')) d.experience.forEach(x=>add('Experience', x.company||x.role||'a job', x.bullets));
  if(vis.has('projects')) d.projects.forEach(x=>add('Projects', x.title||'a project', x.bullets));
  if(vis.has('achievements')) d.achievements.forEach(x=>add('Achievements', x.title||'an award', x.bullets));
  if(vis.has('customSections')) d.customSections.forEach(x=>add(x.title||'Custom', x.title||'section', x.bullets));
  return out;
}
function resumeHealth(){
  const d = resumeData, vis = new Set(resumeVisible()), issues = [];
  const bad = (title, items) => issues.push({lv:'bad', title, items});
  const warn = (title, items) => issues.push({lv:'warn', title, items});
  const tip = (title, items) => issues.push({lv:'tip', title, items});
  const clip = (s,n) => s.length>n ? s.slice(0,n)+'…' : s;
  // 1. placeholders & contact basics
  const all = [d.name,d.title,d.summary,d.email,d.phone,d.location, ...d.skills.map(s=>s.cat+' '+s.items), ...resumeBullets().map(b=>b.text),
    ...d.experience.flatMap(x=>[x.company,x.role,x.date]), ...d.education.flatMap(e=>[e.degree,e.school,e.year])].join(' \n ');
  const ph = (all.match(/\[[^\]\n]{2,60}\]/g)||[]);
  if(ph.length) bad(ph.length+' placeholder'+(ph.length===1?'':'s')+' like '+ph[0]+' still need replacing', ph.slice(0,4));
  if(!d.name.trim() || /your full name/i.test(d.name)) bad('Add your real name');
  if(!d.email.trim() || /you@example\.com/i.test(d.email)) bad('Add your real email address');
  else if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email.trim())) warn('That email address looks incomplete', [d.email]);
  if(!d.phone.trim() || /\+00 00000/.test(d.phone)) warn('Add a phone number (recruiters like to call)');
  if(!d.links.some(l=>/linkedin/i.test(l.url))) tip('Add your LinkedIn link under Contact — most recruiters look for it');
  // 2. summary
  if(vis.has('summary')){
    const words = d.summary.trim().split(/\s+/).filter(Boolean).length;
    if(!words) warn('Write a short summary (2–3 lines) aimed at the job you want');
    else if(words < 18) tip('Your summary is very short ('+words+' words) — aim for about 25–60');
    else if(words > 90) tip('Your summary is long ('+words+' words) — trim it to 2–4 lines');
    if(/\b(i|my|me)\b/i.test(d.summary)) tip('Avoid first-person words (I, my) in the summary — write it without them');
  }
  // 3. bullets
  const bullets = resumeBullets().filter(b=>!/\[[^\]]+\]/.test(b.text));
  if(bullets.length){
    const weak = bullets.filter(b=>RESUME_WEAK_STARTS.some(w=>b.text.toLowerCase().startsWith(w)));
    if(weak.length) warn(weak.length+' bullet'+(weak.length===1?'':'s')+' start with a weak phrase ("responsible for", "worked on"…) — start with what you did', weak.slice(0,3).map(b=>clip(b.text,70)));
    const noVerb = bullets.filter(b=>{
      const w = (b.text.toLowerCase().match(/^[a-z]+/)||[''])[0];
      return !weak.includes(b) && w && !RESUME_STRONG.has(w) && !RESUME_STRONG.has(w.replace(/s$/,'')) && !/ed$/.test(w) && !/^(?:built|led|ran|won|grew|cut|drove|wrote|made|set|sold|taught|spent|brought|began|chose|found|held|kept|met|paid|put|read|sent|took|thought|understood|oversaw)$/.test(w);
    });
    if(noVerb.length) tip(noVerb.length+' bullet'+(noVerb.length===1?'':'s')+' don\'t start with an action verb (Led, Built, Reduced, Delivered…)', noVerb.slice(0,3).map(b=>clip(b.text,70)));
    const withNum = bullets.filter(b=>RESUME_METRIC_RE.test(b.text)).length;
    if(withNum/bullets.length < 0.4) warn('Only '+withNum+' of '+bullets.length+' bullets include a number — add %, money, team size, volume or time saved');
    const long = bullets.filter(b=>b.text.length > 230 || b.text.split(/\s+/).length > 38);
    if(long.length) tip(long.length+' bullet'+(long.length===1?' is':'s are')+' very long — keep each to about 1–2 lines', long.slice(0,2).map(b=>clip(b.text,70)));
    const short = bullets.filter(b=>b.text.split(/\s+/).length < 5);
    if(short.length) tip(short.length+' bullet'+(short.length===1?' is':'s are')+' very short — say what you did and the result', short.slice(0,2).map(b=>b.text));
    const firsts = {}; bullets.forEach(b=>{ const w = (b.text.toLowerCase().match(/^[a-z]+/)||[''])[0]; if(w) firsts[w] = (firsts[w]||0)+1; });
    const rep = Object.entries(firsts).filter(([w,n])=>n>=3 && RESUME_STRONG.has(w)||n>=4).sort((a,b)=>b[1]-a[1])[0];
    if(rep) tip('"'+rep[0]+'" starts '+rep[1]+' bullets — vary your opening verbs');
  }
  if(vis.has('experience')){
    d.experience.forEach((x,i)=>{
      const n = x.bullets.filter(b=>b.trim()).length;
      if(x.company && n===0) warn('"'+x.company+'" has no bullet points');
      else if(n > 7) tip('"'+(x.company||'A job')+'" has '+n+' bullets — keep the strongest 4–6');
    });
    const dates = d.experience.map(x=>x.date).filter(Boolean);
    const kinds = new Set(dates.map(s=>/[A-Za-z]{3,}\s*\d{4}/.test(s) ? 'Mon YYYY' : /\d{1,2}[\/.-]\d{4}/.test(s) ? 'MM/YYYY' : /^\s*\d{4}/.test(s) ? 'YYYY' : 'other'));
    if(kinds.size > 1) tip('Date formats are mixed ('+[...kinds].join(', ')+') — pick one style, e.g. Mon YYYY');
    if(d.experience.some(x=>x.company && !x.date.trim())) warn('Some jobs have no dates');
  }
  if(vis.has('skills') && !d.skills.some(s=>s.items.trim() && !/^\[/.test(s.items))) warn('Add your key skills (use the same words as the job advert)');
  if(vis.has('education') && !d.education.some(e=>e.degree.trim() && !/^\[/.test(e.degree))) tip('Add your education (or hide the section with the eye icon)');
  // 4. length
  if(_resumePages!==null){
    if(_resumePages > 2.05) bad('The resume is about '+(Math.round(_resumePages*10)/10)+' pages — cut it to 2 pages or fewer');
    else if(_resumePages > 1.05) tip('It runs to about '+(Math.round(_resumePages*10)/10)+' pages. One page is ideal under ~10 years of experience (try "Fit to one page")');
  }
  const pen = {bad:14, warn:7, tip:3};
  const score = Math.max(0, 100 - issues.reduce((n,i)=>n+pen[i.lv],0));
  return {score, issues};
}
function renderResumeHealth(){
  const box = document.getElementById('resume-health'); if(!box) return;
  const {score, issues} = resumeHealth();
  const color = score>=85?'#16a34a':score>=65?'#2563eb':score>=40?'#d97706':'#dc2626';
  const label = score>=85?'Strong':score>=65?'Good':score>=40?'Needs work':'Rough draft';
  const ic = {bad:['bi-x-octagon-fill','#dc2626'], warn:['bi-exclamation-triangle-fill','#d97706'], tip:['bi-lightbulb-fill','#2563eb']};
  box.innerHTML = `<div class="d-flex align-items-center gap-3 mb-2"><div style="font-size:1.9rem;font-weight:800;color:${color};line-height:1">${score}</div>
      <div class="small text-muted"><b style="color:${color}">${label}</b><br>${issues.length ? issues.length+' thing'+(issues.length===1?'':'s')+' to look at' : 'Nothing to fix — nice work'}</div></div>` +
    issues.map(i=>`<div class="resume-issue"><i class="bi ${ic[i.lv][0]}" style="color:${ic[i.lv][1]}" aria-hidden="true"></i><div><div>${esc(i.title)}</div>${i.items&&i.items.length?`<div class="resume-issue-eg">${i.items.map(x=>`<span>${esc(x)}</span>`).join('')}</div>`:''}</div></div>`).join('');
}

// ---- smarter ATS keyword match ----
const ATS_STOP = new Set('the and a an to of in on for with is are as at by or be this that from will have has you your we our they their it its who what why how can able about into over under between through both may might could would should must also than then them these those such other more most any all each per one two three not but get got just very well while where when there here out up down off use using used new make made take taking including include includes etc plus nice good great strong excellent proven demonstrated required preferred responsibilities responsibility looking join role position candidate candidates experience experienced years year work working team teams ability skills skill knowledge understanding familiarity proficiency proficient relevant related across within ensure help support opportunity company business environment minimum degree bachelor master equivalent similar based high level day time need needs want best part full while ideal seeking responsible duties qualifications requirements benefits salary apply essential critical key important strongly highly net'.split(' '));
const ATS_TECH = ['asp.net core','asp.net','entity framework core','entity framework','ef core','c#','.net core','.net','ci/cd','rest api','restful','web api','microservices','sql server','azure devops','azure','aws','gcp','docker','kubernetes','git','linq','blazor','signalr','grpc','rabbitmq','redis','kafka','mongodb','postgresql','mysql','oracle','angular','react','vue','typescript','javascript','node.js','python','java','sql','nosql','agile','scrum','tdd','unit testing','design patterns','dependency injection','oauth','jwt','html','css','tailwind','terraform','jenkins','github actions','selenium','jira','excel','power bi','tableau','salesforce','sap','project management','stakeholder management','customer service','data analysis','machine learning','api','cloud','security','testing','automation'];
function atsEscape(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
function atsHas(text, term){
  if(/^[^a-z0-9]|[^a-z0-9]$/.test(term)) return text.includes(term);
  if(new RegExp('(^|[^a-z0-9+#])'+atsEscape(term)+'($|[^a-z0-9+#])').test(text)) return true;
  if(!term.includes(' ') && term.length >= 6){                      // "managing" ~ "management"
    const stem = term.replace(/(ing|ment|ation|ions?|ed|es|s)$/,'');
    if(stem.length >= 5) return new RegExp('(^|[^a-z0-9])'+atsEscape(stem)).test(text);
  }
  return false;
}
function atsExtract(jd){
  const text = ' ' + jd.toLowerCase().replace(/[\n\r\t]+/g,' ') + ' ';
  const terms = new Map();                                           // term -> weight
  ATS_TECH.forEach(t=>{ const m = text.match(new RegExp('(^|[^a-z0-9+#])'+atsEscape(t)+'(?=$|[^a-z0-9+#])','g')); if(m) terms.set(t, 3 + m.length); });
  const words = text.replace(/[^a-z0-9+#.\s/-]/g,' ').split(/\s+/).map(w=>w.replace(/^[.\-/]+|[.\-/]+$/g,'')).filter(Boolean);
  const ok = w => w.length > 2 && !ATS_STOP.has(w) && !/^\d+$/.test(w);
  const uni = new Map(), bi = new Map();
  words.forEach((w,i)=>{ if(ok(w)) uni.set(w,(uni.get(w)||0)+1); if(ok(w) && ok(words[i+1]||'')){ const b = w+' '+words[i+1]; bi.set(b,(bi.get(b)||0)+1); } });
  bi.forEach((n,b)=>{ if(n >= 2 && !terms.has(b)) terms.set(b, 2 + n); });
  const short = words.length < 70;
  uni.forEach((n,w)=>{ if((n >= 2 || short) && !terms.has(w)) terms.set(w, n); });
  // "asp.net" and "asp.net core" are one skill: keep only the longer known phrase
  [...terms.keys()].forEach(t=>{ if(ATS_TECH.includes(t) && [...terms.keys()].some(u=>u!==t && ATS_TECH.includes(u) && u.length>t.length && u.includes(t))) terms.delete(t); });
  const chosen = [...terms.entries()].sort((a,b)=>b[1]-a[1]).slice(0,45);
  const phrases = chosen.filter(([t])=>t.includes(' ')).map(([t])=>t);
  return chosen.filter(([t])=>t.includes(' ') || !phrases.some(p=>p.split(' ').includes(t) && !ATS_TECH.includes(t)));
}
function resumeToPlainText(){
  return resumeModel().map(b=>[b.title, ...(b.paras||[]), ...(b.lines||[]).map(l=>l.b+' '+l.t), ...(b.entries||[]).flatMap(e=>[e.head,e.sub,e.note,...e.bullets])].join(' ')).join(' ').concat(' ', resumeData.name, ' ', resumeData.title).toLowerCase();
}
function onJdInput(v){
  resumeData.jd = v;
  clearTimeout(window._jdT); window._jdT = setTimeout(()=>{ saveResumeData(); updateATSScore(); }, 350);
}
function syncJdBox(){ const el = document.getElementById('resume-jd-input'); if(el) el.value = resumeData.jd || ''; updateATSScore(); }
function updateATSScore(){
  const jdEl = document.getElementById('resume-jd-input'), box = document.getElementById('resume-ats-result');
  if(!jdEl || !box) return;
  const jdText = jdEl.value.trim();
  if(!jdText){ box.innerHTML = '<p class="small text-muted mb-0">Paste a job description above to see your keyword score and what is missing.</p>'; return; }
  const terms = atsExtract(jdText), text = resumeToPlainText();
  if(!terms.length){ box.innerHTML = '<p class="small text-muted mb-0">Paste a longer job description so there are keywords to compare.</p>'; return; }
  const total = terms.reduce((n,[,w])=>n+w,0);
  const hit = [], miss = [];
  terms.forEach(([t,w])=> (atsHas(text,t) ? hit : miss).push([t,w]));
  const score = Math.round(hit.reduce((n,[,w])=>n+w,0) / total * 100);
  const color = score>=70?'#16a34a':score>=40?'#d97706':'#dc2626';
  box.innerHTML = `
    <div class="d-flex align-items-center gap-3 mb-2"><div style="font-size:1.9rem;font-weight:800;color:${color};line-height:1">${score}%</div>
      <div class="small text-muted">Weighted keyword match<br>${hit.length} of ${terms.length} key terms found</div></div>
    ${miss.length ? `<div class="small mb-2"><strong>Missing</strong> <span class="text-muted">— tap + to add one to your skills (only if it is true for you)</span><div class="mt-1">${miss.slice(0,20).map(([t])=>`<button type="button" class="ats-chip miss" onclick="addResumeKeyword(this.dataset.k)" data-k="${escA(t)}" title="Add to skills">${esc(t)} <i class="bi bi-plus-lg"></i></button>`).join('')}</div></div>` : ''}
    ${hit.length ? `<div class="small"><strong>Found</strong><div class="mt-1">${hit.slice(0,24).map(([t])=>`<span class="ats-chip hit">${esc(t)}</span>`).join('')}</div></div>` : ''}`;
}
function addResumeKeyword(term){
  term = String(term||'').trim(); if(!term) return;
  const cat = 'Keywords from job description';
  let g = resumeData.skills.find(s=>s.cat===cat);
  if(!g){ g = {cat, items:''}; resumeData.skills.push(g); }
  if(!g.items.toLowerCase().split(/\s*,\s*/).includes(term.toLowerCase())) g.items = g.items ? g.items + ', ' + term : term;
  saveResumeData(); renderResumeEditor(); updateResumePreview();
  if(window.UI) UI.toast('Added "'+term+'" to Skills');
}
function checkATSMatch(){ updateATSScore(); }

// ---- one model, many exports ----
function resumeModel(){
  const d = resumeData, out = [];
  resumeVisible().forEach(k=>{
    if(k==='summary' && d.summary.trim()) out.push({title:'Summary', paras:[d.summary.trim()]});
    else if(k==='skills'){ const lines = d.skills.filter(s=>s.cat.trim()||s.items.trim()).map(s=>({b:s.cat.trim(), t:s.items.trim()})); if(lines.length) out.push({title:'Skills', lines}); }
    else if(k==='experience'){ const e = d.experience.filter(x=>x.company.trim()).map(x=>({head:x.company, date:x.date, sub:x.role, note:'', bullets:x.bullets.filter(b=>b.trim())})); if(e.length) out.push({title:'Work Experience', entries:e}); }
    else if(k==='projects'){ const e = d.projects.filter(x=>x.title.trim()).map(x=>({head:x.title, date:x.date, sub:x.tech, note:'', bullets:x.bullets.filter(b=>b.trim())})); if(e.length) out.push({title:'Projects', entries:e}); }
    else if(k==='education'){ const e = d.education.filter(x=>x.degree.trim()).map(x=>({head:x.degree, date:x.year, sub:x.school, note:x.detail, bullets:[]})); if(e.length) out.push({title:'Education', entries:e}); }
    else if(k==='achievements'){ const e = d.achievements.filter(x=>x.title.trim()).map(x=>({head:x.title, date:x.date, sub:x.org, note:'', bullets:x.bullets.filter(b=>b.trim())})); if(e.length) out.push({title:'Achievements', entries:e}); }
    else if(k==='certifications'){ const e = d.certifications.filter(x=>x.name.trim()).map(x=>({head:x.name, date:x.date, sub:x.issuer, note:x.url, bullets:[]})); if(e.length) out.push({title:'Certifications', entries:e}); }
    else if(k==='languages'){ const lines = d.languages.filter(x=>x.name.trim()).map(x=>({b:x.name.trim(), t:x.level.trim()})); if(lines.length) out.push({title:'Languages', lines}); }
    else if(k==='customSections') d.customSections.filter(s=>s.title.trim()).forEach(s=>out.push({title:s.title.trim(), entries:[{head:'', date:'', sub:'', note:'', bullets:s.bullets.filter(b=>b.trim())}]}));
  });
  return out;
}
function resumeFileBase(){ return (resumeData.name||'resume').trim().replace(/[^\w.-]+/g,'_').replace(/^_+|_+$/g,'') || 'resume'; }
function downloadResumeTxt(){
  const d = resumeData;
  let txt = d.name + '\n' + [d.title, ...resumeContactList()].filter(Boolean).join(' | ') + '\n\n';
  resumeModel().forEach(b=>{
    txt += b.title.toUpperCase() + '\n';
    (b.paras||[]).forEach(p=>{ txt += p + '\n'; });
    (b.lines||[]).forEach(l=>{ txt += (l.b ? l.b + ': ' : '') + l.t + '\n'; });
    (b.entries||[]).forEach(e=>{
      const head = [e.head, e.sub].filter(Boolean).join(' — ') + (e.date ? ' (' + e.date + ')' : '');
      if(head) txt += head + '\n';
      if(e.note) txt += e.note + '\n';
      e.bullets.forEach(x=>{ txt += '- ' + x + '\n'; });
    });
    txt += '\n';
  });
  downloadBlob(new Blob([txt.trim()+'\n'], {type:'text/plain'}), resumeFileBase() + '_ATS.txt');
}
function downloadResumeMd(){
  const d = resumeData;
  let md = '# ' + d.name + '\n\n' + [d.title, ...resumeContactList()].filter(Boolean).join(' · ') + '\n\n';
  resumeModel().forEach(b=>{
    md += '## ' + b.title + '\n\n';
    (b.paras||[]).forEach(p=>{ md += p + '\n\n'; });
    if(b.lines) md += b.lines.map(l=>'- ' + (l.b ? '**' + l.b + ':** ' : '') + l.t).join('\n') + '\n\n';
    (b.entries||[]).forEach(e=>{
      const head = [e.head && '**' + e.head + '**', e.sub].filter(Boolean).join(' — ') + (e.date ? ' _(' + e.date + ')_' : '');
      if(head) md += head + '\n\n';
      if(e.note) md += e.note + '\n\n';
      if(e.bullets.length) md += e.bullets.map(x=>'- ' + x).join('\n') + '\n\n';
    });
  });
  downloadBlob(new Blob([md.trim()+'\n'], {type:'text/markdown'}), resumeFileBase() + '.md');
}
function downloadResumeJson(){
  const payload = {app:'dotnet-tracker-resume', version:1, exportedAt:new Date().toISOString(), resume:resumeData};
  downloadBlob(new Blob([JSON.stringify(payload,null,2)], {type:'application/json'}), resumeFileBase() + '_resume.json');
}
function importResumeJson(e){
  const file = e.target.files[0]; e.target.value=''; if(!file) return;
  if(file.size > 2*1024*1024){ alert('That file is too large to be a resume export.'); return; }
  const r = new FileReader();
  r.onload = ()=>{
    let obj; try{ obj = JSON.parse(r.result); }catch(err){ alert('That file is not valid JSON.'); return; }
    const src = obj && obj.resume && typeof obj.resume==='object' ? obj.resume : obj;
    if(!src || typeof src!=='object' || Array.isArray(src) || typeof src.name!=='string'){ alert('This does not look like a resume export from this app.'); return; }
    if(!confirm('Replace your current resume with "'+src.name+'"? Your current one is saved first as a version called "Backup before import".')) return;
    resumeVersions.push({id:'ver-'+Date.now(), name:'Backup before import '+new Date().toLocaleDateString(), data:JSON.parse(JSON.stringify(resumeData)), savedAt:Date.now()});
    lsSave('dotnet_resume_versions', resumeVersions);
    resumeData = resumeMigrate(JSON.parse(JSON.stringify(src)));
    activeResumeVersionId = null; localStorage.removeItem('dotnet_resume_active_version');
    saveResumeData(); renderResumeBuilder();
    if(window.UI) UI.toast('Resume imported');
  };
  r.readAsText(file);
}
// ---- Word (.docx): real bullets, right-aligned dates, no tables or text boxes, so ATS software reads it cleanly ----
function xmlEsc(s){ return String(s==null?'':s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function buildResumeDocx(){
  const d = resumeData, st = d.style, letter = st.page==='letter';
  const pgW = letter ? 12240 : 11906, pgH = letter ? 15840 : 16838, mar = 680, textW = pgW - mar*2;
  const font = st.font==='sans' ? 'Calibri' : 'Georgia';
  const base = {s:19, m:21, l:23}[st.size] || 21;
  const accent = (st.template==='modern' ? st.accent : '#111827').slice(1).toUpperCase();
  const run = (t, o={}) => `<w:r><w:rPr>${o.b?'<w:b/>':''}${o.i?'<w:i/>':''}${o.color?`<w:color w:val="${o.color}"/>`:''}<w:sz w:val="${o.sz||base}"/><w:szCs w:val="${o.sz||base}"/></w:rPr><w:t xml:space="preserve">${xmlEsc(t)}</w:t></w:r>`;
  const para = (runs, o={}) => `<w:p><w:pPr>${o.keep?'<w:keepNext/>':''}${o.num?'<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>':''}${o.border?`<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="${o.border}"/></w:pBdr>`:''}${o.tab?`<w:tabs><w:tab w:val="right" w:pos="${textW}"/></w:tabs>`:''}<w:spacing w:before="${o.before||0}" w:after="${o.after==null?40:o.after}" w:line="${st.template==='compact'?240:264}" w:lineRule="auto"/></w:pPr>${runs}</w:p>`;
  let body = para(run(d.name, {b:1, sz:base+16, color:accent}), {after:20});
  if(d.title.trim()) body += para(run(d.title, {sz:base+3, color:'374151'}), {after:20});
  const contact = resumeContactList();
  if(contact.length) body += para(run(contact.join('  •  '), {sz:base-1, color:'4B5563'}), {after:60});
  resumeModel().forEach(b=>{
    body += para(run(b.title.toUpperCase(), {b:1, sz:base+1, color:accent}), {before:160, after:60, border:accent, keep:1});
    (b.paras||[]).forEach(p=>{ body += para(run(p)); });
    (b.lines||[]).forEach(l=>{ body += para((l.b ? run(l.b+': ', {b:1}) : '') + run(l.t), {after:20}); });
    (b.entries||[]).forEach(e=>{
      if(e.head || e.date) body += para(run(e.head, {b:1}) + (e.date ? '<w:r><w:tab/></w:r>' + run(e.date, {color:'4B5563', sz:base-1}) : ''), {tab:1, keep:1, after:0, before:60});
      if(e.sub) body += para(run(e.sub, {i:1, color:'374151'}), {after:20, keep:e.bullets.length>0 || !!e.note});
      if(e.note) body += para(run(e.note, {color:'4B5563', sz:base-1}), {after:20});
      e.bullets.forEach(x=>{ body += para(run(x), {num:1, after:20}); });
    });
  });
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const files = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`],
    ['word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`],
    ['word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/><w:sz w:val="${base}"/><w:szCs w:val="${base}"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="40" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`],
    ['word/numbering.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="360" w:hanging="220"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`],
    ['word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}<w:sectPr><w:pgSz w:w="${pgW}" w:h="${pgH}"/><w:pgMar w:top="${mar}" w:right="${mar}" w:bottom="${mar}" w:left="${mar}" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr></w:body></w:document>`]
  ];
  const enc = new TextEncoder();
  return new Blob([zipStore(files.map(([name,xml])=>({name, data:enc.encode(xml)})))], {type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}
function downloadResumeDocx(){ downloadBlob(buildResumeDocx(), resumeFileBase() + '.docx'); }
// ---- PDF through the browser's print dialog (choose "Save as PDF") ----
function downloadResumePDF(){
  const root = document.getElementById('resume-print-root');
  if(root){ root.innerHTML = resumePreviewHTML(); applyResumeStyle(root); }
  let ps = document.getElementById('resume-page-style');
  if(!ps){ ps = document.createElement('style'); ps.id = 'resume-page-style'; document.head.appendChild(ps); }
  ps.textContent = '@media print{@page{size:' + (resumeData.style.page==='letter' ? 'letter' : 'A4') + ';margin:12mm;}}';
  document.body.classList.add('resume-print-mode');
  window.print();
}
window.addEventListener('afterprint', ()=>document.body.classList.remove('resume-print-mode'));

// ===================== JOB APPLICATION TRACKER =====================
const JOB_STATUSES = [['wishlist','Wishlist','#64748b'],['applied','Applied','#2563eb'],['screening','Screening','#7c3aed'],['interview','Interview','#d97706'],['offer','Offer','#16a34a'],['rejected','Rejected','#dc2626'],['withdrawn','Withdrawn','#6b7280']];
const JOB_CLOSED = ['offer','rejected','withdrawn'];
let jobApps = (()=>{ const a = lsJSON('dotnet_job_apps','[]'); return Array.isArray(a) ? a.filter(x=>x && typeof x==='object') : []; })();
let jobFilter = 'all';
function saveJobApps(){ lsSave('dotnet_job_apps', jobApps); }
const jobStatusInfo = s => JOB_STATUSES.find(x=>x[0]===s) || JOB_STATUSES[0];
function jobDate(s){ if(!/^\d{4}-\d{2}-\d{2}$/.test(s||'')) return ''; return new Date(s+'T00:00:00').toLocaleDateString([], {day:'numeric', month:'short'}); }
function jobAddDays(n){ const d = new Date(); d.setDate(d.getDate()+n); return ymd(d); }
function renderJobTracker(){
  const box = document.getElementById('job-tracker'); if(!box) return;
  const today = ymd(new Date());
  const counts = {}; jobApps.forEach(j=>{ counts[j.status] = (counts[j.status]||0)+1; });
  const applied = jobApps.filter(j=>j.status!=='wishlist').length, moved = jobApps.filter(j=>['screening','interview','offer'].includes(j.status)).length;
  const due = jobApps.filter(j=>j.followUp && j.followUp<=today && !JOB_CLOSED.includes(j.status));
  const list = jobApps.filter(j=>jobFilter==='all' || j.status===jobFilter).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
  const pills = [['all','All',jobApps.length], ...JOB_STATUSES.map(s=>[s[0], s[1], counts[s[0]]||0])]
    .map(([k,l,n])=>`<button type="button" class="job-pill ${jobFilter===k?'on':''}" onclick="setJobFilter('${k}')">${l} <b>${n}</b></button>`).join('');
  const rows = list.map(j=>{
    const [,label,col] = jobStatusInfo(j.status), ver = resumeVersions.find(v=>v.id===j.versionId);
    const fu = j.followUp && !JOB_CLOSED.includes(j.status) ? (j.followUp < today ? `<span class="job-fu over">Follow-up overdue · ${esc(jobDate(j.followUp))}</span>` : j.followUp === today ? '<span class="job-fu today">Follow up today</span>' : `<span class="job-fu">Follow up ${esc(jobDate(j.followUp))}</span>`) : '';
    return `<div class="job-row" data-job-id="${escA(j.id)}" style="--jc:${col}">
      <div class="job-main">
        <div class="job-title"><b>${esc(j.company||'Untitled')}</b>${j.role ? ' — '+esc(j.role) : ''}${j.url && safeUrl(j.url)!=='#' ? ` <a href="${escA(safeUrl(j.url))}" target="_blank" rel="noopener noreferrer" aria-label="Open job posting" title="Open job posting"><i class="bi bi-box-arrow-up-right"></i></a>` : ''}</div>
        <div class="job-meta">${j.location ? esc(j.location)+' · ' : ''}${j.appliedOn ? 'Applied '+esc(jobDate(j.appliedOn)) : 'Not applied yet'}${ver ? ' · <i class="bi bi-file-earmark-person" aria-hidden="true"></i> '+esc(ver.name) : ''} ${fu}</div>
      </div>
      <select class="job-status" aria-label="Status" onchange="setJobStatus('${escA(j.id)}', this.value)" style="border-color:${col};color:${col}">${JOB_STATUSES.map(s=>`<option value="${s[0]}" ${s[0]===j.status?'selected':''}>${s[1]}</option>`).join('')}</select>
      <div class="job-actions">
        ${j.jd ? `<button type="button" class="item-action-btn" onclick="matchJob('${escA(j.id)}')" title="Check my resume against this job's description" aria-label="Check match"><i class="bi bi-bullseye"></i></button>` : ''}
        <button type="button" class="item-action-btn" onclick="snapshotForJob('${escA(j.id)}')" title="Save the current resume as a version for this job" aria-label="Save resume version"><i class="bi bi-file-earmark-plus"></i></button>
        <button type="button" class="item-action-btn" onclick="openJobForm('${escA(j.id)}')" title="Edit" aria-label="Edit"><i class="bi bi-pencil"></i></button>
        <button type="button" class="item-action-btn danger" onclick="deleteJobApp('${escA(j.id)}')" title="Delete" aria-label="Delete"><i class="bi bi-trash"></i></button>
      </div>
    </div>`;
  }).join('');
  box.innerHTML = `
    <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
      <div class="small text-muted">${jobApps.length ? `${applied} applied · ${moved} moving forward${applied ? ' ('+Math.round(moved/applied*100)+'%)' : ''}` : 'Track every application: status, follow-up dates and the resume you sent.'}</div>
      <button class="btn btn-sm btn-primary" onclick="openJobForm()"><i class="bi bi-plus-lg me-1"></i>Add application</button>
    </div>
    ${due.length ? `<div class="job-due"><i class="bi bi-bell-fill me-1" aria-hidden="true"></i><b>${due.length}</b> follow-up${due.length===1?'':'s'} due: ${due.slice(0,3).map(j=>esc(j.company||'Untitled')).join(', ')}${due.length>3?'…':''}</div>` : ''}
    ${jobApps.length ? `<div class="job-pills">${pills}</div>` : ''}
    <div class="job-list">${rows || (jobApps.length ? '<p class="small text-muted text-center py-2 mb-0">Nothing with this status.</p>' : '')}</div>`;
}
function setJobFilter(k){ jobFilter = k; renderJobTracker(); }
function setJobStatus(id, status){
  const j = jobApps.find(x=>x.id===id); if(!j) return;
  const prev = j.status; j.status = status; j.updatedAt = Date.now();
  if(status==='applied' && prev==='wishlist'){ if(!j.appliedOn) j.appliedOn = ymd(new Date()); if(!j.followUp) j.followUp = jobAddDays(7); }
  if(JOB_CLOSED.includes(status)) j.followUp = '';
  saveJobApps(); renderJobTracker();
}
function openJobForm(id){
  const j = id ? jobApps.find(x=>x.id===id) : null;
  if(id && !j) return;
  const opt = (s, v) => `<option value="${escA(v)}" ${s===v?'selected':''}>`;
  openModal(`
    <div class="author-form docshub-form-compact mb-0">
      <h6 class="form-title"><i class="bi bi-briefcase me-1"></i>${j?'Edit application':'Add application'}</h6>
      <div class="row g-2">
        <div class="col-md-6"><label>Company <span class="text-danger">*</span></label><input id="job-company" class="form-control" value="${escA(j?j.company:'')}"></div>
        <div class="col-md-6"><label>Role <span class="text-danger">*</span></label><input id="job-role" class="form-control" value="${escA(j?j.role:'')}"></div>
        <div class="col-md-6"><label>Job link</label><input id="job-url" class="form-control" placeholder="https://…" value="${escA(j?j.url:'')}"></div>
        <div class="col-md-6"><label>Location</label><input id="job-location" class="form-control" placeholder="City / Remote" value="${escA(j?j.location:'')}"></div>
        <div class="col-md-4"><label>Status</label><select id="job-status-f" class="form-select">${JOB_STATUSES.map(s=>`<option value="${s[0]}" ${(j?j.status:'wishlist')===s[0]?'selected':''}>${s[1]}</option>`).join('')}</select></div>
        <div class="col-md-4"><label>Applied on</label><input id="job-applied" type="date" class="form-control" value="${escA(j?j.appliedOn:'')}"></div>
        <div class="col-md-4"><label>Follow up on</label><input id="job-followup" type="date" class="form-control" value="${escA(j?j.followUp:'')}"></div>
        <div class="col-12"><label>Resume version sent</label><select id="job-version" class="form-select"><option value="">— none / current —</option>${resumeVersions.map(v=>`<option value="${escA(v.id)}" ${j&&j.versionId===v.id?'selected':''}>${esc(v.name)}</option>`).join('')}</select></div>
        <div class="col-12"><label>Job description <span class="text-muted fw-normal">(paste it — used for the ATS match)</span></label><textarea id="job-jd" class="form-control" rows="4">${esc(j?j.jd:'')}</textarea></div>
        <div class="col-12"><label>Notes</label>${rteEditorHTML('job-notes','Contacts, interview dates, salary talk, questions…', j?j.notes:'')}</div>
      </div>
      <div class="d-flex gap-2 mt-2">
        <button class="btn btn-primary btn-sm" onclick="saveJobForm('${j?escA(j.id):''}')"><i class="bi bi-check2 me-1"></i>${j?'Save':'Add'}</button>
        <button class="btn btn-outline-secondary btn-sm" onclick="closeModal()">Cancel</button>
      </div>
    </div>`);
  draftSetup('job|'+(j?'e:'+j.id:'n'), ()=>openJobForm(id));
}
function saveJobForm(id){
  const company = document.getElementById('job-company').value.trim(), role = document.getElementById('job-role').value.trim();
  if(!company || !role){ alert('Please fill in the company and the role.'); return; }
  const urlRaw = document.getElementById('job-url').value.trim(), url = urlRaw ? normUrl(urlRaw) : '';
  if(urlRaw && !url){ alert('That job link does not look valid.'); return; }
  const status = document.getElementById('job-status-f').value;
  const data = {company, role, url, location:document.getElementById('job-location').value.trim(), status,
    appliedOn:document.getElementById('job-applied').value, followUp:JOB_CLOSED.includes(status) ? '' : document.getElementById('job-followup').value,
    versionId:document.getElementById('job-version').value, jd:document.getElementById('job-jd').value, notes:rteGetHTML('job-notes'), updatedAt:Date.now()};
  if(id){ const j = jobApps.find(x=>x.id===id); if(!j) return; Object.assign(j, data); }
  else jobApps.unshift({id:'job-'+Date.now(), createdAt:Date.now(), ...data});
  saveJobApps(); draftClear(); closeModal(); renderJobTracker();
}
function deleteJobApp(id){
  const idx = jobApps.findIndex(x=>x.id===id); if(idx<0) return;
  const removed = jobApps[idx];
  jobApps.splice(idx,1); saveJobApps(); renderJobTracker();
  toastUndo('Deleted "'+clipText(removed.company||'application')+'"', ()=>{ jobApps.splice(Math.min(idx, jobApps.length), 0, removed); saveJobApps(); renderJobTracker(); });
}
function matchJob(id){
  const j = jobApps.find(x=>x.id===id); if(!j) return;
  if(j.versionId && resumeVersions.some(v=>v.id===j.versionId) && j.versionId!==activeResumeVersionId) switchResumeVersion(j.versionId);
  resumeData.jd = j.jd || ''; saveResumeData(); syncJdBox();
  flashEl(document.getElementById('resume-ats-card'));
  if(window.UI) UI.toast('Showing the match for '+(j.company||'this job'));
}
function snapshotForJob(id){
  const j = jobApps.find(x=>x.id===id); if(!j) return;
  const name = (j.company + (j.role ? ' – ' + j.role : '')).slice(0,60);
  const ex = resumeVersions.find(v=>v.name.toLowerCase()===name.toLowerCase());
  if(ex){ if(!confirm('A version called "'+name+'" already exists. Overwrite it with your current resume?')) return; ex.data = JSON.parse(JSON.stringify(resumeData)); ex.savedAt = Date.now(); j.versionId = ex.id; }
  else { const v = {id:'ver-'+Date.now(), name, data:JSON.parse(JSON.stringify(resumeData)), savedAt:Date.now()}; resumeVersions.push(v); j.versionId = v.id; }
  lsSave('dotnet_resume_versions', resumeVersions); j.updatedAt = Date.now(); saveJobApps();
  renderResumeVersionSelect(); renderJobTracker();
  if(window.UI) UI.toast('Saved resume version "'+name+'"');
}
function jumpToJobApp(id){
  goTab('profile');
  const b = [...document.querySelectorAll('.profile-subtab')].find(x=>(x.getAttribute('onclick')||'').includes("'resume'")); if(b) b.click();
  jobFilter = 'all'; renderJobTracker();
  setTimeout(()=>flashEl(document.querySelector('.job-row[data-job-id="'+CSS.escape(id)+'"]')), 80);
}

let done = new Set((lsJSON('dotnet_done2', '[]') || []).map(Number).filter(n => n >= 1 && n <= 175));
let filter = 'all';
let searchTerm = '';

function save(){ lsSave('dotnet_done2', [...done].sort((a,b)=>a-b)); }
function toggle(n){ if(done.has(n)) done.delete(n); else done.add(n); save(); render(); updateStats(); }
function setFilter(f,btn){ filter=f; document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); render(); }
function filterDays(){ searchTerm=document.getElementById('search-box').value.toLowerCase(); render(); }
function clearSearchBox(){ const sb=document.getElementById('search-box'); if(sb){ sb.value=''; filterDays(); } }
function resetAll(){ if(done.size && confirm('Reset all '+done.size+' completed days? This cannot be undone.')){ done.clear(); save(); render(); updateStats(); } }

function updateStats(){
  const d=done.size, l=TOTAL-d, pct=Math.round(d/TOTAL*100);
  document.getElementById('stat-left').textContent=l;
  document.getElementById('main-prog').style.width=pct+'%';
  document.getElementById('prog-label').textContent=d+' / '+TOTAL+' days';
  updateCalendarCaption();
}

// Keeps the calendar-based stat boxes (Days Elapsed, Target End Date, Days Left) in sync
// with the start date → target date, independent of task-completion counts.
function updateCalendarCaption(){
  const t = getTimelineInfo();
  const elapsedEl = document.getElementById('stat-elapsed');
  const endDateEl = document.getElementById('stat-enddate');
  const targetEl = document.getElementById('stat-target-days');
  if(elapsedEl) elapsedEl.textContent = t.elapsedDays;
  if(endDateEl) endDateEl.textContent = t.target.toLocaleDateString('en-IN',{day:'numeric',month:'short'});
  if(targetEl) targetEl.textContent = t.overdue ? '0' : t.remainingDays;
}

// Tapping any stat box opens a popup with the underlying data behind that number.
function showStatDetail(which){
  const d = done.size, l = TOTAL-d, pct = Math.round(d/TOTAL*100);
  const t = getTimelineInfo();
  let html = '';
  if(which==='elapsed'){
    const startStr = new Date(t.startStr+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
    html = `<div class="author-form mb-0"><h6 class="form-title"><i class="bi bi-calendar3 me-2 text-primary"></i>${t.elapsedDays} days elapsed</h6>
      <p class="small text-muted mb-2">Since you started on <strong>${startStr}</strong>.</p>
      <p class="small mb-0">You've completed <strong>${d}</strong> of ${TOTAL} roadmap days so far — current pace: <strong>${t.currentPace}</strong> days/week.</p>
      <button class="btn btn-outline-secondary btn-sm mt-3" onclick="closeModal()">Close</button></div>`;
  } else if(which==='left'){
    const leftDays = [];
    PHASES.forEach(phase=> phase.weeks.forEach(w=> w.days.forEach(dd=>{ if(!done.has(dd.n)) leftDays.push(dd); })));
    html = `<div class="author-form mb-0"><h6 class="form-title"><i class="bi bi-hourglass-split me-2 text-primary"></i>${l} Tasks Left</h6>
      <div class="stat-scroll">
        ${leftDays.length ? leftDays.map(dd=>`<div class="small py-1 stat-line">Day ${dd.n} — ${esc(dd.topic)}</div>`).join('') : '<p class="small text-muted">All caught up!</p>'}
      </div>
      <button class="btn btn-outline-secondary btn-sm mt-3" onclick="closeModal()">Close</button></div>`;
  } else if(which==='enddate'){
    const endStr = t.target.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
    html = `<div class="author-form mb-0"><h6 class="form-title"><i class="bi bi-flag-fill me-2 text-primary"></i>Target: ${endStr}</h6>
      <p class="small mb-0 ${t.overdue?'text-bad':'text-muted'}">
        ${t.overdue ? "You're past this date — consider setting a new start date, or just keep going at your own pace." :
          `That's <strong>${t.remainingDays} days</strong> away. To finish on time you need about <strong>${t.requiredPace} days/week</strong>.`}
      </p>
      <button class="btn btn-outline-secondary btn-sm mt-3" onclick="closeModal()">Close</button></div>`;
  } else if(which==='target'){
    const startStr = new Date(t.startStr+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
    const endStr = t.target.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
    html = `<div class="author-form mb-0"><h6 class="form-title"><i class="bi bi-flag me-2 text-primary"></i>${t.overdue?'Past target date':t.remainingDays+' Days Left'}</h6>
      <table class="table table-sm mb-2" style="font-size:0.82rem">
        <tbody>
          <tr><td class="text-muted">Start date</td><td>${startStr}</td></tr>
          <tr><td class="text-muted">Target end date</td><td>${endStr}</td></tr>
          <tr><td class="text-muted">Days elapsed</td><td>${t.elapsedDays}</td></tr>
          <tr><td class="text-muted">Days remaining</td><td>${t.overdue?'0 (overdue)':t.remainingDays}</td></tr>
        </tbody>
      </table>
      <p class="small text-muted mb-0">Change your start date any time from Profile → Timeline &amp; Summary.</p>
      <button class="btn btn-outline-secondary btn-sm mt-3" onclick="closeModal()">Close</button></div>`;
  }
  openModal(html);
}

const TAB_TITLES = {feed:'Feed', roadmap:'Roadmap', author:'Docs Hub', projects:'Projects', interview:'Interview Prep', profile:'Profile'};
function setPageTitle(tab){ const t = (TAB_TITLES[tab] || 'Roadmap') + ' · .NET Roadmap'; if(!document.hidden) document.title = t; }
function showTab(tab, btn){
  setPageTitle(tab);
  document.querySelectorAll('[id^="tab-"]').forEach(t=>t.style.display='none');
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('tab-'+tab).style.display='';
  btn.classList.add('active');
  if(tab==='feed' && window.Feed) Feed.show();
  if(tab==='author'){
    renderDocsSubtabs();
    document.getElementById('docs-community-view').style.display = activeDocsSection==='resources' ? 'none' : '';
    document.getElementById('docs-resources-view').style.display = activeDocsSection==='resources' ? '' : 'none';
    if(activeDocsSection==='resources') renderResources(); else renderAuthorPosts();
  }
  if(tab==='projects'){ renderProjects(); renderStructure(); renderAdvanced(); }
  if(tab==='interview') renderInterview();
  if(tab==='profile'){ renderProfile(); renderSummary(); }
}

function setProjSubtab(which, btn){
  document.querySelectorAll('.proj-subtab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('proj-container').style.display = which==='list' ? '' : 'none';
  document.getElementById('struct-container').style.display = which==='structure' ? '' : 'none';
  document.getElementById('advanced-container').style.display = which==='advanced' ? '' : 'none';
}

function setProfileSubtab(which, btn){
  document.querySelectorAll('.profile-subtab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('profile-overview-view').style.display = which==='overview' ? '' : 'none';
  document.getElementById('profile-summary-view').style.display = which==='summary' ? '' : 'none';
  document.getElementById('profile-resume-view').style.display = which==='resume' ? '' : 'none';
  if(which==='resume') renderResumeBuilder();
}

// ===================== DAY NOTES =====================
let dayNotes = lsJSON('dotnet_day_notes', '{}'); // {dayNum: {type, text|points, mediaKey, mediaName, updatedAt}}
let pendingNoteImages = {}; // keyed by day number (or 'quick') -> {dataUrl, name}
let noteCollapsed = lsJSON('dotnet_note_collapsed', '{}');

function noteBoxHTML(n){
  const note = dayNotes[n];
  const existing = note ? (note.type==='bullets' ? '<ul>'+(note.points||[]).map(p=>`<li>${esc(p)}</li>`).join('')+'</ul>' : (note.text||'')) : '';
  return `${rteEditorHTML('note-text-'+n, 'What did you learn or struggle with on Day '+n+'?', existing)}
    <div class="note-attach-row">
      <button type="button" class="btn btn-sm btn-outline-secondary" onclick="document.getElementById('note-img-input-${n}').click()"><i class="bi bi-paperclip me-1"></i>Attach image</button>
      <input type="file" id="note-img-input-${n}" accept="image/*" style="display:none" onchange="handleNoteImage(event,${n})">
      <span class="small text-success" id="note-img-name-${n}">${dayNotes[n]&&dayNotes[n].mediaName?'✓ '+esc(dayNotes[n].mediaName):''}</span>
    </div>
    <div class="note-actions">
      <button type="button" class="btn btn-sm btn-outline-secondary" onclick="toggleNoteBox(${n})">Close</button>
      <button type="button" class="btn btn-sm btn-primary" onclick="saveNote(${n})"><i class="bi bi-check2 me-1"></i>Save note</button>
    </div>`;
}
// Note editors are built the first time a day's note is opened (the old code built 175 editors on every redraw).
function openNoteBox(n){
  const box = document.getElementById('note-box-'+n); if(!box) return null;
  if(!box.dataset.built){ box.innerHTML = noteBoxHTML(n); box.dataset.built = '1'; }
  box.style.display = 'block';
  const btn = document.querySelector(`.day-row[data-day="${n}"] .day-note-btn`); if(btn) btn.setAttribute('aria-expanded','true');
  return box;
}
function toggleNoteBox(n){
  const box = document.getElementById('note-box-'+n);
  if(!box) return;
  if(box.style.display==='block'){
    box.style.display = 'none';
    const btn = document.querySelector(`.day-row[data-day="${n}"] .day-note-btn`); if(btn) btn.setAttribute('aria-expanded','false');
    return;
  }
  openNoteBox(n);
  const ed = document.getElementById('note-text-'+n); if(ed) ed.focus();
}
// Text typed into an open note must survive a redraw (ticking another day used to wipe it).
function captureNoteDrafts(){
  const out = {};
  document.querySelectorAll('#phases-container .day-note-box').forEach(box=>{
    if(box.style.display!=='block') return;
    const n = box.id.replace('note-box-','');
    const ed = document.getElementById('note-text-'+n);
    out[n] = ed ? ed.innerHTML : null;
  });
  return out;
}
function restoreNoteDrafts(d){
  Object.keys(d).forEach(n=>{
    if(!openNoteBox(n)) return;
    const ed = document.getElementById('note-text-'+n);
    if(ed && d[n]!==null) ed.innerHTML = sanitizeHTML(d[n]);
  });
}

async function saveNote(n){
  const raw = rteGetHTML('note-text-'+n);
  const old = dayNotes[n];
  let mediaKey = old?.mediaKey, mediaName = old?.mediaName;
  if(pendingNoteImages[n]){
    if(mediaKey) idbDelete(mediaKey);
    mediaKey = 'media-note-'+Date.now();
    await idbPut(mediaKey, pendingNoteImages[n].dataUrl);
    mediaName = pendingNoteImages[n].name;
    delete pendingNoteImages[n];
  }
  if(raw || mediaKey){
    dayNotes[n] = {type:'rich', text: raw, updatedAt: Date.now(), mediaKey, mediaName};
  } else {
    if(old?.mediaKey) idbDelete(old.mediaKey);
    delete dayNotes[n];
  }
  if(!lsSave('dotnet_day_notes', dayNotes)) return;     // keep the editor open if storage is full
  render();
  refreshAllNoteViews();
  if(window.UI) UI.toast('Note saved');
}
function findDayTopic(n){
  for(const phase of PHASES) for(const w of phase.weeks) for(const d of w.days) if(d.n===Number(n)) return d.topic;
  return '';
}
function toggleNoteFold(key){
  noteCollapsed[key] = !noteCollapsed[key];
  localStorage.setItem('dotnet_note_collapsed', JSON.stringify(noteCollapsed));
  refreshAllNoteViews();
}
function deleteNote(n){
  if(!confirm('Delete this note? This can\'t be undone.')) return;
  const note = dayNotes[n];
  if(note && note.mediaKey) idbDelete(note.mediaKey);
  delete dayNotes[n];
  localStorage.setItem('dotnet_day_notes', JSON.stringify(dayNotes));
  render(); // updates the note icon on that day row
  refreshAllNoteViews();
}
function renderAllNotes(searchTerm){
  const term = (searchTerm||'').trim().toLowerCase();
  const entries = Object.keys(dayNotes)
    .map(n=>({n:Number(n), ...dayNotes[n], topic: findDayTopic(n)}))
    .filter(e=>{
      if(!term) return true;
      const hay = (e.type==='bullets' ? (e.points||[]).join(' ') : stripTags(e.text||'')).toLowerCase() + ' ' + e.topic.toLowerCase() + ' day ' + e.n;
      return hay.includes(term);
    })
    .sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
  if(entries.length===0) return `<div class="text-muted small text-center py-3">No notes ${term?'match your search':'yet'} — add one from any day, or use Quick Add.</div>`;
  return entries.map(e=>{
    const key = 'note-'+e.n;
    const lengthGuess = e.type==='bullets' ? (e.points||[]).join('').length : stripTags(e.text||'').length;
    const isLong = lengthGuess > 160 || (e.points||[]).length > 4;
    const collapsed = noteCollapsed[key] !== undefined ? noteCollapsed[key] : isLong;
    const bodyHtml = e.type==='bullets'
      ? `<ul class="note-bullets note-text">${(e.points||[]).map(p=>`<li>${esc(p)}</li>`).join('')}</ul>`
      : `<div class="note-text">${rich(e.text||'')}</div>`;
    return `<div class="note-card">
      <div class="note-meta">
        <button type="button" class="note-fold" onclick="toggleNoteFold('${key}')" aria-expanded="${!collapsed}"><i class="bi bi-chevron-${collapsed?'right':'down'}" aria-hidden="true"></i>Day ${e.n} — ${esc(e.topic)}</button>
        <span class="d-flex align-items-center gap-2">
          <span>${e.updatedAt ? new Date(e.updatedAt).toLocaleDateString() : ''}</span>
          <button type="button" class="item-action-btn danger" onclick="deleteNote(${e.n})" title="Delete note" aria-label="Delete note for day ${e.n}"><i class="bi bi-trash"></i></button>
        </span>
      </div>
      ${collapsed ? '' : bodyHtml + (e.mediaKey ? `<img class="note-img" id="noteimg-${key}" alt="Note attachment">` : '')}
    </div>`;
  }).join('');
}
function hydrateNoteImages(){
  Object.keys(dayNotes).forEach(n=>{
    const note = dayNotes[n];
    if(note.mediaKey){
      idbGet(note.mediaKey).then(dataUrl=>{
        document.querySelectorAll(`#noteimg-note-${n}`).forEach(img=>{ if(dataUrl) img.src=dataUrl; });
      });
    }
  });
}
function filterNotes(){ const el=document.getElementById('all-notes-list'); if(el){ el.innerHTML = renderAllNotes(document.getElementById('notes-search-input').value); hydrateNoteImages(); } }
function filterNotesSidebar(){ const el=document.getElementById('all-notes-list-sidebar'); if(el){ el.innerHTML = renderAllNotes(document.getElementById('notes-search-sidebar').value); hydrateNoteImages(); } }
function refreshAllNoteViews(){
  const s1=document.getElementById('notes-search-input'), s2=document.getElementById('notes-search-sidebar');
  const l1=document.getElementById('all-notes-list'), l2=document.getElementById('all-notes-list-sidebar');
  if(l1) l1.innerHTML = renderAllNotes(s1?s1.value:'');
  if(l2) l2.innerHTML = renderAllNotes(s2?s2.value:'');
  hydrateNoteImages();
}
function populateQuickNoteDaySelect(){
  const sel = document.getElementById('quick-note-day');
  if(!sel) return;
  let opts = '<option value="">Choose a day...</option>';
  PHASES.forEach(phase=> phase.weeks.forEach(w=> w.days.forEach(d=>{
    opts += `<option value="${escA(d.n)}">Day ${d.n} — ${esc(d.topic)}</option>`;
  })));
  sel.innerHTML = opts;
}
function toggleQuickNoteForm(){
  const form = document.getElementById('quick-note-form');
  form.style.display = form.style.display==='block' ? 'none' : 'block';
}
async function quickAddNote(){
  const n = document.getElementById('quick-note-day').value;
  const raw = rteGetHTML('quick-note-text');
  if(!n || (!raw && !pendingNoteImages['quick'])){ alert('Pick a day and write something (or attach an image) first.'); return; }
  const old = dayNotes[n];
  let mediaKey = old?.mediaKey, mediaName = old?.mediaName;
  if(pendingNoteImages['quick']){
    if(mediaKey) idbDelete(mediaKey);
    mediaKey = 'media-note-'+Date.now();
    await idbPut(mediaKey, pendingNoteImages['quick'].dataUrl);
    mediaName = pendingNoteImages['quick'].name;
    delete pendingNoteImages['quick'];
  }
  let text = raw;
  if(old && old.text && raw) text = old.text + '<br>' + raw;        // add to the day's note instead of replacing it
  else if(old && old.text) text = old.text;
  if(old && old.type==='bullets' && !old.text) text = '<ul>'+(old.points||[]).map(p=>`<li>${esc(p)}</li>`).join('')+'</ul>' + (raw ? '<br>'+raw : '');
  dayNotes[n] = {type:'rich', text, updatedAt: Date.now(), mediaKey, mediaName};
  if(!lsSave('dotnet_day_notes', dayNotes)) return;
  document.getElementById('quick-note-text').innerHTML='';
  document.getElementById('quick-note-day').value='';
  const imgNameEl = document.getElementById('quick-note-img-name'); if(imgNameEl) imgNameEl.textContent='';
  document.getElementById('quick-note-form').style.display='none';
  refreshAllNoteViews();
  if(document.getElementById('tab-roadmap').style.display!=='none') render();
  if(window.UI) UI.toast(old ? 'Added to your Day '+n+' note' : 'Note saved');
}

// ===================== CUSTOM PHASES (user-added, CRUD) =====================
let customPhases = lsJSON('dotnet_custom_phases', '[]'); // [{id,title,unit,color,tasks:[{id,label,title,points:[]}]}]
let customPhaseDone = new Set(lsJSON('dotnet_custom_phase_done', '[]'));
let editingPhaseId = null;
let taskRowCounter = 0;
const PHASE_COLORS = ['#1f3a7a','#2f6b4f','#8a6a1f','#8a2a3a','#1f6f78','#5b2a6e'];

function saveCustomPhases(){ localStorage.setItem('dotnet_custom_phases', JSON.stringify(customPhases)); }
function saveCustomPhaseDone(){ localStorage.setItem('dotnet_custom_phase_done', JSON.stringify([...customPhaseDone])); }

function openPhaseForm(phaseId){
  editingPhaseId = phaseId;
  const phase = phaseId ? customPhases.find(p=>p.id===phaseId) : null;
  taskRowCounter = 0;
  const slot = document.getElementById('phase-form-slot');
  slot.innerHTML = `
    <div class="author-form">
      <h6 class="form-title"><i class="bi ${phase?'bi-pencil-square':'bi-plus-circle'} me-1"></i>${phase?'Edit phase':'Add a new phase'}</h6>
      <div class="row g-2 mb-2">
        <div class="col-md-8"><label class="small text-muted d-block">Phase title</label><input id="phase-title" class="form-control" placeholder="e.g. Phase 6 — Portfolio Prep" value="${escA(phase?phase.title:'')}"></div>
        <div class="col-md-4"><label class="small text-muted d-block">Organize by</label>
          <select id="phase-unit">
            <option value="Day" ${phase&&phase.unit==='Day'?'selected':''}>Day</option>
            <option value="Week" ${phase&&phase.unit==='Week'?'selected':''}>Week</option>
            <option value="Month" ${phase&&phase.unit==='Month'?'selected':''}>Month</option>
            <option value="Hour" ${phase&&phase.unit==='Hour'?'selected':''}>Hour</option>
            <option value="Task" ${!phase||phase.unit==='Task'?'selected':''}>Task (no numbering)</option>
          </select>
        </div>
      </div>
      <div id="task-rows-container"></div>
      <button class="btn btn-sm btn-outline-primary mb-3" onclick="addTaskRow()"><i class="bi bi-plus-lg me-1"></i>Add ${phase?phase.unit:'item'}</button>
      <div class="d-flex gap-2">
        <button class="btn btn-primary btn-sm" onclick="submitPhaseForm()"><i class="bi bi-check2 me-1"></i>${phase?'Save changes':'Create phase'}</button>
        <button class="btn btn-outline-secondary btn-sm" onclick="closePhaseForm()">Cancel</button>
      </div>
    </div>`;
  document.getElementById('phase-unit').style.cssText = 'font-size:0.84rem;width:100%;border:1px solid var(--border);border-radius:8px;padding:0.375rem 0.5rem;';
  if(phase && phase.tasks.length){
    phase.tasks.forEach(t=>addTaskRow(t));
  } else {
    addTaskRow();
  }
  slot.scrollIntoView({behavior:'smooth', block:'nearest'});
}
function closePhaseForm(){ document.getElementById('phase-form-slot').innerHTML=''; editingPhaseId=null; }

function addTaskRow(existing){
  const id = 'trow-'+(taskRowCounter++);
  const container = document.getElementById('task-rows-container');
  const row = document.createElement('div');
  row.className = 'task-row-form';
  row.id = id;
  if(existing && existing.id) row.dataset.taskId = existing.id;      // keep ids so completed ticks stay with the right item
  row.innerHTML = `
    <button type="button" class="remove-task-btn" onclick="document.getElementById('${id}').remove()" title="Remove" aria-label="Remove item"><i class="bi bi-x-lg"></i></button>
    <input class="form-control task-title" aria-label="Item title" placeholder="Title (e.g. Setup & First App)" value="${escA(existing?existing.title:'')}">
    <textarea class="form-control task-points" rows="2" placeholder="Bullet points, one per line (e.g. Morning: ..., Afternoon: ...)">${esc(existing&&existing.points?existing.points.join('\n'):'')}</textarea>
  `;
  container.appendChild(row);
}

function submitPhaseForm(){
  const title = document.getElementById('phase-title').value.trim();
  const unit = document.getElementById('phase-unit').value;
  if(!title){ alert('Please give the phase a title.'); return; }
  const rows = [...document.querySelectorAll('#task-rows-container .task-row-form')];
  const tasks = rows.map((row,i)=>{
    return {
      id: row.dataset.taskId || ('task-'+Date.now()+'-'+i),
      label: unit==='Task' ? '' : unit+' '+(i+1),
      title: row.querySelector('.task-title').value.trim() || '(untitled)',
      points: row.querySelector('.task-points').value.split('\n').map(s=>s.trim()).filter(Boolean)
    };
  }).filter(t=>t.title);
  if(tasks.length===0){ alert('Add at least one item.'); return; }

  if(editingPhaseId){
    const phase = customPhases.find(p=>p.id===editingPhaseId);
    const keep = new Set(tasks.map(t=>t.id));
    phase.tasks.forEach(t=>{ if(!keep.has(t.id)) customPhaseDone.delete(phase.id+':'+t.id); });   // drop ticks for removed items
    saveCustomPhaseDone();
    phase.title = title; phase.unit = unit; phase.tasks = tasks;
  } else {
    customPhases.push({id:'phase-'+Date.now(), title, unit, color: PHASE_COLORS[customPhases.length % PHASE_COLORS.length], tasks});
  }
  saveCustomPhases();
  closePhaseForm();
  renderCustomPhases();
}
function editPhase(phaseId){ openPhaseForm(phaseId); }
function deletePhase(phaseId){
  if(!confirm('Delete this whole phase and all its items?')) return;
  const phase = customPhases.find(p=>p.id===phaseId);
  if(phase) phase.tasks.forEach(t=> customPhaseDone.delete(phase.id+':'+t.id));
  customPhases = customPhases.filter(p=>p.id!==phaseId);
  saveCustomPhases(); saveCustomPhaseDone();
  renderCustomPhases();
}
function toggleCustomTask(phaseId, taskId){
  const key = phaseId+':'+taskId;
  if(customPhaseDone.has(key)) customPhaseDone.delete(key); else customPhaseDone.add(key);
  saveCustomPhaseDone();
  renderCustomPhases();
}

function renderCustomPhases(){
  const c = document.getElementById('custom-phases-container'); if(!c) return;
  c.innerHTML = customPhases.map(phase=>{
    const total = phase.tasks.length;
    const done_ = phase.tasks.filter(t=>customPhaseDone.has(phase.id+':'+t.id)).length;
    const pct = total ? Math.round(done_/total*100) : 0;
    return `<section class="phase-card custom" style="--phc:${tone(phase.color)}">
      <div class="phase-header static">
        <div class="phase-title"><span class="phase-dot" aria-hidden="true"></span><span class="phase-name">${esc(phase.title)}</span><span class="phase-badge">${done_}/${total}</span><span class="phase-tag">Custom</span></div>
        <div class="phase-meta">
          <button type="button" class="item-action-btn" onclick="editPhase('${escA(phase.id)}')" title="Edit" aria-label="Edit phase"><i class="bi bi-pencil"></i></button>
          <button type="button" class="item-action-btn danger" onclick="deletePhase('${escA(phase.id)}')" title="Delete" aria-label="Delete phase"><i class="bi bi-trash"></i></button>
        </div>
      </div>
      <div class="phase-progress" aria-hidden="true"><i style="width:${pct}%"></i></div>
      ${phase.tasks.map(t=>{
        const isDone = customPhaseDone.has(phase.id+':'+t.id);
        return `<div class="custom-task-row ${isDone?'is-done':''}">
          <button type="button" class="day-check ${isDone?'done':''}" role="checkbox" aria-checked="${isDone}" aria-label="${escA(t.title)}" onclick="toggleCustomTask('${escA(phase.id)}','${escA(t.id)}')"></button>
          <div class="day-topic">
            <strong>${t.label?esc(t.label)+' — ':''}${esc(t.title)}</strong>
            ${t.points.length ? `<ul class="task-points">${t.points.map(p=>`<li>${esc(p)}</li>`).join('')}</ul>` : ''}
          </div>
        </div>`;
      }).join('')}
    </section>`;
  }).join('');
}

let NEXT_DAY = null;
let weekState = {};
try{ weekState = lsJSON('dn_weeks', '{}'); }catch(e){ weekState = {}; }
function findNextDay(){
  for(const ph of PHASES) for(const w of ph.weeks) for(const d of w.days) if(!done.has(d.n)) return d.n;
  return null;
}
function toggleWeek(el){
  const card = el.closest('.week-card'); if(!card) return;
  const collapsed = card.classList.toggle('collapsed');
  el.setAttribute('aria-expanded', String(!collapsed));
  weekState[card.dataset.wk] = !collapsed;
  try{ localStorage.setItem('dn_weeks', JSON.stringify(weekState)); }catch(e){}
}
function setAllWeeks(open){
  document.querySelectorAll('#phases-container .week-card').forEach(c=>{
    c.classList.toggle('collapsed', !open); weekState[c.dataset.wk]=open;
    const h = c.querySelector('.week-header'); if(h) h.setAttribute('aria-expanded', String(open));
  });
  try{ localStorage.setItem('dn_weeks', JSON.stringify(weekState)); }catch(e){}
}
const keyAct = (e, fn) => { if(e.key==='Enter' || e.key===' '){ e.preventDefault(); fn(); } };
const closedPhases = new Set();
function render(){
  NEXT_DAY = findNextDay();
  const drafts = captureNoteDrafts();
  const c=document.getElementById('phases-container');
  const parts = [];
  let shownWeeks = 0;
  PHASES.forEach(phase=>{
    let pd=0,pt=0;
    phase.weeks.forEach(w=>w.days.forEach(d=>{pt++;if(done.has(d.n))pd++;}));
    const pp=pt?Math.round(pd/pt*100):0;
    const weeksHtml = phase.weeks.map(w=>renderWeek(w,phase.color)).join('');
    if(!weeksHtml) return;
    shownWeeks++;
    const isClosed = closedPhases.has(phase.id);
    parts.push(`<section class="phase-card" style="--phc:${tone(phase.color)}">
      <div class="phase-header" role="button" tabindex="0" aria-expanded="${!isClosed}" onclick="togglePhase('${phase.id}')" onkeydown="keyAct(event,()=>togglePhase('${phase.id}'))">
        <div class="phase-title"><span class="phase-dot" aria-hidden="true"></span><span class="phase-name">${esc(phase.title)}</span><span class="phase-badge">${pd}/${pt}</span></div>
        <div class="phase-meta"><span class="phase-pct">${pp}%</span><i class="bi bi-chevron-down" id="chev-${phase.id}" style="${isClosed?'transform:rotate(-90deg)':''}" aria-hidden="true"></i></div>
      </div>
      <div class="phase-progress" aria-hidden="true"><i style="width:${pp}%"></i></div>
      <div id="body-${phase.id}" class="phase-body" style="${isClosed?'display:none':''}">${weeksHtml}</div>
    </section>`);
  });
  c.innerHTML = parts.join('');
  const emptyEl = document.getElementById('roadmap-empty');
  if(emptyEl) emptyEl.style.display = shownWeeks ? 'none' : '';
  restoreNoteDrafts(drafts);
}

function renderWeek(w,color){
  const wd=w.days.filter(d=>done.has(d.n)).length, wt=w.days.length;
  const pct=Math.round(wd/wt*100);
  const term = searchTerm.trim();
  const days=w.days.filter(d=>{
    if(filter==='done'&&!done.has(d.n)) return false;
    if(filter==='pending'&&done.has(d.n)) return false;
    if(term && !d.topic.toLowerCase().includes(term) && !d.desc.toLowerCase().includes(term) && !('day '+d.n).includes(term)) return false;
    return true;
  });
  if(!days.length) return '';
  const resHtml = w.res ? `<div class="wk-res"><i class="bi bi-book me-1" aria-hidden="true"></i><strong>Resources:</strong> ${w.res.map(r=>`<span class="chip">${esc(r)}</span>`).join('')}</div>` : '';
  const wkKey = 'w'+w.days[0].n;
  const hasNext = w.days.some(d=>d.n===NEXT_DAY);
  let collapsed;
  if(term || filter!=='all') collapsed = false;
  else if(weekState[wkKey]!==undefined) collapsed = !weekState[wkKey];
  else collapsed = !hasNext;
  return `<div class="week-card ${collapsed?'collapsed':''}" data-wk="${wkKey}">
    <div class="week-header" role="button" tabindex="0" aria-expanded="${!collapsed}" onclick="toggleWeek(this)" onkeydown="keyAct(event,()=>toggleWeek(this))">
      <span class="week-title"><i class="bi bi-chevron-down wk-chev" aria-hidden="true"></i><span class="week-no">${esc(w.week)}</span><span class="week-name">${esc(w.title)}</span></span>
      <div class="week-meta">
        <span class="deadline-badge">${esc(w.deadline)}</span>
        <div class="week-prog" aria-hidden="true"><div class="week-prog-fill" style="width:${pct}%"></div></div>
        <span class="week-count">${wd}/${wt}</span>
      </div>
    </div>
    ${days.map(d=>{
      const isDone = done.has(d.n), hasNote = !!dayNotes[d.n];
      return `
    <div class="day-row ${d.n===NEXT_DAY?'is-next':''} ${isDone?'is-done':''}" data-day="${d.n}">
      <span class="day-num">Day ${d.n}</span>
      <button type="button" class="day-check ${isDone?'done':''}" role="checkbox" aria-checked="${isDone}" aria-label="Day ${d.n}: ${escA(d.topic)}" onclick="toggle(${d.n})"></button>
      <div class="day-topic">
        <strong>${esc(d.topic)}${d.n===NEXT_DAY?'<span class="next-pill">Up next</span>':''}</strong>
        <span>${esc(d.desc)}</span>
      </div>
      <button type="button" class="day-note-btn ${hasNote?'has-note':''}" onclick="toggleNoteBox(${d.n})" title="${hasNote?'View or edit note':'Add a note'}" aria-label="${hasNote?'View or edit note':'Add a note'} for day ${d.n}" aria-expanded="false"><i class="bi bi-sticky${hasNote?'-fill':''}"></i></button>
      <div class="day-note-box" id="note-box-${d.n}"></div>
    </div>`;}).join('')}
    ${resHtml}
  </div>`;
}

function togglePhase(id){
  const body=document.getElementById('body-'+id);
  const chev=document.getElementById('chev-'+id);
  if(!body) return;
  const hidden=body.style.display==='none';
  body.style.display=hidden?'':'none';
  if(chev) chev.style.transform=hidden?'':'rotate(-90deg)';
  hidden ? closedPhases.delete(id) : closedPhases.add(id);
  const hd = body.parentElement.querySelector('.phase-header'); if(hd) hd.setAttribute('aria-expanded', String(hidden));
}

let resCatOrder = lsJSON('dotnet_res_cat_order', 'null');
function saveResCatOrder(names){ resCatOrder = names; localStorage.setItem('dotnet_res_cat_order', JSON.stringify(names)); }
let draggedResCat = null;
function attachResCardDragEvents(col, catName){
  const card = col.querySelector('.res-card');
  const handle = card.querySelector('h6');
  handle.style.cursor = 'grab';
  handle.setAttribute('draggable','true');
  handle.addEventListener('dragstart', e=>{ draggedResCat = catName; e.stopPropagation(); card.classList.add('dragging'); });
  handle.addEventListener('dragend', ()=>{ card.classList.remove('dragging'); document.querySelectorAll('.res-card').forEach(c=>c.classList.remove('drag-over-item')); });
  col.addEventListener('dragover', e=>{ e.preventDefault(); e.stopPropagation(); if(draggedResCat && draggedResCat!==catName) card.classList.add('drag-over-item'); });
  col.addEventListener('dragleave', ()=> card.classList.remove('drag-over-item'));
  col.addEventListener('drop', e=>{
    e.preventDefault(); e.stopPropagation(); card.classList.remove('drag-over-item');
    if(!draggedResCat || draggedResCat===catName) return;
    const names = [...document.querySelectorAll('#res-container > div')].map(x=>x.dataset.catName);
    const fromIdx = names.indexOf(draggedResCat), toIdx = names.indexOf(catName);
    names.splice(toIdx, 0, names.splice(fromIdx,1)[0]);
    saveResCatOrder(names);
    renderResources();
  });
}

function resLinkHTML(i, editable){
  const tag = `<span class="res-type">${esc(i.type)}</span>`;
  const price = `<span class="res-type ${i.label==='Free'?'is-free':'is-paid'}">${esc(i.label)}</span>`;
  const href = escA(safeUrl(i.url)||'#');
  if(!editable) return `<a class="res-link" href="${href}" target="_blank" rel="noopener noreferrer">${tag}<span class="res-name">${esc(i.name)}</span>${price}<i class="bi bi-box-arrow-up-right res-ext" aria-hidden="true"></i></a>`;
  return `<div class="res-link has-actions"><a href="${href}" target="_blank" rel="noopener noreferrer" class="res-main">${tag}<span class="res-name">${esc(i.name)}</span>${price}</a>
    <button type="button" class="item-action-btn" onclick="openResourceForm('${escA(i.id)}')" aria-label="Edit resource"><i class="bi bi-pencil"></i></button>
    <button type="button" class="item-action-btn danger" onclick="deleteResourceLink('${escA(i.id)}')" aria-label="Remove resource"><i class="bi bi-trash"></i></button></div>`;
}
function renderResources(){
  const c=document.getElementById('res-container'); c.innerHTML='';
  const customByCat = {};
  customResourceLinks.forEach(r=>{ (customByCat[r.category] = customByCat[r.category]||[]).push(r); });
  const cards = [];
  const mk = (catName, color, inner)=>{
    const col=document.createElement('div'); col.className='col-12 col-md-6'; col.dataset.catName=catName;
    col.innerHTML=`<div class="res-card" style="--phc:${tone(color)}"><h6><i class="bi bi-grip-vertical grip" aria-hidden="true"></i>${esc(catName)}</h6>${inner}</div>`;
    cards.push({catName, col});
  };
  RESOURCES.forEach(r=>{
    const extra = customByCat[r.phase] || [];
    delete customByCat[r.phase];
    mk(r.phase, r.color, r.items.map(i=>resLinkHTML(i,false)).join('') + extra.map(i=>resLinkHTML(i,true)).join(''));
  });
  Object.keys(customByCat).forEach(catName=> mk(catName, '#2f6b4f', customByCat[catName].map(i=>resLinkHTML(i,true)).join('')));
  let ordered = cards;
  if(resCatOrder){
    const map = new Map(cards.map(x=>[x.catName,x]));
    ordered = resCatOrder.map(n=>map.get(n)).filter(Boolean);
    cards.forEach(x=>{ if(!resCatOrder.includes(x.catName)) ordered.push(x); });
  }
  ordered.forEach(x=>{ c.appendChild(x.col); attachResCardDragEvents(x.col, x.catName); });
  const rsEl = document.getElementById('docs-search-input');
  if(rsEl && rsEl.value) filterResources();
}

function renderProjects(){
  const c=document.getElementById('proj-container');
  c.innerHTML = PROJECTS.map(p=>`<article class="proj-card ${p.featured?'featured':''}">
      <div class="proj-head">
        <div>
          <h5>${esc(p.name)}</h5>
          <span class="proj-sub">${esc(p.phase)} &nbsp;·&nbsp; ${esc(p.time)}</span>
        </div>
        <span class="proj-level lvl-${esc(String(p.level).toLowerCase())}">${esc(p.level)}</span>
      </div>
      <p class="proj-desc">${esc(p.desc)}</p>
      <p class="proj-goal"><strong>Goal:</strong> ${esc(p.goal)}</p>
      <div class="proj-feat-title">Features</div>
      <ul class="proj-feat">${p.features.map(f=>`<li>${esc(f)}</li>`).join('')}</ul>
      <div class="proj-tech-row">${p.tech.map(t=>`<span class="proj-tech">${esc(t)}</span>`).join('')}</div>
    </article>`).join('');
}

function renderStructure(){
  const c=document.getElementById('struct-container');
  c.innerHTML = STRUCTURES.map(s=>`<section class="phase-card mb-3" style="--phc:${tone(s.color)}">
      <div class="phase-header static"><div class="phase-title"><span class="phase-dot" aria-hidden="true"></span><span class="phase-name">${esc(s.name)}</span></div></div>
      <div class="struct-wrap"><div class="struct-tree" tabindex="0" role="region" aria-label="${escA(s.name)} folder tree">${s.tree}</div></div>
    </section>`).join('');
}

// ===================== ADVANCED+ TOPIC BOARD (add/edit/delete/drag/collapse) =====================
let advOrder = lsJSON('dotnet_adv_order', 'null');
let advCollapsed = lsJSON('dotnet_adv_collapsed', '{}');
let advOverrides = lsJSON('dotnet_adv_overrides', '{}');
let advDeleted = new Set(lsJSON('dotnet_adv_deleted', '[]'));
let advCustom = lsJSON('dotnet_adv_custom', '[]');
let editingAdvItem = null;
let pendingAdvMedia = null;
let advDraft = null; // keeps the title when switching type while editing

function getAllAdvItems(){
  const seed = ADV_TOPICS.map((t,i)=>({id:'adv-seed-'+i, type:'Bullets', badgeColor:t.color, title:t.title, summary:t.desc, points:t.points}));
  let all = [...seed, ...advCustom]
    .filter(it=>!advDeleted.has(it.id))
    .map(it=> advOverrides[it.id] ? {...it, ...advOverrides[it.id]} : it);
  if(advOrder){
    const map = new Map(all.map(i=>[i.id,i]));
    const ordered = advOrder.map(id=>map.get(id)).filter(Boolean);
    all.forEach(i=>{ if(!advOrder.includes(i.id)) ordered.push(i); });
    all = ordered;
  }
  return all;
}
function saveAdvOrder(items){ advOrder = items.map(i=>i.id); localStorage.setItem('dotnet_adv_order', JSON.stringify(advOrder)); }
function toggleAdvCollapse(id){ advCollapsed[id]=!advCollapsed[id]; localStorage.setItem('dotnet_adv_collapsed', JSON.stringify(advCollapsed)); renderAdvanced(); }

function renderAdvanced(){
  const c=document.getElementById('adv-container'); c.innerHTML='<div class="item-list" id="adv-list" style="padding:0;background:transparent"></div>';
  const list = document.getElementById('adv-list');
  getAllAdvItems().forEach(item=>{
    const closed = !!advCollapsed[item.id];
    const el = document.createElement('div');
    el.className='content-item';
    el.draggable = true;
    el.dataset.itemId = item.id;
    el.innerHTML = `
      <i class="bi bi-grip-vertical item-handle"></i>
      <div class="item-body">
        <div class="item-top">
          <span class="item-badge"><i class="bi ${TYPE_ICON[item.type]||'bi-file-text'} me-1" aria-hidden="true"></i>${esc(item.type)}</span>
          <span class="item-title">${esc(item.title)}</span>
          <button class="item-collapse-btn" onclick="toggleAdvCollapse('${escA(item.id)}')" title="Collapse/expand" aria-label="Collapse or expand" aria-expanded="${!closed}"><i class="bi bi-chevron-${closed?'down':'up'}"></i></button>
          <div class="item-actions">
            <button class="item-action-btn" onclick="editAdvItem('${escA(item.id)}')" title="Edit" aria-label="Edit"><i class="bi bi-pencil"></i></button>
            <button class="item-action-btn danger" onclick="deleteAdvItem('${escA(item.id)}')" title="Delete" aria-label="Delete"><i class="bi bi-trash"></i></button>
          </div>
        </div>
        ${closed ? '' : itemBodyHTML(item)}
      </div>`;
    list.appendChild(el);
    attachAdvDragEvents(el);
  });
    hydrateSliders(c);
}

let draggedAdvId = null;
function attachAdvDragEvents(el){
  el.addEventListener('dragstart', ()=>{ draggedAdvId = el.dataset.itemId; el.classList.add('dragging'); });
  el.addEventListener('dragend', ()=>{ el.classList.remove('dragging'); document.querySelectorAll('#adv-list .content-item').forEach(i=>i.classList.remove('drag-over-item')); });
  el.addEventListener('dragover', e=>{ e.preventDefault(); if(draggedAdvId && draggedAdvId!==el.dataset.itemId) el.classList.add('drag-over-item'); });
  el.addEventListener('dragleave', ()=> el.classList.remove('drag-over-item'));
  el.addEventListener('drop', e=>{
    e.preventDefault(); el.classList.remove('drag-over-item');
    if(!draggedAdvId || draggedAdvId===el.dataset.itemId) return;
    const items = getAllAdvItems();
    const fromIdx = items.findIndex(i=>i.id===draggedAdvId);
    const toIdx = items.findIndex(i=>i.id===el.dataset.itemId);
    const [moved] = items.splice(fromIdx,1);
    items.splice(toIdx,0,moved);
    saveAdvOrder(items);
    renderAdvanced();
  });
}

function deleteAdvItem(id){
  const item = getAllAdvItems().find(i=>i.id===id);
  if(!item) return;
  const isSeed = id.startsWith('adv-seed-');
  let idx = -1, removed = null;
  if(isSeed){ advDeleted.add(id); localStorage.setItem('dotnet_adv_deleted', JSON.stringify([...advDeleted])); }
  else {
    idx = advCustom.findIndex(i=>i.id===id); if(idx<0) return;
    removed = advCustom[idx]; advCustom = advCustom.filter(i=>i.id!==id);
    localStorage.setItem('dotnet_adv_custom', JSON.stringify(advCustom));
  }
  renderAdvanced();
  toastUndo('Deleted "'+clipText(item.title)+'"', ()=>{
    if(isSeed){ advDeleted.delete(id); localStorage.setItem('dotnet_adv_deleted', JSON.stringify([...advDeleted])); }
    else { advCustom.splice(Math.min(idx, advCustom.length), 0, removed); localStorage.setItem('dotnet_adv_custom', JSON.stringify(advCustom)); }
    renderAdvanced();
  }, ()=>{ itemMediaKeys(item).forEach(k=>idbDelete(k));  });
}
function editAdvItem(id){ openAdvForm(id); }

function advCategoryForType(type){
  if(type==='PDF') return 'PDF';
  if(type==='Image') return 'Image';
  if(type==='Link' || type==='Video' || type==='Post') return 'Link';
  return 'Content';
}

// ---- Step 1: ask what kind of advanced topic to add (mirrors Docs Hub) ----
function openAdvChooser(){
  editingAdvItem = null; pendingAdvMedia = null; advDraft = null;
  const slot = document.getElementById('adv-form-slot');
  slot.innerHTML = `
    <div class="author-form">
      <h6 class="form-title"><i class="bi bi-plus-circle me-1"></i>What kind of advanced topic?</h6>
      <p class="small text-muted mb-3">Pick a type — the form below will only ask what's relevant.</p>
      <div class="type-chooser-grid">
        <button type="button" class="type-chooser-btn" onclick="openAdvForm(null,'PDF')"><i class="bi bi-file-earmark-pdf-fill" style="color:#dc2626"></i><span class="tc-label">PDF</span><span class="tc-desc">Upload &amp; preview a PDF</span></button>
        <button type="button" class="type-chooser-btn" onclick="openAdvForm(null,'Image')"><i class="bi bi-image" style="color:#d97706"></i><span class="tc-label">Image</span><span class="tc-desc">Upload a picture</span></button>
        <button type="button" class="type-chooser-btn" onclick="openAdvForm(null,'Link')"><i class="bi bi-link-45deg" style="color:#0891b2"></i><span class="tc-label">Link</span><span class="tc-desc">Web link — video links auto-play</span></button>
        <button type="button" class="type-chooser-btn" onclick="openAdvForm(null,'Content')"><i class="bi bi-text-paragraph" style="color:#16a34a"></i><span class="tc-label">Content</span><span class="tc-desc">Paragraph, bullets, or diagram</span></button>
      </div>
      <div class="d-flex mt-3"><button class="btn btn-outline-secondary btn-sm" onclick="closeAdvForm()">Cancel</button></div>
    </div>`;
  slot.scrollIntoView({behavior:'smooth', block:'nearest'});
}

function openAdvForm(itemId, category){
  const isEdit = !!itemId;
  editingAdvItem = itemId; pendingAdvMedia = null;
  const item = isEdit ? getAllAdvItems().find(i=>i.id===itemId) : null;
  if(isEdit && !category) category = advCategoryForType(item.type);
  if(!isEdit && !category){ openAdvChooser(); return; }
  const draft = advDraft; advDraft = null;

  let typeSpecificHTML = '';
  if(category==='PDF'){
    typeSpecificHTML = `
      <div class="col-12"><label>PDF file ${isEdit && item.mediaKey && item.type==='PDF' ? '' : '<span class="text-danger">*required</span>'}</label><div class="media-drop" onclick="document.getElementById('adv-pdf-input').click()"><i class="bi bi-cloud-upload me-1"></i>Choose a PDF or drop it here<input type="file" id="adv-pdf-input" accept="application/pdf" style="display:none" onclick="event.stopPropagation()" onchange="handleAdvMediaFile(event)"></div><div class="media-preview-name" id="adv-media-name-pdf">${esc(isEdit && item.type==='PDF'?(item.mediaName||'Existing PDF kept'):'')}</div></div>
      <div class="col-12"><label>Topic / notes <span class="text-muted fw-normal">(optional, collapsible)</span></label>${rteEditorHTML('adv-para','Write your notes here…', isEdit && item.type==='PDF'?item.summary||'':'')}</div>`;
  } else if(category==='Image'){
    typeSpecificHTML = `
    <div class="col-12"><label>Images <span class="text-danger">*required</span> <span class="text-muted fw-normal">— as many as you want</span></label>${imgPickerHTML('adv-imgs', isEdit && item.type==='Image' ? itemImages(item) : [])}</div>
    <div class="col-12"><label>Description <span class="text-muted fw-normal">(optional)</span></label>${rteEditorHTML('adv-summary','Short description…', isEdit && item.type==='Image'?item.summary||'':'')}</div>`;
  } else if(category==='Link'){
    typeSpecificHTML = `
      <div class="col-12"><label>Link URL <span class="text-danger">*required</span> <span class="text-muted fw-normal">— video links play right here</span></label><input id="adv-url" class="form-control" value="${escA(isEdit && item.url?item.url:'')}" placeholder="https://..."></div>
      <div class="col-12"><label>Short summary <span class="text-muted fw-normal">(optional)</span></label>${rteEditorHTML('adv-summary','Short description…', isEdit?item.summary||'':'')}</div>`;
  } else {
    typeSpecificHTML = `
      <div class="col-md-5"><label>Content type</label><select id="adv-type" class="form-select" onchange="renderAdvTypeFields()">
        <option value="Bullets">Bullets</option><option value="Paragraph">Paragraph</option><option value="Diagram">Mini Roadmap Diagram</option>
      </select></div>
      <div class="col-12 adv-type-field" data-type="Paragraph"><label>Paragraph text</label>${rteEditorHTML('adv-para','Write your notes here…', isEdit && item.type==='Paragraph'?item.summary||'':'')}</div>
      <div class="col-12 adv-type-field" data-type="Bullets"><label>Bullet points</label>${rteEditorHTML('adv-bullets','Type your points — press Enter for the next bullet', pointsToListHTML(isEdit && item.points ? item.points : []))}</div>
      <div class="col-12 adv-type-field" data-type="Diagram"><label>Steps (one per line)</label><textarea id="adv-steps" class="form-control" rows="3">${esc(isEdit && item.steps?item.steps.join('\n'):'')}</textarea></div>
      <div class="col-12"><label>Short summary <span class="text-muted fw-normal">(optional)</span></label>${rteEditorHTML('adv-summary','Short description…', isEdit && item.type!=='Paragraph'?item.summary||'':'')}</div>`;
  }

  const catMeta = {PDF:{icon:'bi-file-earmark-pdf-fill',label:'PDF'},Image:{icon:'bi-image',label:'Image'},Link:{icon:'bi-link-45deg',label:'Link'},Content:{icon:'bi-text-paragraph',label:'Content'}}[category];
  const slot = document.getElementById('adv-form-slot');
  slot.innerHTML = `
    <div class="author-form">
      <h6 class="form-title"><i class="bi ${isEdit?'bi-pencil-square':catMeta.icon} me-1"></i>${isEdit?'Edit topic':'Add '+catMeta.label+' topic'}</h6>
      <div class="row g-2">
        <div class="col-12"><label>Topic title <span class="text-danger">*required</span></label><input id="adv-title" class="form-control" value="${escA(draft ? draft.title : (isEdit?item.title:''))}" placeholder="e.g. Rate Limiting Strategies"></div>
        ${tagFieldHTML('adv-tags', isEdit ? item.tags : [])}
        ${isEdit ? typeSwitcherHTML(category,'switchAdvFormType') : ''}
        ${typeSpecificHTML}
      </div>
      <div class="d-flex gap-2 mt-3 flex-wrap">
        <button class="btn btn-primary btn-sm" onclick="submitAdvForm('${category}')"><i class="bi bi-check2 me-1"></i>${isEdit?'Save changes':'Add'}</button>
        <button class="btn btn-outline-secondary btn-sm" onclick="closeAdvForm()">Cancel</button>
        ${!isEdit ? `<button class="btn btn-link btn-sm text-muted" onclick="openAdvChooser()"><i class="bi bi-arrow-left me-1"></i>Back</button>` : ''}
      </div>
    </div>`;
  if(category==='Image') imgPickerRender('adv-imgs');
  if(category==='Content'){ document.getElementById('adv-type').value = (isEdit && ['Bullets','Paragraph','Diagram'].includes(item.type)) ? item.type : 'Bullets'; renderAdvTypeFields(); }  
  draftSetup('adv|'+(isEdit?'e:'+itemId:'n')+'|'+category, ()=>openAdvForm(itemId, category));
  slot.scrollIntoView({behavior:'smooth', block:'nearest'});
}
function closeAdvForm(){ draftFlush(); _draft = null; document.getElementById('adv-form-slot').innerHTML=''; editingAdvItem=null; pendingAdvMedia=null; advDraft=null; }
function switchAdvFormType(cat){
  if(!editingAdvItem) return;
  const t = document.getElementById('adv-title');
  advDraft = {title: t ? t.value : ''};
  openAdvForm(editingAdvItem, cat);
}
function renderAdvTypeFields(){
  const type = document.getElementById('adv-type').value;
  document.querySelectorAll('.adv-type-field').forEach(f=>f.classList.toggle('active', f.dataset.type===type));
}
async function handleAdvMediaFile(e){
  const file = e.target.files[0]; if(!file) return;
  const up = await readUpload(file);
  if(!up){ e.target.value=''; return; }
  pendingAdvMedia = up;
  const el = document.getElementById('adv-media-name') || document.getElementById('adv-media-name-pdf');
  if(el) el.textContent = '✓ ' + file.name + ' (' + Math.round(up.dataUrl.length*0.75/1024) + ' KB)';
}
async function submitAdvForm(category){
  const title = document.getElementById('adv-title').value.trim();
  if(!title){ alert('Please add a topic title.'); return; }

  let type;
  if(category==='PDF') type='PDF';
  else if(category==='Image') type='Image';
  else if(category==='Link'){ const url=normUrl(document.getElementById('adv-url').value); type = getVideoEmbedInfo(url) ? 'Video' : 'Link'; }
  else type = document.getElementById('adv-type').value;

  let data = {type, title, badgeColor: TYPE_COLOR[type], tags: parseTags((document.getElementById('adv-tags')||{}).value)};
  const summaryEl = document.getElementById('adv-summary');
  data.summary = summaryEl ? rteGetHTML('adv-summary') : '';
  if(type==='Paragraph') data.summary = rteGetHTML('adv-para');
  if(type==='PDF'){ const p=document.getElementById('adv-para'); if(p) data.summary = rteGetHTML('adv-para'); }
  if(type==='Bullets') data.points = rteGetPoints('adv-bullets');
  if(type==='Diagram') data.steps = document.getElementById('adv-steps').value.split('\n').map(s=>s.trim()).filter(Boolean);
  if(type==='Link' || type==='Video') data.url = normUrl(document.getElementById('adv-url').value);
  const old = editingAdvItem ? getAllAdvItems().find(i=>i.id===editingAdvItem) : null;
  if(editingAdvItem && !old){ alert('That topic no longer exists.'); closeAdvForm(); renderAdvanced(); return; }
  const isImg = type==='Image', isPDF = type==='PDF';
  const keepOld = !!(old && isPDF && !pendingAdvMedia && old.mediaKey && old.type==='PDF');
  if(isPDF && !pendingAdvMedia && !keepOld){ alert('Please choose a PDF file to upload.'); return; }
  if(isImg && !(IMGPICK['adv-imgs']||[]).length){ alert('Please add at least one image.'); return; }
  if((type==='Link'||type==='Video') && !data.url){ alert('Please enter a valid web link (https://…).'); return; }
  if(isPDF && pendingAdvMedia){
    const key = 'media-adv-'+Date.now()+'-'+Math.random().toString(36).slice(2,8);
    const busy = busyStart();
    try{ await idbPut(key, pendingAdvMedia.dataUrl, busy.progress); } finally { busy.done(); }
    data.mediaKey = key; data.mediaName = pendingAdvMedia.name;
  } else if(keepOld){ data.mediaKey = old.mediaKey; data.mediaName = old.mediaName; }
  if(isImg){
    const busy = busyStart();
    try{ const imgs = await imgPickerCommit('adv-imgs','media-adv-',busy); data.images = imgs; data.mediaKey = imgs[0].key; data.mediaName = imgs[0].name; } finally { busy.done(); }
  }

  if(editingAdvItem){
    pruneMedia(old, data);   // replaced, or switched away from PDF/Image
    if(editingAdvItem.startsWith('adv-seed-')){
      STALE_KEYS.forEach(k=>{ if(!(k in data)) data[k] = null; });   // clear the built-in topic's old bullets/link/etc.
      advOverrides[editingAdvItem] = data;
      localStorage.setItem('dotnet_adv_overrides', JSON.stringify(advOverrides));
    } else {
      const idx = advCustom.findIndex(i=>i.id===editingAdvItem);
      if(idx<0){ alert('That topic no longer exists.'); closeAdvForm(); renderAdvanced(); return; }
      advCustom[idx] = dropStale({...old, ...data, id:old.id}, data);
      localStorage.setItem('dotnet_adv_custom', JSON.stringify(advCustom));
    }
  } else {
    const newItem = {id:'adv-custom-'+Date.now(), ...data};
    advCustom.push(newItem);
    localStorage.setItem('dotnet_adv_custom', JSON.stringify(advCustom));
  }
  draftClear();
  closeAdvForm();
  renderAdvanced();
}

let customQA = lsJSON('dotnet_custom_qa', '[]'); // [{id, cat, q, a}] or rich {id, cat, q, type, summary/points/steps/url/mediaKey/mediaName}
let qaOverrides = lsJSON('dotnet_qa_overrides', '{}'); // edits to hardcoded (seed) questions, keyed by seed id
let qaDeleted = new Set(lsJSON('dotnet_qa_deleted', '[]')); // deleted hardcoded question ids
let editingQAItem = null; // id being edited, or null when adding
let pendingQAMedia = null;

// ---- Interview Q&A: dynamic, scrollable sub-tabs (Built-in Topics / My Questions are built-in;
// any number of custom ones can be created right from the "Add question" flow) ----
let qaSections = lsJSON('dotnet_qa_sections', 'null') || [
  {key:'builtin', label:'Built-in Topics', icon:'bi-collection', builtin:true},
  {key:'custom', label:'My Questions', icon:'bi-person-lines-fill', builtin:true}
];
let activeQASection = localStorage.getItem('dotnet_active_qa_section') || 'builtin';
if(!qaSections.some(s=>s.key===activeQASection)) activeQASection = 'builtin';
function saveQASections(){ localStorage.setItem('dotnet_qa_sections', JSON.stringify(qaSections)); }

// Hardcoded QA_DATA questions get stable ids and flow through the same
// override/delete pattern as Docs Hub + Advanced+ seed items, so they're
// editable and deletable too — not just custom-added ones.
function getAllQAItems(){
  const seed = [];
  QA_DATA.forEach((cat,ci)=>{ cat.qs.forEach((qq,qi)=>{ seed.push({id:'qa-seed-'+ci+'-'+qi, cat:cat.cat, q:qq.q, a:qq.a}); }); });
  return [...seed, ...customQA]
    .filter(it=>!qaDeleted.has(it.id))
    .map(it=> qaOverrides[it.id] ? {...it, ...qaOverrides[it.id]} : it);
}

let _relCache = null;
function findRelatedContent(question){
  const words = question.toLowerCase().split(/\W+/).filter(w=>w.length>4);
  if(!words.length) return [];
  if(!_relCache){ _relCache = {days:[], docs:[]};
    PHASES.forEach(p=>p.weeks.forEach(w=>w.days.forEach(d=>_relCache.days.push({d, t:d.topic.toLowerCase()}))));
    getAllAuthors().forEach(a=>a.items.forEach(it=>_relCache.docs.push({it, t:String(it.title||'').toLowerCase()})));
    setTimeout(()=>{ _relCache = null; }, 0);
  }
  const hits = [];
  _relCache.days.forEach(({d,t})=>{ if(words.some(w=>t.includes(w))) hits.push({label:`Day ${d.n} — ${d.topic}`, kind:'Roadmap'}); });
  _relCache.docs.forEach(({it,t})=>{ if(words.some(w=>t.includes(w))) hits.push({label:it.title, kind:'Docs Hub'}); });
  const seen0 = new Set();
  return hits.filter(h=>{ const k=h.kind+h.label; if(seen0.has(k)) return false; seen0.add(k); return true; }).slice(0,2);

}

// Renders a QA answer body: rich items (PDF/Image/Link/Video) reuse itemBodyHTML just like
// Docs Hub / Advanced+; plain-text answers collapse behind "Show more" past ~220 chars.
// Rich-text answers (containing HTML tags from the editor) are never truncated, since cutting
// mid-tag would break the markup — they're shown in full instead.
function qaAnswerHTML(q){
  if(q.type) return itemBodyHTML(q);
  return qaPlainAnswerHTML(q) + tagChipsHTML(q);
}
function qaPlainAnswerHTML(q){
  const text = q.a || '';
  // Only editor output counts as rich text. Plain answers such as "Span<T> is a ref struct" must be escaped, not parsed.
  if(isRich(text) || text.length <= 220) return `<div class="item-summary mb-0">${rich(text)}</div>`;
  const short = text.slice(0,220).trim();
  return `<div class="item-summary mb-0 qa-long-text" data-full="${encodeURIComponent(text)}" data-short="${encodeURIComponent(short)}" data-expanded="0">${esc(short)}… <button type="button" class="qa-showmore-btn" onclick="event.stopPropagation();toggleQALongText(this.parentElement)">Show more</button></div>`;
}
function toggleQALongText(p){
  const expanded = p.dataset.expanded==='1';
  const full = decodeURIComponent(p.dataset.full);
  const short = decodeURIComponent(p.dataset.short);
  p.innerHTML = expanded
    ? `${esc(short)}… <button type="button" class="qa-showmore-btn" onclick="event.stopPropagation();toggleQALongText(this.parentElement)">Show more</button>`
    : `${esc(full)} <button type="button" class="qa-showmore-btn" onclick="event.stopPropagation();toggleQALongText(this.parentElement)">Show less</button>`;
  p.dataset.expanded = expanded ? '0' : '1';
}

// Builds one category card's HTML (used by both the Built-in and My Questions views).
// ---- Drag & drop: reorder questions within a category (persisted, mirrors Docs Hub) ----
let qaCatOrders = lsJSON('dotnet_qa_cat_orders', '{}');
function saveQACatOrder(catName, ids){ qaCatOrders[catName] = ids; localStorage.setItem('dotnet_qa_cat_orders', JSON.stringify(qaCatOrders)); }
function applyQAOrder(catName, qs){
  const ord = qaCatOrders[catName];
  if(!ord) return qs;
  const map = new Map(qs.map(q=>[q.id,q]));
  const ordered = ord.map(id=>map.get(id)).filter(Boolean);
  qs.forEach(q=>{ if(!ord.includes(q.id)) ordered.unshift(q); }); // newly added / unordered items float to the top
  return ordered;
}
let draggedQAId = null, draggedQACat = null;
function attachQADragEvents(el, catName){
  el.addEventListener('dragstart', e=>{ draggedQAId = el.dataset.itemId; draggedQACat = catName; e.stopPropagation(); el.classList.add('dragging'); });
  el.addEventListener('dragend', ()=>{ el.classList.remove('dragging'); document.querySelectorAll('.interview-q').forEach(i=>i.classList.remove('drag-over-item')); });
  el.addEventListener('dragover', e=>{ e.preventDefault(); e.stopPropagation(); if(draggedQACat===catName && draggedQAId!==el.dataset.itemId) el.classList.add('drag-over-item'); });
  el.addEventListener('dragleave', ()=> el.classList.remove('drag-over-item'));
  el.addEventListener('drop', e=>{
    e.preventDefault(); e.stopPropagation(); el.classList.remove('drag-over-item');
    if(draggedQACat!==catName || draggedQAId===el.dataset.itemId) return;
    const rows = [...el.parentElement.querySelectorAll(':scope > .interview-q')];
    const ids = rows.map(r=>r.dataset.itemId);
    const fromIdx = ids.indexOf(draggedQAId);
    const toIdx = ids.indexOf(el.dataset.itemId);
    ids.splice(toIdx, 0, ids.splice(fromIdx,1)[0]);
    saveQACatOrder(catName, ids);
    renderInterview();
  });
}

// ---- Search filter (works within whichever section tab is currently active) ----
function filterQAList(){
  const term = (document.getElementById('qa-search-input').value||'').trim().toLowerCase();
  document.querySelectorAll('#qa-items-container .phase-card').forEach(card=>{
    let anyVisible = false;
    card.querySelectorAll('.interview-q').forEach(row=>{
      const match = !term || row.textContent.toLowerCase().includes(term);
      row.style.display = match ? '' : 'none';
      if(match) anyVisible = true;
    });
    card.style.display = anyVisible ? '' : 'none';
  });
}

function qaCategoryCardHTML(catName, qs, color, qiStart){
  let qi = qiStart;
  qs = applyQAOrder(catName, qs);
  return {qi: qi + qs.length, html: `<section class="phase-card mb-3" data-cat-name="${escA(catName)}" style="--phc:${tone(color)}">
      <div class="phase-header static" draggable="true" title="Drag to reorder this whole category">
        <div class="phase-title"><i class="bi bi-grip-vertical grip" aria-hidden="true"></i><span class="phase-name">${esc(catName)}</span></div>
        <div class="cat-right">
          <span class="phase-badge">${qs.length} ${qs.length===1?'question':'questions'}</span>
          <button type="button" class="item-action-btn" onclick="event.stopPropagation();addQAToCategory(this.closest('.phase-card').dataset.catName)" title="Add a question or upload to this topic" aria-label="Add a question or upload to this topic"><i class="bi bi-plus-lg"></i></button>
          <button type="button" class="item-action-btn" onclick="event.stopPropagation();openRenameQACategory(this.closest('.phase-card').dataset.catName)" title="Rename category" aria-label="Rename category"><i class="bi bi-pencil"></i></button>
          <button type="button" class="item-action-btn danger" onclick="event.stopPropagation();deleteQACategory(this.closest('.phase-card').dataset.catName)" title="Delete category" aria-label="Delete category"><i class="bi bi-trash"></i></button>
        </div>
      </div>
      <div class="qa-list">
        ${qs.map(q=>{
          const id='qa-'+(qi++);
          const related = findRelatedContent(q.q);
          return `<div class="interview-q" draggable="true" data-item-id="${escA(q.id)}" data-cat="${escA(catName)}">
            <div class="qa-row" role="button" tabindex="0" aria-expanded="false" onclick="toggleQA('${id}','${escA(q.id)}',this)" onkeydown="if(event.target===this)keyAct(event,()=>toggleQA('${id}','${escA(q.id)}',this))">
              <span class="qa-q"><i class="bi bi-grip-vertical grip" aria-hidden="true" title="Drag to reorder"></i>${q.type?`<span class="item-badge"><i class="bi ${TYPE_ICON[q.type]||'bi-file-text'} me-1" aria-hidden="true"></i>${esc(q.type)}</span>`:''}<span>${esc(q.q)}</span></span>
              <span class="qa-tools">
                <button type="button" class="item-action-btn" onclick="event.stopPropagation();editQAItem('${escA(q.id)}')" aria-label="Edit question"><i class="bi bi-pencil"></i></button>
                <button type="button" class="item-action-btn danger" onclick="event.stopPropagation();deleteQAItem('${escA(q.id)}')" aria-label="Delete question"><i class="bi bi-trash"></i></button>
                <i class="bi bi-chevron-down qa-chev" aria-hidden="true"></i>
              </span>
            </div>
            <div id="${id}" class="qa-answer">
              ${qaAnswerHTML(q)}
              ${related.length ? `<div class="qa-related">${related.map(r=>`<span class="rel-chip"><i class="bi bi-link-45deg" aria-hidden="true"></i> ${esc(r.label)} (${esc(r.kind)})</span>`).join('')}</div>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
    </section>`};
}

// ---- Drag & drop: reorder entire category sections (Built-in Topics / My Questions, tracked separately) ----
let qaCatOrder = lsJSON('dotnet_qa_cat_order', '{}'); // {builtin:[catName,...], custom:[catName,...]}
function applyCatOrder(viewKey, cats){
  const ord = qaCatOrder[viewKey];
  if(!ord) return cats;
  const set = new Set(cats);
  const ordered = ord.filter(c=>set.has(c));
  cats.forEach(c=>{ if(!ordered.includes(c)) ordered.push(c); });
  return ordered;
}
function saveCatOrder(viewKey, cats){ qaCatOrder[viewKey]=cats; localStorage.setItem('dotnet_qa_cat_order', JSON.stringify(qaCatOrder)); }
let draggedQACatName = null, draggedQACatView = null;
function attachQACategoryDragEvents(el, viewKey){
  const handle = el.querySelector('.phase-header');
  handle.addEventListener('dragstart', e=>{ draggedQACatName = el.dataset.catName; draggedQACatView = viewKey; e.stopPropagation(); el.classList.add('dragging'); });
  handle.addEventListener('dragend', ()=>{ el.classList.remove('dragging'); document.querySelectorAll('.phase-card').forEach(c=>c.classList.remove('drag-over-item')); });
  el.addEventListener('dragover', e=>{ e.preventDefault(); e.stopPropagation(); if(draggedQACatView===viewKey && draggedQACatName!==el.dataset.catName) el.classList.add('drag-over-item'); });
  el.addEventListener('dragleave', ()=> el.classList.remove('drag-over-item'));
  el.addEventListener('drop', e=>{
    e.preventDefault(); e.stopPropagation(); el.classList.remove('drag-over-item');
    if(draggedQACatView!==viewKey || draggedQACatName===el.dataset.catName) return;
    const names = [...el.parentElement.querySelectorAll(':scope > .phase-card')].map(c=>c.dataset.catName);
    const fromIdx = names.indexOf(draggedQACatName), toIdx = names.indexOf(el.dataset.catName);
    names.splice(toIdx, 0, names.splice(fromIdx,1)[0]);
    saveCatOrder(viewKey, names);
    renderInterview();
  });
}

function renderInterview(){
  renderQASubtabs();
  const allItems = getAllQAItems();
  const catColorMap = {}; QA_DATA.forEach(cc=> catColorMap[cc.cat]=cc.color);
  const builtinIds = new Set();
  QA_DATA.forEach((cat,ci)=> cat.qs.forEach((qq,qi)=> builtinIds.add('qa-seed-'+ci+'-'+qi)));

  const sectionItems = allItems.filter(i=>{
    const sec = i.section || (builtinIds.has(i.id) ? 'builtin' : 'custom');
    return sec === activeQASection;
  });

  const c = document.getElementById('qa-items-container'); c.innerHTML='';
  if(sectionItems.length===0){
    c.innerHTML = `<p class="small text-muted text-center py-3"><i class="bi bi-info-circle me-1"></i>Nothing in this tab yet — tap "Add question" above to add one here.</p>`;
  } else {
    let html = '';
    let cats = [...new Set(sectionItems.map(i=>i.cat))];
    cats = applyCatOrder(activeQASection, cats);
    let qi=0;
    cats.forEach(catName=>{
      const qs = sectionItems.filter(i=>i.cat===catName);
      if(qs.length===0) return;
      const color = catColorMap[catName] || (activeQASection==='builtin' ? '#1f3a7a' : '#2f6b4f');
      const res = qaCategoryCardHTML(catName, qs, color, qi); qi = res.qi;
      html += res.html;
    });
    c.innerHTML = html;
  }

  document.querySelectorAll('#qa-items-container > .phase-card').forEach(el=> attachQACategoryDragEvents(el, activeQASection));
  document.querySelectorAll('#qa-items-container .interview-q').forEach(el=> attachQADragEvents(el, el.dataset.cat));
  const searchEl = document.getElementById('qa-search-input');
  if(searchEl && searchEl.value) filterQAList();
}

// ---- Dynamic, scrollable Interview Q&A sub-tabs ----
function renderQASubtabs(){
  const el = document.getElementById('qa-subtabs');
  if(!el) return;
  el.innerHTML = qaSections.map(s=>`
    <button class="subtab-pill ${s.key===activeQASection?'active':''}" data-key="${escA(s.key)}" draggable="true" onclick="setQASubtab('${escA(s.key)}')">
      <i class="bi bi-grip-vertical grip" aria-hidden="true"></i>
      <i class="bi ${escA(s.icon)}" aria-hidden="true"></i>${esc(s.label)}
      ${!s.builtin ? `<span class="del-section" role="button" tabindex="0" aria-label="Delete this tab" onclick="event.stopPropagation();deleteQASection('${escA(s.key)}')" onkeydown="if(event.key==='Enter'){event.stopPropagation();deleteQASection('${escA(s.key)}')}"><i class="bi bi-x-circle"></i></span>` : ''}
    </button>`).join('')
    + `<button class="subtab-pill add-pill" onclick="promptNewQASection()"><i class="bi bi-plus-lg"></i>New tab</button>`;
  attachSubtabDragEvents('qa-subtabs', qaSections, saveQASections, renderQASubtabs);
}
function setQASubtab(key){
  activeQASection = key;
  localStorage.setItem('dotnet_active_qa_section', key);
  renderInterview();
}
function promptNewQASection(){
  const name = (prompt('Name your new tab (e.g. "Behavioral Questions", "System Design"):')||'').trim().slice(0,40);
  if(!name) return;
  const key = slugify(name);
  if(!qaSections.some(s=>s.key===key)){
    qaSections.push({key, label:name, icon:'bi-folder2', builtin:false});
    saveQASections();
  }
  setQASubtab(key);
}
function deleteQASection(key){
  const sec = qaSections.find(s=>s.key===key);
  if(!sec) return;
  if(!confirm('Delete the "'+sec.label+'" tab? Any questions in it will move back to My Questions.')) return;
  customQA.forEach(q=>{ if((q.section||'custom')===key) q.section='custom'; });
  localStorage.setItem('dotnet_custom_qa', JSON.stringify(customQA));
  qaSections = qaSections.filter(s=>s.key!==key);
  saveQASections();
  setQASubtab('custom');
}

function deleteQAItem(id){
  const item = getAllQAItems().find(i=>i.id===id);
  if(!item) return;
  const isSeed = id.startsWith('qa-seed-');
  let idx = -1, removed = null;
  if(isSeed){ qaDeleted.add(id); localStorage.setItem('dotnet_qa_deleted', JSON.stringify([...qaDeleted])); }
  else {
    idx = customQA.findIndex(i=>i.id===id); if(idx<0) return;
    removed = customQA[idx]; customQA = customQA.filter(i=>i.id!==id);
    localStorage.setItem('dotnet_custom_qa', JSON.stringify(customQA));
  }
  renderInterview();
  toastUndo('Deleted "'+clipText(item.q)+'"', ()=>{
    if(isSeed){ qaDeleted.delete(id); localStorage.setItem('dotnet_qa_deleted', JSON.stringify([...qaDeleted])); }
    else { customQA.splice(Math.min(idx, customQA.length), 0, removed); localStorage.setItem('dotnet_custom_qa', JSON.stringify(customQA)); }
    renderInterview();
  }, ()=>{ itemMediaKeys(item).forEach(k=>idbDelete(k));  });
}
function editQAItem(id){ openQAForm(id); }

// ---- Main category (the card heading in Interview Q&A): rename + delete ----
// Applies to the questions of that category in the tab you are looking at.
function qaItemsOfCategory(catName){
  const builtinIds = new Set();
  QA_DATA.forEach((cat,ci)=> cat.qs.forEach((qq,qi)=> builtinIds.add('qa-seed-'+ci+'-'+qi)));
  return getAllQAItems().filter(i=>{
    const sec = i.section || (builtinIds.has(i.id) ? 'builtin' : 'custom');
    return sec===activeQASection && i.cat===catName;
  });
}
let renamingQACat = null;
function openRenameQACategory(catName){
  renamingQACat = catName;
  openModal(`<div class="author-form docshub-form-compact mb-0">
    <h6 class="form-title"><i class="bi bi-pencil me-1"></i>Rename category</h6>
    <input id="qa-cat-rename" class="form-control" maxlength="60" value="${escA(catName)}" aria-label="Category name" onkeydown="if(event.key==='Enter'){event.preventDefault();saveRenameQACategory()}">
    <div class="small text-muted mt-2">Renaming moves all ${qaItemsOfCategory(catName).length} question(s) in this category. Using an existing name merges the two.</div>
    <div class="d-flex justify-content-end gap-2 mt-3">
      <button class="btn btn-sm btn-outline-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-sm btn-primary" onclick="saveRenameQACategory()"><i class="bi bi-check2 me-1"></i>Save</button>
    </div></div>`);
  setTimeout(()=>{ const i=document.getElementById('qa-cat-rename'); if(i){ i.focus(); i.select(); } }, 250);
}
function saveRenameQACategory(){
  const old = renamingQACat;
  const name = (document.getElementById('qa-cat-rename').value||'').trim().slice(0,60);
  if(!old || !name){ alert('Please enter a category name.'); return; }
  if(name===old){ closeModal(); return; }
  const items = qaItemsOfCategory(old);
  items.forEach(i=>{
    if(String(i.id).startsWith('qa-seed-')) qaOverrides[i.id] = {...(qaOverrides[i.id]||{}), cat:name};
    else { const c = customQA.find(x=>x.id===i.id); if(c) c.cat = name; }
  });
  localStorage.setItem('dotnet_qa_overrides', JSON.stringify(qaOverrides));
  localStorage.setItem('dotnet_custom_qa', JSON.stringify(customQA));
  // keep the saved question order and category order that belonged to the old name
  if(qaCatOrders[old]){ qaCatOrders[name] = [...(qaCatOrders[name]||[]), ...qaCatOrders[old].filter(id=>!(qaCatOrders[name]||[]).includes(id))]; delete qaCatOrders[old]; localStorage.setItem('dotnet_qa_cat_orders', JSON.stringify(qaCatOrders)); }
  const view = qaCatOrder[activeQASection];
  if(view){ qaCatOrder[activeQASection] = [...new Set(view.map(c=>c===old?name:c))]; localStorage.setItem('dotnet_qa_cat_order', JSON.stringify(qaCatOrder)); }
  renamingQACat = null;
  closeModal();
  renderInterview();
}
function deleteQACategory(catName){
  const items = qaItemsOfCategory(catName);
  if(!confirm(`Delete the category "${catName}" and its ${items.length} question${items.length===1?'':'s'}? This can't be undone.`)) return;
  items.forEach(i=>{
    itemMediaKeys(i).forEach(k=>idbDelete(k));
    if(String(i.id).startsWith('qa-seed-')) qaDeleted.add(i.id);
    else customQA = customQA.filter(x=>x.id!==i.id);
  });
  localStorage.setItem('dotnet_qa_deleted', JSON.stringify([...qaDeleted]));
  localStorage.setItem('dotnet_custom_qa', JSON.stringify(customQA));
  delete qaCatOrders[catName]; localStorage.setItem('dotnet_qa_cat_orders', JSON.stringify(qaCatOrders));
  renderInterview();
}

function qaSectionOf(it){
  if(it.section) return it.section;
  return String(it.id).startsWith('qa-seed-') ? 'builtin' : 'custom';
}
function qaCategoryForType(type){
  if(!type) return 'Content';
  if(type==='PDF') return 'PDF';
  if(type==='Image') return 'Image';
  if(type==='Link' || type==='Video') return 'Link';
  return 'Content';
}

// ---- Step 1: ask what kind of answer to add — compact chooser, same options as Docs Hub ----
let pendingQADestination = 'custom';
let pendingQACategory = '';   // topic (category) to pre-fill when adding from inside a topic card
let qaDraft = null;           // keeps category + question text when switching type while editing
function openQAChooser(){
  editingQAItem = null; pendingQAMedia = null; pendingQACategory = ''; qaDraft = null;
  openModal(`
    <div class="author-form qa-form-compact mb-0">
      <h6 class="form-title"><i class="bi bi-plus-circle me-1"></i>Where should this go?</h6>
      <div class="type-chooser-grid" style="grid-template-columns:repeat(2,1fr)">
        ${qaSections.map(s=>`<button type="button" class="type-chooser-btn" onclick="openQATypeChooser('${escA(s.key)}')"><i class="bi ${escA(s.icon)}" aria-hidden="true"></i><span class="tc-label">${esc(s.label)}</span></button>`).join('')}
      </div>
      <button type="button" class="type-chooser-btn mt-2" style="border-style:dashed;width:100%" onclick="promptNewQASectionThenAdd()"><i class="bi bi-plus-lg" style="color:#16a34a"></i><span class="tc-label">Create a new tab</span></button>
      <button class="btn btn-outline-secondary btn-sm mt-2" onclick="closeModal()">Cancel</button>
    </div>`);
}
function promptNewQASectionThenAdd(){
  const name = (prompt('Name your new tab (e.g. "Behavioral Questions", "System Design"):')||'').trim().slice(0,40);
  if(!name) return;
  const key = slugify(name);
  if(!qaSections.some(s=>s.key===key)){
    qaSections.push({key, label:name, icon:'bi-folder2', builtin:false});
    saveQASections();
  }
  openQATypeChooser(key);
}

// "+" inside a topic card: add a new question/upload straight into that topic.
function addQAToCategory(catName){
  editingQAItem = null; pendingQAMedia = null; qaDraft = null;
  pendingQACategory = catName;
  openQATypeChooser(activeQASection);
}
// While editing: switch an existing question to another type (e.g. attach a PDF/image to a text answer).
function switchQAFormType(cat){
  if(!editingQAItem) return;
  const c = document.getElementById('qa-cat'), q = document.getElementById('qa-q');
  qaDraft = {cat: c ? c.value : '', q: q ? q.value : ''};
  openQAForm(editingQAItem, cat);
}
function openQATypeChooser(destination){
  pendingQADestination = destination;
  openModal(`
    <div class="author-form qa-form-compact mb-0">
      <h6 class="form-title"><i class="bi bi-plus-circle me-1"></i>Add a question</h6>
      <div class="type-chooser-grid">
        <button type="button" class="type-chooser-btn" onclick="openQAForm(null,'PDF')"><i class="bi bi-file-earmark-pdf-fill" style="color:#dc2626"></i><span class="tc-label">PDF</span></button>
        <button type="button" class="type-chooser-btn" onclick="openQAForm(null,'Image')"><i class="bi bi-image" style="color:#d97706"></i><span class="tc-label">Image</span></button>
        <button type="button" class="type-chooser-btn" onclick="openQAForm(null,'Link')"><i class="bi bi-link-45deg" style="color:#0891b2"></i><span class="tc-label">Link</span></button>
        <button type="button" class="type-chooser-btn" onclick="openQAForm(null,'Content')"><i class="bi bi-text-paragraph" style="color:#16a34a"></i><span class="tc-label">Text</span></button>
      </div>
      <div class="d-flex gap-2 mt-2">
        <button class="btn btn-outline-secondary btn-sm" onclick="closeModal()">Cancel</button>
        <button class="btn btn-link btn-sm text-muted p-0 ps-2" onclick="openQAChooser()"><i class="bi bi-arrow-left me-1"></i>Back</button>
      </div>
    </div>`);
}

function openQAForm(itemId, category){
  const isEdit = !!itemId;
  editingQAItem = itemId; pendingQAMedia = null;
  const item = isEdit ? getAllQAItems().find(i=>i.id===itemId) : null;
  if(isEdit && !category) category = qaCategoryForType(item.type);
  if(!isEdit && !category){ openQAChooser(); return; }
  const draft = qaDraft; qaDraft = null;

  const existingCats = QA_DATA.map(c=>c.cat);
  let typeSpecificHTML = '';
  if(category==='PDF'){
    typeSpecificHTML = `
      <div class="col-12"><label>PDF file ${isEdit && item.mediaKey && item.type==='PDF' ? '' : '<span class="text-danger">*</span>'}</label><div class="media-drop" onclick="document.getElementById('qa-pdf-input').click()"><i class="bi bi-cloud-upload me-1"></i>Choose a PDF or drop it here<input type="file" id="qa-pdf-input" accept="application/pdf" style="display:none" onclick="event.stopPropagation()" onchange="handleQAMediaFile(event)"></div><div class="media-preview-name" id="qa-media-name-pdf">${esc(isEdit && item.type==='PDF'?(item.mediaName||'Existing PDF kept'):'')}</div></div>
      <div class="col-12"><label>Notes <span class="text-muted fw-normal">(optional)</span></label>${rteEditorHTML('qa-para','Optional notes', isEdit && item.type==='PDF'?item.summary||'':'')}</div>`;
  } else if(category==='Image'){
    typeSpecificHTML = `
    <div class="col-12"><label>Images <span class="text-danger">*</span> <span class="text-muted fw-normal">— as many as you want</span></label>${imgPickerHTML('qa-imgs', isEdit && item.type==='Image' ? itemImages(item) : [])}</div>
    <div class="col-12"><label>Notes <span class="text-muted fw-normal">(optional)</span></label>${rteEditorHTML('qa-summary','Optional notes', isEdit && item.type==='Image'?item.summary||'':'')}</div>`;
  } else if(category==='Link'){
    typeSpecificHTML = `
      <div class="col-12"><label>Link URL <span class="text-danger">*</span></label><input id="qa-url" class="form-control" value="${escA(isEdit && item.url?item.url:'')}" placeholder="https://..."></div>
      <div class="col-12"><label>Notes <span class="text-muted fw-normal">(optional)</span></label>${rteEditorHTML('qa-summary','Optional notes', isEdit?item.summary||'':'')}</div>`;
  } else {
    typeSpecificHTML = `<div class="col-12"><label>Answer <span class="text-danger">*</span></label>${rteEditorHTML('qa-a','Write the answer', isEdit?(item.a||item.summary||''):'')}</div>`;
  }

  const catMeta = {PDF:{icon:'bi-file-earmark-pdf-fill',label:'PDF'},Image:{icon:'bi-image',label:'Image'},Link:{icon:'bi-link-45deg',label:'Link'},Content:{icon:'bi-text-paragraph',label:'Text'}}[category];
  openModal(`
    <div class="author-form qa-form-compact mb-0">
      <h6 class="form-title"><i class="bi ${isEdit?'bi-pencil-square':catMeta.icon} me-1"></i>${isEdit?'Edit question':catMeta.label+' answer'}</h6>
      <div class="row g-2">
        <div class="col-md-6"><label>Category</label><input id="qa-cat" class="form-control" list="qa-cat-list" placeholder="e.g. C# Core" value="${escA(draft ? draft.cat : (isEdit ? item.cat : pendingQACategory))}"><datalist id="qa-cat-list">${existingCats.map(cn=>`<option value="${escA(cn)}">`).join('')}</datalist></div>
        <div class="col-md-6"><label>Question <span class="text-danger">*</span></label><input id="qa-q" class="form-control" placeholder="e.g. What is ref vs out?" value="${escA(draft ? draft.q : (isEdit?item.q:''))}"></div>
        ${tagFieldHTML('qa-tags', isEdit ? item.tags : [])}
        ${isEdit ? typeSwitcherHTML(category,'switchQAFormType') : ''}
        ${typeSpecificHTML}
        ${isEdit ? `<div class="col-12"><label>Move to tab</label><select id="qa-move-section" class="form-select">${qaSections.map(x=>`<option value="${escA(x.key)}" ${x.key===qaSectionOf(item)?'selected':''}>${esc(x.label)}</option>`).join('')}</select></div>` : ''}
      </div>
      <div class="d-flex gap-2 mt-2 flex-wrap">
        <button class="btn btn-primary btn-sm" onclick="submitQAForm('${category}')"><i class="bi bi-check2 me-1"></i>${isEdit?'Save':'Add'}</button>
        <button class="btn btn-outline-secondary btn-sm" onclick="closeModal()">Cancel</button>
        ${!isEdit ? `<button class="btn btn-link btn-sm text-muted p-0 ps-2" onclick="openQATypeChooser(pendingQADestination)"><i class="bi bi-arrow-left me-1"></i>Back</button>` : ''}
      </div>
    </div>`);
  if(category==='Image') imgPickerRender('qa-imgs');  
  draftSetup('qa|'+(isEdit?'e:'+itemId:'n:'+pendingQACategory+':'+pendingQADestination)+'|'+category, ()=>openQAForm(itemId, category));
}
function closeQAForm(){ closeModal(); editingQAItem=null; pendingQAMedia=null; qaDraft=null; }
async function handleQAMediaFile(e){
  const file = e.target.files[0]; if(!file) return;
  const up = await readUpload(file);
  if(!up){ e.target.value=''; return; }
  pendingQAMedia = up;
  const el = document.getElementById('qa-media-name') || document.getElementById('qa-media-name-pdf');
  if(el) el.textContent = '✓ ' + file.name + ' (' + Math.round(up.dataUrl.length*0.75/1024) + ' KB)';
}
async function submitQAForm(category){
  const cat = document.getElementById('qa-cat').value.trim() || 'Custom Questions';
  const q = document.getElementById('qa-q').value.trim();
  if(!q){ alert('Please add the question.'); return; }

  let type = null;
  if(category==='PDF') type='PDF';
  else if(category==='Image') type='Image';
  else if(category==='Link'){ const url=normUrl(document.getElementById('qa-url').value); type = getVideoEmbedInfo(url) ? 'Video' : 'Link'; }

  const old = editingQAItem ? getAllQAItems().find(i=>i.id===editingQAItem) : null;
  if(editingQAItem && !old){ alert('That question no longer exists.'); closeQAForm(); renderInterview(); return; }

  let data = {cat, q, tags: parseTags((document.getElementById('qa-tags')||{}).value)};
  if(type){
    data.type = type; data.badgeColor = TYPE_COLOR[type];
    data.summary = rteGetHTML('qa-summary');
    if(type==='PDF') data.summary = rteGetHTML('qa-para');
    if(type==='Link' || type==='Video') data.url = normUrl(document.getElementById('qa-url').value);
    if((type==='Link'||type==='Video') && !data.url){ alert('Please enter a valid web link (https://…).'); return; }
    if(type==='Image'){
    if(!(IMGPICK['qa-imgs']||[]).length){ alert('Please add at least one image.'); return; }
      const busy = busyStart();
      try{ const imgs = await imgPickerCommit('qa-imgs','media-qa-',busy); data.images = imgs; data.mediaKey = imgs[0].key; data.mediaName = imgs[0].name; } finally { busy.done(); }
     } else if(type==='PDF'){
      const keepOld = !!(old && !pendingQAMedia && old.mediaKey && old.type==='PDF');
      if(!pendingQAMedia && !keepOld){ alert('Please choose a PDF file to upload.'); return; }
      if(pendingQAMedia){
      const key = 'media-qa-'+Date.now()+'-'+Math.random().toString(36).slice(2,8);
      const busy = busyStart();
      try{ await idbPut(key, pendingQAMedia.dataUrl, busy.progress); } finally { busy.done(); }
      data.mediaKey = key; data.mediaName = pendingQAMedia.name;
    } else { data.mediaKey = old.mediaKey; data.mediaName = old.mediaName; }
  }
  } else {
    const a = rteGetHTML('qa-a');
    if(!a){ alert('Please write the answer.'); return; }
    data.a = a;
  }

  const wasEdit = !!editingQAItem;
  let movedNote = '';
  if(wasEdit){
    const secEl = document.getElementById('qa-move-section');
    if(secEl && secEl.value){
      data.section = secEl.value;
      if(data.section !== qaSectionOf(old)){ const sx = qaSections.find(x=>x.key===data.section); movedNote = 'Moved to ' + (sx ? sx.label : 'another tab'); }
    }
    pruneMedia(old, data);   // replaced, or switched away from PDF/Image
    if(editingQAItem.startsWith('qa-seed-')){
      qaOverrides[editingQAItem] = data;
      localStorage.setItem('dotnet_qa_overrides', JSON.stringify(qaOverrides));
    } else {
      const idx = customQA.findIndex(i=>i.id===editingQAItem);
      if(idx<0){ alert('That question no longer exists.'); closeQAForm(); renderInterview(); return; }
      const merged = {...old, ...data, id:old.id};
      ['type','badgeColor','url','mediaKey','mediaName','images'].forEach(k=>{ if(!(k in data)) delete merged[k]; });
      customQA[idx] = merged;
      localStorage.setItem('dotnet_custom_qa', JSON.stringify(customQA));
    }
  } else {
    customQA.unshift({id:'qa-custom-'+Date.now(), section: pendingQADestination, ...data});
    localStorage.setItem('dotnet_custom_qa', JSON.stringify(customQA));
  }
  draftClear();
  closeQAForm();
  // editing keeps you on the tab you are on; only a brand-new item jumps to its destination tab
  if(!wasEdit && activeQASection !== pendingQADestination){
    setQASubtab(pendingQADestination);
  } else {
    renderInterview();
  }
  if(movedNote && window.UI) UI.toast(movedNote);
}

function toggleQA(id, itemId, el){
  const ans=document.getElementById(id);
  const icon=el.querySelector('.bi-chevron-down');
  const shown=ans.style.display==='block';
  ans.style.display=shown?'none':'block';
  el.setAttribute('aria-expanded', String(!shown));
  if(icon) icon.style.transform=shown?'':'rotate(180deg)';
  if(!shown) hydrateSliders(ans);
}

function renderSummary(){
  const c=document.getElementById('sum-container');
  const t = getTimelineInfo();
  c.innerHTML = `
  <div class="docshub-header">
    <div>
      <h5 class="docshub-title">Timeline &amp; Summary</h5>
      <p class="docshub-sub mb-0">Your pace, the month-by-month plan, an ideal daily schedule, and every note you've written.</p>
    </div>
  </div>
  ${renderTimelineCard()}
  <h6 class="section-label"><i class="bi bi-calendar3"></i>Month-by-month timeline</h6>
  ${SUMMARY.timeline.map(m=>`<div class="summary-phase" style="--phc:${tone(m.color)}">
      <h6>${esc(m.month)} — ${esc(m.title)}</h6>
      <div>${m.skills.map(s=>`<span class="skill-pill">${esc(s.replace(/\s*/g,''))}</span>`).join('')}</div>
    </div>`).join('')}
  <h6 class="section-label mt-4"><i class="bi bi-clock"></i>Ideal daily schedule</h6>
  <div class="phase-card mb-3 pad sched">
    ${SUMMARY.dailySchedule.map(s=>`<div class="sched-row"><span class="sched-time">${esc(s.time)}</span><span class="sched-task">${esc(s.task)}</span></div>`).join('')}
  </div>
  <h6 class="section-label mt-4"><i class="bi bi-stickies"></i>My notes</h6>
  <input id="notes-search-input" class="form-control notes-search mb-2" aria-label="Search your notes" placeholder="Search your notes…" oninput="filterNotes()">
  <div id="all-notes-list">${renderAllNotes('')}</div>
  <div class="closing-note">${t.overdue ? 'Past target date' : t.remainingDays+' days left'} — every day counts. Track your streak, ship your projects.</div>`;
  hydrateNoteImages();
}

// ===================== FIREBASE BRIDGE =====================
// Auth, Firestore sync and the sync badge live in js/boot.js + js/cloud-store.js.
// Every localStorage write to a "dotnet_*" key is saved to Firestore automatically.
function syncNow(){ if(window.Cloud) Cloud.flush(); }
function signOutUser(){ if(window.Cloud) Cloud.signOut(); }

// ===================== PROFILE / SETTINGS =====================
const TROUBLESHOOTING = [
  {q:"Sign-up says 'operation-not-allowed' / 'configuration not found'",
   a:"In the Firebase console go to Authentication → Sign-in method and enable <strong>Email/Password</strong>. Usernames are stored as <code>username@users.dotnet-roadmap.app</code> behind the scenes — no real email and no verification is needed."},
  {q:"'Missing or insufficient permissions'",
   a:"Publish the rules from <code>firestore.rules</code>: Firebase console → Firestore Database → Rules, or run <code>firebase deploy --only firestore:rules</code>."},
  {q:"Sync badge stays on 'Saving…'",
   a:"You're probably offline or Firestore isn't created yet. Changes are kept on this device and retried automatically as soon as the connection is back."},
  {q:"My data isn't showing on another device",
   a:"Sign in with the exact same username. Wait for the badge to say 'Saved', then reload the other device — it always loads from Firebase on startup."},
  {q:"I forgot my password",
   a:"There is no email on the account, so there is no reset link. Delete the user in Firebase console → Authentication and create a new one, or reset the password there if you have admin access."}
];

function toggleProfileItem(id, el){
  const ans = document.getElementById(id);
  const icon = el.querySelector('.bi-chevron-down');
  const shown = ans.style.display==='block';
  ans.style.display = shown ? 'none' : 'block';
  el.setAttribute('aria-expanded', String(!shown));
  if(icon) icon.style.transform = shown ? '' : 'rotate(180deg)';
}

function saveDisplayName(){
  const name = document.getElementById('display-name-input').value.trim().slice(0,40);
  if(name) localStorage.setItem('dotnet_display_name', name);
  else localStorage.removeItem('dotnet_display_name');
  updateGreeting();
  renderProfile();
}
function updateGreeting(){
  const name = localStorage.getItem('dotnet_display_name');
  const el = document.getElementById('roadmap-greeting');
  if(el) el.textContent = name ? `Welcome back, ${name}` : '';
}

function saveStartDate(){
  const val = document.getElementById('start-date-input').value;
  if(!val){ alert('Pick a start date first.'); return; }
  localStorage.setItem('dotnet_start_date', val);
  if(window.UI) UI.toast('Start date updated');
  renderProfile();
  updateCalendarCaption();
}
// Shared by the Profile Timeline card and the "Days Left" stat caption, so both
// always agree on start date, target end date, and days remaining.
function getTimelineInfo(){
  const TOTAL_DAYS = 175;
  const startStr = localStorage.getItem('dotnet_start_date') || ymd(new Date());          // local date (toISOString is UTC: wrong day in IST)
  let start = new Date(startStr+'T00:00:00');
  if(isNaN(start)) start = new Date(ymd(new Date())+'T00:00:00');
  const target = new Date(start); target.setDate(target.getDate() + TOTAL_DAYS);
  const now = new Date();
  const msPerDay = 24*60*60*1000;
  const elapsedDays = Math.max(0, Math.floor((now - start)/msPerDay));
  const remainingMs = target - now;
  const remainingDays = Math.max(0, Math.ceil(remainingMs/msPerDay));
  const remainingHours = Math.max(0, Math.round(remainingMs/(60*60*1000)));
  const doneCount = done.size;
  const elapsedWeeks = Math.max(1, elapsedDays/7);
  const currentPace = +(doneCount/elapsedWeeks).toFixed(1);
  const remainingDaysToDo = TOTAL_DAYS - doneCount;
  const remainingWeeks = Math.max(0.1, remainingDays/7);
  const requiredPace = +(remainingDaysToDo/remainingWeeks).toFixed(1);
  const overdue = remainingMs < 0;
  const hasCustomStart = !!localStorage.getItem('dotnet_start_date');
  return {TOTAL_DAYS, startStr: ymd(start), start, target, elapsedDays, remainingDays, remainingHours, doneCount, currentPace, requiredPace, overdue, hasCustomStart};
}

function renderTimelineCard(){
  const t = getTimelineInfo();
  const {startStr, target, elapsedDays, remainingDays, remainingHours, doneCount, currentPace, requiredPace, overdue} = t;
  const fmt = {day:'numeric',month:'short',year:'numeric'};
  return `<div class="phase-card mb-3 pad">
    <h6 class="card-title"><i class="bi bi-hourglass-split"></i>Timeline</h6>
    <div class="row g-2 mb-3">
      <div class="col-6">
        <label class="small text-muted d-block" for="start-date-input">Start date</label>
        <div class="d-flex gap-2">
          <input type="date" id="start-date-input" class="form-control form-control-sm" value="${escA(startStr)}">
          <button class="btn btn-sm btn-outline-primary" onclick="saveStartDate()">Set</button>
        </div>
      </div>
      <div class="col-6">
        <span class="small text-muted d-block">Target completion</span>
        <div class="form-control form-control-sm static-field">${target.toLocaleDateString('en-IN',fmt)}</div>
      </div>
    </div>
    <div class="row g-2">
      ${statBox(elapsedDays,'Days elapsed')}
      ${statBox(overdue?'0':remainingDays, overdue?'Past target':'Days remaining', overdue?'is-bad':'is-good')}
      ${statBox(overdue?'0':remainingHours,'Hours remaining')}
      ${statBox(currentPace,'Days / week pace')}
    </div>
    <p class="small mt-3 mb-0 ${doneCount>0 && currentPace>=requiredPace ? 'text-good':'text-warn'}">
      ${overdue ? "You're past your original target date — consider setting a new start date, or just keep going at your own pace." :
        `To finish by ${target.toLocaleDateString('en-IN',{day:'numeric',month:'short'})}, you need about <strong>${requiredPace} days/week</strong>. ${doneCount>0 ? `You're currently averaging <strong>${currentPace}/week</strong>.` : ''}`}
    </p>
  </div>`;
}

// ===================== BACKUP / RESTORE (export & import everything as one JSON file) =====================
// Everything the app syncs: all "dotnet_*" keys except the few that are device-local bookkeeping.
const BACKUP_SKIP = new Set(['dotnet_uid','dotnet_pending','dotnet_sync_banner_dismissed']);
const BACKUP_KEY_RE = /^dotnet_[a-z0-9_]{1,60}$/;
const backupKeys = () => Object.keys(localStorage).filter(k=>BACKUP_KEY_RE.test(k) && !BACKUP_SKIP.has(k));
function exportBackup(){
  const data = {};
  backupKeys().forEach(k=>{ data[k] = localStorage.getItem(k); });
  const payload = {app:'dotnet-tracker', version:2, exportedAt: new Date().toISOString(), note:'Images and PDFs are not part of this file. Use "Backup + files (.zip)" to include them.', data};
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'}), 'dotnet-tracker-backup-' + ymd(new Date()) + '.json');
}

// ---- minimal ZIP (store-only) writer/reader, so a backup can carry uploaded PDFs/images without any library ----
const CRC_TABLE = (()=>{ const t = new Uint32Array(256); for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c = (c&1) ? (0xEDB88320 ^ (c>>>1)) : (c>>>1); t[n] = c>>>0; } return t; })();
function crc32(u8){ let c = 0xFFFFFFFF; for(let i=0;i<u8.length;i++) c = CRC_TABLE[(c ^ u8[i]) & 255] ^ (c>>>8); return (c ^ 0xFFFFFFFF)>>>0; }
function zipStore(files){   // files: [{name, data:Uint8Array}] -> Uint8Array
  const enc = new TextEncoder(), parts = [], central = []; let offset = 0;
  files.forEach(f=>{
    const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0,0x04034b50,true); lh.setUint16(4,20,true); lh.setUint16(6,0x0800,true); lh.setUint16(8,0,true);
    lh.setUint16(10,0,true); lh.setUint16(12,0x21,true); lh.setUint32(14,crc,true); lh.setUint32(18,size,true); lh.setUint32(22,size,true);
    lh.setUint16(26,name.length,true); lh.setUint16(28,0,true);
    parts.push(new Uint8Array(lh.buffer), name, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0,0x02014b50,true); ch.setUint16(4,20,true); ch.setUint16(6,20,true); ch.setUint16(8,0x0800,true); ch.setUint16(10,0,true);
    ch.setUint16(12,0,true); ch.setUint16(14,0x21,true); ch.setUint32(16,crc,true); ch.setUint32(20,size,true); ch.setUint32(24,size,true);
    ch.setUint16(28,name.length,true); ch.setUint32(42,offset,true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + size;
  });
  const cdSize = central.reduce((n,x)=>n+x.byteLength,0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0,0x06054b50,true); end.setUint16(8,files.length,true); end.setUint16(10,files.length,true); end.setUint32(12,cdSize,true); end.setUint32(16,offset,true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n,x)=>n+x.byteLength,0)); let p = 0;
  all.forEach(x=>{ out.set(x,p); p += x.byteLength; });
  return out;
}
function zipRead(buf){   // reads zips written by zipStore (no compression)
  const u8 = new Uint8Array(buf), dv = new DataView(buf), dec = new TextDecoder(), out = []; let p = 0;
  while(p+30 <= u8.length && dv.getUint32(p,true)===0x04034b50){
    const flags = dv.getUint16(p+6,true), method = dv.getUint16(p+8,true), size = dv.getUint32(p+18,true), nlen = dv.getUint16(p+26,true), xlen = dv.getUint16(p+28,true);
    if(method!==0 || (flags & 8)) throw new Error('This zip is compressed. Please restore a zip that was created by "Backup + files (.zip)" in this app.');
    const start = p+30+nlen+xlen;
    if(start+size > u8.length) throw new Error('This zip file looks damaged.');
    out.push({name: dec.decode(u8.subarray(p+30,p+30+nlen)), data: u8.subarray(start,start+size)});
    p = start + size;
  }
  if(!out.length) throw new Error('That is not a valid backup zip.');
  return out;
}
function dataUrlToBytes(d){ const bin = atob(d.slice(d.indexOf(',')+1)), u = new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i] = bin.charCodeAt(i); return u; }
function dataUrlMime(d){ const m = /^data:([^;,]+)/.exec(d); return m ? m[1] : 'application/octet-stream'; }
function bytesToDataUrl(u8, mime){ let s = ''; for(let i=0;i<u8.length;i+=0x8000) s += String.fromCharCode.apply(null, u8.subarray(i,i+0x8000)); return 'data:'+mime+';base64,'+btoa(s); }
const BACKUP_MIME_EXT = {'application/pdf':'pdf','image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp'};

// Every uploaded PDF/image the app still references, wherever it lives.
function collectMediaRefs(){
  const refs = [];
  const addRefs = (it, name, title, where) => itemMediaKeys(it).forEach(k=>refs.push({key:k, name:name||title, title, where}));
  getAllAuthors().forEach(a=>a.items.forEach(i=>addRefs(i, i.mediaName||i.title, i.title, 'Docs Hub')));
  getAllQAItems().forEach(i=>addRefs(i, i.mediaName||i.q, i.q, 'Interview Q&A'));
  getAllAdvItems().forEach(i=>addRefs(i, i.mediaName||i.title, i.title, 'Advanced+'));
  Object.entries(dayNotes).forEach(([n,e])=>{ if(e && e.mediaKey) refs.push({key:e.mediaKey, name:e.mediaName||('Day '+n+' note image'), title:'Day '+n+' note', where:'Notes'}); });
  const seen = new Set();
  return refs.filter(r=>!seen.has(r.key) && seen.add(r.key));
}
async function exportFullBackup(){
  const refs = collectMediaRefs(), pt = progressToast('Preparing backup…');
  let missing = 0;
  try{
    const data = {}; backupKeys().forEach(k=>{ data[k] = localStorage.getItem(k); });
    const files = [], manifest = [];
    for(let i=0;i<refs.length;i++){
      const r = refs[i]; pt.set('Collecting files '+(i+1)+' of '+refs.length+'…');
      let d = null; try{ d = await idbGet(r.key); }catch(e){ console.error(e); }
      if(!d){ missing++; continue; }
      const mime = dataUrlMime(d), path = 'media/'+r.key+'.'+(BACKUP_MIME_EXT[mime]||'bin');
      files.push({name:path, data:dataUrlToBytes(d)});
      manifest.push({key:r.key, file:path, name:r.name, mime, where:r.where, title:r.title});
    }
    const payload = {app:'dotnet-tracker', version:3, exportedAt:new Date().toISOString(), note:'Settings, notes and lists are in "data"; uploaded files are in media/ and listed in "media".', data, media:manifest};
    files.unshift({name:'backup.json', data:new TextEncoder().encode(JSON.stringify(payload,null,2))});
    pt.set('Building zip…');
    downloadBlob(new Blob([zipStore(files)], {type:'application/zip'}), 'dotnet-tracker-backup-with-files-'+ymd(new Date())+'.zip');
  } catch(err){ console.error(err); alert('Could not build the backup: '+(err.message||err)); return; }
  finally { pt.close(); }
  if(window.UI) UI.toast('Backup downloaded' + (missing ? ' · '+missing+' file(s) could not be read' : ''));
}
function triggerImportBackup(){ document.getElementById('backup-import-input').click(); }
async function importBackup(e){
  const file = e.target.files[0]; e.target.value=''; if(!file) return;
  let isZip = /\.zip$/i.test(file.name) || /zip/.test(file.type);
  if(!isZip){ try{ const h = new Uint8Array(await file.slice(0,4).arrayBuffer()); isZip = h[0]===0x50 && h[1]===0x4B; }catch(err){} }   // "PK" = zip, whatever the file is called
  if(isZip){
    if(file.size > 250*1024*1024){ alert('That zip is too large to be a backup.'); return; }
    file.arrayBuffer().then(buf=>{
      let entries; try{ entries = zipRead(buf); }catch(err){ alert(err.message); return; }
      const bj = entries.find(x=>x.name==='backup.json');
      if(!bj){ alert('This zip has no backup.json — it was not created by this app.'); return; }
      let payload; try{ payload = JSON.parse(new TextDecoder().decode(bj.data)); }catch(err){ alert('backup.json inside the zip is not valid.'); return; }
      applyBackupPayload(payload, entries);
    }).catch(err=>alert('Could not read that file: '+(err.message||err)));
    return;
  }
  if(file.size > 20*1024*1024){ alert('That file is too large to be a backup.'); return; }
  const reader = new FileReader();
  reader.onload = ()=>{
    let payload;
    try{ payload = JSON.parse(reader.result); }catch(err){ alert('That file is not a valid backup (invalid JSON).'); return; }
    applyBackupPayload(payload, null);
  };
  reader.readAsText(file);
}
async function applyBackupPayload(payload, entries){
  if(!payload || typeof payload.data!=='object' || payload.data===null || Array.isArray(payload.data)){ alert('That file is not a valid backup — expected a dotnet-tracker export.'); return; }
  // accept only well-formed keys whose values are JSON text
  const incoming = {};
  for(const [k,v] of Object.entries(payload.data)){
    if(!BACKUP_KEY_RE.test(k) || BACKUP_SKIP.has(k) || typeof v!=='string') continue;
    if(k!=='dotnet_display_name' && k!=='dotnet_start_date' && k!=='dotnet_active_docs_section' && k!=='dotnet_active_qa_section'){
      try{ JSON.parse(v); }catch(err){ continue; }
    }
    incoming[k] = v;
  }
  const n = Object.keys(incoming).length;
  if(!n){ alert('No restorable data was found in that file.'); return; }
  const mediaList = (entries && Array.isArray(payload.media)) ? payload.media.filter(m=>m && typeof m.key==='string' && /^[A-Za-z0-9_.-]{1,100}$/.test(m.key) && typeof m.file==='string' && Object.prototype.hasOwnProperty.call(BACKUP_MIME_EXT, m.mime)) : [];
  if(!confirm(`Restore ${n} saved items${mediaList.length ? ' and '+mediaList.length+' uploaded file'+(mediaList.length===1?'':'s') : ''} from this backup? Your current progress, notes, Docs Hub, Q&A and resume will be replaced.`)) return;
  if(mediaList.length){
    const pt = progressToast('Restoring files…');
    try{
      for(let i=0;i<mediaList.length;i++){
        const m = mediaList[i], ent = entries.find(x=>x.name===m.file); if(!ent) continue;
        pt.set('Restoring file '+(i+1)+' of '+mediaList.length+'…');
        try{ await idbPut(m.key, bytesToDataUrl(ent.data, m.mime)); }catch(err){ console.error(err); }
      }
    } finally { pt.close(); }
  }
  backupKeys().forEach(k=>{ if(!(k in incoming)) localStorage.removeItem(k); });
  let failed = false;
  Object.entries(incoming).forEach(([k,v])=>{ try{ localStorage.setItem(k, v); }catch(err){ failed = true; } });
  if(failed){ alert('Some items were too large to restore.'); }
  (window.Cloud ? Cloud.flush() : Promise.resolve()).then(()=>{ alert('Backup restored. Reloading…'); location.reload(); });
}
// "Uploads & storage" card: how much space the PDFs/images use, biggest first.
async function measureUploads(btn){
  const out = document.getElementById('storage-usage-out'); if(!out) return;
  const refs = collectMediaRefs();
  if(!refs.length){ out.textContent = 'No uploaded files yet.'; return; }
  if(btn) btn.disabled = true;
  const rows = []; let total = 0;
  for(let i=0;i<refs.length;i++){
    out.textContent = 'Measuring '+(i+1)+' of '+refs.length+'…';
    let d = null; try{ d = await idbGet(refs[i].key); }catch(e){}
    const bytes = d ? Math.round((d.length - d.indexOf(',') - 1)*0.75) : 0;
    total += bytes; rows.push({...refs[i], bytes});
  }
  rows.sort((a,b)=>b.bytes-a.bytes);
  out.innerHTML = `<div class="mb-2"><strong>${rows.length}</strong> file${rows.length===1?'':'s'} · <strong>${fmtBytes(total)}</strong> in total</div>` +
    rows.slice(0,8).map(r=>`<div class="d-flex justify-content-between gap-2 border-top py-1"><span class="text-truncate">${esc(clipText(r.name||r.title,48))} <span class="text-muted">· ${esc(r.where)}</span></span><span class="text-nowrap">${r.bytes ? fmtBytes(r.bytes) : 'unreadable'}</span></div>`).join('') +
    (rows.length>8 ? `<div class="text-muted pt-1">…and ${rows.length-8} smaller file${rows.length-8===1?'':'s'}</div>` : '');
  if(btn){ btn.disabled = false; btn.textContent = 'Recalculate'; }
}
function getLocalStorageSizeKB(){
  let total = 0;
  backupKeys().forEach(k=>{ const v = localStorage.getItem(k); if(v) total += v.length; });
  return (total/1024).toFixed(1);
}

function statBox(num, label, tone_){
  return `<div class="col-6 col-md-3"><div class="stat-box ${tone_||''}"><div class="num">${num}</div><div class="lbl">${label}</div></div></div>`;
}
function renderProfile(){
  const c = document.getElementById('profile-container');
  const signedIn = !!(window.Cloud && Cloud.user);
  const displayName = localStorage.getItem('dotnet_display_name') || '';
  const notesCount = Object.keys(dayNotes).length;
  const customContentCount = getAllAuthors().reduce((sum,a)=>sum+a.items.length,0);
  const customQACount = getAllQAItems().length;
  c.innerHTML = `
  <div class="docshub-header">
    <div>
      <h5 class="docshub-title">${displayName ? esc(displayName)+'’s Profile' : 'Your Profile'}</h5>
      <p class="docshub-sub mb-0">Switch to <strong>Timeline &amp; Summary</strong> for pace, plan, and notes.</p>
    </div>
  </div>

  <div class="phase-card mb-3 pad">
    <div class="d-flex align-items-center gap-2 mb-2 flex-wrap">
      <label class="mb-0 small fw-bold text-muted" for="display-name-input" style="flex:0 0 auto"><i class="bi bi-person-badge me-1"></i>Name</label>
      <input id="display-name-input" class="form-control form-control-sm" maxlength="40" style="flex:1 1 120px;min-width:0" placeholder="e.g. Sandip" value="${escA(displayName)}" onkeydown="if(event.key==='Enter')saveDisplayName()">
      <button class="btn btn-sm btn-primary flex-shrink-0" onclick="saveDisplayName()">Save</button>
    </div>
    <hr class="my-2">
    <div class="d-flex align-items-center justify-content-between gap-2 flex-wrap">
      <span class="small d-flex align-items-center gap-2"><i class="bi bi-cloud-check ${signedIn?'ok-ic':'off-ic'}"></i>${signedIn ? 'Signed in as <strong>'+esc(Cloud.user.username)+'</strong> · saved to Firebase' : 'Not signed in'}</span>
      ${signedIn ? `<button class="btn btn-sm btn-outline-danger" onclick="signOutUser()"><i class="bi bi-box-arrow-right me-1"></i>Sign out</button>` : `<a class="btn btn-sm btn-outline-primary" href="login.html">Sign in</a>`}
    </div>
  </div>

  <div class="phase-card mb-3 pad">
    <h6 class="card-title"><i class="bi bi-bar-chart"></i>Your data, right now</h6>
    <div class="row g-2">
      ${statBox(done.size,'Days done')}${statBox(notesCount,'Notes')}${statBox(customContentCount,'Docs Hub items')}${statBox(customQACount,'Q&amp;A items')}
    </div>
  </div>

  <div class="phase-card mb-3 pad">
    <h6 class="card-title"><i class="bi bi-shield-check"></i>Backup &amp; restore</h6>
    <p class="small text-muted mb-2">Everything is stored in Firebase under your account (~${getLocalStorageSizeKB()} KB of settings and notes, plus uploads). <strong>Backup + files (.zip)</strong> also includes every uploaded PDF and image; the small .json backup holds settings, notes and lists only.</p>
    <div class="d-flex gap-2 flex-wrap">
      <button class="btn btn-sm btn-primary" onclick="exportFullBackup()"><i class="bi bi-file-earmark-zip me-1"></i>Backup + files (.zip)</button>
      <button class="btn btn-sm btn-outline-primary" onclick="exportBackup()"><i class="bi bi-download me-1"></i>Settings only (.json)</button>
      <button class="btn btn-sm btn-outline-primary" onclick="triggerImportBackup()"><i class="bi bi-upload me-1"></i>Restore from backup</button>
      <input type="file" id="backup-import-input" accept="application/json,.json,application/zip,.zip" style="display:none" onchange="importBackup(event)">
    </div>
  </div>

  <div class="phase-card mb-3 pad">
    <h6 class="card-title"><i class="bi bi-hdd"></i>Uploads &amp; storage</h6>
    <p class="small text-muted mb-2">See how much space your uploaded PDFs and images use, biggest first.</p>
    <button class="btn btn-sm btn-outline-primary" onclick="measureUploads(this)">Calculate</button>
    <div id="storage-usage-out" class="small mt-2"></div>
  </div>

  <details class="phase-card mb-3 profile-details">
    <summary class="card-title-sum"><span><i class="bi bi-diagram-3"></i>How this app is wired up</span><i class="bi bi-chevron-down"></i></summary>
    <table class="table table-sm mb-0 wired">
      <tbody>
        <tr><td class="text-muted">Login</td><td>Username + password (Firebase Authentication) — no email verification</td></tr>
        <tr><td class="text-muted">Cloud storage</td><td>Cloud Firestore, under <code>users/&lt;your id&gt;</code> — the source of truth</td></tr>
        <tr><td class="text-muted">Local copy</td><td>Browser cache only; cleared when you sign out</td></tr>
        <tr><td class="text-muted">Auto-save</td><td>~1.5 seconds after every change, plus when the tab is hidden or closed</td></tr>
        <tr><td class="text-muted">What's stored</td><td>Progress, notes, Docs Hub, Advanced+, Q&amp;A, resume, layout prefs, name, images &amp; PDFs</td></tr>
      </tbody>
    </table>
  </details>

  <h6 class="section-label mt-4"><i class="bi bi-life-preserver"></i>Troubleshooting</h6>
  <div>${TROUBLESHOOTING.map((t,i)=>{
    const id = 'profile-ts-'+i;
    return `<div class="interview-q">
      <div class="qa-row" role="button" tabindex="0" aria-expanded="false" onclick="toggleProfileItem('${id}',this)" onkeydown="if(event.target===this)keyAct(event,()=>toggleProfileItem('${id}',this))">
        <span class="qa-q"><span>${t.q}</span></span>
        <i class="bi bi-chevron-down qa-chev" aria-hidden="true"></i>
      </div>
      <div id="${id}" class="qa-answer">${t.a}</div>
    </div>`;
  }).join('')}</div>`;
}

// ===================== SCROLL TO TOP =====================
function scrollToTop(){
  // Use both window and the app's own container just in case a mobile browser
  // is treating a wrapping element as the actual scroll root.
  window.scrollTo({top:0, left:0, behavior:'smooth'});
  if(document.scrollingElement) document.scrollingElement.scrollTo({top:0, behavior:'smooth'});
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}
(function initScrollTopButton(){
  const btn = document.getElementById('scroll-top-btn');
  if(!btn) return;
  let ticking = false;
  function updateVisibility(){
    const y = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    btn.classList.toggle('show', y > 250);
    ticking = false;
  }
  function onScroll(){
    if(!ticking){ window.requestAnimationFrame(updateVisibility); ticking = true; }
  }
  window.addEventListener('scroll', onScroll, {passive:true});
  window.addEventListener('resize', updateVisibility, {passive:true});
  updateVisibility();
})();


// Init
document.getElementById('today-date').textContent = new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
render();
updateStats();
populateQuickNoteDaySelect();
refreshAllNoteViews();
updateGreeting();
renderCustomPhases();
if(!localStorage.getItem('dotnet_start_date')) localStorage.setItem('dotnet_start_date', ymd(new Date()));