/* ---------- 1v1 duel ----------
   Hot-potato head-to-head over Supabase Realtime (broadcast only, no tables needed).
   The ball has a hidden fuse. Name a valid answer to pass it. Whoever has it when
   it bursts loses a life, then a new category starts and the other player has the ball.
   The player who creates the room is the referee: their browser holds the match
   state, judges answers and runs the fuse; the other player sends guesses and
   draws whatever state arrives. Add ?local=1 to the URL to test with two tabs
   on one computer (no Supabase involved). */
(() => {
const D = {
  LIVES: 2, LIVES_MIN: 1, LIVES_MAX: 5,
  MINTURN: 8, MINTURN_MIN: 3, MINTURN_MAX: 15,   // seconds you're guaranteed after receiving the ball
  FUSE_MIN: 15, FUSE_MAX: 30,                    // hidden fuse per category, seconds
  MIN_ANSWERS: 12,                               // only use prompts with at least this many answers
  POP_PAUSE: 2200,                               // ms to show the burst before the next category
  SB_JS: "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.76.1/dist/umd/supabase.js",
};
const LOCAL = new URLSearchParams(location.search).has("local");
const myPid = (() => { try { if (LOCAL) throw 0; return playerId(); } catch(e) { return Math.random().toString(36).slice(2); } })();
const rnd = (a,b) => a + Math.random()*(b-a);
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const code4 = () => Array.from({length:4},()=>"ABCDEFGHJKMNPQRSTUVWXYZ"[Math.floor(Math.random()*23)]).join("");

/* ---------- DOM ---------- */
const css = `
body.duel-on #lobby, body.duel-on #game, body.duel-on #help{display:none!important}
.duel{display:flex;flex-direction:column;gap:14px}
.duel .panel{background:var(--panel);border:2px solid var(--line);padding:22px;display:flex;flex-direction:column;gap:14px}
.duel h2{font-family:var(--display);font-weight:900;font-size:clamp(34px,6vw,52px);line-height:.92;margin:0;text-transform:uppercase}
.duel .lede{margin:0;font-size:17px;max-width:52ch}
.duel input.dname{background:#06120b;border:2px solid var(--line);color:var(--fg);font-size:19px;padding:10px 12px;max-width:320px}
.duel .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.duel .codebox{font-family:var(--display);font-weight:900;font-size:56px;letter-spacing:.12em;color:var(--accent);line-height:1}
.duel .linkline{font-family:var(--label);font-size:15px;color:var(--muted);word-break:break-all;margin:0}
.duel .err{color:var(--danger);margin:0;font-weight:600}
.duel .muted{color:var(--muted);margin:0}
.duel .drules{margin:0;padding:0;list-style:none;display:grid;gap:6px}
.duel .drules li{display:grid;grid-template-columns:18px minmax(0,1fr);gap:6px;align-items:baseline}
.duel .drules li::before{content:"●";color:var(--accent);font-size:10px}
.settings{display:grid;gap:8px;border-top:1px solid var(--line);padding-top:14px}
.setrow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center}
.setrow .lbl{font-family:var(--label);font-weight:700;font-size:17px;letter-spacing:.04em;text-transform:uppercase}
.setrow .lbl small{display:block;font-family:var(--body);font-weight:400;font-size:13px;letter-spacing:0;text-transform:none;color:var(--muted)}
.stepper{display:flex;align-items:center;border:2px solid var(--line)}
.stepper button{background:transparent;border:0;width:40px;height:40px;font-family:var(--display);font-weight:900;font-size:24px;color:var(--fg)}
.stepper button:disabled{opacity:.25;cursor:default}
.stepper b{min-width:52px;text-align:center;font-family:var(--display);font-weight:900;font-size:24px;color:var(--accent)}
.stepper.ro{border-color:transparent}
.vs{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}
.pl{background:var(--panel);border:2px solid var(--line);padding:10px 12px;display:flex;flex-direction:column;gap:6px;transition:border-color .25s,background .25s,opacity .25s;opacity:.6}
.pl.on{border-color:var(--accent);background:var(--panel-2);opacity:1;box-shadow:0 0 0 3px rgba(255,210,63,.18)}
.pl .nm{font-family:var(--display);font-weight:800;font-size:24px;text-transform:uppercase;line-height:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pl .nm small{font-family:var(--label);font-size:13px;color:var(--muted);letter-spacing:.08em;margin-left:6px}
.pl .lives{display:flex;gap:5px;height:20px;flex-wrap:wrap}
.pl .lives svg{width:20px;height:20px}
.pl .lives svg.gone{opacity:.15;filter:grayscale(1)}
.pl .typing{font-size:14px;color:var(--muted);min-height:1.3em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pl.right{text-align:right}.pl.right .lives{justify-content:flex-end}
.lane{position:relative;height:118px;border:2px solid var(--line);overflow:hidden;
  background:repeating-linear-gradient(90deg,#11301f 0 40px,#0e2a1b 40px 80px)}
.lane::before{content:"";position:absolute;left:50%;top:0;bottom:0;border-left:2px solid rgba(243,241,231,.35)}
.lane::after{content:"";position:absolute;left:50%;top:50%;width:64px;height:64px;margin:-32px 0 0 -32px;border:2px solid rgba(243,241,231,.35);border-radius:50%}
.lane .holder{position:absolute;bottom:6px;font-family:var(--display);font-weight:900;font-size:20px;letter-spacing:.04em;text-transform:uppercase;color:var(--accent);z-index:2;transition:left .45s cubic-bezier(.3,1.2,.4,1),opacity .2s;transform:translateX(-50%);white-space:nowrap;max-width:60%;overflow:hidden;text-overflow:ellipsis}
.dball{position:absolute;top:50%;width:56px;height:56px;margin:-34px 0 0 -28px;z-index:3;transition:left .5s cubic-bezier(.3,1.1,.4,1)}
.dball .inflate{width:100%;height:100%;transition:transform .9s linear}
.dball svg{width:100%;height:100%;display:block;filter:drop-shadow(0 4px 6px rgba(0,0,0,.5))}
.dball.passing svg{animation:dspin .5s linear}
@keyframes dspin{to{transform:rotate(540deg)}}
.dball.s1 .wob{animation:dwob .5s ease-in-out infinite}
.dball.s2 .wob{animation:dwob .28s ease-in-out infinite}
.dball.s3 .wob{animation:dwob .14s ease-in-out infinite}
@keyframes dwob{0%,100%{transform:rotate(-4deg) translate(-1px,0)}50%{transform:rotate(4deg) translate(1px,0)}}
.dball.s3 svg{filter:drop-shadow(0 0 10px rgba(255,82,71,.85))}
.dburst{position:absolute;top:50%;width:150px;height:150px;margin:-75px 0 0 -75px;z-index:4;pointer-events:none}
.dburst .bang{transform-origin:center;transform-box:fill-box;animation:dbang .5s cubic-bezier(.2,1.4,.4,1) both}
@keyframes dbang{from{transform:scale(.2);opacity:0}to{transform:none;opacity:1}}
.dburst .frag{animation:dfrag .8s ease-out both}
@keyframes dfrag{from{transform:translate(0,0) rotate(0);opacity:1}to{transform:translate(var(--dx),var(--dy)) rotate(var(--dr));opacity:0}}
.dcard{background:var(--panel);border:2px solid var(--line);padding:16px 18px;display:flex;flex-direction:column;gap:12px;transition:border-color .25s}
.dcard.mine{border-color:var(--accent)}
.dcard h3{font-family:var(--display);font-weight:800;font-size:clamp(25px,4.4vw,38px);line-height:1;margin:0;text-wrap:balance}
.dcard h3.flash{animation:dnew .6s ease-out}
@keyframes dnew{from{color:var(--accent);transform:translateY(-4px)}to{color:var(--fg);transform:none}}
.dform{display:flex;gap:8px}
.dform input{flex:1;min-width:0;background:#06120b;border:2px solid var(--line);color:var(--fg);font-size:19px;padding:12px 14px}
.dcard.mine .dform input{border-color:var(--accent)}
.dform input.waiting{opacity:.55}
.dform button{background:var(--accent);color:var(--accent-ink);border:0;padding:0 18px;font-family:var(--display);font-weight:900;font-size:22px}
.dcard:not(.mine) .dform button{opacity:.35}
.dfb{margin:0;min-height:1.45em;font-weight:600}
.dfb.bad{color:var(--danger)}.dfb.good{color:var(--ok)}
.used{display:flex;flex-wrap:wrap;gap:6px}
.used span{border-left:4px solid var(--c);background:var(--bg);padding:3px 8px;font-family:var(--label);font-weight:600;font-size:15px}
.used span em{font-style:normal;color:var(--muted);margin-left:5px;font-size:13px}
.dlog{margin:0;padding:0;list-style:none;display:grid;gap:4px;font-size:15px;color:var(--muted)}
.dlog b{color:var(--fg)}
.cdbig{font-family:var(--display);font-weight:900;font-size:110px;line-height:1;color:var(--accent);text-align:center}
.winner{font-family:var(--display);font-weight:900;font-size:clamp(44px,9vw,80px);line-height:.9;color:var(--accent);text-transform:uppercase;margin:0}
.pl.flash{animation:dflash .6s ease-out}
@keyframes dflash{from{background:rgba(255,82,71,.45)}to{background:var(--panel)}}
@media (max-width:560px){.pl .nm{font-size:19px}.duel .panel,.dcard{padding:14px}.lane{height:104px}}
`;
document.head.insertAdjacentHTML("beforeend", `<style>${css}</style>`);
const sec = document.createElement("section");
sec.className = "duel"; sec.id = "duel"; sec.hidden = true;
document.querySelector(".app footer").before(sec);
const nav = document.querySelector(".modes");
const btn = document.createElement("button");
btn.type = "button"; btn.id = "duelBtn"; btn.textContent = "1v1";
nav.prepend(btn);
// The ball's gradient/clip live in one always-rendered <defs>, so the ball draws properly
// even when the daily game's copy of those ids sits inside a hidden section.
const BALLG = typeof BALL !== "undefined"
  ? BALL.replace(/<clipPath[\s\S]*?<\/clipPath>/, "").replace(/<radialGradient[\s\S]*?<\/radialGradient>/, "").replace(/url\(#tbbc\)/g, "url(#dbc)").replace(/url\(#tbbg\)/g, "url(#dbg)")
  : '<circle r="10" fill="#fff"/>';
document.body.insertAdjacentHTML("beforeend", `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><clipPath id="dbc"><circle r="10"/></clipPath><radialGradient id="dbg" cx=".38" cy=".32" r=".75"><stop offset=".55" stop-color="#fbfaf4"/><stop offset="1" stop-color="#b9b7ad"/></radialGradient></defs></svg>`);
const LIFE = `<svg viewBox="-12 -12 24 24">${BALLG}</svg>`;
const BIGBALL = `<div class="inflate"><div class="wob"><svg viewBox="-12 -12 24 24">${BALLG}</svg></div></div>`;
function burstSvg(){
  const pts = Array.from({ length: 16 }, (_, i) => { const r = i % 2 ? 26 : 58, a = i / 16 * Math.PI * 2; return `${(75 + r * Math.cos(a)).toFixed(1)},${(75 + r * Math.sin(a)).toFixed(1)}`; }).join(" ");
  const frags = Array.from({ length: 9 }, (_, i) => { const a = i / 9 * Math.PI * 2 + .3, d = 55 + (i % 3) * 14;
    return `<path class="frag" style="--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d).toFixed(0)}px;--dr:${i * 70}deg" d="M75 75l${i % 2 ? 9 : 7} -5 3 9 -10 2z" fill="${i % 3 ? "#f6f4ec" : "#141414"}"/>`; }).join("");
  return `<svg class="dburst-svg" viewBox="0 0 150 150"><polygon class="bang" points="${pts}" fill="#ff5247" stroke="#ffd23f" stroke-width="3"/><text class="bang" x="75" y="84" text-anchor="middle" font-family="Big Shoulders Display, Impact, sans-serif" font-weight="900" font-size="30" fill="#fff">POP!</text>${frags}</svg>`;
}

/* ---------- transport ---------- */
let chan = null, sbClient = null;
function loadSb(){
  if (window.supabase?.createClient) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = D.SB_JS;
    s.onload = res; s.onerror = () => rej(new Error("Couldn't load the realtime library."));
    document.head.appendChild(s);
  });
}
async function connect(code, onMsg){
  disconnect();
  if (LOCAL) {
    const bc = new BroadcastChannel("spiders-duel-" + code);
    bc.onmessage = e => onMsg(e.data);
    chan = { send: m => bc.postMessage(m), close: () => bc.close() };
    return;
  }
  if (!(LEADERBOARD.url && LEADERBOARD.key)) throw new Error("1v1 needs the Supabase settings filled in.");
  await loadSb();
  sbClient = sbClient || window.supabase.createClient(LEADERBOARD.url, LEADERBOARD.key, { realtime: { params: { eventsPerSecond: 20 } } });
  const ch = sbClient.channel("spiders-duel-" + code, { config: { broadcast: { self: false, ack: false } } });
  ch.on("broadcast", { event: "m" }, ({ payload }) => onMsg(payload));
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("Couldn't reach the match server.")), 10000);
    ch.subscribe(st => {
      if (st === "SUBSCRIBED") { clearTimeout(t); res(); }
      else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT") { clearTimeout(t); rej(new Error("Couldn't reach the match server.")); }
    });
  });
  chan = { send: m => ch.send({ type: "broadcast", event: "m", payload: m }), close: () => sbClient.removeChannel(ch) };
}
function disconnect(){ try { chan?.close(); } catch(e){} chan = null; }
const send = m => { try { chan?.send(m); } catch(e){} };

