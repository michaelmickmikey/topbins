/* ---------- 1v1 duel ----------
   Online head-to-head over Supabase Realtime (broadcast only, no tables needed).
   The player who creates the room is the referee: their browser holds the match
   state, judges answers and runs the clocks; the other player sends guesses and
   draws whatever state arrives. Add ?local=1 to the URL to test with two tabs
   on one computer (no Supabase involved). */
(() => {
const D = {
  LIVES: 2,
  TURN_MIN: 8, TURN_MAX: 15,      // seconds per turn, random each turn
  CAT_MIN: 15, CAT_MAX: 30,       // seconds before the category changes
  MIN_ANSWERS: 12,                // only use prompts with at least this many answers
  WRONG_COSTS_LIFE: false,        // false: wrong answers cost nothing but time
  SB_JS: "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.76.1/dist/umd/supabase.js",
};
const LOCAL = new URLSearchParams(location.search).has("local");
const myPid = (() => { try { if (LOCAL) throw 0; return playerId(); } catch(e) { return Math.random().toString(36).slice(2); } })();
const rnd = (a,b) => a + Math.random()*(b-a);
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
.duel .linkline{font-family:var(--label);font-size:15px;color:var(--muted);word-break:break-all}
.duel .err{color:var(--danger);margin:0;font-weight:600}
.duel .muted{color:var(--muted);margin:0}
.vs{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:10px;align-items:stretch}
.pl{background:var(--panel);border:2px solid var(--line);padding:12px 14px;display:flex;flex-direction:column;gap:6px;transition:border-color .2s,background .2s}
.pl.on{border-color:var(--accent);background:var(--panel-2)}
.pl .nm{font-family:var(--display);font-weight:800;font-size:24px;text-transform:uppercase;line-height:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pl .nm small{font-family:var(--label);font-size:13px;color:var(--muted);letter-spacing:.08em;margin-left:6px}
.pl .lives{display:flex;gap:6px;height:22px}
.pl .lives svg{width:22px;height:22px}
.pl .lives svg.gone{opacity:.18;filter:grayscale(1)}
.pl .typing{font-size:15px;color:var(--muted);min-height:1.3em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vs .x{align-self:center;font-family:var(--display);font-weight:900;font-size:26px;color:var(--muted)}
.pl.right{text-align:right}.pl.right .lives{justify-content:flex-end}
.dcard{background:var(--panel);border:2px solid var(--line);padding:18px 20px;display:flex;flex-direction:column;gap:12px}
.dcard .catrow{display:flex;justify-content:space-between;gap:10px;align-items:center}
.catbar{height:4px;background:#06120b;flex:1;max-width:160px}
.catbar i{display:block;height:100%;background:var(--muted)}
.dcard h3{font-family:var(--display);font-weight:800;font-size:clamp(26px,4.4vw,38px);line-height:1;margin:0;text-wrap:balance}
.turnline{display:flex;align-items:center;gap:12px}
.turnline .who{font-family:var(--label);font-weight:700;font-size:18px;letter-spacing:.06em;text-transform:uppercase;flex:1}
.turnline .who.me{color:var(--accent)}
.tclock{font-family:var(--display);font-weight:900;font-size:44px;line-height:1;font-variant-numeric:tabular-nums;min-width:2.2ch;text-align:right}
.tclock.low{color:var(--danger)}
.tbar2{height:8px;background:#06120b;border:1px solid var(--line)}
.tbar2 i{display:block;height:100%;background:var(--accent)}
.tbar2 i.low{background:var(--danger)}
.dform{display:flex;gap:8px}
.dform input{flex:1;min-width:0;background:#06120b;border:2px solid var(--line);color:var(--fg);font-size:19px;padding:12px 14px}
.dform input.waiting{opacity:.55}
.dform button{background:var(--accent);color:var(--accent-ink);border:0;padding:0 22px;font-family:var(--display);font-weight:900;font-size:24px}
.dform button:disabled{opacity:.4}
.dfb{margin:0;min-height:1.45em;font-weight:600}
.dfb.bad{color:var(--danger)}.dfb.good{color:var(--ok)}
.used{display:flex;flex-wrap:wrap;gap:6px}
.used span{border-left:4px solid var(--c);background:var(--bg);padding:3px 8px;font-family:var(--label);font-weight:600;font-size:15px}
.used span em{font-style:normal;color:var(--muted);margin-left:5px;font-size:13px}
.dlog{margin:0;padding:0;list-style:none;display:grid;gap:4px;font-size:15px;color:var(--muted)}
.dlog b{color:var(--fg)}
.cdbig{font-family:var(--display);font-weight:900;font-size:120px;line-height:1;color:var(--accent);text-align:center}
.winner{font-family:var(--display);font-weight:900;font-size:clamp(44px,9vw,80px);line-height:.9;color:var(--accent);text-transform:uppercase;margin:0}
.flash{animation:dflash .5s ease-out}
@keyframes dflash{from{background:rgba(255,82,71,.35)}to{background:transparent}}
@media (max-width:560px){.pl .nm{font-size:19px}.tclock{font-size:36px}.duel .panel,.dcard{padding:16px}}
`;
document.head.insertAdjacentHTML("beforeend", `<style>${css}</style>`);
const sec = document.createElement("section");
sec.className = "duel"; sec.id = "duel"; sec.hidden = true;
document.querySelector(".app footer").before(sec);
const nav = document.querySelector(".modes");
const btn = document.createElement("button");
btn.type = "button"; btn.id = "duelBtn"; btn.textContent = "1v1";
nav.prepend(btn);
const LIFE = `<svg viewBox="-12 -12 24 24">${typeof BALL!=="undefined"?BALL:'<circle r="10" fill="#fff"/>'}</svg>`;

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
    const bc = new BroadcastChannel("spiders-duel-"+code);
    bc.onmessage = e => onMsg(e.data);
    chan = { send: m => bc.postMessage(m), close: () => bc.close() };
    return;
  }
  if (!(LEADERBOARD.url && LEADERBOARD.key)) throw new Error("1v1 needs the Supabase settings filled in.");
  await loadSb();
  sbClient = sbClient || window.supabase.createClient(LEADERBOARD.url, LEADERBOARD.key, { realtime: { params: { eventsPerSecond: 20 } } });
  const ch = sbClient.channel("spiders-duel-"+code, { config: { broadcast: { self: false, ack: false } } });
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
let V = { screen: "home", err: "" };   // home | wait | join | match
let G = null;                          // latest match state (host's copy is authoritative)
let isHost = false, room = "";
let deadlines = { turn: 0, cat: 0 };   // local performance.now() deadlines
let lastStateAt = 0, lastPeerAt = 0;
let fb = { text: "", cls: "" };
let peerTyping = "";
let hb = 0, tickH = 0, rafH = 0;

const myName = () => (store.get("tb-name") || "").trim();
const meIdx = () => G ? G.players.findIndex(p => p.pid === myPid) : -1;
const promptOf = id => BANK.find(b => b.id === id);

/* ---------- host logic ---------- */
function hostNewPrompt(){
  const pool = BANK.filter(p => p.a.length >= D.MIN_ANSWERS && !G.seen.includes(p.id));
  const list = pool.length ? pool : BANK.filter(p => p.a.length >= D.MIN_ANSWERS);
  let p = rand(list);
  if (list.length > 1) { let n=0; while (p.family === G.lastFamily && n++ < 20) p = rand(list); }
  G.promptId = p.id; G.lastFamily = p.family; G.seen.push(p.id); G.used = [];
  G.catLen = rnd(D.CAT_MIN, D.CAT_MAX) * 1000; G.catEnd = Date.now() + G.catLen;
}
function hostNewTurn(){
  G.turnLen = Math.round(rnd(D.TURN_MIN, D.TURN_MAX)) * 1000;
  G.turnEnd = Date.now() + G.turnLen;
}
function snap(){
  const now = Date.now();
  return { ...G, turnLeft: Math.max(0, (G.turnEnd || 0) - now), catLeft: Math.max(0, (G.catEnd || 0) - now), cdLeft: Math.max(0, (G.cdEnd || 0) - now) };
}
function hostPush(){
  G.seq++;
  const out = snap();
  send({ t: "state", g: out });
  applyState(out);
}
function hostStart(){
  G.phase = "countdown"; G.cdEnd = Date.now() + 3000;
  G.players.forEach(p => p.lives = D.LIVES);
  G.turn = Math.random() < .5 ? 0 : 1;
  G.log = []; G.seen = []; G.used = []; G.winner = null; G.last = null;
  fb = { text: "", cls: "" };
  hostPush();
}
function hostLog(s){ G.log.unshift(s); G.log = G.log.slice(0, 8); }
function hostLoseLife(i, why){
  const pl = G.players[i];
  pl.lives--;
  G.last = { kind: why, by: i, id: Date.now() };
  hostLog(why === "timeout" ? `<b>${esc(pl.name)}</b> ran out of time. Life lost.` : `<b>${esc(pl.name)}</b> missed. Life lost.`);
  if (pl.lives <= 0) { G.phase = "over"; G.winner = 1 - i; hostLog(`<b>${esc(G.players[1-i].name)}</b> wins.`); return; }
  G.turn = 1 - i; hostNewTurn();
}
function hostTick(){
  if (!isHost || !G) return;
  const now = Date.now();
  if (G.phase === "countdown" && now >= G.cdEnd) {
    G.phase = "live"; hostNewPrompt(); hostNewTurn(); hostPush(); return;
  }
  if (G.phase !== "live") return;
  if (now >= G.turnEnd) { hostLoseLife(G.turn, "timeout"); if (G.phase === "live" && now >= G.catEnd) { hostNewPrompt(); } hostPush(); return; }
  if (now >= G.catEnd) {
    const old = promptOf(G.promptId);
    hostNewPrompt(); hostNewTurn();
    G.last = { kind: "newcat", id: now };
    hostLog(`New category.` + (old ? ` Last one: <i>${esc(old.q)}</i>` : ""));
    hostPush();
  }
}
function hostGuess(pid, text){
  if (!G || G.phase !== "live") return;
  const i = G.players.findIndex(p => p.pid === pid);
  if (i !== G.turn) return;
  const p = promptOf(G.promptId); if (!p) return;
  const hit = match(p, text);
  if (!hit) {
    if (D.WRONG_COSTS_LIFE) { hostLoseLife(i, "miss"); hostPush(); return; }
    G.last = { kind: "miss", by: i, text, id: Date.now() };
    hostPush(); return;
  }
  if (G.used.some(u => u.name === hit.name)) {
    G.last = { kind: "repeat", by: i, text, answer: hit.name, id: Date.now() };
    hostPush(); return;
  }
  G.used.push({ name: hit.name, by: i, tier: hit.tier });
  G.last = { kind: "hit", by: i, answer: hit.name, tier: hit.tier, id: Date.now() };
  G.turn = 1 - i; hostNewTurn();
  hostPush();
}

/* ---------- messages ---------- */
function onMsg(m){
  if (!m || typeof m !== "object") return;
  if (isHost) {
    if (m.t === "hello" && m.pid !== myPid) {
      lastPeerAt = performance.now();
      if (G.players.length < 2 && !G.players.some(p => p.pid === m.pid)) {
        G.players.push({ pid: m.pid, name: String(m.name || "Player 2").slice(0, 16), lives: D.LIVES });
        hostLog(`<b>${esc(G.players[1].name)}</b> joined.`);
      } else if (G.players[1] && G.players[1].pid !== m.pid) { send({ t: "full", to: m.pid }); return; }
      hostPush();
    }
    else if (m.t === "ping") lastPeerAt = performance.now();
    else if (m.t === "guess") { lastPeerAt = performance.now(); hostGuess(m.pid, String(m.text || "").slice(0, 60)); }
    else if (m.t === "typing") { lastPeerAt = performance.now(); peerTyping = String(m.text || "").slice(0, 40); paintTyping(); }
    else if (m.t === "rematch" && G.phase === "over" && G.players.length === 2) hostStart();
    else if (m.t === "bye") { if (G.phase === "live" || G.phase === "countdown") { G.phase = "over"; G.winner = 0; hostLog(`<b>${esc(G.players[1]?.name || "Opponent")}</b> left.`); hostPush(); } }
  } else {
    if (m.t === "state") { lastStateAt = performance.now(); applyState(m.g); }
    else if (m.t === "typing") { peerTyping = String(m.text || "").slice(0, 40); paintTyping(); }
    else if (m.t === "full" && m.to === myPid) { V = { screen: "join", err: "That match already has two players." }; disconnect(); draw(); }
  }
}

/* ---------- applying state (both sides) ---------- */
let lastSeenEvent = 0, prevPrompt = null, prevPhase = null;
function applyState(g){
  const now = performance.now();
  deadlines.turn = now + (g.turnLeft || 0);
  deadlines.cat = now + (g.catLeft || 0);
  deadlines.cd = now + (g.cdLeft || 0);
  if (!isHost) {
    if (G && g.seq < G.seq) return;
    const same = G && g.seq === G.seq;
    G = g;
    if (same) return;                       // heartbeat: clocks only
  }
  const newPrompt = g.promptId !== prevPrompt; prevPrompt = g.promptId;
  const newPhase = g.phase !== prevPhase; prevPhase = g.phase;
  if (newPhase && g.phase === "countdown") fb = { text: "", cls: "" };
  const ev = g.last && g.last.id !== lastSeenEvent ? g.last : null;
  if (ev) lastSeenEvent = ev.id;
  if (ev) feedbackFor(ev);
  peerTyping = "";
  V.screen = g.phase === "lobby" ? (isHost ? "wait" : "joined") : "match";
  draw({ newPrompt, newPhase, ev });
}
function feedbackFor(ev){
  const me = meIdx(), mine = ev.by === me;
  const who = ev.by != null && G.players[ev.by] ? G.players[ev.by].name : "";
  if (ev.kind === "hit") { const t = TIERS[ev.tier] || TIERS[0]; fb = { text: `${mine ? "You" : who}: ${ev.answer} ✓ (${t.name})`, cls: "good" }; }
  else if (ev.kind === "repeat") fb = { text: mine ? `${ev.answer} has already been said. Go again.` : `${who} repeated ${ev.answer}.`, cls: "bad" };
  else if (ev.kind === "miss") fb = { text: mine ? `"${ev.text}" isn't on the list. Go again.` : `${who} tried "${ev.text}".`, cls: "bad" };
  else if (ev.kind === "timeout") fb = { text: mine ? "Out of time. You lost a life." : `${who} ran out of time.`, cls: "bad" };
  else if (ev.kind === "newcat") fb = { text: "New category!", cls: "" };
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

function draw(info = {}){
  if (V.screen === "home") {
    sec.innerHTML = `<div class="panel arc">
      <span class="eyebrow">1v1</span>
      <h2>Head to head</h2>
      <p class="lede">Take turns naming answers. ${D.LIVES} lives each. Your turn clock is ${D.TURN_MIN}–${D.TURN_MAX} seconds, and it's random every time. Run out and you lose a life. No repeats. The category changes every ${D.CAT_MIN}–${D.CAT_MAX} seconds.</p>
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
      <p class="lede">${two ? `<b>${esc(G.players[1].name)}</b> is in. Kick off when you're ready.` : "Send this link to your opponent. This page has to stay open."}</p>
      <p class="linkline" id="dlink">${esc(shareLink())}</p>
      <div class="row">${two ? `<button class="deploy" type="button" data-act="start">Kick off</button>` : `<button class="deploy" type="button" data-act="share">Share link</button><span class="muted">Waiting for opponent…</span>`}</div>
      <div class="row">${back}</div></div>`;
  }
  else if (V.screen === "joined") {
    sec.innerHTML = `<div class="panel arc">
      <span class="eyebrow">1v1 · Match ${esc(room)}</span>
      <h2>You're in</h2>
      <p class="lede">Playing <b>${esc(G.players[0]?.name || "")}</b>. Waiting for them to kick off…</p>
      <div class="row">${back}</div></div>`;
  }
  else if (V.screen === "match") drawMatch(info);
  bindButtons();
}

function lifeIcons(n){ return Array.from({ length: D.LIVES }, (_, i) => LIFE.replace("<svg", `<svg class="${i < n ? "" : "gone"}"`)).join(""); }
function drawMatch(info){
  const me = meIdx();
  const order = me === 1 ? [1, 0] : [0, 1];
  const pcard = (i, side) => { const p = G.players[i]; if (!p) return `<div class="pl"></div>`;
    return `<div class="pl ${side}${G.phase === "live" && G.turn === i ? " on" : ""}" id="pl${i}">
      <div class="nm">${esc(p.name)}${i === me ? "<small>YOU</small>" : ""}</div>
      <div class="lives">${lifeIcons(p.lives)}</div>
      <div class="typing" id="typ${i}"></div></div>`; };
  const vs = `<div class="vs">${pcard(order[0], "")}<div class="x">V</div>${pcard(order[1], "right")}</div>`;
  if (G.phase === "countdown") {
    sec.innerHTML = vs + `<div class="dcard"><span class="eyebrow">Kick-off in</span><div class="cdbig" id="dcd">3</div><p class="muted" style="text-align:center"><b>${esc(G.players[G.turn].name)}</b> goes first.</p></div>`;
    startRaf(); return;
  }
  if (G.phase === "over") {
    const w = G.players[G.winner];
    sec.innerHTML = vs + `<div class="dcard">
      <span class="eyebrow">Full time</span>
      <p class="winner">${G.winner === me ? "You win" : esc(w ? w.name : "") + " wins"}</p>
      <ol class="dlog">${G.log.map(l => `<li>${l}</li>`).join("")}</ol>
      <div class="row">${G.players.length === 2 ? (isHost ? `<button class="deploy" type="button" data-act="start">Rematch</button>` : `<button class="deploy" type="button" data-act="rematch">Rematch</button>`) : ""}${back}</div></div>`;
    stopRaf(); return;
  }
  const p = promptOf(G.promptId);
  const myTurn = G.turn === me;
  if (info.newPhase || !document.getElementById("dguess")) {
    sec.innerHTML = `<div id="dvs"></div><div class="dcard">
      <div class="catrow"><span class="eyebrow" id="dtag"></span><div class="catbar" title="Category clock"><i id="dcat"></i></div></div>
      <h3 id="dq"></h3>
      <div class="turnline"><span class="who" id="dwho"></span><span class="tclock" id="dclock"></span></div>
      <div class="tbar2"><i id="dtbar"></i></div>
      <form class="dform" id="dform" autocomplete="off"><input id="dguess" type="text" placeholder="Type your answer" spellcheck="false" autocapitalize="off" autocorrect="off" aria-label="Your answer"><button type="submit" id="dshoot">SHOOT</button></form>
      <p class="dfb" id="dfb"></p>
      <div id="dused"></div>
      <ol class="dlog" id="dlog"></ol>
      <div class="row">${back}</div></div>`;
    const inp = document.getElementById("dguess");
    document.getElementById("dform").onsubmit = e => {
      e.preventDefault();
      const v = inp.value.trim(); if (!v) return;
      if (G.turn !== meIdx()) { fb = { text: "Not your turn yet.", cls: "bad" }; paintFb(); return; }
      inp.value = "";
      if (isHost) hostGuess(myPid, v); else send({ t: "guess", pid: myPid, text: v });
    };
    let tt = 0;
    inp.oninput = () => { if (G.turn !== meIdx()) return; clearTimeout(tt); tt = setTimeout(() => send({ t: "typing", text: inp.value }), 80); };
    bindButtons();
  }
  document.getElementById("dvs").outerHTML = `<div id="dvs">${vs}</div>`;
  document.getElementById("dtag").textContent = `${p ? p.tag || "" : ""} · ${p ? p.a.length : 0} answers`;
  const dq = document.getElementById("dq");
  if (dq.textContent !== (p ? p.q : "")) { dq.textContent = p ? p.q : ""; dq.classList.remove("flash"); void dq.offsetWidth; if (!info.newPhase) dq.classList.add("flash"); }
  const who = document.getElementById("dwho");
  who.textContent = myTurn ? "Your turn" : `${G.players[G.turn].name}'s turn`; who.classList.toggle("me", myTurn);
  const inp = document.getElementById("dguess");
  inp.placeholder = myTurn ? "Type your answer" : "Wait for your turn";
  inp.classList.toggle("waiting", !myTurn);
  if (info.newPrompt && !myTurn) inp.value = "";
  if (myTurn && info.newPhase) inp.focus({ preventScroll: true });
  paintFb();
  document.getElementById("dused").innerHTML = G.used.length ? `<span class="eyebrow">Said this category</span><div class="used">${G.used.map(u => `<span style="--c:${(TIERS[u.tier] || TIERS[0]).color}">${esc(u.name)}<em>${esc(G.players[u.by]?.name || "")}</em></span>`).join("")}</div>` : "";
  document.getElementById("dlog").innerHTML = G.log.slice(0, 4).map(l => `<li>${l}</li>`).join("");
  if (info.ev && (info.ev.kind === "timeout" || info.ev.kind === "miss") && G.players[info.ev.by]) document.getElementById("pl" + info.ev.by)?.classList.add("flash");
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
    const el = document.getElementById("dcd"); if (el) el.textContent = Math.max(1, Math.ceil((deadlines.cd - now) / 1000));
  } else if (G && G.phase === "live") {
    const left = Math.max(0, deadlines.turn - now);
    const c = document.getElementById("dclock"), b = document.getElementById("dtbar"), k = document.getElementById("dcat");
    const low = left < 3000;
    if (c) { c.textContent = (left / 1000).toFixed(1); c.classList.toggle("low", low); }
    if (b) { b.style.width = (left / (G.turnLen || 1) * 100) + "%"; b.classList.toggle("low", low); }
    if (k) k.style.width = (Math.max(0, deadlines.cat - now) / (G.catLen || 1) * 100) + "%";
  }
  rafH = requestAnimationFrame(frame);
}
function startRaf(){ if (!rafH) rafH = requestAnimationFrame(frame); }
function stopRaf(){ cancelAnimationFrame(rafH); rafH = 0; }

function bindButtons(){
  sec.querySelectorAll("[data-act]").forEach(b => b.onclick = () => act(b.dataset.act));
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
    isHost = true; room = code4();
    G = { seq: 0, phase: "lobby", players: [{ pid: myPid, name: n, lives: D.LIVES }], turn: 0, used: [], seen: [], log: [], promptId: null };
    V = { screen: "connecting", err: "" }; draw();
    try { await connect(room, onMsg); } catch (e) { isHost = false; V = { screen: "home", err: e.message }; return draw(); }
    history.replaceState(null, "", shareLink());
    V.screen = "wait"; draw();
    clearInterval(hb); hb = setInterval(() => { send({ t: "state", g: snap() });
      if (G.players.length === 2 && lastPeerAt && performance.now() - lastPeerAt > 12000 && (G.phase === "live" || G.phase === "countdown")) { G.phase = "over"; G.winner = 0; hostLog(`<b>${esc(G.players[1].name)}</b> lost connection.`); hostPush(); }
    }, 1000);
    clearInterval(tickH); tickH = setInterval(hostTick, 100);
  }
  if (a === "joincode") {
    const c = (document.getElementById("dcode")?.value || "").trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(c)) { V.err = "Codes are four letters."; return draw(); }
    room = c; a = "join";
  }
  if (a === "join") {
    const n = readName(); if (!n) { V.err = "Put your name in first."; V.screen = V.screen === "home" ? "home" : "join"; return draw(); }
    isHost = false; G = null; prevPrompt = null;
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
  if (chan && (G?.phase === "live" || G?.phase === "countdown")) send({ t: "bye", pid: myPid });
  clearInterval(hb); clearInterval(tickH); stopRaf(); disconnect();
  G = null; isHost = false; fb = { text: "", cls: "" };
  document.body.classList.remove("duel-on"); sec.hidden = true;
  const u = new URL(location.href); u.searchParams.delete("duel"); history.replaceState(null, "", u.toString());
}
window.addEventListener("pagehide", () => { if (chan && G && (G.phase === "live" || G.phase === "countdown")) send({ t: "bye", pid: myPid }); });
btn.onclick = () => (document.body.classList.contains("duel-on") ? closeDuel() : openDuel());

const q = new URLSearchParams(location.search).get("duel");
if (q && /^[A-Za-z]{4}$/.test(q)) {
  const wait = () => BANK.length ? openDuel(q.toUpperCase()) : setTimeout(wait, 100);
  wait();
}
})();
