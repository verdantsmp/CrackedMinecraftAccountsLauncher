const state = {
  accounts: [],
  settings: {},
  queue: { queued: 0, activeJoins: 0, maxConcurrentJoins: 1 },
  logs: [],
  selected: new Set(),
  view: 'dashboard',
  configId: null,
  configTab: 'profile',
  inspectorId: null,
  logFilter: 'all',
  logChatAccount: '__selected__',
  messageTargetMode: 'selected',
  createAppearance: null,
  appearanceDraft: null,
  appearanceMode: null,
  appearanceRotation: 0,
  appearanceTilt: 7,
  appearanceDrag: null,
  appearanceAutoRotate: false,
  appearanceAutoRotateFrame: null,
  confirmAction: null,
  chatAutomation: null,
  listHash: '',
  inspectorHash: '',
  logHash: '',
  settingsHash: '',
  rendering: false,
  publicConfig: { siteName:'NEXUS Control', discordServerUrl:'', discordBotInviteUrl:'', discordBotClientId:'', discordDocsUrl:'/discord-docs.html' },
  detailCache: new Map()
};

const $ = id => document.getElementById(id);
const toNumber = (value, fallback = 0) => { const n = Number(value); return Number.isFinite(n) ? Math.max(0, n) : fallback; };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const account = id => state.accounts.find(a => a.id === id);
const orderedIds = ids => { const wanted = new Set(ids || []); return state.accounts.filter(a => wanted.has(a.id)).map(a => a.id); };
const targetText = target => target?.host ? `${target.host}:${target.port || 25565}` : 'Not set';
const isOnline = runtime => runtime?.inServer === true;
const statusText = status => ({ online:'In Server', joining:'Joining', reconnecting:'Reconnecting', kicked:'Kicked', error:'Error', offline:'Offline' }[status] || 'Offline');
const runtimeStatusText = runtime => runtime?.inServer === true ? 'In Server' : statusText(runtime?.status === 'online' ? 'offline' : runtime?.status);
const statusClass = runtime => { const normalized = typeof runtime === 'string' ? runtime : (runtime?.inServer === true ? 'online' : (runtime?.status === 'online' ? 'offline' : runtime?.status)); return ['online', 'joining', 'reconnecting', 'kicked', 'error'].includes(normalized) ? normalized : 'offline'; };
const formatDuration = seconds => { const n = Math.max(0, Number(seconds) || 0); const h = Math.floor(n / 3600); const m = Math.floor((n % 3600) / 60); const s = Math.floor(n % 60); return h ? `${h}h ${m}m` : m ? `${m}m ${s}s` : `${s}s`; };

const DEFAULT_SKIN_URLS = { steve: 'https://www.minecraftskins.com/uploads/skins/2026/09/24/classic-steve----24357132.png?v973', alex: 'https://www.minecraftskins.com/uploads/skins/2026/09/13/classic-alex-base-24337555.png?v973' };

const capes = [
  ['none','No cape'],['migrator','Migrator Cape'],['vanilla','Vanilla Cape'],['15th-anniversary','15th Anniversary Cape'],['purple-heart','Purple Heart Cape'],['followers','Followers Cape'],['home','Home Cape'],['menace','Menace Cape'],['year-minecraft','Year Minecraft Cape'],['common','Common Cape'],['minecon-2011','MINECON 2011'],['minecon-2012','MINECON 2012'],['minecon-2013','MINECON 2013'],['minecon-2015','MINECON 2015'],['minecon-2016','MINECON 2016'],['hero','Hero Cape'],['twisted','Twisted Cape'],['soul','Soul Cape'],['corrupted-creeper','Corrupted Creeper Cape'],['special','Special Cape'],['mojang-studios','Mojang Studios Cape'],['mojira-moderator','Mojira Moderator Cape'],['realms-mapmaker','Realms Mapmaker Cape'],['dannybstyle','DannyBstyle-Cape'],['julianclark','JulianClark-Cape'],['mrmessiah','MrMessiah-Cape'],['bergerkiller','Bergerkiller-Cape'],['akira-70','akira_70-Cape'],['cheapshott','Cheapshott-Cape'],['miclee','Miclee-Cape'],['millionth-customer','Millionth-Customer-Cape'],['grinch','Grinch-Cape'],['birthday','Birthday-Cape'],['scrollifer','Scrollifer-Cape'],['cobalt','Cobalt-Cape'],['turtle','Turtle-Cape'],['translator','Translator-Cape'],['custom','Custom cape URL']
];
const CAPE_TEXTURES = {
  migrator:'https://minecraft.wiki/Special:Redirect/file/Migrator_Cape.png',
  vanilla:'https://minecraft.wiki/Special:Redirect/file/Vanilla_Cape.png',
  '15th-anniversary':'https://minecraft.wiki/Special:Redirect/file/15th_Anniversary_Cape.png',
  'purple-heart':'https://minecraft.wiki/Special:Redirect/file/Purple_Heart_Cape.png',
  followers:'https://minecraft.wiki/Special:Redirect/file/Followers_Cape.png',
  home:'https://minecraft.wiki/Special:Redirect/file/Home_Cape.png',
  menace:'https://minecraft.wiki/Special:Redirect/file/Menace_Cape.png',
  'year-minecraft':'https://minecraft.wiki/Special:Redirect/file/Year_of_Minecraft_Cape.png',
  common:'https://minecraft.wiki/Special:Redirect/file/Common_Cape.png',
  'minecon-2011':'https://minecraft.wiki/Special:Redirect/file/MINECON_2011_Cape.png',
  'minecon-2012':'https://minecraft.wiki/Special:Redirect/file/MINECON_2012_Cape.png',
  'minecon-2013':'https://minecraft.wiki/Special:Redirect/file/MINECON_2013_Cape.png',
  'minecon-2015':'https://minecraft.wiki/Special:Redirect/file/MINECON_2015_Cape.png',
  'minecon-2016':'https://minecraft.wiki/Special:Redirect/file/MINECON_2016_Cape.png',
  hero:'https://minecraft.wiki/Special:Redirect/file/Hero_Cape.png',
  twisted:'https://minecraft.wiki/Special:Redirect/file/Twisted_Cape.png',
  soul:'https://minecraft.wiki/Special:Redirect/file/Soul_Cape.png',
  'corrupted-creeper':'https://minecraft.wiki/Special:Redirect/file/Corrupted_Creeper_Cape.png',
  special:'https://minecraft.wiki/Special:Redirect/file/Special_Cape.png',
  'mojang-studios':'https://minecraft.wiki/Special:Redirect/file/Mojang_Studios_Cape.png',
  'mojira-moderator':'https://minecraft.wiki/Special:Redirect/file/Mojira_Moderator_Cape.png',
  'realms-mapmaker':'https://minecraft.wiki/Special:Redirect/file/Realms_Mapmaker_Cape.png',
  dannybstyle:'https://minecraft.wiki/Special:Redirect/file/DannyBstyle_Cape.png',
  julianclark:'https://minecraft.wiki/Special:Redirect/file/JulianClark_Cape.png',
  mrmessiah:'https://minecraft.wiki/Special:Redirect/file/MrMessiah_Cape.png',
  bergerkiller:'https://minecraft.wiki/Special:Redirect/file/Bergerkiller_Cape.png',
  'akira-70':'https://minecraft.wiki/Special:Redirect/file/Akira_70_Cape.png',
  cheapshott:'https://minecraft.wiki/Special:Redirect/file/Cheapshott_Cape.png',
  miclee:'https://minecraft.wiki/Special:Redirect/file/Miclee_Cape.png',
  'millionth-customer':'https://minecraft.wiki/Special:Redirect/file/Millionth_Customer_Cape.png',
  grinch:'https://minecraft.wiki/Special:Redirect/file/Grinch_Cape.png',
  birthday:'https://minecraft.wiki/Special:Redirect/file/Birthday_Cape.png',
  scrollifer:'https://minecraft.wiki/Special:Redirect/file/Scrollifer_Cape.png',
  cobalt:'https://minecraft.wiki/Special:Redirect/file/Cobalt_Cape.png',
  turtle:'https://minecraft.wiki/Special:Redirect/file/Turtle_Cape.png',
  translator:'https://minecraft.wiki/Special:Redirect/file/Translator_Cape.png'
};
function capeTextureFor(appearance) { const a=normalizeAppearance(appearance); return a.cape==='custom' ? (a.capeUrl||'') : (CAPE_TEXTURES[a.cape]||''); }