/* ---------- shared view state ---------- */
let V = { screen: "home", err: "" };   // home | join | connecting | wait | joined | match
let G = null;                          // latest match state (host's copy is authoritative)
let isHost = false, room = "";
let fuseStartLocal = 0, cdEndLocal = 0;
let lastStateAt = 0, lastPeerAt = 0;
let fb = { text: "", cls: "" };
let peerTyping = "";
let hb = 0, tickH = 0, rafH = 0;

const myName = () => (store.get("tb-name") || "").trim();
const meIdx = () => G ? G.players.findIndex(p => p.pid === myPid) : -1;
const promptOf = id => BANK.find(b => b.id === id);
function loadSettings(){
  const s = store.get("tb-duel-settings") || {};
  return { lives: clamp(+s.lives || D.LIVES, D.LIVES_MIN, D.LIVES_MAX), minTurn: clamp(+s.minTurn || D.MINTURN, D.MINTURN_MIN, D.MINTURN_MAX) };
}

/* ---------- host logic ---------- */
function hostNewPrompt(){
  const pool = BANK.filter(p => p.a.length >= D.MIN_ANSWERS && !G.seen.includes(p.id));
  const list = pool.length ? pool : BANK.filter(p => p.a.length >= D.MIN_ANSWERS);
  let p = rand(list);
  if (list.length > 1) { let n = 0; while (p.family === G.lastFamily && n++ < 20) p = rand(list); }
  G.promptId = p.id; G.lastFamily = p.family; G.seen.push(p.id); G.used = [];
  G.fuseStart = Date.now();
  G.fuseEnd = G.fuseStart + rnd(D.FUSE_MIN, D.FUSE_MAX) * 1000;
}
function snap(){
  const now = Date.now();
  const { fuseEnd, ...pub } = G;                    // the fuse stays secret
  return { ...pub, fuseAge: G.fuseStart ? now - G.fuseStart : 0, cdLeft: Math.max(0, (G.cdEnd || 0) - now) };
}
function hostPush(){ G.seq++; const out = snap(); send({ t: "state", g: out }); applyState(out); }
function hostStart(){
  G.phase = "countdown"; G.cdEnd = Date.now() + 3000;
  G.players.forEach(p => p.lives = G.settings.lives);
  G.turn = Math.random() < .5 ? 0 : 1;
  G.log = []; G.seen = []; G.used = []; G.winner = null; G.last = null; G.fuseStart = 0; G.promptId = null;
  fb = { text: "", cls: "" };
  hostPush();
}
function hostLog(s){ G.log.unshift(s); G.log = G.log.slice(0, 8); }
function hostTick(){
  if (!isHost || !G) return;
  const now = Date.now();
  if (G.phase === "countdown" && now >= G.cdEnd) { G.phase = "live"; hostNewPrompt(); hostPush(); return; }
  if (G.phase === "popped" && now >= G.popEnd) {
    G.phase = "live"; hostNewPrompt(); G.last = { kind: "newcat", id: now }; hostPush(); return;
  }
  if (G.phase === "live" && now >= G.fuseEnd) {
    const i = G.turn, pl = G.players[i];
    pl.lives--;
    G.last = { kind: "pop", by: i, id: now };
    hostLog(`The ball burst on <b>${esc(pl.name)}</b>. Life lost.`);
    if (pl.lives <= 0) { G.phase = "over"; G.winner = 1 - i; hostLog(`<b>${esc(G.players[1 - i].name)}</b> wins.`); }
    else { G.phase = "popped"; G.popEnd = now + D.POP_PAUSE; G.turn = 1 - i; G.reveal = revealFor(promptOf(G.promptId)); }
    hostPush();
  }
}
function revealFor(p){
  if (!p) return [];
  const used = new Set(G.used.map(u => u.name));
  return entries(p).filter(e => !used.has(e.name)).sort((a, b) => b.tier - a.tier).slice(0, 3).map(e => e.name);
}
function hostGuess(pid, text){
  if (!G || G.phase !== "live") return;
  const i = G.players.findIndex(p => p.pid === pid);
  if (i !== G.turn) return;
  const p = promptOf(G.promptId); if (!p) return;
  const hit = match(p, text);
  if (!hit) { G.last = { kind: "miss", by: i, text, id: Date.now() }; hostPush(); return; }
  if (G.used.some(u => u.name === hit.name)) { G.last = { kind: "repeat", by: i, text, answer: hit.name, id: Date.now() }; hostPush(); return; }
  G.used.push({ name: hit.name, by: i, tier: hit.tier });
  G.last = { kind: "hit", by: i, answer: hit.name, tier: hit.tier, id: Date.now() };
  G.turn = 1 - i;
  const floor = Date.now() + G.settings.minTurn * 1000;   // receiver always gets at least the minimum
  if (G.fuseEnd < floor) G.fuseEnd = floor;
  hostPush();
}

