const fs = require('fs');
const path = require('path');
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const mineflayer = require('mineflayer');

const ROOT = __dirname;
const DATA_DIR = process.env.MCAL_DATA_DIR ? path.resolve(process.env.MCAL_DATA_DIR) : path.join(ROOT, 'data');
const ACCOUNTS_PATH = path.join(DATA_DIR, 'accounts.json');
const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');
const PUBLIC_DIR = path.join(ROOT, 'public');
const SKIN_DIR = path.join(DATA_DIR, 'skins');
const DEFAULT_PORT = 3030;

const DEFAULT_SETTINGS = {
  host: '',
  port: 25565,
  version: '',
  joinDelayMs: 1000,
  joinJitterMs: 0,
  maxConcurrentJoins: 1,
  joinTimeoutMs: 20000,
  leaveDelayMs: 0,
  autoReconnect: false,
  keepOnline: true,
  reconnectAfterKick: true,
  autoRespawn: true,
  reconnectDelayMs: 1000,
  reconnectBackoff: false,
  maxReconnectAttempts: 0,
  maxAccounts: 0,
  movementTapMs: 180,
  multiChatDelayMs: 0,
  chatSigningCompatibility: true,
  liveUpdateMs: 500,
  playerLimit: 200,
  logLimit: 500,
  stateBroadcastMs: 100,
  chatQueueLimit: 0,
  joinOrder: 'saved-top-down',
  chatOrder: 'saved-top-down',
  leaveOrder: 'saved-top-down',
  siteName: 'NEXUS Control',
  discordServerUrl: 'https://discord.gg/THwcY93fPb',
  discordBotClientId: '',
  discordBotInviteUrl: '',
  discordDocsUrl: '/discord-docs.html'
};

const DEFAULT_APPEARANCE = {
  defaultSkin: 'steve',
  skinUrl: '',
  skinDataUrl: '',
  cape: 'none',
  capeUrl: '',
  capeEnabled: false,
  hair: 'black',
  eyes: 'blue',
  shirt: 'navy',
  pants: 'black',
  editorMode: 'default'
};

const logs = [];
const subscribers = new Set();
const runtimes = new Map();
const moveTimers = new Map();
const followTimers = new Map();
const joinQueue = [];
let joinPumpTimer = null;
let activeJoinAttempts = 0;
let lastJoinStartedAt = 0;
let joinSequence = 0;
let broadcastTimer = null;
let runtimeTickTimer = null;
let heartbeatTimer = null;
let shuttingDown = false;
let broadcastQueued = false;
let chatAutomation = { running: false, ids: [], messages: [], intervalMs: 30000, timer: null, index: 0 };

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8'); }
function now() { return new Date().toISOString(); }
function makeId() { return crypto.randomUUID(); }
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function nonNegativeNumber(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, n) : fallback; }
function nonNegativeInteger(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback; }

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SKIN_DIR)) fs.mkdirSync(SKIN_DIR, { recursive: true });
let accountsStore = readJson(ACCOUNTS_PATH, { accounts: [] });
let settings = { ...DEFAULT_SETTINGS, ...readJson(SETTINGS_PATH, {}) };
if (!Array.isArray(accountsStore.accounts)) accountsStore.accounts = [];

function parseServerAddress(input, fallbackPort = 25565) {
  let raw = String(input ?? '').trim();
  if (!raw) throw new Error('Enter a server address first.');
  raw = raw.replace(/^[a-z]+:\/\//i, '').split('/')[0];
  let host = raw;
  let port = Number(fallbackPort) || 25565;
  if (raw.startsWith('[')) {
    const match = raw.match(/^\[([^\]]+)\](?::(\d+))?$/);
    if (!match) throw new Error('Invalid server address.');
    host = match[1];
    if (match[2]) port = Number(match[2]);
  } else if ((raw.match(/:/g) || []).length === 1) {
    const match = raw.match(/^(.+):(\d+)$/);
    if (match) { host = match[1]; port = Number(match[2]); }
  }
  host = host.trim();
  if (!host) throw new Error('Enter a server address first.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be between 1 and 65535.');
  return { host, port };
}

function sanitizeUsername(input) {
  const value = String(input ?? '').trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(value)) throw new Error('Username must be 3-16 characters using letters, numbers or underscores.');
  return value;
}

function persistAppearance(accountId, value) {
  const appearance = { ...DEFAULT_APPEARANCE, ...(value || {}) };
  const data = String(appearance.skinDataUrl || '');
  if (data.startsWith('data:image/png;base64,')) {
    try {
      const fileName = `${accountId}.png`;
      fs.writeFileSync(path.join(SKIN_DIR, fileName), Buffer.from(data.slice('data:image/png;base64,'.length), 'base64'));
      appearance.skinUrl = `/api/skins/${encodeURIComponent(accountId)}.png`;
      appearance.skinDataUrl = '';
      appearance.editorMode = 'stored-upload';
    } catch {}
  }
  return appearance;
}

function normalizeAppearance(value) {
  return { ...DEFAULT_APPEARANCE, ...(value || {}) };
}

function normalizeAccount(account) {
  account.id ||= makeId();
  account.username = sanitizeUsername(account.username);
  account.label = String(account.label || account.username).trim().slice(0, 32) || account.username;
  account.serverMode = account.serverMode === 'custom' ? 'custom' : 'global';
  account.hostOverride = String(account.hostOverride || '').trim();
  account.portOverride = clamp(Number(account.portOverride) || 25565, 1, 65535);
  account.versionOverride = String(account.versionOverride || '').trim();
  account.autoReconnect = Boolean(account.autoReconnect);
  account.startOnLaunch = Boolean(account.startOnLaunch);
  account.reconnectDelayMs = nonNegativeNumber(account.reconnectDelayMs, settings.reconnectDelayMs);
  account.joinDelayMsOverride = account.joinDelayMsOverride == null || account.joinDelayMsOverride === '' ? null : nonNegativeNumber(account.joinDelayMsOverride, settings.joinDelayMs);
  account.appearance = persistAppearance(account.id, account.appearance);
  return account;
}

for (const account of accountsStore.accounts) normalizeAccount(account);
if (String(settings.host || '').trim()) {
  try {
    const parsed = parseServerAddress(settings.host, settings.port || 25565);
    settings.host = parsed.host;
    settings.port = parsed.port;
  } catch {}
}
{ const n = Number(settings.joinDelayMs); settings.joinDelayMs = Number.isFinite(n) ? Math.max(0, n) : 1000; }
{ const n = Number(settings.joinJitterMs); settings.joinJitterMs = Number.isFinite(n) ? Math.max(0, n) : 0; }
{ const n = Number(settings.maxConcurrentJoins); settings.maxConcurrentJoins = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 1; }
{ const n = Number(settings.joinTimeoutMs); settings.joinTimeoutMs = Number.isFinite(n) ? Math.max(0, n) : 20000; }
{ const n = Number(settings.leaveDelayMs); settings.leaveDelayMs = Number.isFinite(n) ? Math.max(0, n) : 0; }
{ const n = Number(settings.reconnectDelayMs); settings.reconnectDelayMs = Number.isFinite(n) ? Math.max(0, n) : 1000; }
settings.keepOnline = settings.keepOnline !== false;
settings.reconnectAfterKick = settings.reconnectAfterKick !== false;
settings.autoRespawn = settings.autoRespawn !== false;
settings.maxReconnectAttempts = nonNegativeInteger(settings.maxReconnectAttempts, 0);
settings.maxAccounts = nonNegativeInteger(settings.maxAccounts, 0);
settings.movementTapMs = nonNegativeNumber(settings.movementTapMs, 180);
{ const n = Number(settings.multiChatDelayMs); settings.multiChatDelayMs = Number.isFinite(n) ? Math.max(0, n) : 0; }
settings.chatSigningCompatibility = settings.chatSigningCompatibility !== false;
{ const n = Number(settings.liveUpdateMs); settings.liveUpdateMs = Number.isFinite(n) ? Math.max(0, n) : 500; }
settings.playerLimit = nonNegativeInteger(settings.playerLimit, 200);
settings.logLimit = nonNegativeInteger(settings.logLimit, 500);
settings.stateBroadcastMs = nonNegativeNumber(settings.stateBroadcastMs, 100);
settings.chatQueueLimit = nonNegativeInteger(settings.chatQueueLimit, 0);
settings.joinOrder = ['saved-top-down','selected-order','reverse'].includes(settings.joinOrder) ? settings.joinOrder : 'saved-top-down';
settings.chatOrder = ['saved-top-down','selected-order','reverse'].includes(settings.chatOrder) ? settings.chatOrder : 'saved-top-down';
settings.leaveOrder = ['saved-top-down','selected-order','reverse'].includes(settings.leaveOrder) ? settings.leaveOrder : 'saved-top-down';
writeJson(ACCOUNTS_PATH, accountsStore);
writeJson(SETTINGS_PATH, settings);

function saveAll() {
  writeJson(ACCOUNTS_PATH, accountsStore);
  writeJson(SETTINGS_PATH, settings);
}
function getAccount(accountId) { return accountsStore.accounts.find(a => a.id === accountId) || null; }
function orderedAccountIds(ids, mode = 'saved-top-down') {
  const raw = Array.isArray(ids) ? ids.filter(Boolean) : [];
  const wanted = new Set(raw);
  const saved = accountsStore.accounts.filter(account => wanted.has(account.id)).map(account => account.id);
  if (mode === 'selected-order') return raw.filter(id => wanted.has(id) && accountsStore.accounts.some(account => account.id === id));
  if (mode === 'reverse') return saved.reverse();
  return saved;
}