function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i></i><span>${esc(message)}</span>`;
  $('toastStack')?.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

async function api(url, options = {}) {
  const response = await fetch(url, { cache: 'no-store', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

function normalizeAppearance(value) {
  return { defaultSkin:'steve', skinUrl:'', skinDataUrl:'', cape:'none', capeUrl:'', capeEnabled:false, hair:'black', eyes:'blue', shirt:'navy', pants:'black', editorMode:'default', ...(value || {}) };
}
function appearanceBase() { return normalizeAppearance(); }
function skinSource(appearance) {
  const a = normalizeAppearance(appearance);
  return a.skinDataUrl || a.skinUrl || `/assets/${a.defaultSkin === 'alex' ? 'alex' : 'steve'}.png`;
}
function capeLabel(key) { return capes.find(c => c[0] === key)?.[1] || 'No cape'; }

function defaultHeadAsset(skin) { return `/assets/${skin === 'alex' ? 'alex' : 'steve'}-head-8x8.png`; }
function skinFullAsset(skin) { return `/assets/${skin === 'alex' ? 'alex' : 'steve'}.png`; }
function cssUrl(value) { return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }
function setSkinLayers(holder, appearance) {
  if (!holder) return;
  const a = normalizeAppearance(appearance);
  holder.replaceChildren();
  holder.classList.add('mc-head-holder');
  const hasCustom = Boolean(a.skinDataUrl || a.skinUrl);
  if (!hasCustom) {
    const img = document.createElement('img');
    img.className = 'head-pixel-image';
    img.alt = a.defaultSkin === 'alex' ? 'Alex' : 'Steve';
    img.loading = 'eager';
    img.decoding = 'async';
    img.src = defaultHeadAsset(a.defaultSkin);
    holder.append(img);
    return;
  }
  const source = String(a.skinDataUrl || a.skinUrl);
  const pixel = document.createElement('div');
  pixel.className = 'head-pixel';
  pixel.style.backgroundImage = `url("${cssUrl(source)}")`;
  const hat = document.createElement('div');
  hat.className = 'head-pixel head-pixel-hat';
  hat.style.backgroundImage = `url("${cssUrl(source)}")`;
  holder.append(pixel, hat);
}
function renderHead(el, appearance) { setSkinLayers(el, appearance); }

function makeTexturedFace(width, height, cropX, cropY, cropW, cropH, source, cls = '') {
  const face = document.createElement('div');
  face.className = `skin-face ${cls}`.trim();
  face.style.width = `${width}px`;
  face.style.height = `${height}px`;
  const scale = Math.min(width / cropW, height / cropH);
  face.style.backgroundImage = `url("${cssUrl(source)}")`;
  face.style.backgroundSize = `${64 * scale}px ${64 * scale}px`;
  face.style.backgroundPosition = `-${cropX * scale}px -${cropY * scale}px`;
  return face;
}

function createSkinPart(name, dimensions, faces, source, position, extraClass = '') {
  const [w,h,d] = dimensions;
  const part = document.createElement('div');
  part.className = `skin-part skin-part-${name} ${extraClass}`.trim();
  part.style.width = `${w}px`;
  part.style.height = `${h}px`;
  part.style.transform = `translate3d(${position[0]}px,${position[1]}px,${position[2]}px)`;
  const definitions = [
    ['front', w, h, faces.front, `translateZ(${d/2}px)`],
    ['back', w, h, faces.back, `rotateY(180deg) translateZ(${d/2}px)`],
    ['right', d, h, faces.right, `rotateY(90deg) translateZ(${w/2}px)`],
    ['left', d, h, faces.left, `rotateY(-90deg) translateZ(${w/2}px)`],
    ['top', w, d, faces.top, `rotateX(90deg) translateZ(${h/2}px)`],
    ['bottom', w, d, faces.bottom, `rotateX(-90deg) translateZ(${h/2}px)`]
  ];
  for (const [label, fw, fh, rect, transform] of definitions) {
    const face = makeTexturedFace(fw, fh, rect[0], rect[1], rect[2], rect[3], source, `face-${label}`);
    face.style.transform = `translate(-50%,-50%) ${transform}`;
    face.style.left = '50%';
    face.style.top = '50%';
    part.appendChild(face);
  }
  return part;
}

function boxFaces(u, v, width, height, depth) {
  return {
    top: [u + depth, v, width, depth],
    bottom: [u + width + depth, v, width, depth],
    left: [u, v + depth, depth, height],
    front: [u + depth, v + depth, width, height],
    right: [u + width + depth, v + depth, depth, height],
    back: [u + width + depth * 2, v + depth, width, height]
  };
}

function renderModel(stage, appearance) {
  if (!stage) return;
  stage.replaceChildren();
  const a = normalizeAppearance(appearance);
  const source = String(a.skinDataUrl || a.skinUrl || skinFullAsset(a.defaultSkin));
  const slim = a.defaultSkin === 'alex';
  const S = 6;
  const model = document.createElement('div');
  model.className = 'skin-model';
  model.style.setProperty('--ry', `${state.appearanceRotation}deg`);
  model.style.setProperty('--rx', `${state.appearanceTilt ?? 7}deg`);

  const add = (name, size, uv, x, y, z=0, extra='') => model.appendChild(createSkinPart(name, size, uv, source, [x,y,z], extra));
  const outer = (base, pad, extraName) => ({
    size: [base[0]+pad, base[1]+pad, base[2]+pad],
    offset: [-(pad/2), -(pad/2), -(pad/2)],
    name: `${extraName}-overlay`
  });

  const head=[8*S,8*S,8*S], headOuter=[9*S,9*S,9*S];
  add('head', head, boxFaces(0,0,8,8,8), -4*S, -15*S);
  add('head-overlay', headOuter, boxFaces(32,0,8,8,8), -4*S-0.5*S, -15*S-0.5*S, -0.5*S, 'skin-overlay');

  const body=[8*S,12*S,4*S], bodyOuter=[8.5*S,12.5*S,4.5*S];
  add('body', body, boxFaces(16,16,8,12,4), -4*S, -7*S);
  add('body-overlay', bodyOuter, boxFaces(16,32,8,12,4), -4*S-0.25*S, -7*S-0.25*S, -0.25*S, 'skin-overlay');

  const armW = slim ? 3*S : 4*S;
  const arm=[armW,12*S,4*S], armOuter=[armW+0.5*S,12.5*S,4.5*S];
  add('arm-right', arm, boxFaces(40,16,slim?3:4,12,4), -4*S-armW, -7*S);
  add('arm-right-overlay', armOuter, boxFaces(40,32,slim?3:4,12,4), -4*S-armW-0.25*S, -7*S-0.25*S, -0.25*S, 'skin-overlay');
  add('arm-left', arm, boxFaces(32,48,slim?3:4,12,4), 4*S, -7*S);
  add('arm-left-overlay', armOuter, boxFaces(48,48,slim?3:4,12,4), 4*S-0.25*S, -7*S-0.25*S, -0.25*S, 'skin-overlay');

  const leg=[4*S,12*S,4*S], legOuter=[4.5*S,12.5*S,4.5*S];
  add('leg-right', leg, boxFaces(0,16,4,12,4), -4*S, 5*S);
  add('leg-right-overlay', legOuter, boxFaces(0,32,4,12,4), -4*S-0.25*S, 5*S-0.25*S, -0.25*S, 'skin-overlay');
  add('leg-left', leg, boxFaces(16,48,4,12,4), 0, 5*S);
  add('leg-left-overlay', legOuter, boxFaces(0,48,4,12,4), 0-0.25*S, 5*S-0.25*S, -0.25*S, 'skin-overlay');

  const capeSource = capeTextureFor(a);
  if (a.capeEnabled && capeSource) addCape(model, capeSource, S, -5*S, -7.8*S, -3.2*S);
  stage.appendChild(model);
}

function addCape(model, source, S, x, y, z) {
  const w=10*S, h=16*S, d=1*S;
  const cape=document.createElement('div');
  cape.className='skin-cape-box';
  cape.style.width=`${w}px`; cape.style.height=`${h}px`;
  cape.style.transform=`translate3d(${x}px,${y}px,${z}px)`;
  cape.style.setProperty('--cape-w', `${w}px`); cape.style.setProperty('--cape-h', `${h}px`); cape.style.setProperty('--cape-d', `${d}px`);
  const faces=boxFaces(0,0,10,16,1);
  const defs=[
    ['front',w,h,faces.front,`translateZ(${d/2}px)`],['back',w,h,faces.back,`rotateY(180deg) translateZ(${d/2}px)`],
    ['right',d,h,faces.right,`rotateY(90deg) translateZ(${w/2}px)`],['left',d,h,faces.left,`rotateY(-90deg) translateZ(${w/2}px)`],
    ['top',w,d,faces.top,`rotateX(90deg) translateZ(${h/2}px)`],['bottom',w,d,faces.bottom,`rotateX(-90deg) translateZ(${h/2}px)`]
  ];
  for(const [label,fw,fh,rect,tr] of defs){
    const f=makeCapeFace(fw,fh,rect[0],rect[1],rect[2],rect[3],source,`cape-face-${label}`);
    f.style.transform=`translate(-50%,-50%) ${tr}`; cape.appendChild(f);
  }
  model.appendChild(cape);
}

function makeCapeFace(width,height,cx,cy,cw,ch,source,cls='') {
  const f=document.createElement('div'); f.className=`skin-face ${cls}`.trim();
  f.style.width=`${width}px`; f.style.height=`${height}px`;
  const scale=Math.min(width/cw,height/ch);
  f.style.backgroundImage=`url("${cssUrl(source)}")`;
  f.style.backgroundSize=`${64*scale}px ${32*scale}px`;
  f.style.backgroundPosition=`-${cx*scale}px -${cy*scale}px`;
  return f;
}

function filtered(list, search, filter) {
  const query = String(search || '').trim().toLowerCase();
  return list.filter(a => {
    const match = !query || String(a.username || '').toLowerCase().includes(query) || String(a.label || '').toLowerCase().includes(query);
    const st = a.runtime?.status || 'offline';
    const selected = state.selected.has(a.id);
    return match && (
      filter === 'all' ||
      (filter === 'online' && isOnline(a.runtime)) ||
      (filter === 'offline' && !isOnline(a.runtime)) ||
      (filter === 'joining' && st === 'joining') ||
      (filter === 'reconnecting' && st === 'reconnecting') ||
      (filter === 'error' && st === 'error') ||
      (filter === 'selected' && selected)
    );
  }).sort((a, b) => String(a.label || a.username).localeCompare(String(b.label || b.username)));
}

function accountListHash(list, search, filter) {
  return JSON.stringify({ search:String(search||''), filter, ids:list.map(a=>a.id) });
}

function accountRow(a) {
  return `<article class="account-row ${state.selected.has(a.id) ? 'selected' : ''}" data-account-row="${a.id}" data-open-inspector="${a.id}">
    <label class="select-wrap"><input class="select-box" type="checkbox" data-select="${a.id}" ${state.selected.has(a.id) ? 'checked' : ''}></label>
    <div class="row-account"><div class="head-sm" data-head="${a.id}"></div><div class="account-text"><strong data-field="label"></strong><small data-field="username"></small></div></div>
    <div class="account-target" data-field="target"></div>
    <div><span class="status-chip offline" data-field="status"></span><small class="status-detail" data-field="detail"></small></div>
    <div class="account-actions"><button class="button ghost compact" data-open-config="${a.id}">Edit</button><button class="button primary compact" data-field="action" data-connect="${a.id}">Join</button></div>
  </article>`;
}
function rowSkinSignature(a){ const ap=normalizeAppearance(a.appearance); return JSON.stringify([ap.defaultSkin,ap.skinUrl,Boolean(ap.skinDataUrl),ap.cape]); }
function hydrateAccountRow(el, a){
  const rt=a.runtime||{}; const online=isOnline(rt); const status=runtimeStatusText(rt);
  el.classList.toggle('selected',state.selected.has(a.id));
  const cb=el.querySelector('.select-box'); if(cb) cb.checked=state.selected.has(a.id);
  el.querySelector('[data-field="label"]').textContent=a.label||a.username;
  el.querySelector('[data-field="username"]').textContent=a.username;
  el.querySelector('[data-field="target"]').textContent=targetText(rt.target||state.settings);
  const st=el.querySelector('[data-field="status"]'); if(st){ st.className=`status-chip ${statusClass(rt)}`; st.textContent=status; }
  const detail=el.querySelector('[data-field="detail"]'); if(detail){ detail.textContent=rt.inServer?'Connection active':(rt.lastEvent||rt.error||'No recent activity'); detail.title=detail.textContent; }
  const action=el.querySelector('[data-field="action"]'); if(action){ action.classList.remove('danger','primary','ghost'); action.classList.add(online?'danger':(rt.status==='reconnecting'?'ghost':'primary')); action.textContent=online?'Leave':(rt.pendingJoin?'Queued':(rt.status==='reconnecting'?'Reconnecting':'Join')); action.disabled=rt.status==='reconnecting'; }
  const head=el.querySelector(`[data-head="${a.id}"]`); const sig=rowSkinSignature(a); if(head && head.dataset.skinSig!==sig){ renderHead(head,a.appearance); head.dataset.skinSig=sig; }
}
function renderListInto(rootId, rows) {
  const root=$(rootId); if(!root) return;
  const wanted=new Set(rows.map(a=>a.id));
  [...root.querySelectorAll('[data-account-row]')].forEach(el=>{ if(!wanted.has(el.dataset.accountRow)) el.remove(); });
  const existing=new Map([...root.querySelectorAll('[data-account-row]')].map(el=>[el.dataset.accountRow,el]));
  for(const a of rows){
    let el=existing.get(a.id);
    if(!el){ const tpl=document.createElement('template'); tpl.innerHTML=accountRow(a).trim(); el=tpl.content.firstElementChild; root.appendChild(el); }
    hydrateAccountRow(el,a);
  }
}

function renderAccountLists(force = false) {
  const dashSearch=$('dashboardSearch')?.value||''; const dashFilter=$('dashboardFilter')?.value||'all';
  const dashRows=filtered(state.accounts,dashSearch,dashFilter);
  const managerSearch=$('accountsSearch')?.value||''; const managerFilter=$('accountsFilter')?.value||'all';
  const managerRows=filtered(state.accounts,managerSearch,managerFilter);
  renderListInto('dashboardAccounts',dashRows);
  renderListInto('accountsList',managerRows);
  $('dashboardEmpty')?.classList.toggle('hidden',state.accounts.length>0);
  $('accountsEmpty')?.classList.toggle('hidden',state.accounts.length>0);
}
function renderStats() {
  const online = state.accounts.filter(a => isOnline(a.runtime)).length;
  $('statSaved').textContent = state.accounts.length;
  $('statOnline').textContent = online;
  $('statSelected').textContent = state.selected.size;
  $('statEvents').textContent = state.logs.length;
  $('selectionHint').textContent = `${state.selected.size} selected`;
  $('bulkCount').textContent = `${state.selected.size} selected`;
  $('bulkServer').textContent = targetText(state.settings);
  const selectedOnline = state.accounts.some(a => state.selected.has(a.id) && isOnline(a.runtime));
  const anyOnline = state.accounts.some(a => isOnline(a.runtime));
  $('leaveSelected')?.classList.toggle('hidden', !selectedOnline);
  $('leaveAllBottom')?.classList.toggle('hidden', !anyOnline);
  const joinDelay = Number(state.settings.joinDelayMs || 0); const concurrency = Number(state.queue?.maxConcurrentJoins || 0); const joinMode = concurrency === 0 ? 'all at once' : `${concurrency} concurrent`; $('queueState').textContent = `${state.queue?.queued || 0} queued · ${state.queue?.activeJoins || 0} connecting · ${joinDelay}ms · ${joinMode}`;
  const inServer = state.accounts.filter(a => a.runtime?.inServer).length;
  if ($('statOnlineLabel')) $('statOnlineLabel').textContent = 'In Server';
  if ($('statOnline')) $('statOnline').title = `${inServer} account(s) currently in the server`;
}

function inviteUrl() {
  if (state.publicConfig?.discordBotInviteUrl) return state.publicConfig.discordBotInviteUrl;
  const id = String(state.publicConfig?.discordBotClientId || '').trim();
  return id ? `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(id)}&scope=bot%20applications.commands&permissions=0` : '';
}
function renderPublicLinks() {
  const cfg = state.publicConfig || {};
  const site = cfg.siteName || 'NEXUS Control';
  $('launcherSiteName')?.replaceChildren(document.createTextNode(site));
  $('appSiteName')?.replaceChildren(document.createTextNode(site));
  const community = String(cfg.discordServerUrl || '').trim();
  const invite = inviteUrl();
  for (const id of ['launcherCommunity','appCommunity']) { const el=$(id); if(!el) continue; el.href=community||'#'; el.classList.toggle('disabled-link',!community); }
  for (const id of ['launcherInvite','appInvite']) { const el=$(id); if(!el) continue; el.href=invite||'#'; el.classList.toggle('disabled-link',!invite); }
}

function renderHeader() {
  const target = targetText(state.settings);
  $('topTarget').textContent = target;
  $('heroTarget').textContent = target;
  $('settingsTarget').textContent = target;
  const configured = Boolean(state.settings.host);
  $('topTargetDot').style.background = configured ? '#72d19b' : '#5a6a7b';
  $('settingsTargetDot').style.background = configured ? '#72d19b' : '#5a6a7b';
  $('createTargetPreview').textContent = configured ? `Global · ${target}` : 'No server target';
}

function renderLogs() {
  const hash = JSON.stringify([state.logFilter, state.logs.map(x => x.id)]);
  if (hash === state.logHash && $('logsFeed').innerHTML) return;
  state.logHash = hash;
  const logLimit = Number(state.settings.logLimit) > 0 ? Number(state.settings.logLimit) : state.logs.length;
  const rows = state.logs.filter(x => state.logFilter === 'all' || x.accountId === state.logFilter).slice(-logLimit).reverse();
  $('logsFeed').innerHTML = rows.map(x => `<div class="log-line"><time>${new Date(x.time).toLocaleTimeString()}</time><i class="log-dot ${esc(x.level)}"></i><span class="log-level">${esc(x.level)}</span><span class="log-account">${esc(account(x.accountId)?.username || 'System')}</span><p>${esc(x.message)}</p></div>`).join('') || '<div class="chat-empty">No events yet.</div>';
  const filter = $('logFilter');
  if (filter) { const old = state.logFilter; filter.innerHTML = '<option value="all">All accounts</option>' + state.accounts.map(a => `<option value="${a.id}">${esc(a.username)}</option>`).join(''); filter.value = state.accounts.some(a => a.id === old) ? old : 'all'; state.logFilter = filter.value; }
  const selector = $('logsChatAccount');
  if (selector) { const current = state.logChatAccount || '__selected__'; selector.innerHTML = '<option value="__selected__">Selected accounts</option><option value="__all__">All saved accounts</option>' + state.accounts.map(a => `<option value="${a.id}">${esc(a.username)}</option>`).join(''); selector.value = ['__selected__','__all__'].includes(current) || state.accounts.some(a => a.id === current) ? current : '__selected__'; state.logChatAccount = selector.value; }
  renderLogsChat();
}

function chatMarkup(m) { return `<div class="chat-message ${m.type === 'outgoing' ? 'outgoing' : ''}"><div class="chat-message-top"><strong>${esc(m.from || 'Server')}</strong><time>${new Date(m.time).toLocaleTimeString()}</time></div><p>${esc(m.message)}</p></div>`; }
function renderLogsChat() {
  const selector = $('logsChatAccount');
  const mode = selector?.value || '__selected__';
  const selectedCount = state.selected.size;
  const targetAccounts = mode === '__all__' ? state.accounts : mode === '__selected__' ? state.accounts.filter(a => state.selected.has(a.id)) : [account(mode)].filter(Boolean);
  const first = targetAccounts[0];
  $('logsChatTitle').textContent = mode === '__all__' ? 'All saved accounts' : mode === '__selected__' ? 'Selected accounts' : (first?.username || 'Select target');
  if ($('logsChatTargetHint')) $('logsChatTargetHint').textContent = mode === '__all__' ? `${state.accounts.length} accounts` : mode === '__selected__' ? `${selectedCount} selected` : (first ? first.username : '0 selected');
  const feed = $('logsChatFeed');
  if (first && targetAccounts.length === 1) feed.innerHTML = ((first.runtime?.chatPreview || first.runtime?.chat || []).map(chatMarkup).join('') || '<div class="chat-empty">No chat captured yet.</div>');
  else {
    const merged = targetAccounts.flatMap(a => (a.runtime?.chatPreview || a.runtime?.chat || []).slice(-12).map(m => ({...m, accountName:a.username}))).sort((a,b)=>String(a.time).localeCompare(String(b.time))).slice(-60);
    feed.innerHTML = merged.length ? merged.map(m => `<div class="chat-message ${m.type === 'outgoing' ? 'outgoing' : ''}"><div class="chat-message-top"><strong>${esc(m.accountName)} · ${esc(m.from || 'Server')}</strong><time>${new Date(m.time).toLocaleTimeString()}</time></div><p>${esc(m.message)}</p></div>`).join('') : '<div class="chat-empty">No chat captured yet.</div>';
  }
  feed.scrollTop = feed.scrollHeight;
  renderSelectedAccountEvents();
  renderSelectedAccountActivity();
}
function commandMarkup(c) { return `<div class="event-item event-command"><div class="event-item-top"><span class="event-type">${esc(c?.status || 'submitted')}</span><time>${c?.time ? new Date(c.time).toLocaleTimeString() : ''}</time></div><strong>${esc(c?.command || '')}</strong>${c?.detail ? `<p>${esc(c.detail)}</p>` : ''}</div>`; }
function renderCommands(containerId, commands) { const el=$(containerId); if(!el) return; el.innerHTML=(commands||[]).slice(-40).reverse().map(commandMarkup).join('') || '<div class="chat-empty">No commands sent yet.</div>'; }
function currentLogTargetAccounts(){
  const mode=$('logsChatAccount')?.value||state.logChatAccount||'__selected__';
  if(mode==='__all__') return state.accounts;
  if(mode==='__selected__') return state.accounts.filter(a=>state.selected.has(a.id));
  const one=account(mode); return one?[one]:[];
}
function renderSelectedAccountEvents() {
  const targets=currentLogTargetAccounts();
  const title=$('logsEventsTitle'); if(title) title.textContent=targets.length===1?`${targets[0].username} activity`:`Account activity · ${targets.length}`;
  const merged=targets.flatMap(a=>(a.runtime?.eventsPreview||a.runtime?.events||[]).map(e=>({...e,accountName:a.username,time:e.time}))).sort((a,b)=>String(a.time).localeCompare(String(b.time))).slice(-60);
  const el=$('logsEventsFeed'); if(el) el.innerHTML=merged.reverse().map(e=>eventMarkup({...e,message:`${e.accountName} · ${e.message}`})).join('')||'<div class="chat-empty">Select accounts or wait for activity.</div>';
}
function renderSelectedAccountActivity(){
  const targets=currentLogTargetAccounts();
  const merged=targets.flatMap(a=>(a.runtime?.commandHistoryPreview||a.runtime?.commandHistory||[]).map(c=>({...c,accountName:a.username,time:c.time}))).sort((a,b)=>String(a.time).localeCompare(String(b.time))).slice(-50);
  renderCommands('logsCommandsFeed', merged);
}

function renderAutomation() {
  const running = Boolean(state.chatAutomation?.running);
  const automationInterval = Number(state.chatAutomation?.intervalMs ?? 0);
  const automationLabel = automationInterval === 0 ? 'immediate' : `${Math.max(0, Math.round(automationInterval / 1000))}s`;
  $('automationStatus').textContent = running ? `Running · ${automationLabel}` : 'Stopped';
  $('automationStatus').className = `status-chip ${running ? 'online' : 'offline'}`;
  $('automationStart').disabled = running || state.selected.size === 0;
  $('automationStop').disabled = !running;
  $('automationTargets').textContent = state.selected.size ? `${state.selected.size} selected` : '0 selected';
}

function eventMarkup(e) {
  const type = String(e?.type || 'event').toLowerCase();
  const label = ({kick:'Kick',error:'Error',connection:'Connection',login:'Login',spawn:'Spawn',chat:'Chat',whisper:'Whisper',server:'Server',actionbar:'Action bar',title:'Title',death:'Death',command:'Command',disconnect:'Disconnect',reconnecting:'Reconnect',timeout:'Timeout','connection-end':'Connection'}[type] || 'Event');
  return `<div class="event-item event-${esc(type)}"><div class="event-item-top"><span class="event-type">${label}</span><time>${e?.time ? new Date(e.time).toLocaleTimeString() : ''}</time></div><strong>${esc(e?.message || '')}</strong>${e?.detail ? `<p>${esc(e.detail)}</p>` : ''}</div>`;
}

function renderAccountEvents(containerId, events, emptyText = 'No events yet.') {
  const el = $(containerId); if (!el) return;
  el.innerHTML = (events || []).slice(-40).reverse().map(eventMarkup).join('') || `<div class="chat-empty">${esc(emptyText)}</div>`;
}

function inspectorSignature(a) {
  if (!a) return '';
  const rt = a.runtime || {};
  const ap = normalizeAppearance(a.appearance); const eventList=rt.eventsPreview||rt.events||[]; const commandList=rt.commandHistoryPreview||rt.commandHistory||[]; const lastEvent = eventList.at(-1); return JSON.stringify([a.id,a.username,a.label,ap.defaultSkin,ap.skinUrl,Boolean(ap.skinDataUrl),ap.cape,ap.capeEnabled,rt.status,rt.pendingJoin,rt.position,rt.yaw,rt.pitch,rt.health,rt.food,rt.world,rt.players,rt.chatPreview?.length,eventList.length,commandList.length,lastEvent?.id,lastEvent?.type,lastEvent?.message,lastEvent?.detail,rt.sprint,rt.sneak,rt.follow?.active,rt.follow?.targetName,rt.follow?.lastMessage]);
}

function renderInspector(force = false) {
  const a = account(state.inspectorId);
  const empty = $('inspectorEmpty');
  const body = $('inspectorBody');
  if (!a) { empty?.classList.remove('hidden'); body?.classList.add('hidden'); state.inspectorHash = ''; return; }
  const sig = inspectorSignature(a);
  if (!force && sig === state.inspectorHash) return;
  state.inspectorHash = sig;
  const active = document.activeElement;
  const preserve = active && active.closest('#inspectorBody') && ['INPUT','TEXTAREA'].includes(active.tagName) ? { id:active.id, value:active.value, start:active.selectionStart, end:active.selectionEnd } : null;
  empty?.classList.add('hidden'); body?.classList.remove('hidden');
  const rt = a.runtime || {};
  const target = rt.target ? targetText(rt.target) : targetText(state.settings);
  body.innerHTML = `<div class="inspector-head"><div class="inspect-title"><div id="inspectHead" class="head-md"></div><div><strong>${esc(a.label || a.username)}</strong><small>${esc(a.username)}</small><div class="inspect-status"><span class="status-chip ${statusClass(rt)}">${esc(runtimeStatusText(rt))}</span></div></div></div><div class="inspect-target"><span>Target</span><b>${esc(target)}</b></div><div class="inspect-actions"><button class="button primary ${isOnline(rt) || rt.pendingJoin || rt.status === 'joining' || rt.status === 'reconnecting' ? 'hidden' : ''}" data-connect="${a.id}">Join</button><button class="button danger ${isOnline(rt) ? '' : 'hidden'}" data-connect="${a.id}" data-force-leave="true">Leave</button><button class="button ghost" data-open-config="${a.id}">Configure</button></div></div>
  <div class="inspect-section"><div class="section-mini-head"><h4>Chat</h4><span>${(rt.chatPreview || rt.chat || []).length} recent</span></div><div id="inspectChat" class="inspector-chat chat-feed">${(rt.chatPreview || rt.chat || []).map(chatMarkup).join('') || '<div class="chat-empty">No chat yet.</div>'}</div><div class="panel-foot"><input id="inspectChatInput" class="field" maxlength="256" placeholder="Message..." autocomplete="off"><button class="button primary" data-inspect-chat="${a.id}">Send</button></div></div>
  <div class="inspect-section"><div class="section-mini-head"><h4>Movement</h4><span>Short tap</span></div><div class="dpad"><button data-inspector-move="${a.id}" data-move="forward">W</button><div><button data-inspector-move="${a.id}" data-move="left">A</button><button data-inspector-move="${a.id}" data-move="back">S</button><button data-inspector-move="${a.id}" data-move="right">D</button></div></div><div class="inspector-control-row"><button class="button ghost ${rt.sprint ? 'active' : ''}" data-inspector-control="${a.id}" data-control="sprint">Sprint</button><button class="button ghost ${rt.sneak ? 'active' : ''}" data-inspector-control="${a.id}" data-control="sneak">Sneak</button><button class="button ghost" data-inspector-move="${a.id}" data-move="jump">Jump</button><button class="button ghost" data-stop="${a.id}">Stop</button></div><div class="look-row"><input id="inspectYaw" class="field" type="number" value="${Number(rt.yaw || 0)}" placeholder="Yaw"><input id="inspectPitch" class="field" type="number" value="${Number(rt.pitch || 0)}" placeholder="Pitch"><button class="button ghost" data-look="${a.id}">Apply</button></div></div>
  <div class="inspect-section"><div class="section-mini-head"><h4>Live state</h4><span>Auto updated</span></div><div class="inspector-metric-grid"><div class="metric"><span>Server state</span><b>${rt.inServer ? 'In Server' : statusText(rt.status)}</b></div><div class="metric"><span>Ping</span><b>${rt.ping != null ? `${rt.ping} ms` : '—'}</b></div><div class="metric"><span>Position</span><b>${rt.position ? `${rt.position.x} / ${rt.position.y} / ${rt.position.z}` : '—'}</b></div><div class="metric"><span>Session</span><b>${formatDuration(rt.sessionSeconds || 0)}</b></div><div class="metric"><span>Health</span><b>${rt.health ?? '—'}</b></div><div class="metric"><span>Food</span><b>${rt.food ?? '—'}</b></div><div class="metric"><span>Messages</span><b>${rt.messagesSent ?? 0}</b></div><div class="metric"><span>Commands</span><b>${rt.commandsSent ?? 0}</b></div></div><div class="live-reason"><span>Last event</span><b>${esc(rt.lastEvent || '—')}</b>${rt.lastKickReason ? `<small>Last kick: ${esc(rt.lastKickReason)}</small>` : ''}${rt.lastDisconnectReason ? `<small>Last disconnect: ${esc(rt.lastDisconnectReason)}</small>` : ''}</div></div>
  <div class="inspect-section"><div class="section-mini-head"><h4>Connection activity</h4><span>${(rt.eventsPreview || rt.events || []).length} events</span></div><div id="inspectEvents" class="event-feed"></div></div>
  <div class="inspect-section"><div class="section-mini-head"><h4>Visible players</h4><span>${(rt.players || []).length}</span></div><div class="player-list">${(rt.players || []).map(p => `<div class="player-row"><span>${esc(p)}</span><button class="tool-button" data-follow-player="${esc(p)}">Follow</button></div>`).join('') || '<span>No players visible</span>'}</div>${rt.follow?.active ? `<div class="follow-hint">Following ${esc(rt.follow.targetName)} · ${esc(rt.follow.lastMessage || '')}</div>` : ''}</div>`;
  renderHead($('inspectHead'), a.appearance);
  renderAccountEvents('inspectEvents', rt.eventsPreview || rt.events, 'No connection events yet.');
  const chat = $('inspectChat'); if (chat) chat.scrollTop = chat.scrollHeight;
  if (preserve && $(preserve.id)) { const el = $(preserve.id); el.value = preserve.value; try { el.setSelectionRange(preserve.start, preserve.end); } catch {} el.focus(); }
}

function renderState(force = false) {
  if (state.rendering) return;
  state.rendering = true;
  try {
    renderHeader();
    renderStats();
    renderAccountLists(force);
    renderInspector(force);
    if (state.view === 'logs') renderLogs();
    renderAutomation();
    if (state.settings && state.view === 'settings') syncSettings(false);
  } finally { state.rendering = false; }
}

function showView(view) {
  const valid = ['dashboard','accounts','logs','settings'];
  if (!valid.includes(view)) view = 'dashboard';
  state.view = view;
  const app = $('appShell');
  if (app) app.dataset.view = view;
  document.querySelectorAll('.view').forEach(el => {
    const active = el.id === view + 'View';
    el.hidden = !active;
    el.classList.toggle('active-view', active);
    el.setAttribute('aria-hidden', active ? 'false' : 'true');
  });
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  const meta = {
    dashboard:['CONTROL CENTER','Dashboard','See, select and control every bot from one place.'],
    accounts:['ACCOUNT MANAGER','Accounts','Find, select and manage your saved profiles.'],
    logs:['REAL TIME','Logs & Chat','Watch account events, captured chat and automatic messages.'],
    settings:['SERVER','Server settings','Configure the target, join queue, recovery and performance.']
  }[view];
  if (meta) { $('pageEyebrow').textContent = meta[0]; $('pageTitle').textContent = meta[1]; $('pageSubtitle').textContent = meta[2]; }
  if (view === 'logs') { state.logHash = ''; renderLogs(); }
  if (view === 'settings') syncSettings(false);
}

function openModal(id) { const modal = $(id); if (!modal) return; modal.classList.remove('hidden'); modal.setAttribute('aria-hidden', 'false'); }
function closeModal(id) {
  const modal = $(id); if (!modal) return;
  modal.classList.add('hidden'); modal.setAttribute('aria-hidden', 'true');
  if (id === 'appearanceModal') {
    stopAppearanceAutoRotate();
    state.appearanceDraft = null; state.appearanceMode = null; state.appearanceRotation = 0; state.appearanceTilt = 7;
  }
}

function openCreate() {
  state.createAppearance = appearanceBase();
  $('accountUsername').value = '';
  $('accountLabel').value = '';
  $('createDefaultSkin').value = 'steve';
  $('accountAutoReconnect').checked = false;
  $('accountStartOnLaunch').checked = false;
  openModal('accountModal');
  updateCreatePreview();
  setTimeout(() => $('accountUsername')?.focus(), 80);
}
function updateCreatePreview() {
  const skin = $('createDefaultSkin')?.value || 'steve';
  state.createAppearance = { ...normalizeAppearance(state.createAppearance), defaultSkin: skin, skinUrl:'', skinDataUrl:'', editorMode:'default' };
  $('createPreviewName').textContent = $('accountUsername').value.trim() || 'Bot';
  renderHead($('createHead'), state.createAppearance);
  renderHeader();
}
function openAppearance(mode) {
  stopAppearanceAutoRotate();
  state.appearanceMode = mode;
  state.appearanceDraft = normalizeAppearance(mode === 'create' ? state.createAppearance : account(state.configId)?.appearance);
  state.appearanceRotation = 0;
  state.appearanceTilt = 7;
  populateAppearance();
  openModal('appearanceModal');
}
function stopAppearanceAutoRotate() {
  state.appearanceAutoRotate = false;
  if (state.appearanceAutoRotateFrame) cancelAnimationFrame(state.appearanceAutoRotateFrame);
  state.appearanceAutoRotateFrame = null;
  const btn=$('toggleAppearanceRotate');
  btn?.classList.remove('active'); btn?.setAttribute('aria-pressed','false');
}
function startAppearanceAutoRotate() {
  if (state.appearanceAutoRotateFrame) cancelAnimationFrame(state.appearanceAutoRotateFrame);
  const tick=()=>{
    if(!state.appearanceAutoRotate) return;
    state.appearanceRotation=(state.appearanceRotation+0.55)%360;
    renderModel($('appearanceStage'),state.appearanceDraft);
    updateAppearanceFacing();
    state.appearanceAutoRotateFrame=requestAnimationFrame(tick);
  };
  state.appearanceAutoRotateFrame=requestAnimationFrame(tick);
}
function toggleAppearanceAutoRotate() {
  state.appearanceAutoRotate=!state.appearanceAutoRotate;
  const btn=$('toggleAppearanceRotate');
  btn?.classList.toggle('active',state.appearanceAutoRotate);
  btn?.setAttribute('aria-pressed',String(state.appearanceAutoRotate));
  if(state.appearanceAutoRotate) startAppearanceAutoRotate(); else stopAppearanceAutoRotate();
}
function updateAppearanceFacing(){
  const yaw=Math.abs(((state.appearanceRotation%360)+360)%360);
  const label=yaw<15||yaw>345?'Front':yaw<165?'Side':yaw<195?'Back':'Side';
  if($('appearanceFacing')) $('appearanceFacing').textContent=label;
}
function populateAppearance() {
  const a = normalizeAppearance(state.appearanceDraft);
  $('defaultSkinSelect').value = a.defaultSkin || 'steve';
  $('skinUrl').value = a.skinUrl || '';
  $('capeUrl').value = a.capeUrl || '';
  $('capeSelect').value = a.cape || 'none';
  $('capeEnabled').checked = Boolean(a.capeEnabled);
  updateCapeTexturePreview(a);
  renderModel($('appearanceStage'), a);
  updateAppearanceFacing();
}
function updateCapeTexturePreview(appearance){
  const box=$('capeTexturePreview'); if(!box) return;
  const a=normalizeAppearance(appearance);
  const src=capeTextureFor(a);
  box.replaceChildren();
  if(!src){ const span=document.createElement('span'); span.textContent='No cape texture selected'; box.append(span); return; }
  const img=document.createElement('img'); img.src=src; img.alt=capeLabel(a.cape); img.loading='lazy'; img.decoding='async'; box.append(img);
}

async function saveAppearanceEditor() {
  if (!state.appearanceDraft) return;
  state.appearanceDraft = normalizeAppearance(state.appearanceDraft);
  if (state.appearanceMode === 'config' && state.configId) {
    try {
      await api(`/api/accounts/${encodeURIComponent(state.configId)}`, { method:'PATCH', body:JSON.stringify({ appearance:state.appearanceDraft }) });
      closeModal('appearanceModal');
      toast('Appearance saved.', 'success');
    } catch (e) { toast(e.message, 'error'); }
    return;
  }
  state.createAppearance = { ...state.appearanceDraft };
  closeModal('appearanceModal');
  updateCreatePreview();
  toast('Appearance selected.', 'success');
}

async function loadAccountDetails(id){
  try{
    const response=await api(`/api/accounts/${encodeURIComponent(id)}/details`);
    if(response.account){
      const index=state.accounts.findIndex(a=>a.id===id);
      if(index>=0) state.accounts[index]=response.account;
      state.detailCache.set(id, response.account.runtime || {});
      state.listHash=''; state.inspectorHash=''; state.logHash=''; renderState(false); renderLogs();
    }
  }catch{}
}
function openConfig(id, tab = 'profile') {
  if (!account(id)) return;
  state.configId = id;
  state.configTab = tab;
  openModal('configModal');
  state.inspectorHash = '';
  renderConfig(true);
  loadAccountDetails(id);
}

function setValue(id, value) { const el = $(id); if (el && document.activeElement !== el) el.value = value == null ? '' : value; }
function setCheck(id, value) { const el = $(id); if (el && document.activeElement !== el) el.checked = Boolean(value); }

function renderConfig(forceValues = true) {
  const a = account(state.configId);
  if (!a || $('configModal').classList.contains('hidden')) return;
  const rt = a.runtime || {};
  $('configTitle').textContent = a.label || a.username;
  $('configTarget').textContent = rt.target ? targetText(rt.target) : targetText(state.settings);
  $('configStatus').textContent = runtimeStatusText(rt);
  $('configStatus').className = `status-chip ${statusClass(rt)}`;
  renderHead($('configHead'), a.appearance);
  const configJoin = $('configJoin');
  const configLeave = $('configLeave');
  if (configJoin) {
    const busy = rt.pendingJoin || rt.status === 'joining' || rt.status === 'reconnecting';
    configJoin.classList.toggle('hidden', rt.inServer || busy);
    configJoin.disabled = rt.inServer || busy;
  }
  if (configLeave) {
    configLeave.classList.toggle('hidden', !rt.inServer);
    configLeave.disabled = !rt.inServer;
  }
  document.querySelectorAll('[data-config-tab]').forEach(b => b.classList.toggle('active', b.dataset.configTab === state.configTab));
  document.querySelectorAll('.config-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === state.configTab));
  if (forceValues) {
    setValue('editUsername', a.username); setValue('editLabel', a.label || a.username);
    setValue('editJoinDelay', a.joinDelayMsOverride ?? ''); setValue('editReconnectDelay', a.reconnectDelayMs || state.settings.reconnectDelayMs || 5000);
    setCheck('editAutoReconnect', a.autoReconnect); setCheck('editStartOnLaunch', a.startOnLaunch); setCheck('editUseCustom', a.serverMode === 'custom');
    setValue('editHost', a.hostOverride || ''); setValue('editPort', a.portOverride || 25565); setValue('editVersion', a.versionOverride || '');
    $('customServerFields')?.classList.toggle('hidden', a.serverMode !== 'custom');
  }
  if (state.configTab === 'appearance') {
    $('appearanceInlineName').textContent = a.username;
    const app = normalizeAppearance(a.appearance);
    $('appearanceInlineSummary').textContent = app.skinUrl || app.skinDataUrl ? `Custom skin · ${capeLabel(app.cape)}` : `${app.defaultSkin === 'alex' ? 'Alex' : 'Steve'} · ${capeLabel(app.cape)}`;
    renderHead($('appearanceInlineHead'), app);
  }
  if (state.configTab === 'control') {
    $('controlChatStatus').textContent = runtimeStatusText(rt); $('controlChatStatus').className = `status-chip ${statusClass(rt)}`;
    $('controlChatFeed').innerHTML = (rt.chatPreview || rt.chat || []).map(chatMarkup).join('') || '<div class="chat-empty">No chat yet.</div>';
    $('controlChatFeed').scrollTop = $('controlChatFeed').scrollHeight;
    $('liveStatus').textContent = runtimeStatusText(rt); $('livePosition').textContent = rt.position ? `${rt.position.x} / ${rt.position.y} / ${rt.position.z}` : '—';
    $('liveHealth').textContent = rt.health ?? '—'; $('liveFood').textContent = rt.food ?? '—'; $('livePlayers').textContent = (rt.players || []).length;
    if ($('followTarget') && document.activeElement !== $('followTarget')) $('followTarget').value = rt.follow?.targetName || '';
    if ($('followStatus')) { $('followStatus').textContent = rt.follow?.active ? 'Following' : 'Off'; $('followStatus').className = `status-chip ${rt.follow?.active ? 'online' : 'offline'}`; }
    if ($('followHint')) $('followHint').textContent = rt.follow?.active ? (rt.follow.lastMessage || `Tracking ${rt.follow.targetName}`) : 'The player must be nearby and currently visible to the bot.';
    $('playerList').innerHTML = (rt.players || []).map(p => `<div class="player-row"><span>${esc(p)}</span><button class="tool-button" data-follow-player="${esc(p)}">Follow</button></div>`).join('') || '<span>No players visible</span>';
  }
}

async function createAccount() {
  const username = $('accountUsername').value.trim();
  if (!username) return toast('Enter a username first.', 'warn');
  try {
    const response = await api('/api/accounts', { method:'POST', body:JSON.stringify({
      username,
      label:$('accountLabel').value.trim(),
      autoReconnect:$('accountAutoReconnect').checked,
      startOnLaunch:$('accountStartOnLaunch').checked,
      appearance:state.createAppearance || appearanceBase()
    }) });
    if (response.account) {
      state.accounts = [...state.accounts.filter(a => a.id !== response.account.id), response.account];
      state.listHash = '';
    }
    closeModal('accountModal');
    state.createAppearance = null;
    renderState(true);
    toast(`${username} created.`, 'success');
  } catch (e) { toast(e.message, 'error'); }
}

async function saveProfile() {
  if (!state.configId) return;
  try { await api(`/api/accounts/${encodeURIComponent(state.configId)}`, { method:'PATCH', body:JSON.stringify({ username:$('editUsername').value.trim(), label:$('editLabel').value.trim() }) }); toast('Profile saved.', 'success'); }
  catch (e) { toast(e.message, 'error'); }
}
async function saveBehaviour() {
  if (!state.configId) return;
  const custom = $('editUseCustom').checked;
  const body = {
    serverMode: custom ? 'custom' : 'global',
    autoReconnect:$('editAutoReconnect').checked,
    startOnLaunch:$('editStartOnLaunch').checked,
    reconnectDelayMs:Number($('editReconnectDelay').value || 1000),
    joinDelayMsOverride:$('editJoinDelay').value === '' ? null : Number($('editJoinDelay').value)
  };
  if (custom) Object.assign(body, { hostOverride:$('editHost').value.trim(), portOverride:Number($('editPort').value || 25565), versionOverride:$('editVersion').value.trim() });
  try { await api(`/api/accounts/${encodeURIComponent(state.configId)}`, { method:'PATCH', body:JSON.stringify(body) }); toast('Behaviour saved.', 'success'); }
  catch (e) { toast(e.message, 'error'); }
}

function syncSettings(force = true) {
  const s = state.settings || {};
  const values = {
    setHost:s.host || '', setPort:s.port || 25565, setVersion:s.version || '', setJoinDelay:s.joinDelayMs ?? 1000,
    setMaxConcurrent:s.maxConcurrentJoins ?? 1, setJoinJitter:s.joinJitterMs ?? 0, setJoinTimeout:s.joinTimeoutMs ?? 20000, setLeaveDelay:s.leaveDelayMs ?? 150,
    setReconnectDelay:s.reconnectDelayMs ?? 1000, setMaxReconnect:s.maxReconnectAttempts ?? 0,
    setLiveUpdate:s.liveUpdateMs ?? 500, setPlayerLimit:s.playerLimit ?? 200, setLogLimit:s.logLimit ?? 500,
    setMultiChatDelay:s.multiChatDelayMs ?? 0, setMovementTap:s.movementTapMs ?? 180, setMaxAccounts:s.maxAccounts ?? 0,
    setStateBroadcast:s.stateBroadcastMs ?? 100, setChatQueueLimit:s.chatQueueLimit ?? 0,
    setJoinOrder:s.joinOrder ?? 'saved-top-down', setChatOrder:s.chatOrder ?? 'saved-top-down', setLeaveOrder:s.leaveOrder ?? 'saved-top-down'
  };
  for (const [id, value] of Object.entries(values)) if (force || document.activeElement !== $(id)) setValue(id, value);
  if ($('setJoinOrder')) $('setJoinOrder').value = s.joinOrder ?? 'saved-top-down';
  if ($('setChatOrder')) $('setChatOrder').value = s.chatOrder ?? 'saved-top-down';
  if ($('setLeaveOrder')) $('setLeaveOrder').value = s.leaveOrder ?? 'saved-top-down';
  if ($('setChatSigningCompatibility')) $('setChatSigningCompatibility').value = s.chatSigningCompatibility === false ? 'off' : 'on';
  setCheck('setAutoReconnect', s.autoReconnect); setCheck('setReconnectBackoff', s.reconnectBackoff); setCheck('setKeepOnline', s.keepOnline !== false); setCheck('setReconnectAfterKick', s.reconnectAfterKick !== false); setCheck('setAutoRespawn', s.autoRespawn !== false);
  const quick = s.host ? (s.port && s.port !== 25565 ? `${s.host}:${s.port}` : s.host) : '';
  if (force || document.activeElement !== $('quickServer')) $('quickServer').value = quick;
}

async function saveServerSettings() {
  const raw = $('setHost').value.trim();
  if (!raw) return toast('Enter a server address first.', 'warn');
  try {
    await api('/api/settings', { method:'POST', body:JSON.stringify({
      host:raw, port:Number($('setPort').value || 25565), version:$('setVersion').value.trim(),
      joinDelayMs:toNumber($('setJoinDelay').value, 1000), maxConcurrentJoins:toNumber($('setMaxConcurrent').value, 1),
      joinJitterMs:toNumber($('setJoinJitter').value, 0), joinTimeoutMs:toNumber($('setJoinTimeout').value, 20000), leaveDelayMs:toNumber($('setLeaveDelay').value, 0),
      reconnectDelayMs:toNumber($('setReconnectDelay').value, 1000), maxReconnectAttempts:toNumber($('setMaxReconnect').value, 0),
      autoReconnect:$('setAutoReconnect').checked, reconnectBackoff:$('setReconnectBackoff').checked, keepOnline:$('setKeepOnline')?.checked !== false, reconnectAfterKick:$('setReconnectAfterKick')?.checked !== false, autoRespawn:$('setAutoRespawn')?.checked !== false,
      liveUpdateMs:toNumber($('setLiveUpdate').value, 500), playerLimit:toNumber($('setPlayerLimit').value, 200), logLimit:toNumber($('setLogLimit').value, 500),
      multiChatDelayMs:toNumber($('setMultiChatDelay').value, 0), movementTapMs:toNumber($('setMovementTap').value, 180), maxAccounts:toNumber($('setMaxAccounts').value, 0), chatSigningCompatibility:$('setChatSigningCompatibility')?.value !== 'off',
      stateBroadcastMs:toNumber($('setStateBroadcast').value, 100), chatQueueLimit:toNumber($('setChatQueueLimit').value, 0),
      joinOrder:$('setJoinOrder').value, chatOrder:$('setChatOrder').value, leaveOrder:$('setLeaveOrder').value
    }) });
    toast('Server settings saved.', 'success');
  } catch (e) { toast(e.message, 'error'); }
}
async function resetSettings() {
  try {
    const response = await api('/api/settings/reset', { method:'POST', body:'{}' });
    if (response.settings) state.settings = response.settings;
    syncSettings(true);
    renderState(true);
    toast('Default configuration restored.', 'success');
  } catch (e) { toast(e.message, 'error'); }
}
async function applyQuickServer() {
  const raw = $('quickServer').value.trim();
  if (!raw) return toast('Enter a server target first.', 'warn');
  try { await api('/api/settings', { method:'POST', body:JSON.stringify({ host:raw, port:25565 }) }); toast('Server target updated.', 'success'); }
  catch (e) { toast(e.message, 'error'); }
}
async function testServer() {
  const raw = $('setHost').value.trim(); if (!raw) return toast('Enter a server target first.', 'warn');
  $('connectionResult').textContent = 'Testing connection…'; $('connectionResult').className = 'test-result';
  try {
    const response = await api('/api/test-connection', { method:'POST', body:JSON.stringify({ address:raw, port:Number($('setPort').value || 25565) }) });
    $('connectionResult').className = `test-result ${response.ok ? 'success' : 'error'}`;
    $('connectionResult').textContent = response.ok ? `TCP reachable · ${response.host}:${response.port} · ${response.latencyMs} ms` : `Not reachable · ${response.host}:${response.port} · ${response.error}`;
  } catch (e) { $('connectionResult').className = 'test-result error'; $('connectionResult').textContent = e.message; }
}

async function connect(id) {
  const a = account(id); if (!a) return;
  if (a.runtime?.status === 'reconnecting') return;
  const action = isOnline(a.runtime) ? 'disconnect' : 'connect';
  try { await api(`/api/accounts/${encodeURIComponent(id)}/${action}`, { method:'POST', body:'{}' }); }
  catch (e) { toast(e.message, 'error'); }
}
async function connectMany(ids) {
  ids = (Array.isArray(ids) ? ids : []).filter(id => Boolean(account(id)));
  if (!ids.length) return toast('Select at least one account.', 'warn');
  const needsGlobalTarget = ids.some(id => { const a = account(id); return !a || a.serverMode !== 'custom' || !a.hostOverride; });
  if (needsGlobalTarget && !state.settings.host) return toast('Set a global server first, or configure a custom server for every selected account.', 'warn');
  try { await api('/api/actions/connect-all', { method:'POST', body:JSON.stringify({ ids }) }); toast(`${ids.length} account(s) added to the join queue.`, 'success'); }
  catch (e) { toast(e.message, 'error'); }
}
async function leaveMany(ids) {
  ids = (Array.isArray(ids) ? ids : []).filter(id => Boolean(account(id)));
  if (!ids.length) return toast('No accounts selected.', 'warn');
  try { await api('/api/actions/disconnect-all', { method:'POST', body:JSON.stringify({ ids }) }); toast(`${ids.length} account(s) are leaving in order.`, 'success'); }
  catch (e) { toast(e.message, 'error'); }
}
async function clearQueue() {
  try { await api('/api/actions/clear-queue', { method:'POST', body:'{}' }); toast('Join queue cleared.', 'success'); }
  catch (e) { toast(e.message, 'error'); }
}
async function stopAll() {
  try { await api('/api/actions/stop-all', { method:'POST', body:'{}' }); toast('All bot activity stopped.', 'success'); }
  catch (e) { toast(e.message, 'error'); }
}
async function sendChat(id, inputId) {
  const input = $(inputId); if (!input) return;
  const message = input.value.trim(); if (!message) return;
  try { const result = await api(`/api/accounts/${encodeURIComponent(id)}/chat`, { method:'POST', body:JSON.stringify({ message }) }); input.value = ''; toast(result.delivery === 'sent' ? 'Message sent to Minecraft.' : 'Message queued until the bot is ready.', result.delivery === 'sent' ? 'success' : 'info'); }
  catch (e) { toast(e.message, 'error'); }
}
function updateMessageModalTarget() {
  const el = $('messageTargetMode');
  if (el) el.value = state.messageTargetMode || 'selected';
  const count = state.messageTargetMode === 'all' ? state.accounts.length : state.selected.size;
  const p = document.querySelector('#messageModal .message-target-count');
  if (p) p.textContent = `${count} account(s)`;
}
async function sendMulti() {
  const message = $('multiMessage').value.trim(); if (!message) return;
  const mode = state.messageTargetMode || $('messageTargetMode')?.value || 'selected';
  const ids = mode === 'all' ? state.accounts.map(a => a.id) : [...state.selected];
  if (!ids.length) return toast(mode === 'all' ? 'No saved accounts.' : 'Select at least one account.', 'warn');
  try { await api('/api/actions/chat-all', { method:'POST', body:JSON.stringify({ ids, message }) }); $('multiMessage').value=''; closeModal('messageModal'); toast(`${message.startsWith('/') ? 'Command' : 'Message'} sent/queued for ${ids.length} account(s).`, 'success'); }
  catch (e) { toast(e.message, 'error'); }
}
async function sendLogsChat() {
  const input = $('logsChatInput'); if (!input) return;
  const message = input.value.trim(); if (!message) return;
  const mode = $('logsChatAccount')?.value || '__selected__';
  let ids = [];
  if (mode === '__all__') ids = state.accounts.map(a => a.id);
  else if (mode === '__selected__') ids = [...state.selected];
  else if (account(mode)) ids = [mode];
  if (!ids.length) return toast('Select at least one account.', 'warn');
  try { await api('/api/actions/chat-all', { method:'POST', body:JSON.stringify({ ids, message }) }); input.value=''; toast(`${message.startsWith('/') ? 'Command' : 'Message'} sent/queued for ${ids.length} account(s).`, 'success'); }
  catch (e) { toast(e.message, 'error'); }
}

async function followPlayer(id, targetName) {
  try { await api(`/api/accounts/${encodeURIComponent(id)}/follow`, { method:'POST', body:JSON.stringify({ targetName }) }); }
  catch (e) { toast(e.message, 'error'); }
}
async function stopFollow(id) {
  try { await api(`/api/accounts/${encodeURIComponent(id)}/follow-stop`, { method:'POST', body:'{}' }); }
  catch (e) { toast(e.message, 'error'); }
}

async function moveFor(id, direction) {
  try { await api(`/api/accounts/${encodeURIComponent(id)}/move`, { method:'POST', body:JSON.stringify({ direction }) }); }
  catch (e) { toast(e.message, 'error'); }
}
async function toggleControl(id, key) {
  const rt = account(id)?.runtime || {};
  const next = !Boolean(rt[key]);
  try { await api(`/api/accounts/${encodeURIComponent(id)}/controls`, { method:'POST', body:JSON.stringify({ [key]:next }) }); }
  catch (e) { toast(e.message, 'error'); }
}
async function applyLookFor(id, yawId, pitchId) {
  try { await api(`/api/accounts/${encodeURIComponent(id)}/look`, { method:'POST', body:JSON.stringify({ yaw:Number($(yawId).value || 0), pitch:Number($(pitchId).value || 0) }) }); }
  catch (e) { toast(e.message, 'error'); }
}
async function stopFor(id) { try { await api(`/api/accounts/${encodeURIComponent(id)}/stop`, { method:'POST', body:'{}' }); } catch (e) { toast(e.message, 'error'); } }

function confirmDelete() {
  const a = account(state.configId); if (!a) return;
  $('confirmTitle').textContent = `Delete ${a.username}?`;
  $('confirmText').textContent = 'This removes the saved profile and disconnects the bot.';
  state.confirmAction = async () => {
    try {
      await api(`/api/accounts/${encodeURIComponent(a.id)}`, { method:'DELETE' });
      state.selected.delete(a.id); if (state.inspectorId === a.id) state.inspectorId = null; state.configId = null;
      closeModal('confirmModal'); closeModal('configModal'); renderState(true); toast('Account deleted.', 'success');
    } catch (e) { toast(e.message, 'error'); }
  };
  openModal('confirmModal');
}

async function startAutomation() {
  const messages = $('automationMessage').value.split('\n').map(x => x.trim()).filter(Boolean);
  if (!messages.length) return toast('Enter at least one automatic message.', 'warn');
  if (!state.selected.size) return toast('Select at least one account.', 'warn');
  const seconds = toNumber($('automationInterval').value, 30);
  try { await api('/api/actions/chat-automation', { method:'POST', body:JSON.stringify({ action:'start', ids:orderedIds([...state.selected]), messages, intervalMs:seconds*1000 }) }); toast('Automatic chat started.', 'success'); }
  catch (e) { toast(e.message, 'error'); }
}
async function stopAutomation() {
  try { await api('/api/actions/chat-automation', { method:'POST', body:JSON.stringify({ action:'stop' }) }); toast('Automatic chat stopped.', 'success'); }
  catch (e) { toast(e.message, 'error'); }
}

function applyPreset(name) {
  const preset = {
    immediate:{ join:0, parallel:0, jitter:0, timeout:20000 },
    onePerSecond:{ join:1000, parallel:1, jitter:0, timeout:20000 },
    gentle:{ join:5000, parallel:1, jitter:0, timeout:25000 }
  }[name];
  if (!preset) return;
  $('setJoinDelay').value = preset.join; $('setMaxConcurrent').value = preset.parallel; $('setJoinJitter').value = preset.jitter; $('setJoinTimeout').value = preset.timeout;
  toast('Join preset selected. Click Save settings to apply it.', 'info');
}


function enterWorkspace(system) {
  if (system !== 'cracked') {
    toast('This workspace is coming soon.', 'info');
    return;
  }
  const launcher = $('systemLauncher');
  document.body.classList.add('launcher-closing');
  document.body.classList.remove('landing-open');
  launcher?.setAttribute('aria-hidden', 'true');
  showView('dashboard');
  requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
  setTimeout(() => document.body.classList.remove('launcher-closing'), 360);
}

function openSystemLauncher() {
  const modals = ['confirmModal','messageModal','appearanceModal','configModal','accountModal'];
  for (const id of modals) closeModal(id);
  document.body.classList.add('landing-open');
  const launcher = $('systemLauncher');
  launcher?.setAttribute('aria-hidden', 'false');
  if (launcher) launcher.scrollTop = 0;
  document.body.classList.remove('launcher-closing');
}

function bindEvents() {
  if (window.__nexusEventsBound) return;
  window.__nexusEventsBound = true;
  for (const id of ['launcherCommunity','launcherInvite','appCommunity','appInvite']) $(id)?.addEventListener('click', e => { if ($(id).classList.contains('disabled-link')) e.preventDefault(); });
  $('systemSwitcher')?.addEventListener('click', openSystemLauncher);
  $('brandHome')?.addEventListener('click', openSystemLauncher);
  document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
  document.querySelectorAll('.workspace-card[data-system]').forEach(card => {
    card.onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      enterWorkspace(card.dataset.system);
    };
  });
  $('topSettings').onclick = () => showView('settings');
  renderPublicLinks();
  $('newAccountTop').onclick = openCreate;
  $('emptyNewAccount').onclick = openCreate;
  $('accountsEmptyNew').onclick = openCreate;
  $('createAccount').onclick = createAccount;
  $('openCreateAppearance').onclick = () => openAppearance('create');
  $('createDefaultSkin').onchange = updateCreatePreview;
  $('accountUsername').oninput = updateCreatePreview;
  $('saveProfile').onclick = saveProfile;
  $('saveAdvanced').onclick = saveBehaviour;
  $('deleteAccount').onclick = confirmDelete;
  $('configJoin').onclick = () => state.configId && connect(state.configId);
  $('configLeave').onclick = () => state.configId && leaveMany([state.configId]);
  $('openFullAppearance').onclick = () => openAppearance('config');
  $('saveInlineAppearance').onclick = () => openAppearance('config');
  $('editUseCustom').onchange = () => $('customServerFields').classList.toggle('hidden', !$('editUseCustom').checked);
  $('controlChatSend').onclick = () => sendChat(state.configId, 'controlChatInput');
  $('controlChatInput').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('controlChatSend').click(); } };
  $('saveAppearanceEditor').onclick = saveAppearanceEditor;
  $('defaultSkinSelect').onchange = e => { state.appearanceDraft={...state.appearanceDraft, defaultSkin:e.target.value, skinUrl:'', skinDataUrl:'', editorMode:'default'}; populateAppearance(); };
  $('skinUrl').oninput = e => { state.appearanceDraft={...state.appearanceDraft, skinUrl:e.target.value.trim(), skinDataUrl:'', editorMode:'url'}; renderModel($('appearanceStage'), state.appearanceDraft); };
  $('capeUrl').oninput = e => { const url=e.target.value.trim(); state.appearanceDraft={...state.appearanceDraft, cape:url?'custom':state.appearanceDraft.cape, capeUrl:url, capeEnabled:Boolean(url)||state.appearanceDraft.capeEnabled}; updateCapeTexturePreview(state.appearanceDraft); renderModel($('appearanceStage'), state.appearanceDraft); };
  $('capeSelect').onchange = e => { const key=e.target.value; state.appearanceDraft={...state.appearanceDraft, cape:key, capeUrl:key==='custom'?state.appearanceDraft.capeUrl:'', capeEnabled:key!=='none'}; populateAppearance(); };
  $('capeEnabled').onchange = e => { state.appearanceDraft={...state.appearanceDraft, capeEnabled:e.target.checked}; renderModel($('appearanceStage'), state.appearanceDraft); };
  $('uploadSkinButton').onclick = () => $('skinFile').click();
  $('skinFile').onchange = e => { const file=e.target.files?.[0]; if(!file) return; const reader=new FileReader(); reader.onload=()=>{state.appearanceDraft={...state.appearanceDraft,skinDataUrl:String(reader.result),skinUrl:'',editorMode:'upload'};populateAppearance();}; reader.readAsDataURL(file); };
  $('toggleAppearanceRotate').onclick = toggleAppearanceAutoRotate;
  $('resetAppearance').onclick = () => { state.appearanceRotation=0; state.appearanceTilt=7; populateAppearance(); };
  $('randomizeAppearance').onclick = () => { state.appearanceDraft={...appearanceBase(),defaultSkin:Math.random()<.5?'steve':'alex'}; populateAppearance(); };
  const stage = $('appearanceStage');
  stage.addEventListener('pointerdown', e => { if(!e.target.closest('.skin-model')) return; stopAppearanceAutoRotate(); state.appearanceDrag={x:e.clientX,y:e.clientY,r:state.appearanceRotation,t:state.appearanceTilt}; stage.setPointerCapture(e.pointerId); });
  stage.addEventListener('pointermove', e => { if(!state.appearanceDrag) return; state.appearanceRotation=state.appearanceDrag.r+(e.clientX-state.appearanceDrag.x)*0.65; state.appearanceTilt=Math.max(-70,Math.min(70,state.appearanceDrag.t-(e.clientY-state.appearanceDrag.y)*0.45)); renderModel(stage,state.appearanceDraft); updateAppearanceFacing(); });
  ['pointerup','pointercancel','pointerleave'].forEach(type => stage.addEventListener(type, () => state.appearanceDrag=null));

  $('applyQuickServer').onclick = applyQuickServer;
  $('testQuickServer').onclick = () => { const raw=$('quickServer').value.trim(); if(!raw) return toast('Enter a server target first.','warn'); $('setHost').value=raw; showView('settings'); testServer(); };
  $('saveSettings').onclick = saveServerSettings;
  $('resetSettings').onclick = resetSettings;
  $('testConnection').onclick = testServer;
  $('setHost').addEventListener('input', () => { const raw=$('setHost').value.trim(); $('quickServer').value=raw; const match=raw.match(/^\[[^\]]+\]:(\d+)$/)||raw.match(/^(.+):(\d+)$/); if(match) $('setPort').value=Number(match[1]); });
  document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => applyPreset(button.dataset.preset)));
  $('clearQueue').onclick = clearQueue;
  $('stopAllTop').onclick = stopAll;
  $('joinAll').onclick = () => state.accounts.length ? connectMany(state.accounts.map(a=>a.id)) : toast('No saved accounts.', 'warn');
  $('joinAllBottom').onclick = () => state.accounts.length ? connectMany(state.accounts.map(a=>a.id)) : toast('No saved accounts.', 'warn');
  $('leaveAllBottom').onclick = () => state.accounts.length ? leaveMany(state.accounts.map(a=>a.id)) : toast('No saved accounts.', 'warn');
  $('stopAllBottom').onclick = stopAll;

  $('selectVisible').onclick = () => { const ids=filtered(state.accounts,$('dashboardSearch').value,$('dashboardFilter').value).map(a=>a.id); ids.forEach(id=>state.selected.add(id)); renderState(true); };
  $('clearSelection').onclick = () => { state.selected.clear(); renderState(true); };
  $('selectAllAccounts').onclick = () => { state.accounts.forEach(a=>state.selected.add(a.id)); renderState(true); };
  $('invertSelection').onclick = () => { state.accounts.forEach(a=>state.selected.has(a.id)?state.selected.delete(a.id):state.selected.add(a.id)); renderState(true); };
  $('accountsSelectAll').onclick = () => { const ids=filtered(state.accounts,$('accountsSearch').value,$('accountsFilter').value).map(a=>a.id); ids.forEach(id=>state.selected.add(id)); renderState(true); };
  $('accountsSelectAllGlobal').onclick = () => { state.accounts.forEach(a=>state.selected.add(a.id)); renderState(true); };
  $('accountsInvert').onclick = () => { state.accounts.forEach(a=>state.selected.has(a.id)?state.selected.delete(a.id):state.selected.add(a.id)); renderState(true); };
  ['dashboardSearch','dashboardFilter','accountsSearch','accountsFilter'].forEach(id => { const el=$(id); el.addEventListener('input',()=>renderAccountLists(true)); el.addEventListener('change',()=>renderAccountLists(true)); });
  $('joinSelected').onclick = () => state.selected.size ? connectMany([...state.selected]) : toast('Select at least one account.','warn');
  $('leaveSelected').onclick = () => state.selected.size ? leaveMany([...state.selected]) : toast('Select at least one account.','warn');
  $('chatSelected').onclick = () => state.selected.size ? (state.messageTargetMode='selected', openModal('messageModal'), updateMessageModalTarget()) : toast('Select at least one account.','warn');
  $('automationSelected').onclick = () => { showView('logs'); renderAutomation(); };
  $('sendMultiMessage').onclick = sendMulti;
  $('messageTargetMode').onchange = e => { state.messageTargetMode = e.target.value; updateMessageModalTarget(); };
  $('automationStart').onclick = startAutomation;
  $('automationStop').onclick = stopAutomation;
  $('automationInterval').oninput = renderAutomation;
  $('logsChatAccount').onchange = e => { state.logChatAccount=e.target.value; renderLogsChat(); if(state.logChatAccount!=='__selected__' && state.logChatAccount!=='__all__') loadAccountDetails(state.logChatAccount); };
  $('logsChatSend').onclick = sendLogsChat;
  $('logsChatInput').onkeydown = e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('logsChatSend').click();} };
  $('logFilter').onchange = e => { state.logFilter=e.target.value; state.logHash=''; renderLogs(); };

  document.addEventListener('click', e => {
    const close = e.target.closest('[data-close]'); if (close) { closeModal(close.dataset.close); return; }
    const cfg = e.target.closest('[data-open-config]'); if (cfg) { e.stopPropagation(); openConfig(cfg.dataset.openConfig); return; }
    const forceLeave = e.target.closest('[data-force-leave]'); if (forceLeave) { e.stopPropagation(); leaveMany([forceLeave.dataset.connect]); return; }
    const conn = e.target.closest('[data-connect]'); if (conn) { e.stopPropagation(); connect(conn.dataset.connect); return; }
    const select = e.target.closest('[data-select]'); if (select) { e.stopPropagation(); const id=select.dataset.select; state.selected.has(id)?state.selected.delete(id):state.selected.add(id); renderState(true); return; }
    const inspector = e.target.closest('[data-open-inspector]'); if (inspector && !e.target.closest('button,input,label')) { state.inspectorId=inspector.dataset.openInspector; state.inspectorHash=''; renderInspector(true); loadAccountDetails(state.inspectorId); return; }
    const move = e.target.closest('[data-inspector-move]'); if (move) { e.stopPropagation(); moveFor(move.dataset.inspectorMove, move.dataset.move); return; }
    const control = e.target.closest('[data-inspector-control]'); if (control) { e.stopPropagation(); toggleControl(control.dataset.inspectorControl, control.dataset.control); return; }
    const stop = e.target.closest('[data-stop]'); if (stop) { e.stopPropagation(); stopFor(stop.dataset.stop); return; }
    const look = e.target.closest('[data-look]'); if (look) { e.stopPropagation(); applyLookFor(look.dataset.look,'inspectYaw','inspectPitch'); return; }
    const inspectChat = e.target.closest('[data-inspect-chat]'); if (inspectChat) { e.stopPropagation(); sendChat(inspectChat.dataset.inspectChat,'inspectChatInput'); return; }
    const follow = e.target.closest('[data-follow-player]'); if (follow) { e.stopPropagation(); followPlayer(state.configId, follow.dataset.followPlayer); return; }
    const configMove = e.target.closest('#configModal [data-move]'); if (configMove) { moveFor(state.configId, configMove.dataset.move); return; }
    const configControl = e.target.closest('#configModal [data-control]'); if (configControl) { toggleControl(state.configId, configControl.dataset.control); return; }
    if (e.target.closest('#controlStop')) { stopFor(state.configId); return; }
  });
  $('applyLook').onclick = () => applyLookFor(state.configId,'lookYaw','lookPitch');
  $('followStart').onclick = () => { const id=state.configId; const target=$('followTarget')?.value.trim(); if(id && target) followPlayer(id,target); else toast('Enter a player name first.','warn'); };
  $('followStop').onclick = () => state.configId && stopFollow(state.configId);
  document.querySelectorAll('[data-config-tab]').forEach(button => button.addEventListener('click', () => { state.configTab=button.dataset.configTab; renderConfig(true); }));
  $('confirmAction').onclick = async () => { if(state.confirmAction) await state.confirmAction(); };

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const active = document.activeElement;
    if (['INPUT','TEXTAREA','SELECT'].includes(active?.tagName)) return;
    const modals = ['confirmModal','messageModal','appearanceModal','configModal','accountModal'];
    const open = modals.find(id => !$(`${id}`).classList.contains('hidden'));
    if (open) closeModal(open);
  });

}

function mergeEventState(data) {
  if (data.accounts) {
    state.accounts = data.accounts.map(a => {
      const cached = state.detailCache.get(a.id);
      if (!cached) return a;
      return { ...a, runtime: { ...cached, ...a.runtime } };
    });
    state.selected = new Set([...state.selected].filter(id => state.accounts.some(a => a.id === id)));
    if (state.inspectorId && !state.accounts.some(a => a.id === state.inspectorId)) state.inspectorId = null;
  }
  if (data.settings) state.settings = data.settings;
  if (data.queue) state.queue = data.queue;
  if (data.logTail) state.logs = data.logTail;
  if (data.chatAutomation) state.chatAutomation = data.chatAutomation;
  if (data.public) state.publicConfig = { ...state.publicConfig, ...data.public };
  renderPublicLinks();
  renderState(false);
}

function connectEvents() {
  const source = new EventSource('/events');
  source.onmessage = event => { try { const data=JSON.parse(event.data); if(data.type==='state') mergeEventState(data); if(data.type==='log'){state.logs.push(data.log); if(state.logs.length>(state.settings.logLimit||300))state.logs.shift(); state.logHash=''; renderStats(); if(state.view==='logs')renderLogs();} } catch {} };
  source.onerror = () => {};
}

document.addEventListener('click', event => {
  const card = event.target.closest?.('.workspace-card[data-system]');
  if (!card) return;
  event.preventDefault();
  event.stopPropagation();
  enterWorkspace(card.dataset.system);
}, true);

(async function init() {
  bindEvents();
  document.body.classList.add('landing-open');
  document.body.classList.remove('launcher-closing');
  const launcher = $('systemLauncher');
  launcher?.setAttribute('aria-hidden', 'false');
  $('capeSelect').innerHTML = capes.map(([key,label]) => `<option value="${key}">${esc(label)}</option>`).join('');
  try {
    const initial = await api('/api/state');
    mergeEventState(initial);
    syncSettings(true);
  } catch (e) { toast(e.message, 'error'); }
  connectEvents();
  // Stay on the launcher until the user explicitly chooses a workspace.
  document.querySelectorAll('.view').forEach(el => { el.hidden = true; el.classList.remove('active-view'); el.setAttribute('aria-hidden','true'); });
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  renderState(true);
  updateMessageModalTarget();
})();