/* ---------- messages ---------- */
function onMsg(m){
  if (!m || typeof m !== "object") return;
  if (isHost) {
    if (m.t === "hello" && m.pid !== myPid) {
      lastPeerAt = performance.now();
      if (G.players.length < 2 && !G.players.some(p => p.pid === m.pid)) {
        G.players.push({ pid: m.pid, name: String(m.name || "Player 2").slice(0, 16), lives: G.settings.lives });
        hostLog(`<b>${esc(G.players[1].name)}</b> joined.`);
      } else if (G.players[1] && G.players[1].pid !== m.pid) { send({ t: "full", to: m.pid }); return; }
      hostPush();
    }
    else if (m.t === "ping") lastPeerAt = performance.now();
    else if (m.t === "guess") { lastPeerAt = performance.now(); hostGuess(m.pid, String(m.text || "").slice(0, 60)); }
    else if (m.t === "typing") { lastPeerAt = performance.now(); peerTyping = String(m.text || "").slice(0, 40); paintTyping(); }
    else if (m.t === "rematch" && G.phase === "over" && G.players.length === 2) hostStart();
    else if (m.t === "bye") { if (["live", "countdown", "popped"].includes(G.phase)) { G.phase = "over"; G.winner = 0; hostLog(`<b>${esc(G.players[1]?.name || "Opponent")}</b> left.`); hostPush(); } }
  } else {
    if (m.t === "state") { lastStateAt = performance.now(); applyState(m.g); }
    else if (m.t === "typing") { peerTyping = String(m.text || "").slice(0, 40); paintTyping(); }
    else if (m.t === "full" && m.to === myPid) { V = { screen: "join", err: "That match already has two players." }; disconnect(); draw(); }
  }
}