function runtimeFor(accountId) {
  if (!runtimes.has(accountId)) runtimes.set(accountId, {
    bot: null,
    botGeneration: 0,
    status: 'offline',
    error: '',
    connectedAt: null,
    position: null,
    yaw: 0,
    pitch: 0,
    health: null,
    food: null,
    world: null,
    players: [],
    chat: [],
    events: [],
    commandHistory: [],
    target: null,
    manualStop: false,
    pendingJoin: false,
    joinSlotHeld: false,
    reconnectTimer: null,
    reconnectAttempts: 0,
    reconnectGeneration: 0,
    joinTimeoutTimer: null,
    readinessTimer: null,
    sprint: false,
    sneak: false,
    desiredOnline: false,
    keepAlive: false,
    inServer: false,
    chatReady: false,
    respawnTimer: null,
    lastEventAt: null,
    lastEvent: '',
    lastDisconnectReason: '',
    lastKickReason: '',
    ping: null,
    messagesSent: 0,
    commandsSent: 0,
    outboundQueue: [],
    outboundBusy: false,
    lastMessageStatus: '',
    lastMessageText: '',
    lastMessageAt: null,
    lastMessageError: '',
    outboundTimer: null,
    lastAction: '',
    lastActionAt: null,
    follow: { active: false, targetName: '', stopDistance: 2.5, maxDistance: 32, lastSeenAt: null, lastMessage: '' }
  });
  return runtimes.get(accountId);
}

function log(level, message, accountId = null) {
  const entry = { id: makeId(), time: now(), level, message: String(message), accountId };
  logs.push(entry);
  if (settings.logLimit > 0) while (logs.length > settings.logLimit) logs.shift();
  queueBroadcast(40);
  process.stdout.write(`[${new Date().toLocaleTimeString()}] ${message}\n`);
}

function targetFor(account) {
  if (account.serverMode === 'custom' && account.hostOverride) return parseServerAddress(account.hostOverride, account.portOverride || 25565);
  return parseServerAddress(settings.host, settings.port);
}

function refreshRuntime(bot, rt, refreshPlayers = false) {
  if (!bot?.entity) return false;
  const position = {
    x: Number(bot.entity.position.x.toFixed(2)),
    y: Number(bot.entity.position.y.toFixed(2)),
    z: Number(bot.entity.position.z.toFixed(2))
  };
  const yaw = Number(bot.entity.yaw || 0);
  const pitch = Number(bot.entity.pitch || 0);
  const health = bot.health ?? null;
  const food = bot.food ?? null;
  const ping = Number.isFinite(Number(bot.player?.ping)) ? Number(bot.player.ping) : null;
  const world = bot.game?.dimension || bot.game?.levelType || null;
  const scalarChanged = !rt.position || rt.position.x !== position.x || rt.position.y !== position.y || rt.position.z !== position.z || rt.yaw !== yaw || rt.pitch !== pitch || rt.health !== health || rt.food !== food || rt.world !== world;
  let playersChanged = false;
  if (refreshPlayers) {
    const playerNames = Object.values(bot.players || {}).map(p => p?.username).filter(Boolean).sort((a, b) => a.localeCompare(b));
    const players = settings.playerLimit > 0 ? playerNames.slice(0, settings.playerLimit) : playerNames;
    playersChanged = JSON.stringify(rt.players) !== JSON.stringify(players);
    rt.players = players;
  }
  rt.position = position; rt.yaw = yaw; rt.pitch = pitch; rt.health = health; rt.food = food; rt.world = world; rt.ping = ping;
  return scalarChanged || playersChanged;
}

function clearMovement(accountId) {
  const timer = moveTimers.get(accountId);
  if (timer) clearTimeout(timer);
  moveTimers.delete(accountId);
  const rt = runtimes.get(accountId);
  if (!rt?.bot) return;
  for (const key of ['forward', 'back', 'left', 'right', 'jump']) {
    try { rt.bot.setControlState(key, false); } catch {}
  }
}

function releaseJoinSlot(accountId) {
  const rt = runtimes.get(accountId);
  if (!rt?.joinSlotHeld) return;
  rt.joinSlotHeld = false;
  activeJoinAttempts = Math.max(0, activeJoinAttempts - 1);
  processJoinQueue();
}

function scheduleReconnect(account, force = false) {
  const rt = runtimeFor(account.id);
  const wantsReconnect = force || rt.keepAlive || account.autoReconnect || settings.autoReconnect || settings.keepOnline;
  if (rt.manualStop || !wantsReconnect || !rt.desiredOnline) return false;
  if (rt.reconnectTimer) return false;
  if (settings.maxReconnectAttempts > 0 && rt.reconnectAttempts >= settings.maxReconnectAttempts) {
    log('warn', `${account.username}: maximum reconnect attempts reached.`, account.id);
    return false;
  }
  if (rt.reconnectAttempts >= 1) {
    log('warn', `${account.username}: one reconnect attempt has already been used for this disconnect.`, account.id);
    return false;
  }

  rt.reconnectAttempts = 1;
  const base = nonNegativeNumber(account.reconnectDelayMs, settings.reconnectDelayMs || 1000);
  const delay = Math.round(base);
  rt.reconnectGeneration += 1;
  const reconnectGeneration = rt.reconnectGeneration;
  rt.status = 'reconnecting';
  rt.reconnectTimer = setTimeout(() => {
    rt.reconnectTimer = null;
    if (rt.manualStop || !rt.desiredOnline || rt.reconnectGeneration !== reconnectGeneration) return;
    enqueueConnect([account.id], 'reconnect');
  }, delay);
  rememberEvent(account.id, 'reconnecting', 'One automatic reconnect scheduled', `${delay}ms`);
  log('info', `${account.username}: one reconnect scheduled in ${delay}ms.`, account.id);
  queueBroadcast();
  return true;
}
function formatDisconnectReason(reason) {
  if (reason == null || reason === '') return '';
  if (typeof reason === 'string') return reason;
  try { return JSON.stringify(reason); } catch { return String(reason); }
}

function isBotCurrent(rt, bot, generation) {
  return rt.bot === bot && rt.botGeneration === generation;
}

function markInServer(account, rt, bot, generation, source = 'spawn') {
  if (!isBotCurrent(rt, bot, generation)) return false;
  if (rt.manualStop || rt.inServer) return false;
  const clientState = bot?._client?.state;
  const hasEntity = Boolean(bot?.entity?.position);
  if (clientState !== 'play' || !hasEntity) return false;
  if (rt.joinTimeoutTimer) clearTimeout(rt.joinTimeoutTimer);
  rt.joinTimeoutTimer = null;
  if (rt.readinessTimer) clearInterval(rt.readinessTimer);
  rt.readinessTimer = null;
  rt.status = 'online';
  rt.inServer = true;
  rt.chatReady = true;
  rt.connectedAt ||= now();
  rt.error = '';
  rt.reconnectAttempts = 0;
  releaseJoinSlot(account.id);
  refreshRuntime(bot, rt, true);
  rememberEvent(account.id, 'in-server', 'Bot is in the server', source);
  log('success', `${account.username} is now in the server (${source}).`, account.id);
  queueBroadcast();
  pumpOutbound(account.id);
  return true;
}

function markSocketOffline(account, rt, bot, generation, status = 'offline', error = '') {
  if (!isBotCurrent(rt, bot, generation)) return false;
  if (rt.joinTimeoutTimer) clearTimeout(rt.joinTimeoutTimer);
  rt.joinTimeoutTimer = null;
  if (rt.readinessTimer) clearInterval(rt.readinessTimer);
  rt.readinessTimer = null;
  clearMovement(account.id);
  rt.bot = null;
  rt.chatReady = false;
  rt.connectedAt = null;
  rt.status = status;
  rt.error = error;
  rt.sprint = false;
  rt.sneak = false;
  releaseJoinSlot(account.id);
  return true;
}