/* ---------- applying state (both sides) ---------- */
let lastSeenEvent = 0, prevPrompt = null, prevPhase = null, prevTurn = null;
function applyState(g){
  const now = performance.now();
  fuseStartLocal = now - (g.fuseAge || 0);
  cdEndLocal = now + (g.cdLeft || 0);
  if (!isHost) {
    if (G && g.seq < G.seq) return;
    const same = G && g.seq === G.seq;
    G = g;
    if (same) return;                       // heartbeat: clocks only
  }
  const newPrompt = g.promptId !== prevPrompt; prevPrompt = g.promptId;
  const newPhase = g.phase !== prevPhase; prevPhase = g.phase;
  const passed = prevTurn !== null && g.turn !== prevTurn && !newPhase; prevTurn = g.turn;
  if (newPhase && g.phase === "countdown") fb = { text: "", cls: "" };
  const ev = g.last && g.last.id !== lastSeenEvent ? g.last : null;
  if (ev) { lastSeenEvent = ev.id; feedbackFor(ev); }
  peerTyping = "";
  if (g.turn === meIdx() && (passed || (newPhase && g.phase === "live"))) { try { navigator.vibrate?.(60); } catch(e){} }
  V.screen = g.phase === "lobby" ? (isHost ? "wait" : "joined") : "match";
  draw({ newPrompt, newPhase, passed, ev });
}
function feedbackFor(ev){
  const me = meIdx(), mine = ev.by === me;
  const who = ev.by != null && G.players[ev.by] ? G.players[ev.by].name : "";
  if (ev.kind === "hit") { const t = TIERS[ev.tier] || TIERS[0]; fb = { text: `${mine ? "You" : who}: ${ev.answer} ✓ (${t.name}). Ball passed.`, cls: "good" }; }
  else if (ev.kind === "repeat") fb = { text: mine ? `${ev.answer} has already been said. Go again.` : `${who} repeated ${ev.answer}.`, cls: "bad" };
  else if (ev.kind === "miss") fb = { text: mine ? `"${ev.text}" isn't on the list. Go again.` : `${who} tried "${ev.text}".`, cls: "bad" };
  else if (ev.kind === "pop") fb = { text: mine ? "It burst on you. Life lost." : `It burst on ${who}!`, cls: "bad" };
  else if (ev.kind === "newcat") fb = { text: "New category.", cls: "" };
}