function connectAccountNow(accountId, reason = 'manual') {
  const account = getAccount(accountId);
  if (!account) return;
  const rt = runtimeFor(accountId);
  const reconnectRequest = String(reason).startsWith('reconnect');
  if (rt.bot || rt.status === 'joining' || rt.status === 'online') return;
  if (!reconnectRequest && (rt.status === 'reconnecting' || rt.reconnectTimer)) return;
  const target = targetFor(account);
  rt.manualStop = false;
  if (!reconnectRequest) { rt.reconnectAttempts = 0; rt.reconnectGeneration += 1; }
  rt.desiredOnline = true;
  rt.keepAlive = Boolean(settings.keepOnline || account.autoReconnect);
  rt.inServer = false;
  rt.chatReady = false;
  rt.status = 'joining';
  rt.lastAction = 'Joining'; rt.lastActionAt = now();
  rt.error = '';
  rt.lastDisconnectReason = '';
  rt.lastKickReason = '';
  rt.target = target;
  rt.inServer = false;
  rt.joinSlotHeld = true;
  activeJoinAttempts += 1;
  const generation = ++rt.botGeneration;
  queueBroadcast();
  const connectionLabel = `${target.host}:${target.port}`;
  log('info', `Connecting ${account.username} → ${connectionLabel}${reason === 'manual' ? '' : ` (${reason})`}`, account.id);
  rememberEvent(account.id, 'connection', 'Connection attempt started', connectionLabel);

  const options = {
    host: target.host,
    port: target.port,
    username: account.username,
    auth: 'offline',
    chat: 'enabled',
    colorsEnabled: true,
    hideErrors: false,
    checkTimeoutInterval: 30000,
    disableChatSigning: Boolean(settings.chatSigningCompatibility)
  };
  const version = account.versionOverride || settings.version;
  if (version) options.version = version;

  let bot;
  try { bot = mineflayer.createBot(options); }
  catch (error) {
    if (rt.botGeneration === generation) {
      releaseJoinSlot(account.id);
      rt.status = 'error'; rt.error = error.message || String(error); rt.bot = null; rt.inServer = false; rt.lastDisconnectReason = rt.error;
      log('error', `${account.username}: ${rt.error}`, account.id);
      rememberEvent(account.id, 'error', 'Connection setup failed', rt.error);
      queueBroadcast();
      scheduleReconnect(account);
    }
    return;
  }
  rt.bot = bot;

  rt.readinessTimer = setInterval(() => {
    if (!isBotCurrent(rt, bot, generation)) return;
    if (!['joining', 'online'].includes(rt.status)) return;
    if (bot._client?.state === 'play' && bot.entity?.position) {
      markInServer(account, rt, bot, generation, 'play-state');
    }
  }, 200);

  if (settings.joinTimeoutMs > 0) rt.joinTimeoutTimer = setTimeout(() => {
    if (!isBotCurrent(rt, bot, generation) || rt.status !== 'joining') return;
    rt.error = 'Connection attempt timed out.';
    rememberEvent(account.id, 'timeout', 'Connection attempt timed out', `${settings.joinTimeoutMs}ms`);
    log('warn', `${account.username}: connection timed out after ${settings.joinTimeoutMs}ms.`, account.id);
    try { bot.quit('Connection timeout'); } catch { try { bot.end(); } catch {} }
  }, settings.joinTimeoutMs);

  bot._client?.on?.('state', () => {
    if (!isBotCurrent(rt, bot, generation)) return;
    if (botSessionReady(rt)) {
      markInServer(account, rt, bot, generation, 'client-state');
      pumpOutbound(account.id);
    }
  });

  bot.once('login', () => {
    if (!isBotCurrent(rt, bot, generation)) return;
    try { bot.setSettings({ chat: 'enabled', colorsEnabled: true }); } catch {}
    log('info', `${account.username} authenticated and received the server login packet.`, account.id);
    rememberEvent(account.id, 'login', 'Server login accepted', connectionLabel);
    queueBroadcast();
    setTimeout(() => { markInServer(account, rt, bot, generation, 'login-ready-check'); }, 0);
  });

  bot.once('spawn', () => {
    if (!isBotCurrent(rt, bot, generation)) return;
    rt.chatReady = true;
    markInServer(account, rt, bot, generation, 'spawn');
    rememberEvent(account.id, 'spawn', 'Bot spawned in the world', connectionLabel);
    log('success', `${account.username} joined ${target.host}:${target.port}.`, account.id);
    queueBroadcast();
  });

  bot.on('game', () => {
    if (!isBotCurrent(rt, bot, generation)) return;
    markInServer(account, rt, bot, generation, 'game-state');
  });

  bot.on('health', () => { if (isBotCurrent(rt, bot, generation)) { markInServer(account, rt, bot, generation, 'health'); refreshRuntime(bot, rt); queueBroadcast(20); } });
  bot.on('move', () => {
    if (!isBotCurrent(rt, bot, generation)) return;
    const changed = refreshRuntime(bot, rt);
    if (changed && settings.liveUpdateMs === 0) queueBroadcast();
  });
  bot.on('playerJoined', () => { if (isBotCurrent(rt, bot, generation)) { refreshRuntime(bot, rt, true); queueBroadcast(30); } });
  bot.on('playerLeft', () => { if (isBotCurrent(rt, bot, generation)) { refreshRuntime(bot, rt, true); queueBroadcast(30); } });

  bot.on('chat', (username, message) => {
    if (!isBotCurrent(rt, bot, generation)) return;
    rememberChat(account.id, 'incoming', username, message);
    rememberEvent(account.id, 'chat', `Chat from ${username}`, message);
    log('chat', `${account.username} ← ${username}: ${message}`, account.id);
  });
  bot.on('whisper', (username, message) => {
    if (!isBotCurrent(rt, bot, generation)) return;
    rememberChat(account.id, 'incoming', username, `[Whisper] ${message}`);
    rememberEvent(account.id, 'whisper', `Whisper from ${username}`, message);
    log('chat', `${account.username} ← ${username}: [Whisper] ${message}`, account.id);
  });
  bot.on('messagestr', message => {
    if (!isBotCurrent(rt, bot, generation)) return;
    if (message) {
      rememberChat(account.id, 'server', 'Server', message);
      rememberEvent(account.id, 'server', 'Server message', message);
      queueBroadcast(30);
    }
  });
  bot.on('actionBar', jsonMsg => {
    if (!isBotCurrent(rt, bot, generation)) return;
    const text = formatDisconnectReason(jsonMsg) || '';
    if (text) rememberEvent(account.id, 'actionbar', 'Action bar', text);
    queueBroadcast(30);
  });

  bot.on('title', (title, type) => {
    if (!isBotCurrent(rt, bot, generation)) return;
    rememberEvent(account.id, 'title', `Server title (${type || 'title'})`, title);
    queueBroadcast(30);
  });

  bot.on('death', () => {
    if (!isBotCurrent(rt, bot, generation)) return;
    rememberEvent(account.id, 'death', settings.autoRespawn ? 'Bot died; automatic respawn enabled' : 'Bot died; automatic respawn disabled');
    log('info', `${account.username} died${settings.autoRespawn ? ' and automatic respawn is enabled' : ''}.`, account.id);
    if (settings.autoRespawn && !rt.manualStop) {
      if (rt.respawnTimer) clearTimeout(rt.respawnTimer);
      rt.respawnTimer = setTimeout(() => {
        rt.respawnTimer = null;
        if (!isBotCurrent(rt, bot, generation) || rt.manualStop || !rt.inServer) return;
        try { bot.respawn(); rememberEvent(account.id, 'respawn', 'Automatic respawn requested'); }
        catch (error) { rememberEvent(account.id, 'error', 'Automatic respawn failed', error?.message || String(error)); }
        queueBroadcast();
      }, 350);
    }
    queueBroadcast(30);
  });


  bot.on('kicked', (reason, loggedIn) => {
    if (!isBotCurrent(rt, bot, generation)) return;
    if (rt.joinTimeoutTimer) clearTimeout(rt.joinTimeoutTimer);
    rt.joinTimeoutTimer = null;
    const text = formatDisconnectReason(reason) || 'Unknown kick reason';
    rt.error = text;
    rt.lastKickReason = text;
    rt.lastDisconnectReason = text;
    rt.inServer = false;
    rt.chatReady = false;
    rememberEvent(account.id, 'kick', 'Kicked by server', text);
    rt.status = 'kicked';
    rt.connectedAt = null;
    clearMovement(account.id);
    releaseJoinSlot(account.id);
    log('warn', `${account.username} was kicked${loggedIn ? ' after login' : ' during login'}: ${text}`, account.id);
    queueBroadcast();
  });

  bot.on('error', error => {
    if (!isBotCurrent(rt, bot, generation)) return;
    rt.error = error?.message || String(error);
    rt.lastEvent = `Bot error: ${rt.error}`;
    rt.lastEventAt = now();
    rememberEvent(account.id, 'error', 'Bot error', rt.error);
    log('error', `${account.username}: ${rt.error}`, account.id);
    queueBroadcast();
  });

  bot.on('end', reason => {
    if (!isBotCurrent(rt, bot, generation)) return;
    const wasManual = rt.manualStop;
    const desiredOnline = rt.desiredOnline;
    const hadSpawn = Boolean(rt.connectedAt);
    const disconnectReason = formatDisconnectReason(reason) || 'socketClosed';
    const priorStatus = rt.status;
    const kicked = priorStatus === 'kicked';
    const status = 'offline';
    rt.lastDisconnectReason = disconnectReason;
    rt.inServer = false;
    rt.chatReady = false;
    markSocketOffline(account, rt, bot, generation, status, rt.error || disconnectReason);
    if (!wasManual && desiredOnline && !kicked) rt.error = rt.error || `Connection ended: ${disconnectReason}`;
    rememberEvent(account.id, wasManual ? 'disconnect' : 'connection-end', wasManual ? 'Disconnected from control panel' : kicked ? 'Kick connection closed' : 'Connection ended', disconnectReason);
    log('info', `${account.username} connection ended (${disconnectReason}).`, account.id);
    const allowKickReconnect = kicked && settings.reconnectAfterKick;
    const shouldReconnect = desiredOnline && !wasManual && (rt.keepAlive || account.autoReconnect || settings.autoReconnect || settings.keepOnline) && (!kicked || allowKickReconnect);
    const reconnectScheduled = shouldReconnect ? scheduleReconnect(account, true) : false;
    if (shouldReconnect && reconnectScheduled && hadSpawn) {
      log('warn', `${account.username}: unexpected disconnect. One reconnect will keep the requested session alive.`, account.id);
    }
    if (rt.outboundQueue.length && !reconnectScheduled) {
      rejectOutboundQueue(rt, new Error(`Message delivery stopped because the connection ended: ${disconnectReason}`));
    }
    queueBroadcast();
  });
}

function enqueueConnect(ids, reason = 'manual') {
  const unique = orderedAccountIds(ids, String(reason).startsWith('reconnect') ? 'saved-top-down' : settings.joinOrder);
  const start = Date.now();
  const queuedIds = new Set(joinQueue.map(item => item.accountId));
  let scheduledAt = start;
  for (const accountId of unique) {
    const account = getAccount(accountId);
    if (!account) continue;
    const rt = runtimeFor(accountId);
    const reconnectRequest = String(reason).startsWith('reconnect');
    if (queuedIds.has(accountId) || rt.bot || rt.status === 'joining' || rt.pendingJoin || (rt.desiredOnline && !reconnectRequest)) continue;
    rt.pendingJoin = true;
    const baseDelay = reconnectRequest
      ? nonNegativeNumber(account.reconnectDelayMs, settings.reconnectDelayMs || 1000)
      : nonNegativeNumber(account.joinDelayMsOverride == null ? settings.joinDelayMs : account.joinDelayMsOverride, settings.joinDelayMs);
    const jitter = reconnectRequest ? 0 : (settings.joinJitterMs > 0 ? Math.floor(Math.random() * (settings.joinJitterMs + 1)) : 0);
    joinQueue.push({ accountId, reason, notBefore: scheduledAt, sequence: ++joinSequence });
    queuedIds.add(accountId);
    scheduledAt += baseDelay + jitter;
  }
  joinQueue.sort((a, b) => (a.notBefore - b.notBefore) || (a.sequence - b.sequence));
  queueBroadcast();
  processJoinQueue();
}

function processJoinQueue() {
  if (joinPumpTimer) clearTimeout(joinPumpTimer);
  joinPumpTimer = null;
  const concurrencyLimit = settings.maxConcurrentJoins === 0 ? Number.POSITIVE_INFINITY : settings.maxConcurrentJoins;
  while (activeJoinAttempts < concurrencyLimit && joinQueue.length) {
    const item = joinQueue[0];
    const reconnectRequest = String(item.reason).startsWith('reconnect');
    const wait = Math.max(0, item.notBefore - Date.now());
    if (wait > 0) {
      joinPumpTimer = setTimeout(processJoinQueue, wait);
      return;
    }
    joinQueue.shift();
    const rt = runtimeFor(item.accountId);
    rt.pendingJoin = false;
    if (rt.bot || rt.status === 'joining' || rt.status === 'online' || (rt.desiredOnline && !reconnectRequest)) continue;
    lastJoinStartedAt = Date.now();
    try {
      if (rt.desiredOnline && !rt.bot) rt.desiredOnline = false;
      connectAccountNow(item.accountId, item.reason);
    } catch (error) {
      rt.status = 'offline';
      rt.error = error.message || String(error);
      rt.pendingJoin = false;
      log('error', `${getAccount(item.accountId)?.username || item.accountId}: ${rt.error}`, item.accountId);
    }
  }
  if (joinQueue.length && activeJoinAttempts < concurrencyLimit) {
    const wait = Math.max(0, joinQueue[0].notBefore - Date.now());
    joinPumpTimer = setTimeout(processJoinQueue, wait);
  }
  queueBroadcast(20);
}

function clearJoinQueue(ids = null) {
  const selectedIds = ids ? new Set(ids) : null;
  const kept = [];
  for (const item of joinQueue) {
    if (selectedIds && !selectedIds.has(item.accountId)) { kept.push(item); continue; }
    runtimeFor(item.accountId).pendingJoin = false;
  }
  joinQueue.length = 0;
  joinQueue.push(...kept);
  if (joinPumpTimer) clearTimeout(joinPumpTimer);
  joinPumpTimer = null;
  processJoinQueue();
}

function disconnectAccount(accountId) {
  const account = getAccount(accountId);
  if (!account) return;
  const rt = runtimeFor(accountId);
  rt.manualStop = true;
  rt.desiredOnline = false;
  rt.keepAlive = false;
  rt.pendingJoin = false;
  clearJoinQueue([accountId]);
  if (rt.reconnectTimer) { clearTimeout(rt.reconnectTimer); rt.reconnectTimer = null; }
  clearMovement(accountId);
  stopFollowing(accountId, 'Disconnected from control panel');
  if (rt.joinTimeoutTimer) { clearTimeout(rt.joinTimeoutTimer); rt.joinTimeoutTimer = null; }
  if (rt.outboundTimer) { clearTimeout(rt.outboundTimer); rt.outboundTimer = null; }
  rejectOutboundQueue(rt, new Error('Bot disconnected; queued message was cancelled.'));
  const bot = rt.bot;
  rt.botGeneration += 1;
  rt.bot = null;
  rt.status = 'offline'; rt.inServer = false; rt.desiredOnline = false; rt.lastAction = 'Leave'; rt.lastActionAt = now(); rt.error = ''; rt.connectedAt = null;
  if (bot) { try { bot.quit('Disconnected from control panel'); } catch { try { bot.end(); } catch {} } }
  releaseJoinSlot(accountId);
  rememberEvent(account.id, 'disconnect', 'Disconnected from control panel');
  log('info', `${account.username} disconnected.`, account.id);
  queueBroadcast();
}

function disconnectMany(ids) {
  const unique = orderedAccountIds(Array.isArray(ids) ? ids : accountsStore.accounts.map(a => a.id), settings.leaveOrder);
  return enqueueLeaveAction(async () => {
    for (const accountId of unique) {
      const rt = runtimeFor(accountId);
      if (rt.bot || rt.status === 'joining' || rt.status === 'reconnecting' || rt.inServer || rt.pendingJoin) {
        disconnectAccount(accountId);
        rememberEvent(accountId, 'leave', 'Leave action executed', 'Processed in Saved Accounts order.');
      } else {
        rt.pendingJoin = false;
        rt.inServer = false;
        rt.status = 'offline';
        rt.lastAction = 'Leave';
        rt.lastActionAt = now();
        rememberEvent(accountId, 'leave-skip', 'Leave skipped', 'Account was already offline.');
      }
      queueBroadcast(10);
      await waitMs(Math.max(0, Number(settings.leaveDelayMs) || 0));
    }
  });
}

function stopAll() {
  stopChatAutomation();
  clearJoinQueue();
  const accounts = [...accountsStore.accounts];
  for (const account of accounts) {
    const rt = runtimeFor(account.id);
    if (rt.reconnectTimer) { clearTimeout(rt.reconnectTimer); rt.reconnectTimer = null; }
    rt.pendingJoin = false;
    if (rt.outboundTimer) { clearTimeout(rt.outboundTimer); rt.outboundTimer = null; }
    rejectOutboundQueue(rt, new Error('All activity stopped.'));
    clearMovement(account.id);
    stopFollowing(account.id, 'Stopped by Stop All');
    if (rt.bot || rt.status === 'joining' || rt.status === 'reconnecting' || rt.inServer) {
      disconnectAccount(account.id);
    } else {
      rt.status = 'offline';
      rt.inServer = false;
      rt.desiredOnline = false;
    }
  }
  rememberGlobalLog('warn', 'Stop All executed. All queued and active bot sessions were stopped.');
  queueBroadcast();
}

function rememberGlobalLog(level, message) {
  const entry = { id: makeId(), time: now(), level: String(level || 'info'), accountId: null, message: String(message || '') };
  logs.push(entry);
  if (settings.logLimit > 0) while (logs.length > settings.logLimit) logs.shift();
}

function rememberChat(accountId, type, from, message) {
  const rt = runtimeFor(accountId);
  rt.chat.push({ id: makeId(), time: now(), type, from: String(from || 'Server'), message: String(message || '').slice(0, 512) });
  if (settings.chatQueueLimit > 0) { /* queue limit is independent; chat history uses logLimit */ }
  if (settings.logLimit > 0) while (rt.chat.length > Math.max(60, settings.logLimit)) rt.chat.shift();
  queueBroadcast(40);
}

function rememberCommand(accountId, command, status = 'submitted', detail = '') {
  const rt = runtimeFor(accountId);
  rt.commandHistory.push({ id: makeId(), time: now(), command: String(command || '').slice(0, 512), status: String(status || 'submitted'), detail: String(detail || '').slice(0, 800) });
  while (rt.commandHistory.length > 80) rt.commandHistory.shift();
}

function rememberEvent(accountId, type, message, detail = '') {
  const rt = runtimeFor(accountId);
  const cleanType = String(type || 'event');
  const cleanMessage = String(message || '').slice(0, 512);
  const cleanDetail = String(detail || '').slice(0, 1000);
  const time = now();
  rt.events.push({ id: makeId(), time, type: cleanType, message: cleanMessage, detail: cleanDetail });
  while (rt.events.length > 80) rt.events.shift();
  rt.lastEventAt = time;
  rt.lastEvent = cleanMessage;
}

function moveTimed(accountId, direction, seconds = settings.movementTapMs / 1000) {
  const rt = runtimeFor(accountId);
  if (!rt.bot || rt.status !== 'online') throw new Error('Bot is not online.');
  if (!['forward', 'back', 'left', 'right'].includes(direction)) throw new Error('Invalid movement direction.');
  clearMovement(accountId);
  const duration = clamp(Number(seconds) * 1000 || settings.movementTapMs, 80, 350);
  rt.lastAction = direction === 'jump' ? 'Jump' : `Move ${direction}`; rt.lastActionAt = now();
  rt.bot.setControlState(direction, true);
  moveTimers.set(accountId, setTimeout(() => {
    try { rt.bot?.setControlState(direction, false); } catch {}
    moveTimers.delete(accountId);
  }, duration));
}

function jumpTimed(accountId) {
  const rt = runtimeFor(accountId);
  if (!rt.bot || rt.status !== 'online') throw new Error('Bot is not online.');
  clearMovement(accountId);
  rt.lastAction = 'Jump'; rt.lastActionAt = now();
  rt.bot.setControlState('jump', true);
  moveTimers.set(accountId, setTimeout(() => {
    try { rt.bot?.setControlState('jump', false); } catch {}
    moveTimers.delete(accountId);
  }, clamp(settings.movementTapMs, 100, 350)));
}

function controls(accountId, values) {
  const rt = runtimeFor(accountId);
  if (!rt.bot || rt.status !== 'online') throw new Error('Bot is not online.');
  if (values.sprint !== undefined) { rt.lastAction = 'Sprint'; rt.lastActionAt = now(); rt.sprint = Boolean(values.sprint); rt.bot.setControlState('sprint', rt.sprint); }
  if (values.sneak !== undefined) { rt.lastAction = 'Sneak'; rt.lastActionAt = now(); rt.sneak = Boolean(values.sneak); rt.bot.setControlState('sneak', rt.sneak); }
}