/* ---------- rendering ---------- */
function shareLink(){ const u = new URL(location.href); u.search = ""; u.hash = ""; u.searchParams.set("duel", room); if (LOCAL) u.searchParams.set("local", "1"); return u.toString(); }
function nameField(){ return `<label class="eyebrow" for="dname">Your name</label><input class="dname" id="dname" maxlength="16" value="${esc(myName())}" placeholder="e.g. Mick" autocomplete="nickname" spellcheck="false">`; }
function readName(){
  const el = document.getElementById("dname");
  const n = (el ? el.value : myName()).trim().replace(/\s+/g, " ").slice(0, 16);
  if (n) store.set("tb-name", n);
  return n;
}
const back = `<button class="ghost" type="button" data-act="leave">Back to the daily</button>`;
const RULES_HTML = `<ul class="drules">
  <li>Name a valid answer to pass the ball to your opponent.</li>
  <li>The ball has a hidden fuse. If it bursts while you've got it, you lose a life.</li>
  <li>After a burst, a new category starts and the ball goes to the other player.</li>
  <li>No repeats. Wrong answers cost nothing but time.</li></ul>`;
function settingsHtml(editable){
  const s = G ? G.settings : loadSettings();
  const step = (k, v, lo, hi, unit) => editable
    ? `<div class="stepper"><button type="button" data-set="${k}" data-d="-1" ${v <= lo ? "disabled" : ""} aria-label="Less">−</button><b>${v}${unit}</b><button type="button" data-set="${k}" data-d="1" ${v >= hi ? "disabled" : ""} aria-label="More">+</button></div>`
    : `<div class="stepper ro"><b>${v}${unit}</b></div>`;
  return `<div class="settings"><span class="eyebrow">Match settings${editable ? "" : " (set by the host)"}</span>
    <div class="setrow"><span class="lbl">Lives<small>Each player starts with this many.</small></span>${step("lives", s.lives, D.LIVES_MIN, D.LIVES_MAX, "")}</div>
    <div class="setrow"><span class="lbl">Minimum turn<small>You always get at least this long once the ball reaches you.</small></span>${step("minTurn", s.minTurn, D.MINTURN_MIN, D.MINTURN_MAX, "s")}</div></div>`;
}

function draw(info = {}){
  if (V.screen === "home") {
    sec.innerHTML = `<div class="panel arc">
      <span class="eyebrow">1v1</span>
      <h2>Don't get caught holding it</h2>
      ${RULES_HTML}
      ${nameField()}
      <div class="row"><button class="deploy" type="button" data-act="create">Create match</button></div>
      <div class="row"><input class="dname" id="dcode" maxlength="4" placeholder="Code" style="max-width:120px;text-transform:uppercase"><button class="ghost" type="button" data-act="joincode">Join</button></div>
      ${V.err ? `<p class="err">${esc(V.err)}</p>` : ""}
      <div class="row">${back}</div></div>`;
  }
  else if (V.screen === "join") {
    sec.innerHTML = `<div class="panel arc">
      <span class="eyebrow">1v1 · Match ${esc(room)}</span>
      <h2>You've been challenged</h2>
      ${RULES_HTML}
      ${nameField()}
      <div class="row"><button class="deploy" type="button" data-act="join">Join match</button></div>
      ${V.err ? `<p class="err">${esc(V.err)}</p>` : ""}
      <div class="row">${back}</div></div>`;
  }
  else if (V.screen === "connecting") {
    sec.innerHTML = `<div class="panel arc"><span class="eyebrow">1v1</span><h2>Connecting…</h2><div class="row">${back}</div></div>`;
  }
  else if (V.screen === "wait") {
    const two = G.players.length === 2;
    sec.innerHTML = `<div class="panel arc">
      <span class="eyebrow">1v1 · Your match</span>
      <div class="codebox">${esc(room)}</div>
      <p class="lede">${two ? `<b>${esc(G.players[1].name)}</b> is in. Kick off when you're ready.` : "Send this link to your opponent. Keep this page open."}</p>
      <p class="linkline">${esc(shareLink())}</p>
      <div class="row">${two ? `<button class="deploy" type="button" data-act="start">Kick off</button>` : `<button class="deploy" type="button" data-act="share">Share link</button><span class="muted">Waiting for opponent…</span>`}</div>
      ${settingsHtml(true)}
      <div class="row">${back}</div></div>`;
  }
  else if (V.screen === "joined") {
    sec.innerHTML = `<div class="panel arc">
      <span class="eyebrow">1v1 · Match ${esc(room)}</span>
      <h2>You're in</h2>
      <p class="lede">Playing <b>${esc(G.players[0]?.name || "")}</b>. Waiting for them to kick off…</p>
      ${settingsHtml(false)}
      ${RULES_HTML}
      <div class="row">${back}</div></div>`;
  }
  else if (V.screen === "match") drawMatch(info);
  bindButtons();
}

function lifeIcons(n, max){ return Array.from({ length: max }, (_, i) => LIFE.replace("<svg", `<svg class="${i < n ? "" : "gone"}"`)).join(""); }
function sideOf(i){ const me = meIdx(); return (me === 1 ? i === 1 : i === 0) ? 0 : 1; }   // 0 = left (you), 1 = right
function vsHtml(){
  const me = meIdx(), order = me === 1 ? [1, 0] : [0, 1];
  const card = (i, side) => { const p = G.players[i]; if (!p) return `<div class="pl"></div>`;
    const on = (G.phase === "live" || G.phase === "popped") && G.turn === i;
    return `<div class="pl ${side}${on ? " on" : ""}" id="pl${i}">
      <div class="nm">${esc(p.name)}${i === me ? "<small>YOU</small>" : ""}</div>
      <div class="lives">${lifeIcons(p.lives, G.settings.lives)}</div>
      <div class="typing" id="typ${i}"></div></div>`; };
  return `<div class="vs">${card(order[0], "")}${card(order[1], "right")}</div>`;
}
function drawMatch(info){
  const me = meIdx();
  if (G.phase === "countdown") {
    sec.innerHTML = vsHtml() + `<div class="dcard"><span class="eyebrow">Kick-off in</span><div class="cdbig" id="dcd">3</div><p class="muted" style="text-align:center">${G.turn === me ? "<b>You</b> start with the ball." : `<b>${esc(G.players[G.turn].name)}</b> starts with the ball.`}</p></div>`;
    startRaf(); return;
  }
  if (G.phase === "over") {
    const w = G.players[G.winner];
    sec.innerHTML = vsHtml() + `<div class="dcard">
      <span class="eyebrow">Full time</span>
      <p class="winner">${G.winner === me ? "You win" : esc(w ? w.name : "") + " wins"}</p>
      <ol class="dlog">${G.log.map(l => `<li>${l}</li>`).join("")}</ol>
      <div class="row">${G.players.length === 2 ? `<button class="deploy" type="button" data-act="${isHost ? "start" : "rematch"}">Rematch</button>` : ""}${back}</div></div>`;
    stopRaf(); return;
  }
  // live or popped
  const p = promptOf(G.promptId);
  const myTurn = G.turn === me && G.phase === "live";
  if (!document.getElementById("dguess")) {
    sec.innerHTML = `<div id="dvs"></div>
      <div class="lane" id="dlane"><div class="dball" id="dball">${BIGBALL}</div><div class="holder" id="dholder"></div></div>
      <div class="dcard" id="dcard">
      <span class="eyebrow" id="dtag"></span>
      <h3 id="dq"></h3>
      <form class="dform" id="dform" autocomplete="off"><input id="dguess" type="text" placeholder="Type your answer" spellcheck="false" autocapitalize="off" autocorrect="off" enterkeyhint="send" aria-label="Your answer"><button type="submit">PASS</button></form>
      <p class="dfb" id="dfb"></p>
      <div id="dused"></div>
      <ol class="dlog" id="dlog"></ol>
      <div class="row">${back}</div></div>`;
    const inp = document.getElementById("dguess");
    document.getElementById("dform").onsubmit = e => {
      e.preventDefault();
      const v = inp.value.trim(); if (!v) return;
      if (G.phase !== "live" || G.turn !== meIdx()) { fb = { text: "You haven't got the ball.", cls: "bad" }; paintFb(); return; }
      inp.value = "";
      if (isHost) hostGuess(myPid, v); else send({ t: "guess", pid: myPid, text: v });
    };
    let tt = 0;
    inp.oninput = () => { if (G.turn !== meIdx()) return; clearTimeout(tt); tt = setTimeout(() => send({ t: "typing", text: inp.value }), 80); };
    bindButtons();
  }
  document.getElementById("dvs").innerHTML = vsHtml();
  document.getElementById("dcard").classList.toggle("mine", myTurn);
  document.getElementById("dtag").textContent = p ? `${p.tag || ""} · ${p.a.length} answers` : "";
  const dq = document.getElementById("dq");
  if (dq.textContent !== (p ? p.q : "")) { dq.textContent = p ? p.q : ""; dq.classList.remove("flash"); void dq.offsetWidth; dq.classList.add("flash"); }
  // the ball
  const side = sideOf(G.turn), x = side === 0 ? 22 : 78;
  const ball = document.getElementById("dball"), holder = document.getElementById("dholder"), lane = document.getElementById("dlane");
  lane.querySelector(".dburst")?.remove();
  if (G.phase === "popped") {
    const popSide = sideOf(G.last?.by ?? (1 - G.turn)), px = popSide === 0 ? 22 : 78;
    ball.style.visibility = "hidden";
    lane.insertAdjacentHTML("beforeend", `<div class="dburst" style="left:${px}%">${burstSvg()}</div>`);
    holder.style.opacity = 0;
    const rev = (G.reveal || []).length ? ` Could've said: ${G.reveal.join(", ")}.` : "";
    if (fb.cls === "bad" && rev && !fb.text.includes("Could've")) fb.text += rev;
  } else {
    ball.style.visibility = "";
    ball.style.left = x + "%";
    if (info.passed) { ball.classList.remove("passing"); void ball.offsetWidth; ball.classList.add("passing"); }
    holder.style.left = x + "%"; holder.style.opacity = 1;
    holder.textContent = G.turn === me ? "Your ball" : `${G.players[G.turn].name}'s ball`;
  }
  const inp = document.getElementById("dguess");
  inp.placeholder = myTurn ? "Your ball! Type an answer" : `${G.players[G.turn]?.name || "They"} has the ball…`;
  inp.classList.toggle("waiting", !myTurn);
  if (info.newPrompt && !myTurn) inp.value = "";
  if (myTurn && (info.newPhase || info.passed)) inp.focus({ preventScroll: true });
  paintFb();
  document.getElementById("dused").innerHTML = G.used.length ? `<span class="eyebrow">Said this category</span><div class="used">${G.used.map(u => `<span style="--c:${(TIERS[u.tier] || TIERS[0]).color}">${esc(u.name)}<em>${esc(G.players[u.by]?.name || "")}</em></span>`).join("")}</div>` : "";
  document.getElementById("dlog").innerHTML = G.log.slice(0, 4).map(l => `<li>${l}</li>`).join("");
  if (info.ev && info.ev.kind === "pop" && G.players[info.ev.by]) document.getElementById("pl" + info.ev.by)?.classList.add("flash");
  paintTyping();
  startRaf();
}
function paintFb(){ const el = document.getElementById("dfb"); if (el) { el.textContent = fb.text; el.className = "dfb " + fb.cls; } }
function paintTyping(){
  if (!G) return;
  const other = 1 - meIdx();
  const el = document.getElementById("typ" + other);
  if (el) el.textContent = peerTyping && G.turn === other ? `typing: ${peerTyping}` : "";
}
function frame(){
  const now = performance.now();
  if (G && G.phase === "countdown") {
    const el = document.getElementById("dcd"); if (el) el.textContent = Math.max(1, Math.ceil((cdEndLocal - now) / 1000));
  } else if (G && G.phase === "live") {
    // the ball swells with time since the category started; nobody knows exactly when it goes
    const age = (now - fuseStartLocal) / 1000;
    const ball = document.getElementById("dball");
    if (ball) {
      ball.querySelector(".inflate").style.transform = `scale(${(1 + Math.min(age / D.FUSE_MAX, 1.15) * .85).toFixed(3)})`;
      const st = age < 8 ? 0 : age < 15 ? 1 : age < 22 ? 2 : 3;
      if (!ball.classList.contains("s" + st)) { ball.classList.remove("s0", "s1", "s2", "s3"); ball.classList.add("s" + st); }
    }
  }
  rafH = requestAnimationFrame(frame);
}
function startRaf(){ if (!rafH) rafH = requestAnimationFrame(frame); }
function stopRaf(){ cancelAnimationFrame(rafH); rafH = 0; }