function stopFollowing(accountId, reason = 'Follow stopped') {
  const timer = followTimers.get(accountId);
  if (timer) clearTimeout(timer);
  followTimers.delete(accountId);
  const rt = runtimeFor(accountId);
  rt.follow.active = false;
  rt.follow.targetName = '';
  rt.follow.lastMessage = reason;
  try { rt.bot?.clearControlStates?.(); } catch {}
  rt.sprint = false;
  rt.sneak = false;
  rememberEvent(accountId, 'follow-stop', 'Follow stopped', reason);
  queueBroadcast(20);
}

function scheduleFollowTick(accountId) {
  const old = followTimers.get(accountId);
  if (old) clearTimeout(old);
  followTimers.set(accountId, setTimeout(() => followTick(accountId), 250));
}

function followTick(accountId) {
  followTimers.delete(accountId);
  const account = getAccount(accountId);
  const rt = runtimeFor(accountId);
  if (!account || !rt.follow.active || !rt.bot || !rt.inServer || rt.status !== 'online') return;
  const targetName = rt.follow.targetName;
  const player = rt.bot.players?.[targetName];
  const entity = player?.entity;
  if (!entity || !rt.bot.entity?.position) {
    rt.follow.lastMessage = `${targetName} is not currently visible.`;
    try { rt.bot.clearControlStates(); } catch {}
    rt.sprint = false;
    scheduleFollowTick(accountId);
    queueBroadcast(40);
    return;
  }
  const me = rt.bot.entity.position;
  const target = entity.position;
  const distance = me.distanceTo(target);
  rt.follow.lastSeenAt = now();
  rt.follow.lastMessage = `Tracking ${targetName} · ${distance.toFixed(1)} blocks`;
  if (distance > rt.follow.maxDistance) {
    try { rt.bot.clearControlStates(); } catch {}
    rt.sprint = false;
    rt.follow.lastMessage = `${targetName} is too far away.`;
    scheduleFollowTick(accountId);
    queueBroadcast(60);
    return;
  }
  try { rt.bot.lookAt(target.offset(0, Math.min(1.62, Number(entity.height) || 1.62), 0), true); } catch {}
  if (distance > rt.follow.stopDistance) {
    try { rt.bot.setControlState('forward', true); } catch {}
    if (target.y - me.y > 0.8 && Number(rt.bot.entity.velocity?.y || 0) <= 0.05) {
      try { rt.bot.setControlState('jump', true); } catch {}
      setTimeout(() => { try { rt.bot?.setControlState('jump', false); } catch {} }, 140);
    }
  } else {
    try { rt.bot.setControlState('forward', false); rt.bot.setControlState('back', false); rt.bot.setControlState('left', false); rt.bot.setControlState('right', false); } catch {}
  }
  scheduleFollowTick(accountId);
  queueBroadcast(80);
}

function startFollowing(accountId, targetName, stopDistance = 2.5, maxDistance = 32) {
  const account = getAccount(accountId);
  const rt = runtimeFor(accountId);
  const name = String(targetName || '').trim();
  if (!account) throw new Error('Account not found.');
  if (!rt.bot || !rt.inServer || rt.status !== 'online') throw new Error('Bot must be In Server before following a player.');
  if (!name) throw new Error('Enter a player name first.');
  const player = rt.bot.players?.[name];
  if (!player?.entity) throw new Error(`${name} is not currently visible to ${account.username}.`);
  const distance = rt.bot.entity?.position ? rt.bot.entity.position.distanceTo(player.entity.position) : 9999;
  const max = clamp(Number(maxDistance) || 32, 8, 64);
  if (distance > max) throw new Error(`${name} is too far away (${distance.toFixed(1)} blocks).`);
  const old = followTimers.get(accountId);
  if (old) clearTimeout(old);
  rt.follow = { active: true, targetName: player.username || name, stopDistance: clamp(Number(stopDistance) || 2.5, 1.5, 6), maxDistance: max, lastSeenAt: now(), lastMessage: `Tracking ${player.username || name}` };
  rememberEvent(accountId, 'follow-start', 'Following player', `${rt.follow.targetName} · stop at ${rt.follow.stopDistance} blocks`);
  scheduleFollowTick(accountId);
  queueBroadcast();
}

function look(accountId, yaw, pitch) {
  const rt = runtimeFor(accountId);
  if (!rt.bot || rt.status !== 'online') throw new Error('Bot is not online.');
  const y = Number(yaw) || 0;
  const p = Number(pitch) || 0;
  rt.bot.look((y * Math.PI) / 180, (p * Math.PI) / 180, true);
  refreshRuntime(rt.bot, rt);
  queueBroadcast();
}

function settleOutboundItem(item, error = null) {
  try {
    if (error) item.reject?.(error);
    else item.resolve?.(item.result || { id: item.id, status: 'submitted' });
  } catch {}
}

function rejectOutboundQueue(rt, error) {
  const err = error instanceof Error ? error : new Error(String(error || 'Message delivery failed.'));
  while (rt.outboundQueue.length) settleOutboundItem(rt.outboundQueue.shift(), err);
  rt.outboundBusy = false;
  if (rt.outboundTimer) { clearTimeout(rt.outboundTimer); rt.outboundTimer = null; }
}

function runtimeStatusLabel(rt) { return rt?.inServer ? 'In Server' : ({ joining:'Joining', reconnecting:'Reconnecting', kicked:'Kicked', error:'Error' }[rt?.status] || 'Offline'); }

function botSessionReady(rt) {
  const bot = rt?.bot;
  return Boolean(
    bot &&
    !bot._client?.ended &&
    bot._client?.state === 'play' &&
    bot.entity?.position &&
    rt.inServer === true &&
    rt.status === 'online' &&
    rt.chatReady === true
  );
}

function pumpOutbound(accountId) {
  const account = getAccount(accountId);
  const rt = runtimeFor(accountId);
  if (!account || rt.outboundBusy || !rt.outboundQueue.length) return;
  if (!rt.bot || rt.bot._client?.ended) {
    if (['joining', 'reconnecting'].includes(rt.status) || rt.pendingJoin || rt.desiredOnline) return;
    rejectOutboundQueue(rt, new Error('Bot is offline.'));
    return;
  }
  if (!botSessionReady(rt)) {
    if (!rt.outboundTimer && (rt.desiredOnline || rt.pendingJoin || ['joining', 'reconnecting'].includes(rt.status))) {
      rt.outboundTimer = setTimeout(() => {
        rt.outboundTimer = null;
        pumpOutbound(accountId);
      }, 50);
    }
    return;
  }

  const item = rt.outboundQueue.shift();
  rt.outboundBusy = true;
  rt.lastMessageStatus = 'sending';
  rt.lastMessageText = item.text;
  rt.lastMessageAt = now();
  rt.lastMessageError = '';
  queueBroadcast(5);
  try {
    item.result = dispatchChatDirect(accountId, item.text);
    settleOutboundItem(item);
  } catch (error) {
    rt.lastMessageStatus = 'failed';
    rt.lastMessageError = error?.message || String(error);
    const isCommand = item.text.startsWith('/');
    if (isCommand) rememberCommand(accountId, item.text, 'failed', rt.lastMessageError);
    rememberEvent(accountId, 'error', `Failed to send ${isCommand ? 'command' : 'chat'} to Minecraft`, rt.lastMessageError);
    log('error', `${account.username}: failed to send ${isCommand ? 'command' : 'chat'} to Minecraft: ${rt.lastMessageError}`, accountId);
    settleOutboundItem(item, error);
  } finally {
    rt.outboundBusy = false;
    if (rt.outboundQueue.length) {
      const delay = Math.max(0, Number(settings.multiChatDelayMs) || 0);
      if (delay === 0) {
        queueMicrotask(() => pumpOutbound(accountId));
      } else {
        rt.outboundTimer = setTimeout(() => {
          rt.outboundTimer = null;
          pumpOutbound(accountId);
        }, delay);
      }
    } else if (rt.outboundTimer) {
      clearTimeout(rt.outboundTimer);
      rt.outboundTimer = null;
    }
    queueBroadcast(5);
  }
}

function enqueueOutbound(accountId, text) {
  const rt = runtimeFor(accountId);
  const outbound = String(text || '').slice(0, 256);
  return new Promise((resolve, reject) => {
    rt.outboundQueue.push({ id: makeId(), text: outbound, queuedAt: now(), resolve, reject, result: null });
    const limit = settings.chatQueueLimit;
    if (limit > 0) {
      while (rt.outboundQueue.length > limit) {
        const dropped = rt.outboundQueue.shift();
        settleOutboundItem(dropped, new Error('Outbound message queue limit reached.'));
      }
    }
    pumpOutbound(accountId);
  });
}

function dispatchChatDirect(accountId, text) {
  const account = getAccount(accountId);
  const rt = runtimeFor(accountId);
  if (!account) throw new Error('Account not found.');
  if (!botSessionReady(rt)) throw new Error(`Bot is not ready for chat (status: ${runtimeStatusLabel(rt)}).`);
  const bot = rt.bot;
  if (typeof bot.chat !== 'function') throw new Error('Minecraft chat API is unavailable on this connection.');
  bot.chat(text);
  const isCommand = text.startsWith('/');
  rt.lastAction = isCommand ? 'Command' : 'Chat';
  rt.lastActionAt = now();
  rt.messagesSent += 1;
  if (isCommand) rt.commandsSent += 1;
  rt.lastMessageStatus = 'sent';
  rt.lastMessageText = text;
  rt.lastMessageAt = now();
  rt.lastMessageError = '';
  if (!isCommand) rememberChat(accountId, 'outgoing', account.username, text);
  if (isCommand) rememberCommand(accountId, text, 'submitted', 'Submitted through Mineflayer bot.chat().');
  rememberEvent(accountId, isCommand ? 'command' : 'chat', isCommand ? 'Command submitted to Minecraft' : 'Chat message submitted to Minecraft', `${text} · via bot.chat()`);
  log('chat', `${account.username} → Minecraft ${isCommand ? 'command' : 'chat'}: ${text}`, accountId);
  return { status: 'sent', id: makeId(), type: isCommand ? 'command' : 'chat', text };
}

function sendChat(accountId, message) {
  const account = getAccount(accountId);
  const rt = runtimeFor(accountId);
  const text = String(message || '').trim();
  if (!account || !text) throw new Error('Message is empty.');
  const outbound = text.slice(0, 256);
  const bot = rt.bot;
  rt.lastMessageStatus = 'queued';
  rt.lastMessageText = outbound;
  rt.lastMessageAt = now();
  rt.lastMessageError = '';

  if (botSessionReady(rt) && !rt.outboundBusy && rt.outboundQueue.length === 0) {
    return Promise.resolve(dispatchChatDirect(accountId, outbound));
  }
  if (botSessionReady(rt)) {
    return enqueueOutbound(accountId, outbound);
  }
  if (['joining', 'reconnecting'].includes(rt.status) || rt.pendingJoin || rt.desiredOnline) {
    rememberEvent(accountId, 'queued-chat', 'Message queued until the bot is in the server', outbound);
    queueBroadcast();
    return enqueueOutbound(accountId, outbound);
  }
  throw new Error(`Bot is not in the server. Current status: ${runtimeSnapshot(account).statusLabel}.`);
}

function waitMs(ms) { return new Promise(resolve => setTimeout(resolve, Math.max(0, ms))); }
let multiAccountActionChain = Promise.resolve();
let leaveActionChain = Promise.resolve();
function enqueueMultiAccountAction(task) {
  const run = multiAccountActionChain.then(task, task);
  multiAccountActionChain = run.catch(() => {});
  return run;
}
function enqueueLeaveAction(task) {
  const run = leaveActionChain.then(task, task);
  leaveActionChain = run.catch(() => {});
  return run;
}
function sendChatMany(ids, message) {
  const unique = orderedAccountIds(ids, settings.chatOrder);
  const text = String(message || '').trim();
  if (!unique.length || !text) return Promise.resolve();
  return enqueueMultiAccountAction(async () => {
    for (const accountId of unique) {
      try {
        const result = sendChat(accountId, text);
        Promise.resolve(result).catch(error => log('warn', error.message || String(error), accountId));
      } catch (error) {
        log('warn', error.message || String(error), accountId);
      }
      await Promise.resolve();
    }
  });
}

function stopChatAutomation() {
  if (chatAutomation.timer) clearInterval(chatAutomation.timer);
  chatAutomation.timer = null;
  chatAutomation.running = false;
  chatAutomation.ids = [];
  chatAutomation.messages = [];
  chatAutomation.index = 0;
  queueBroadcast();
}

function startChatAutomation(ids, messages, intervalMs) {
  const requestedIds = Array.isArray(ids) && ids.length ? ids : accountsStore.accounts.map(a => a.id);
  const validIds = orderedAccountIds(requestedIds, settings.chatOrder);
  if (!validIds.length) throw new Error('Select at least one saved account.');
  const list = (Array.isArray(messages) ? messages : [messages]).map(v => String(v || '').trim()).filter(Boolean).map(v => v.slice(0, 256));
  if (!list.length) throw new Error('Automatic chat message is empty.');
  const delay = nonNegativeNumber(intervalMs, 30000);
  stopChatAutomation();
  chatAutomation = { running: true, ids: validIds, messages: list, intervalMs: delay, timer: null, index: 0 };
  const tick = () => {
    const text = chatAutomation.messages[chatAutomation.index % chatAutomation.messages.length];
    chatAutomation.index += 1;
    sendChatMany(chatAutomation.ids, text);
  };
  tick();
  chatAutomation.timer = setInterval(tick, delay);
  log('info', `Automatic chat started for ${validIds.length} account(s), ${list.length} message(s), interval ${delay}ms.`);
  queueBroadcast();
}

function testTcp(host, port, timeout = 3500) {
  return new Promise(resolve => {
    const started = Date.now();
    const socket = net.createConnection({ host, port });
    let done = false;
    const finish = (ok, error = '') => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch {}
      resolve({ ok, latencyMs: Date.now() - started, error });
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false, 'Connection timed out.'));
    socket.once('error', error => finish(false, error.code || error.message || 'Connection failed.'));
  });
}

function runtimeSnapshot(account, compact = true) {
  const rt = runtimeFor(account.id);
  let target = rt.target;
  if (!target) { try { target = targetFor(account); } catch {} }
  const snapshot = {
    status: rt.status,
    statusLabel: rt.inServer ? 'In Server' : ({ joining:'Joining', reconnecting:'Reconnecting', kicked:'Kicked', error:'Error', offline:'Offline' }[rt.status] || 'Offline'),
    error: rt.error,
    inServer: rt.inServer,
    connectedAt: rt.connectedAt,
    lastEventAt: rt.lastEventAt,
    lastEvent: rt.lastEvent,
    lastDisconnectReason: rt.lastDisconnectReason,
    lastKickReason: rt.lastKickReason,
    ping: rt.ping,
    sessionSeconds: rt.connectedAt ? Math.max(0, Math.floor((Date.now() - Date.parse(rt.connectedAt)) / 1000)) : 0,
    messagesSent: rt.messagesSent,
    commandsSent: rt.commandsSent,
    outboundQueued: rt.outboundQueue.length,
    lastMessageStatus: rt.lastMessageStatus,
    lastMessageText: rt.lastMessageText,
    lastMessageAt: rt.lastMessageAt,
    lastMessageError: rt.lastMessageError,
    keepAlive: rt.keepAlive,
    reconnectAttempts: rt.reconnectAttempts,
    position: rt.position,
    yaw: rt.yaw,
    pitch: rt.pitch,
    health: rt.health,
    food: rt.food,
    world: rt.world,
    players: rt.players,
    chatPreview: rt.chat.slice(-12),
    eventsPreview: rt.events.slice(-12),
    commandHistoryPreview: rt.commandHistory.slice(-12),
    target: target || null,
    pendingJoin: rt.pendingJoin,
    desiredOnline: rt.desiredOnline,
    chatReady: rt.chatReady,
    sprint: rt.sprint,
    sneak: rt.sneak,
    follow: { ...rt.follow },
    lastAction: rt.lastAction,
    lastActionAt: rt.lastActionAt
  };
  if (!compact) {
    snapshot.chat = rt.chat.slice();
    snapshot.events = rt.events.slice();
    snapshot.commandHistory = rt.commandHistory.slice();
  }
  return snapshot;
}

function serializeAccount(account, compact = true) {
  return { ...account, appearance: normalizeAppearance(account.appearance), runtime: runtimeSnapshot(account, compact) };
}
function payload() {
  return {
    type: 'state',
    accounts: accountsStore.accounts.map(serializeAccount),
    settings,
    queue: { queued: joinQueue.length, activeJoins: activeJoinAttempts, maxConcurrentJoins: settings.maxConcurrentJoins, lastJoinStartedAt, joinOrder: settings.joinOrder, chatOrder: settings.chatOrder, leaveOrder: settings.leaveOrder },
    logTail: settings.logLimit > 0 ? logs.slice(-settings.logLimit) : logs.slice(),
    public: { siteName: settings.siteName, discordServerUrl: settings.discordServerUrl, discordBotClientId: settings.discordBotClientId, discordBotInviteUrl: settings.discordBotInviteUrl, discordDocsUrl: settings.discordDocsUrl },
    chatAutomation: { running: chatAutomation.running, ids: chatAutomation.ids, messages: chatAutomation.messages || [], intervalMs: chatAutomation.intervalMs }
  };
}

function broadcastNow() {
  broadcastQueued = false;
  broadcastTimer = null;
  const data = `data: ${JSON.stringify(payload())}\n\n`;
  for (const res of subscribers) { try { res.write(data); } catch {} }
}