function bindButtons(){
  sec.querySelectorAll("[data-act]").forEach(b => b.onclick = () => act(b.dataset.act));
  sec.querySelectorAll("[data-set]").forEach(b => b.onclick = () => {
    if (!isHost || !G || G.phase !== "lobby") return;
    const k = b.dataset.set, d = +b.dataset.d;
    if (k === "lives") G.settings.lives = clamp(G.settings.lives + d, D.LIVES_MIN, D.LIVES_MAX);
    if (k === "minTurn") G.settings.minTurn = clamp(G.settings.minTurn + d, D.MINTURN_MIN, D.MINTURN_MAX);
    G.players.forEach(p => p.lives = G.settings.lives);
    store.set("tb-duel-settings", G.settings);
    hostPush();
  });
  const dn = document.getElementById("dname");
  if (dn) dn.onkeydown = e => { if (e.key === "Enter") act(V.screen === "join" ? "join" : "create"); };
  const dc = document.getElementById("dcode");
  if (dc) dc.onkeydown = e => { if (e.key === "Enter") act("joincode"); };
}

/* ---------- actions ---------- */
async function act(a){
  if (a === "leave") return closeDuel();
  if (a === "create") {
    const n = readName(); if (!n) { V.err = "Put your name in first."; return draw(); }
    isHost = true; room = code4(); prevPhase = prevPrompt = prevTurn = null;
    const settings = loadSettings();
    G = { seq: 0, phase: "lobby", settings, players: [{ pid: myPid, name: n, lives: settings.lives }], turn: 0, used: [], seen: [], log: [], promptId: null };
    V = { screen: "connecting", err: "" }; draw();
    try { await connect(room, onMsg); } catch (e) { isHost = false; V = { screen: "home", err: e.message }; return draw(); }
    history.replaceState(null, "", shareLink());
    V.screen = "wait"; draw();
    clearInterval(hb); hb = setInterval(() => {
      send({ t: "state", g: snap() });
      if (G.players.length === 2 && lastPeerAt && performance.now() - lastPeerAt > 12000 && ["live", "countdown", "popped"].includes(G.phase)) {
        G.phase = "over"; G.winner = 0; hostLog(`<b>${esc(G.players[1].name)}</b> lost connection.`); hostPush();
      }
    }, 1000);
    clearInterval(tickH); tickH = setInterval(hostTick, 100);
  }
  if (a === "joincode") {
    const c = (document.getElementById("dcode")?.value || "").trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(c)) { V.err = "Codes are four letters."; return draw(); }
    room = c; a = "join";
  }
  if (a === "join") {
    const n = readName(); if (!n) { V.err = "Put your name in first."; return draw(); }
    isHost = false; G = null; prevPhase = prevPrompt = prevTurn = null;
    V = { screen: "connecting", err: "" }; draw();
    try { await connect(room, onMsg); } catch (e) { V = { screen: "join", err: e.message }; return draw(); }
    history.replaceState(null, "", shareLink());
    lastStateAt = performance.now();
    const hello = () => send({ t: "hello", pid: myPid, name: n });
    hello();
    clearInterval(hb); hb = setInterval(() => {
      if (!G) hello(); else send({ t: "ping", pid: myPid });
      if (G && performance.now() - lastStateAt > 10000 && G.phase !== "over") { G.phase = "over"; G.winner = meIdx(); G.log.unshift(`Lost contact with <b>${esc(G.players[0]?.name || "the host")}</b>.`); draw(); }
      if (!G && performance.now() - lastStateAt > 30000) { V = { screen: "join", err: "No one's hosting that match. Check the code, or ask for a fresh link." }; clearInterval(hb); disconnect(); draw(); }
    }, 1000);
  }
  if (a === "start" && isHost && G.players.length === 2) hostStart();
  if (a === "rematch" && !isHost) { send({ t: "rematch", pid: myPid }); fb = { text: "", cls: "" }; }
  if (a === "share") {
    const url = shareLink();
    if (navigator.share) { try { await navigator.share({ title: "Where the Spiders Live · 1v1", text: "1v1 me on Premier League deep cuts", url }); return; } catch (e) { if (e.name === "AbortError") return; } }
    try { await navigator.clipboard.writeText(url); toast("Link copied"); } catch (e) { toast("Copy the link above"); }
  }
}

function openDuel(code){
  document.body.classList.add("duel-on");
  sec.hidden = false;
  if (code) { room = code; V = { screen: "join", err: "" }; } else V = { screen: "home", err: "" };
  draw(); window.scrollTo({ top: 0 });
}
function closeDuel(){
  if (chan && G && ["live", "countdown", "popped"].includes(G.phase)) send({ t: "bye", pid: myPid });
  clearInterval(hb); clearInterval(tickH); stopRaf(); disconnect();
  G = null; isHost = false; fb = { text: "", cls: "" };
  document.body.classList.remove("duel-on"); sec.hidden = true;
  const u = new URL(location.href); u.searchParams.delete("duel"); history.replaceState(null, "", u.toString());
}
window.addEventListener("pagehide", () => { if (chan && G && ["live", "countdown", "popped"].includes(G.phase)) send({ t: "bye", pid: myPid }); });
btn.onclick = () => (document.body.classList.contains("duel-on") ? closeDuel() : openDuel());

const q = new URLSearchParams(location.search).get("duel");
if (q && /^[A-Za-z]{4}$/.test(q)) {
  const wait = () => BANK.length ? openDuel(q.toUpperCase()) : setTimeout(wait, 100);
  wait();
}
})();