function queueBroadcast(delay = null) {
  if (broadcastQueued) return;
  broadcastQueued = true;
  const effectiveDelay = delay == null ? settings.stateBroadcastMs : delay;
  if (effectiveDelay <= 0) broadcastNow();
  else broadcastTimer = setTimeout(broadcastNow, effectiveDelay);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1024 * 1024) req.destroy();
    });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('Invalid JSON body.')); } });
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function serveStatic(req, res) {
  const requestPath = new URL(req.url, 'http://127.0.0.1').pathname;
  let filePath = requestPath === '/' ? path.join(PUBLIC_DIR, 'index.html') : path.join(PUBLIC_DIR, path.normalize(requestPath).replace(/^[/\\]+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: 'Forbidden.' });
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) filePath = path.join(PUBLIC_DIR, 'index.html');
  const ext = path.extname(filePath).toLowerCase();
  const types = { '.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml' };
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write(`data: ${JSON.stringify(payload())}\n\n`);
      subscribers.add(res);
      req.on('close', () => subscribers.delete(res));
      return;
    }
    if (req.method === 'GET' && url.pathname.startsWith('/api/skins/')) {
      const skinId = decodeURIComponent(url.pathname.slice('/api/skins/'.length)).replace(/[^a-zA-Z0-9_-]/g, '');
      const filePath = path.join(SKIN_DIR, `${skinId}.png`);
      if (!filePath.startsWith(SKIN_DIR) || !fs.existsSync(filePath)) return sendJson(res, 404, { error: 'Skin not found.' });
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300' });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/state') return sendJson(res, 200, payload());
    if (req.method === 'GET' && url.pathname === '/api/logs') {
      const accountId = url.searchParams.get('accountId') || 'all';
      return sendJson(res, 200, { logs: logs.filter(x => accountId === 'all' || x.accountId === accountId) });
    }
    if (req.method === 'POST' && url.pathname === '/api/test-connection') {
      const body = await parseBody(req);
      const target = parseServerAddress(body.address, body.port || 25565);
      return sendJson(res, 200, { ...await testTcp(target.host, target.port), host: target.host, port: target.port });
    }

    if (req.method === 'POST' && url.pathname === '/api/settings/reset') {
      settings = { ...DEFAULT_SETTINGS };
      saveAll();
      log('info', 'Server settings reset to the factory default profile.');
      processJoinQueue();
      queueBroadcast();
      return sendJson(res, 200, { settings });
    }

    if (req.method === 'POST' && url.pathname === '/api/settings') {
      const body = await parseBody(req);
      if (body.host !== undefined || body.port !== undefined) {
        const parsed = parseServerAddress(body.host !== undefined ? body.host : settings.host, body.port !== undefined ? body.port : settings.port);
        settings.host = parsed.host; settings.port = parsed.port;
      }
      if (body.version !== undefined) settings.version = String(body.version || '').trim();
      if (body.joinDelayMs !== undefined) { const n = Number(body.joinDelayMs); if (!Number.isFinite(n)) throw new Error('Join interval must be a number.'); settings.joinDelayMs = Math.max(0, n); }
      if (body.joinJitterMs !== undefined) { const n = Number(body.joinJitterMs); if (!Number.isFinite(n)) throw new Error('Join jitter must be a number.'); settings.joinJitterMs = Math.max(0, n); }
      if (body.maxConcurrentJoins !== undefined) { const n = Number(body.maxConcurrentJoins); if (!Number.isFinite(n)) throw new Error('Concurrent joins must be a number.'); settings.maxConcurrentJoins = Math.max(0, Math.floor(n)); }
      if (body.joinTimeoutMs !== undefined) { const n = Number(body.joinTimeoutMs); if (!Number.isFinite(n)) throw new Error('Join timeout must be a number.'); settings.joinTimeoutMs = Math.max(0, n); }
      if (body.leaveDelayMs !== undefined) { const n = Number(body.leaveDelayMs); if (!Number.isFinite(n)) throw new Error('Leave interval must be a number.'); settings.leaveDelayMs = Math.max(0, n); }
      if (body.autoReconnect !== undefined) settings.autoReconnect = Boolean(body.autoReconnect);
      if (body.keepOnline !== undefined) settings.keepOnline = Boolean(body.keepOnline);
      if (body.reconnectAfterKick !== undefined) settings.reconnectAfterKick = Boolean(body.reconnectAfterKick);
      if (body.autoRespawn !== undefined) settings.autoRespawn = Boolean(body.autoRespawn);
      if (body.reconnectDelayMs !== undefined) { const n = Number(body.reconnectDelayMs); if (!Number.isFinite(n)) throw new Error('Reconnect delay must be a number.'); settings.reconnectDelayMs = Math.max(0, n); }
      if (body.reconnectBackoff !== undefined) settings.reconnectBackoff = Boolean(body.reconnectBackoff);
      if (body.maxReconnectAttempts !== undefined) { const n = Number(body.maxReconnectAttempts); if (!Number.isFinite(n)) throw new Error('Max reconnect attempts must be a number.'); settings.maxReconnectAttempts = Math.max(0, Math.floor(n)); }
      if (body.maxAccounts !== undefined) { const n = Number(body.maxAccounts); if (!Number.isFinite(n)) throw new Error('Maximum accounts must be a number.'); settings.maxAccounts = Math.max(0, Math.floor(n)); }
      if (body.movementTapMs !== undefined) { const n = Number(body.movementTapMs); if (!Number.isFinite(n)) throw new Error('Movement tap must be a number.'); settings.movementTapMs = Math.max(0, n); }
      if (body.multiChatDelayMs !== undefined) { const n = Number(body.multiChatDelayMs); if (!Number.isFinite(n)) throw new Error('Multi-chat delay must be a number.'); settings.multiChatDelayMs = Math.max(0, n); }
      if (body.chatSigningCompatibility !== undefined) settings.chatSigningCompatibility = Boolean(body.chatSigningCompatibility);
      if (body.liveUpdateMs !== undefined) settings.liveUpdateMs = nonNegativeNumber(body.liveUpdateMs, settings.liveUpdateMs);
      if (body.playerLimit !== undefined) settings.playerLimit = nonNegativeInteger(body.playerLimit, settings.playerLimit);
      if (body.logLimit !== undefined) settings.logLimit = nonNegativeInteger(body.logLimit, settings.logLimit);
      if (body.siteName !== undefined) settings.siteName = String(body.siteName || 'NEXUS Control').trim().slice(0, 60) || 'NEXUS Control';
      if (body.discordServerUrl !== undefined) settings.discordServerUrl = String(body.discordServerUrl || '').trim().slice(0, 300);
      if (body.discordBotClientId !== undefined) settings.discordBotClientId = String(body.discordBotClientId || '').trim().slice(0, 40);
      if (body.discordBotInviteUrl !== undefined) settings.discordBotInviteUrl = String(body.discordBotInviteUrl || '').trim().slice(0, 500);
      if (body.discordDocsUrl !== undefined) settings.discordDocsUrl = String(body.discordDocsUrl || '/discord-docs.html').trim().slice(0, 300) || '/discord-docs.html';
      if (body.stateBroadcastMs !== undefined) settings.stateBroadcastMs = nonNegativeNumber(body.stateBroadcastMs, settings.stateBroadcastMs);
      if (body.chatQueueLimit !== undefined) settings.chatQueueLimit = nonNegativeInteger(body.chatQueueLimit, settings.chatQueueLimit);
      if (body.joinOrder !== undefined) settings.joinOrder = ['saved-top-down','selected-order','reverse'].includes(body.joinOrder) ? body.joinOrder : settings.joinOrder;
      if (body.chatOrder !== undefined) settings.chatOrder = ['saved-top-down','selected-order','reverse'].includes(body.chatOrder) ? body.chatOrder : settings.chatOrder;
      if (body.leaveOrder !== undefined) settings.leaveOrder = ['saved-top-down','selected-order','reverse'].includes(body.leaveOrder) ? body.leaveOrder : settings.leaveOrder;
      saveAll();
      log('info', `Server settings saved for ${settings.host}:${settings.port || 25565}.`);
      processJoinQueue();
      queueBroadcast();
      return sendJson(res, 200, { settings });
    }

    if (req.method === 'POST' && url.pathname === '/api/accounts') {
      const body = await parseBody(req);
      if (settings.maxAccounts > 0 && accountsStore.accounts.length >= settings.maxAccounts) throw new Error(`Maximum saved accounts reached (${settings.maxAccounts}).`);
      const username = sanitizeUsername(body.username);
      if (accountsStore.accounts.some(a => a.username.toLowerCase() === username.toLowerCase())) throw new Error('That username already exists.');
      const accountId = makeId();
      const account = normalizeAccount({
        id: accountId, username,
        label: String(body.label || username).trim().slice(0, 32) || username,
        serverMode: 'global', hostOverride: '', portOverride: 25565, versionOverride: '',
        autoReconnect: Boolean(body.autoReconnect), reconnectDelayMs: settings.reconnectDelayMs,
        startOnLaunch: Boolean(body.startOnLaunch), joinDelayMsOverride: null,
        appearance: persistAppearance(accountId, normalizeAppearance(body.appearance)), createdAt: now()
      });
      accountsStore.accounts.push(account); saveAll();
      log('success', `Created account ${username}.`, account.id);
      queueBroadcast();
      return sendJson(res, 201, { account: serializeAccount(account) });
    }

    const accountMatch = url.pathname.match(/^\/api\/accounts\/([^/]+)(?:\/(.+))?$/);
    if (accountMatch) {
      const accountId = decodeURIComponent(accountMatch[1]);
      const action = accountMatch[2] || '';
      const account = getAccount(accountId);
      if (!account) return sendJson(res, 404, { error: 'Account not found.' });
      const rt = runtimeFor(account.id);

      if (req.method === 'GET' && action === 'chat') {
        const rt = runtimeFor(account.id);
        return sendJson(res, 200, { chat: rt.chat.slice(-200) });
      }

      if (req.method === 'GET' && action === 'details') {
        return sendJson(res, 200, { account: serializeAccount(account, false) });
      }

      if (req.method === 'GET' && action === 'world-snapshot') {
        const rt = runtimeFor(account.id);
        if (!rt.bot?.entity?.position) return sendJson(res, 400, { error: 'Bot is not online.' });
        const radius = clamp(Number(url.searchParams.get('radius')) || 5, 2, 7);
        const center = rt.bot.entity.position.floored();
        const blocks = [];
        for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) {
          let found = null;
          for (let dy = 4; dy >= -6; dy--) {
            const block = rt.bot.blockAt(center.offset(dx, dy, dz));
            if (!block || ['air', 'cave_air', 'void_air'].includes(block.name)) continue;
            found = { x: dx, z: dz, y: center.y + dy, name: block.name };
            break;
          }
          if (found) blocks.push(found);
        }
        return sendJson(res, 200, { center: { x: rt.bot.entity.position.x, y: rt.bot.entity.position.y, z: rt.bot.entity.position.z }, yaw: rt.bot.entity.yaw || 0, blocks });
      }

      if (req.method === 'DELETE' && !action) {
        disconnectAccount(account.id);
        clearJoinQueue([account.id]);
        accountsStore.accounts = accountsStore.accounts.filter(a => a.id !== account.id);
        runtimes.delete(account.id);
        saveAll();
        log('info', `Deleted account ${account.username}.`, account.id);
        queueBroadcast();
        return sendJson(res, 200, { ok: true });
      }

      if (req.method === 'PATCH' && !action) {
        const body = await parseBody(req);
        if (body.username !== undefined && body.username !== account.username) {
          const next = sanitizeUsername(body.username);
          if (accountsStore.accounts.some(a => a.id !== account.id && a.username.toLowerCase() === next.toLowerCase())) throw new Error('That username already exists.');
          disconnectAccount(account.id);
          account.username = next;
        }
        if (body.label !== undefined) account.label = String(body.label || account.username).trim().slice(0, 32) || account.username;
        if (body.serverMode !== undefined) account.serverMode = body.serverMode === 'custom' ? 'custom' : 'global';
        if (body.hostOverride !== undefined) account.hostOverride = String(body.hostOverride || '').trim();
        if (body.portOverride !== undefined) account.portOverride = clamp(Number(body.portOverride) || 25565, 1, 65535);
        if (body.versionOverride !== undefined) account.versionOverride = String(body.versionOverride || '').trim();
        if (body.autoReconnect !== undefined) account.autoReconnect = Boolean(body.autoReconnect);
        if (body.startOnLaunch !== undefined) account.startOnLaunch = Boolean(body.startOnLaunch);
        if (body.reconnectDelayMs !== undefined) account.reconnectDelayMs = nonNegativeNumber(body.reconnectDelayMs, settings.reconnectDelayMs);
        if (body.joinDelayMsOverride !== undefined) account.joinDelayMsOverride = body.joinDelayMsOverride === null || body.joinDelayMsOverride === '' ? null : nonNegativeNumber(body.joinDelayMsOverride, settings.joinDelayMs);
        if (body.appearance !== undefined) account.appearance = persistAppearance(account.id, body.appearance);
        saveAll();
        log('info', `Updated account ${account.username}.`, account.id);
        queueBroadcast();
        return sendJson(res, 200, { account: serializeAccount(account) });
      }

      if (req.method === 'POST') {
        if (action === 'connect') enqueueConnect([account.id], 'manual');
        else if (action === 'disconnect') disconnectAccount(account.id);
        else if (action === 'chat' || action === 'command') {
          const body = await parseBody(req);
          const message = String(body.message || '').trim();
          if (!message) throw new Error('Message is empty.');
          if (action === 'command' && !message.startsWith('/')) throw new Error('Commands must start with /.');
          const ready = botSessionReady(rt);
          const promise = sendChat(account.id, message);
          if (ready) {
            const result = await promise;
            return sendJson(res, 200, { ok: true, delivery: result?.status || 'sent', result: result || null });
          }
          promise.catch(() => {});
          return sendJson(res, 202, { ok: true, delivery: 'queued', message });
        }
        else if (action === 'move') { const body = await parseBody(req); body.direction === 'jump' ? jumpTimed(account.id) : moveTimed(account.id, body.direction, settings.movementTapMs / 1000); }
        else if (action === 'controls') { const body = await parseBody(req); controls(account.id, body); }
        else if (action === 'look') { const body = await parseBody(req); look(account.id, body.yaw, body.pitch); }
        else if (action === 'follow') { const body = await parseBody(req); startFollowing(account.id, body.targetName); }
        else if (action === 'follow-stop') stopFollowing(account.id);
        else if (action === 'stop') {
          clearMovement(account.id);
          stopFollowing(account.id, 'Activity stopped');
          if (rt.outboundTimer) { clearTimeout(rt.outboundTimer); rt.outboundTimer = null; }
          if (rt.outboundQueue.length) rejectOutboundQueue(rt, new Error('Outbound activity stopped by user.'));
          if (chatAutomation.ids.includes(account.id)) chatAutomation.ids = chatAutomation.ids.filter(id => id !== account.id);
          rt.lastAction = 'Stop'; rt.lastActionAt = now();
          rememberEvent(account.id, 'stop', 'Bot activity stopped', 'Movement, follow and queued messages stopped.');
        }
        else return sendJson(res, 404, { error: 'Unknown action.' });
        queueBroadcast();
        return sendJson(res, 200, { ok: true });
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/actions/chat-automation') {
      const body = await parseBody(req);
      if (body.action === 'stop') { stopChatAutomation(); return sendJson(res, 200, { ok: true }); }
      if (body.action === 'start') { startChatAutomation(body.ids, body.messages ?? body.message, body.intervalMs); return sendJson(res, 202, { ok: true }); }
      throw new Error('Unknown automation action.');
    }

    if (req.method === 'POST' && url.pathname === '/api/actions/connect-all') {
      const body = await parseBody(req);
      const hasExplicitIds = Array.isArray(body.ids);
      const ids = hasExplicitIds ? body.ids : accountsStore.accounts.map(a => a.id);
      if (!ids.length) throw new Error('No accounts selected.');
      const needsGlobalTarget = ids.some(id => { const account = getAccount(id); return !account || account.serverMode !== 'custom' || !account.hostOverride; });
      if (needsGlobalTarget && !settings.host) throw new Error('Set a global server first, or configure a custom server for every selected account.');
      enqueueConnect(ids, 'bulk');
      return sendJson(res, 202, { ok: true, queued: joinQueue.length });
    }
    if (req.method === 'POST' && url.pathname === '/api/actions/clear-queue') {
      const body = await parseBody(req);
      clearJoinQueue(Array.isArray(body.ids) && body.ids.length ? body.ids : null);
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/actions/disconnect-all') {
      const body = await parseBody(req);
      const hasExplicitIds = Array.isArray(body.ids);
      const ids = hasExplicitIds ? body.ids : accountsStore.accounts.map(a => a.id);
      if (!ids.length) throw new Error('No accounts selected.');
      disconnectMany(ids);
      return sendJson(res, 202, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/actions/stop-all') {
      stopAll();
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/actions/chat-all') {
      const body = await parseBody(req);
      const hasExplicitIds = Array.isArray(body.ids);
      const ids = hasExplicitIds ? body.ids : accountsStore.accounts.map(a => a.id);
      const ordered = orderedAccountIds(ids, settings.chatOrder);
      if (!ordered.length) throw new Error('No accounts selected.');
      const message = String(body.message || '').trim();
      if (!message) throw new Error('Message is empty.');
      sendChatMany(ordered, message).catch(() => {});
      return sendJson(res, 202, { ok: true, queuedFor: ordered.length, message, order: settings.chatOrder });
    }

    if (req.method === 'GET') return serveStatic(req, res);
    return sendJson(res, 404, { error: 'Not found.' });
  } catch (error) {
    log('error', error.message || String(error));
    return sendJson(res, 400, { error: error.message || String(error) });
  }
});

function runtimeTick() {
  runtimeTickTimer = null;
  let changed = false;
  for (const account of accountsStore.accounts) {
    const rt = runtimes.get(account.id);
    if (rt?.bot) {
      if (!rt.inServer) markInServer(account, rt, rt.bot, rt.botGeneration, 'runtime-check');
      if (rt.status === 'online' && (!rt.inServer || rt.bot._client?.ended)) {
        rt.inServer = false;
        rt.chatReady = false;
        rt.status = 'offline';
        changed = true;
      }
      if (rt.bot.entity) changed = refreshRuntime(rt.bot, rt) || changed;
    }
  }
  queueBroadcast(changed ? 0 : Math.max(0, settings.liveUpdateMs - 20));
  if (!shuttingDown && settings.liveUpdateMs > 0) runtimeTickTimer = setTimeout(runtimeTick, settings.liveUpdateMs);
}

function startBackgroundLoops() {
  if (settings.liveUpdateMs > 0 && !runtimeTickTimer) runtimeTickTimer = setTimeout(runtimeTick, settings.liveUpdateMs);
  if (!heartbeatTimer) heartbeatTimer = setInterval(() => {
    for (const res of subscribers) {
      try { res.write(': ping\n\n'); } catch {}
    }
  }, 15000);
}

function startServer(requestedPort = Number(process.env.MCAL_PORT) || DEFAULT_PORT) {
  shuttingDown = false;
  startBackgroundLoops();
  return new Promise((resolve, reject) => {
    if (server.listening) {
      const address = server.address();
      return resolve(address && typeof address === 'object' ? address.port : requestedPort);
    }
    const onError = error => { server.off('listening', onListening); reject(error); };
    const onListening = () => {
      server.off('error', onError);
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : requestedPort;
      log('success', `Control panel ready at http://127.0.0.1:${port}`);
      log('info', settings.host ? `Current Minecraft target: ${settings.host}:${settings.port}.` : 'No Minecraft target is set. Enter the server IP in Server settings.');
      const startup = accountsStore.accounts.filter(a => a.startOnLaunch && settings.host);
      if (startup.length) enqueueConnect(startup.map(a => a.id), 'startup');
      resolve(port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(requestedPort, '127.0.0.1');
  });
}

function shutdownServer() {
  if (shuttingDown) return Promise.resolve();
  shuttingDown = true;
  stopChatAutomation();
  clearJoinQueue();
  if (runtimeTickTimer) { clearTimeout(runtimeTickTimer); runtimeTickTimer = null; }
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  if (broadcastTimer) { clearTimeout(broadcastTimer); broadcastTimer = null; broadcastQueued = false; }
  for (const res of subscribers) { try { res.end(); } catch {} }
  subscribers.clear();
  for (const account of accountsStore.accounts) { try { disconnectAccount(account.id); } catch {} }
  return new Promise(resolve => {
    if (!server.listening) return resolve();
    try { server.close(() => resolve()); } catch { resolve(); }
  });
}

if (require.main === module) {
  startServer().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
  process.on('SIGINT', async () => { await shutdownServer(); process.exit(0); });
}

module.exports = {
  startServer,
  shutdownServer,
  getServerPort: () => { const address = server.address(); return address && typeof address === 'object' ? address.port : null; }
};
