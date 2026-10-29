/* ---------- Versus (2–4 players) ----------
   Hot-potato party game over Supabase Realtime (broadcast only, no tables needed).
   Every answer passes the ball to the next player still in. A wrong answer (or a repeat)
   costs a life. The ball also has a hidden fuse: if it bursts on you, you lose a life
   and a new category starts. Lose all your lives and you're out. Last one standing wins.
   The player who creates the game is the referee: their browser holds the match state,
   judges answers and runs the fuse; everyone else sends answers and draws the state.
   Add ?local=1 to the URL to test with several tabs on one computer (no Supabase). */
(() => {
const D = {
  MAX_PLAYERS: 4,
  LIVES: 2, LIVES_MIN: 1, LIVES_MAX: 5,
  MINTURN: 8, MINTURN_MIN: 3, MINTURN_MAX: 15,   // seconds you're guaranteed after receiving the ball
  FUSE_MAX: 20,                                  // hidden fuse per pass: random between the minimum setting and this many seconds
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
.duel .err{color:var(--danger);margin:0;font-weight:600}
.duel .muted{color:var(--muted);margin:0}
.duel .drules{margin:0;padding:0;list-style:none;display:grid;gap:6px}
.duel .drules li{display:grid;grid-template-columns:18px minmax(0,1fr);gap:6px;align-items:baseline}
.duel .drules li::before{content:"●";color:var(--accent);font-size:10px}
.joinbox{border:2px dashed var(--accent);padding:14px 16px;display:grid;gap:6px;background:#06120b}
.joinbox .jl{font-family:var(--label);font-weight:700;font-size:15px;letter-spacing:.12em;text-transform:uppercase;color:var(--accent)}
.joinbox .jc{font-family:var(--display);font-weight:900;font-size:58px;letter-spacing:.18em;line-height:1;color:var(--fg)}
.joinbox p{margin:0;font-size:15px;color:var(--muted)}
.joinbox .jlink{font-family:var(--label);font-size:14px;word-break:break-all;color:var(--muted)}
.roster{display:grid;gap:6px}
.roster .rp{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:10px;align-items:center;background:var(--bg);border:1px solid var(--line);padding:6px 10px}
.roster .rp .nm{font-family:var(--display);font-weight:800;font-size:22px;text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.roster .rp .tag{font-family:var(--label);font-weight:700;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.roster .rp.me .tag{color:var(--accent)}
.roster .rp.empty{border-style:dashed;opacity:.55;grid-template-columns:44px minmax(0,1fr)}
.roster .rp.empty .dot{width:28px;height:28px;margin:auto;border:2px dashed var(--line);border-radius:50%;animation:dpulse 1.4s ease-in-out infinite}
@keyframes dpulse{50%{opacity:.3}}
.waitline{font-family:var(--label);font-weight:700;font-size:18px;letter-spacing:.04em;margin:0}
.waitline .dots::after{content:"";animation:ddots 1.5s steps(4) infinite}
@keyframes ddots{0%{content:""}25%{content:"."}50%{content:".."}75%{content:"..."}}
.settings{display:grid;gap:8px;border-top:1px solid var(--line);padding-top:14px}
.setrow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center}
.setrow .lbl{font-family:var(--label);font-weight:700;font-size:17px;letter-spacing:.04em;text-transform:uppercase}
.setrow .lbl small{display:block;font-family:var(--body);font-weight:400;font-size:13px;letter-spacing:0;text-transform:none;color:var(--muted)}
.stepper{display:flex;align-items:center;border:2px solid var(--line)}
.stepper button{background:transparent;border:0;width:40px;height:40px;font-family:var(--display);font-weight:900;font-size:24px;color:var(--fg)}
.stepper button:disabled{opacity:.25;cursor:default}
.stepper b{min-width:52px;text-align:center;font-family:var(--display);font-weight:900;font-size:24px;color:var(--accent)}
.stepper.ro{border-color:transparent}
.vs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.pl{background:var(--panel);border:2px solid var(--line);padding:8px 10px;display:flex;flex-direction:column;gap:5px;transition:border-color .25s,background .25s,opacity .25s;opacity:.7;position:relative}
.pl.on{border-color:var(--accent);background:var(--panel-2);opacity:1;box-shadow:0 0 0 3px rgba(255,210,63,.18)}
.pl.out{opacity:.35}
.pl.out::after{content:"OUT";position:absolute;right:10px;bottom:6px;font-family:var(--display);font-weight:900;font-size:20px;color:var(--danger)}
.pl .ptop{display:flex;gap:8px;align-items:center;min-width:0}
.pl .av{width:36px;flex:0 0 36px}
.pl .nm{min-width:0;font-family:var(--display);font-weight:800;font-size:21px;text-transform:uppercase;line-height:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pl .nm small{font-family:var(--label);font-size:12px;color:var(--muted);letter-spacing:.08em;margin-left:5px}
.pl .lives{display:flex;gap:4px;height:18px;flex-wrap:wrap}
.pl .lives svg{width:18px;height:18px}
.pl .lives svg.gone{opacity:.15;filter:grayscale(1)}
.pl .typing{font-size:13px;color:var(--muted);min-height:1.3em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lane{position:relative;height:150px;border:2px solid var(--line);overflow:hidden;
  background:repeating-linear-gradient(90deg,#11301f 0 40px,#0e2a1b 40px 80px)}
.lane::before{content:"";position:absolute;left:50%;top:0;bottom:0;border-left:2px solid rgba(243,241,231,.3)}
.lane::after{content:"";position:absolute;left:50%;top:50%;width:64px;height:64px;margin:-32px 0 0 -32px;border:2px solid rgba(243,241,231,.3);border-radius:50%}
.fusebar{position:absolute;left:0;right:0;bottom:0;height:5px;background:rgba(0,0,0,.35);z-index:1}
.fusebar i{display:block;height:100%;width:0;background:var(--accent)}
.dspi{position:absolute;top:6px;width:68px;margin-left:-34px;z-index:2;transition:opacity .3s}
.dspi.out{opacity:.3}
.dspi .snm{display:block;text-align:center;font-family:var(--label);font-weight:700;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:-2px}
.dspi.on .snm{color:var(--accent)}
.avpick{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;max-width:420px}
.avpick button{background:var(--bg);border:2px solid var(--line);padding:8px 6px 6px;display:flex;flex-direction:column;align-items:center;gap:2px;text-align:center}
.avpick button .spr{width:64px}
.avpick button b{font-family:var(--label);font-weight:700;font-size:16px;letter-spacing:.06em;text-transform:uppercase}
.avpick button small{font-size:12px;color:var(--muted);line-height:1.2}
.avpick button.on{border-color:var(--accent);background:var(--panel-2)}
.avpick button.on b{color:var(--accent)}
.avpick button:not(.on) .spr .f0,.avpick button:not(.on) .spr .f1{animation-play-state:paused}
.dball{position:absolute;top:96px;width:44px;height:44px;margin:-22px 0 0 -22px;z-index:3;transition:left .5s cubic-bezier(.3,1.1,.4,1)}
.dball .inflate{width:100%;height:100%;transition:transform .9s linear;transform-origin:50% 60%}
.dball svg{width:100%;height:100%;display:block;filter:drop-shadow(0 4px 6px rgba(0,0,0,.5))}
.dball.passing svg{animation:dspin .5s linear}
@keyframes dspin{to{transform:rotate(540deg)}}
.dball.s1 .wob{animation:dwob .5s ease-in-out infinite}
.dball.s2 .wob{animation:dwob .28s ease-in-out infinite}
.dball.s3 .wob{animation:dwob .14s ease-in-out infinite}
@keyframes dwob{0%,100%{transform:rotate(-4deg) translate(-1px,0)}50%{transform:rotate(4deg) translate(1px,0)}}
.dball.s3 svg{filter:drop-shadow(0 0 10px rgba(255,82,71,.85))}
.dburst{position:absolute;top:80px;width:140px;height:140px;margin:-70px 0 0 -70px;z-index:4;pointer-events:none}
.dburst .bang{transform-origin:center;transform-box:fill-box;animation:dbang .5s cubic-bezier(.2,1.4,.4,1) both}
@keyframes dbang{from{transform:scale(.2);opacity:0}to{transform:none;opacity:1}}
.dburst .frag{animation:dfrag .8s ease-out both}
@keyframes dfrag{from{transform:translate(0,0) rotate(0);opacity:1}to{transform:translate(var(--dx),var(--dy)) rotate(var(--dr));opacity:0}}
.dcard{background:var(--panel);border:2px solid var(--line);padding:16px 18px;display:flex;flex-direction:column;gap:12px;transition:border-color .25s}
.dcard.mine{border-color:var(--accent)}
.dturn{font-family:var(--display);font-weight:900;font-size:26px;line-height:1;text-transform:uppercase;color:var(--muted);margin:0}
.dcard.mine .dturn{color:var(--accent)}
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
@media (max-width:560px){.pl .nm{font-size:18px}.duel .panel,.dcard{padding:14px}.joinbox .jc{font-size:48px}}
`;
document.head.insertAdjacentHTML("beforeend", `<style>${css}${typeof SPIDERS !== "undefined" ? SPIDERS.CSS : ""}</style>`);
const sec = document.createElement("section");
sec.className = "duel"; sec.id = "duel"; sec.hidden = true;
document.querySelector(".app footer").before(sec);
const nav = document.querySelector(".modes");
const btn = document.createElement("button");
btn.type = "button"; btn.id = "duelBtn"; btn.textContent = "Versus";
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
  return `<svg viewBox="0 0 150 150"><polygon class="bang" points="${pts}" fill="#ff5247" stroke="#ffd23f" stroke-width="3"/><text class="bang" x="75" y="84" text-anchor="middle" font-family="Big Shoulders Display, Impact, sans-serif" font-weight="900" font-size="30" fill="#fff">POP!</text>${frags}</svg>`;
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
  if (!(LEADERBOARD.url && LEADERBOARD.key)) throw new Error("Versus needs the Supabase settings filled in.");
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
let V = { screen: "home", err: "" };   // home | join | connecting | room | match
let G = null;                          // latest match state (host's copy is authoritative)
let isHost = false, room = "";
let fuseStartLocal = 0, cdEndLocal = 0;
let lastStateAt = 0;
const peerSeen = {};                   // host: pid -> last heard (performance.now)
let fb = { text: "", cls: "" };
const typing = {};                     // pid -> text
let hb = 0, tickH = 0, rafH = 0;

const myName = () => (store.get("tb-name") || "").trim();
const meIdx = () => G ? G.players.findIndex(p => p.pid === myPid) : -1;
const promptOf = id => BANK.find(b => b.id === id);
const alive = () => G.players.filter(p => p.lives > 0);
const HAS_SP = typeof SPIDERS !== "undefined";
const AVS = HAS_SP ? SPIDERS.keys : [];
const myAv = () => { const a = store.get("tb-duel-av"); return AVS.includes(a) ? a : (AVS[0] || ""); };
const spr = (av, mood) => HAS_SP ? SPIDERS.svg(AVS.includes(av) ? av : AVS[0], mood) : "";
function loadSettings(){
  const s = store.get("tb-duel-settings") || {};
  return { lives: clamp(+s.lives || D.LIVES, D.LIVES_MIN, D.LIVES_MAX), minTurn: clamp(+s.minTurn || D.MINTURN, D.MINTURN_MIN, D.MINTURN_MAX) };
}
function avPicker(){
  if (!HAS_SP) return "";
  const cur = myAv();
  return `<span class="eyebrow">Pick your spider</span><div class="avpick">${AVS.map(k => `<button type="button" data-av="${k}" class="${k === cur ? "on" : ""}" aria-pressed="${k === cur}">${spr(k, "idle")}<b>${SPIDERS.SPECIES[k].name}</b><small>${SPIDERS.SPECIES[k].blurb}</small></button>`).join("")}</div>`;
}
const whoName = i => i === meIdx() ? "You" : (G.players[i]?.name || "?");

/* ---------- host logic ---------- */
function nextAlive(from){
  const n = G.players.length;
  for (let k = 1; k <= n; k++) { const j = (from + k) % n; if (G.players[j].lives > 0) return j; }
  return from;
}
function hostNewPrompt(){
  const pool = BANK.filter(p => p.a.length >= D.MIN_ANSWERS && !G.seen.includes(p.id));
  const list = pool.length ? pool : BANK.filter(p => p.a.length >= D.MIN_ANSWERS);
  let p = rand(list);
  if (list.length > 1) { let n = 0; while (p.family === G.lastFamily && n++ < 20) p = rand(list); }
  G.promptId = p.id; G.lastFamily = p.family; G.seen.push(p.id); G.used = [];
  hostNewFuse();
}
const fuseMax = s => Math.max(s.minTurn, D.FUSE_MAX);
function hostNewFuse(){     // a fresh hidden fuse every time the ball moves
  G.fuseStart = Date.now();
  G.fuseEnd = G.fuseStart + rnd(G.settings.minTurn, fuseMax(G.settings)) * 1000;
}
function snap(){
  const now = Date.now();
  const { fuseEnd, ...pub } = G;
  return { ...pub, fuseLen: G.fuseEnd && G.fuseStart ? G.fuseEnd - G.fuseStart : 0, fuseAge: G.fuseStart ? now - G.fuseStart : 0, cdLeft: Math.max(0, (G.cdEnd || 0) - now) };
}
function hostPush(){ G.seq++; const out = snap(); send({ t: "state", g: out }); applyState(out); }
function hostStart(){
  G.players = G.players.filter(p => p.pid === myPid || peerSeen[p.pid]);   // drop anyone who's gone
  if (G.players.length < 2) { G.phase = "lobby"; hostPush(); return; }
  G.phase = "countdown"; G.cdEnd = Date.now() + 3000;
  G.players.forEach(p => p.lives = G.settings.lives);
  G.turn = Math.floor(Math.random() * G.players.length);
  G.log = []; G.seen = []; G.used = []; G.winner = null; G.last = null; G.fuseStart = 0; G.promptId = null;
  fb = { text: "", cls: "" };
  hostPush();
}
function hostLog(s){ G.log.unshift(s); G.log = G.log.slice(0, 8); }
function hostLoseLife(i){                // returns true if the game is over
  const pl = G.players[i];
  pl.lives = Math.max(0, pl.lives - 1);
  if (pl.lives === 0) hostLog(`<b>${esc(pl.name)}</b> is out.`);
  const left = alive();
  if (left.length <= 1) {
    G.phase = "over"; G.winner = left.length ? G.players.indexOf(left[0]) : null;
    if (left.length) hostLog(`<b>${esc(left[0].name)}</b> wins.`);
    return true;
  }
  return false;
}
function hostPass(from){
  G.turn = nextAlive(from);
  hostNewFuse();
}
function hostTick(){
  if (!isHost || !G) return;
  const now = Date.now();
  if (G.phase === "countdown" && now >= G.cdEnd) { G.phase = "live"; hostNewPrompt(); hostPush(); return; }
  if (G.phase === "popped" && now >= G.popEnd) {
    G.phase = "live"; hostNewPrompt(); G.last = { kind: "newcat", id: now }; hostPush(); return;
  }
  if (G.phase === "live" && now >= G.fuseEnd) {
    const i = G.turn;
    G.last = { kind: "pop", by: i, id: now, out: false };
    hostLog(`The ball burst on <b>${esc(G.players[i].name)}</b>.`);
    G.reveal = revealFor(promptOf(G.promptId));
    const over = hostLoseLife(i);
    G.last.out = G.players[i].lives === 0;
    if (!over) { G.phase = "popped"; G.popEnd = now + D.POP_PAUSE; G.turn = nextAlive(i); }
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
  const now = Date.now();
  if (hit && !G.used.some(u => u.name === hit.name)) {
    G.used.push({ name: hit.name, by: i, tier: hit.tier });
    G.last = { kind: "hit", by: i, answer: hit.name, tier: hit.tier, id: now };
    hostPass(i);
  } else {
    const repeat = !!hit;
    G.last = { kind: repeat ? "repeat" : "miss", by: i, text, answer: hit ? hit.name : null, id: now };
    hostLog(repeat ? `<b>${esc(G.players[i].name)}</b> repeated ${esc(hit.name)}. Life lost.` : `<b>${esc(G.players[i].name)}</b> said "${esc(text)}". Life lost.`);
    const over = hostLoseLife(i);
    G.last.out = G.players[i].lives === 0;
    if (!over) hostPass(i);
  }
  G.last.to = G.phase === "live" ? G.turn : null;
  hostPush();
}
function hostDrop(i, why){
  const pl = G.players[i]; if (!pl) return;
  if (G.phase === "lobby") { G.players.splice(i, 1); hostLog(`<b>${esc(pl.name)}</b> left.`); hostPush(); return; }
  if (pl.lives > 0 && G.phase !== "over") {
    pl.lives = 0; hostLog(`<b>${esc(pl.name)}</b> ${why}.`);
    const left = alive();
    if (left.length <= 1) { G.phase = "over"; G.winner = left.length ? G.players.indexOf(left[0]) : null; if (left.length) hostLog(`<b>${esc(left[0].name)}</b> wins.`); }
    else if (G.turn === i) hostPass(i);
    hostPush();
  }
}

/* ---------- messages ---------- */
function onMsg(m){
  if (!m || typeof m !== "object") return;
  if (isHost) {
    if (m.pid && m.pid !== myPid) peerSeen[m.pid] = performance.now();
    const idx = G.players.findIndex(p => p.pid === m.pid);
    if (m.t === "hello" && m.pid !== myPid) {
      if (idx >= 0) { hostPush(); return; }
      if (G.phase !== "lobby") { send({ t: "nope", to: m.pid, why: "That game has already kicked off." }); return; }
      if (G.players.length >= D.MAX_PLAYERS) { send({ t: "nope", to: m.pid, why: "That game is full." }); return; }
      G.players.push({ pid: m.pid, name: String(m.name || "Player").slice(0, 16), av: AVS.includes(m.av) ? m.av : AVS[0], lives: G.settings.lives });
      hostLog(`<b>${esc(G.players[G.players.length - 1].name)}</b> joined.`);
      hostPush();
    }
    else if (m.t === "guess") hostGuess(m.pid, String(m.text || "").slice(0, 60));
    else if (m.t === "typing") { typing[m.pid] = String(m.text || "").slice(0, 40); paintTyping(); }
    else if (m.t === "bye" && idx >= 0) hostDrop(idx, "left");
  } else {
    if (m.t === "state") { lastStateAt = performance.now(); applyState(m.g); }
    else if (m.t === "typing" && m.pid !== myPid) { typing[m.pid] = String(m.text || "").slice(0, 40); paintTyping(); }
    else if (m.t === "nope" && m.to === myPid) { V = { screen: "join", err: m.why }; clearInterval(hb); disconnect(); draw(); }
  }
}

/* ---------- applying state (everyone) ---------- */
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
    if (meIdx() < 0 && G.phase !== "lobby") { V = { screen: "join", err: "That game has already kicked off." }; clearInterval(hb); disconnect(); return draw(); }
  }
  const newPrompt = g.promptId !== prevPrompt; prevPrompt = g.promptId;
  const newPhase = g.phase !== prevPhase; prevPhase = g.phase;
  const passed = prevTurn !== null && g.turn !== prevTurn && !newPhase; prevTurn = g.turn;
  if (newPhase && g.phase === "countdown") fb = { text: "", cls: "" };
  const ev = g.last && g.last.id !== lastSeenEvent ? g.last : null;
  if (ev) { lastSeenEvent = ev.id; feedbackFor(ev); }
  if (passed || newPrompt) for (const k in typing) delete typing[k];
  if (g.turn === meIdx() && g.phase === "live" && (passed || newPhase)) { try { navigator.vibrate?.(60); } catch(e){} }
  V.screen = g.phase === "lobby" ? "room" : "match";
  draw({ newPrompt, newPhase, passed, ev });
}
function feedbackFor(ev){
  const me = meIdx(), mine = ev.by === me, who = whoName(ev.by);
  const to = ev.to != null && G.players[ev.to] ? (ev.to === me ? "you" : G.players[ev.to].name) : null;
  const outTxt = ev.out ? (mine ? " You're out." : ` ${who} is out.`) : "";
  if (ev.kind === "hit") { const t = TIERS[ev.tier] || TIERS[0]; fb = { text: `${who}: ${ev.answer} ✓ (${t.name})${to ? `. Ball to ${to}.` : ""}`, cls: "good" }; }
  else if (ev.kind === "repeat") fb = { text: `${who}: ${ev.answer} was already said. Life lost.${outTxt}`, cls: "bad" };
  else if (ev.kind === "miss") fb = { text: `${who}: "${ev.text}" isn't on the list. Life lost.${outTxt}`, cls: "bad" };
  else if (ev.kind === "pop") fb = { text: `${mine ? "It burst on you" : `It burst on ${who}`}! Life lost.${outTxt}`, cls: "bad" };
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
  <li>Answer the question when you've got the ball.</li>
  <li>Every answer passes the ball to the next player. A wrong answer or repeat loses a life.</li>
  <li>The ball has a fuse. If it bursts before you give a correct answer you lose a life. The fuse resets upon passing.</li>
  <li>Lose all your lives and you're out. Last one standing wins.</li></ul>`;
function settingsHtml(editable){
  const s = G ? G.settings : loadSettings();
  const step = (k, v, lo, hi, unit) => editable
    ? `<div class="stepper"><button type="button" data-set="${k}" data-d="-1" ${v <= lo ? "disabled" : ""} aria-label="Less">−</button><b>${v}${unit}</b><button type="button" data-set="${k}" data-d="1" ${v >= hi ? "disabled" : ""} aria-label="More">+</button></div>`
    : `<div class="stepper ro"><b>${v}${unit}</b></div>`;
  return `<div class="settings"><span class="eyebrow">Game settings${editable ? "" : " (set by the host)"}</span>
    <div class="setrow"><span class="lbl">Lives<small>Each player starts with this many.</small></span>${step("lives", s.lives, D.LIVES_MIN, D.LIVES_MAX, "")}</div>
    <div class="setrow"><span class="lbl">Minimum fuse<small>Each fuse is random, from this up to 20 seconds.</small></span>${step("minTurn", s.minTurn, D.MINTURN_MIN, D.MINTURN_MAX, "s")}</div></div>`;
}
function rosterHtml(){
  const me = meIdx();
  const rows = G.players.map((p, i) => `<div class="rp${i === me ? " me" : ""}">${HAS_SP ? `<div>${spr(p.av, "idle")}</div>` : "<div></div>"}<span class="nm">${esc(p.name)}</span><span class="tag">${[i === 0 ? "Host" : "", i === me ? "You" : ""].filter(Boolean).join(" · ")}</span></div>`);
  for (let k = G.players.length; k < D.MAX_PLAYERS; k++) rows.push(`<div class="rp empty"><span class="dot"></span><span class="muted">Open spot</span></div>`);
  return `<div class="roster">${rows.join("")}</div>`;
}

function draw(info = {}){
  if (V.screen === "home") {
    sec.innerHTML = `<div class="panel arc">
      <span class="eyebrow">Versus · 2 to 4 players</span>
      <h2 style="text-transform:none">Quit HOGgin'</h2>
      ${RULES_HTML}
      ${nameField()}
      ${avPicker()}
      <div class="row"><button class="deploy" type="button" data-act="create">Create game</button></div>
      <div class="settings"><span class="eyebrow">Got a join code from a mate?</span>
        <div class="row"><input class="dname" id="dcode" maxlength="4" placeholder="ABCD" autocapitalize="characters" spellcheck="false" style="max-width:130px;text-transform:uppercase;letter-spacing:.15em"><button class="ghost" type="button" data-act="joincode">Join game</button></div></div>
      ${V.err ? `<p class="err">${esc(V.err)}</p>` : ""}
      <div class="row">${back}</div></div>`;
  }
  else if (V.screen === "join") {
    sec.innerHTML = `<div class="panel arc">
      <span class="eyebrow">Versus · Join code ${esc(room)}</span>
      <h2>You've been invited</h2>
      ${RULES_HTML}
      ${nameField()}
      ${avPicker()}
      <div class="row"><button class="deploy" type="button" data-act="join">Join game</button></div>
      ${V.err ? `<p class="err">${esc(V.err)}</p>` : ""}
      <div class="row">${back}</div></div>`;
  }
  else if (V.screen === "connecting") {
    sec.innerHTML = `<div class="panel arc"><span class="eyebrow">Versus</span><h2>Connecting…</h2><div class="row">${back}</div></div>`;
  }
  else if (V.screen === "room") {
    const n = G.players.length, others = G.players.filter(p => p.pid !== myPid).map(p => esc(p.name));
    const vsLine = others.length ? `You vs <b>${others.join("</b>, <b>")}</b>` : "";
    const host = G.players[0];
    sec.innerHTML = `<div class="panel arc">
      <span class="eyebrow">Versus · ${isHost ? "Your game" : `${esc(host?.name || "")}'s game`}</span>
      ${isHost ? `<div class="joinbox"><span class="jl">Join code</span><span class="jc">${esc(room)}</span>
        <p>Send this code to whoever you want to play. They tap <b>Versus</b> and enter it, or just open the link.</p>
        <span class="jlink">${esc(shareLink())}</span>
        <div class="row"><button class="ghost" type="button" data-act="share">Share link</button><button class="ghost" type="button" data-act="copycode">Copy code</button></div></div>`
      : `<p class="lede">Join code <b>${esc(room)}</b>. Want more players? Send them this code.</p>`}
      <span class="eyebrow">Players ${n}/${D.MAX_PLAYERS}</span>
      ${rosterHtml()}
      <p class="waitline">${vsLine ? vsLine + ". " : ""}${isHost
        ? (n < 2 ? `Waiting for players to join<span class="dots"></span>` : `Kick off when everyone's in.`)
        : `Waiting for ${esc(host?.name || "the host")} to kick off<span class="dots"></span>`}</p>
      ${isHost ? `<div class="row"><button class="deploy" type="button" data-act="start" ${n < 2 ? "disabled style=\"opacity:.4;animation:none\"" : ""}>Kick off${n >= 2 ? ` (${n})` : ""}</button></div>` : ""}
      ${settingsHtml(isHost)}
      ${isHost ? "" : RULES_HTML}
      <div class="row">${back}</div></div>`;
  }
  else if (V.screen === "match") drawMatch(info);
  bindButtons();
}

function lifeIcons(n, max){ return Array.from({ length: max }, (_, i) => LIFE.replace("<svg", `<svg class="${i < n ? "" : "gone"}"`)).join(""); }
function moodOf(i){
  const p = G.players[i];
  if (G.phase === "over") return i === G.winner ? "win" : "hurt";
  if (p.lives <= 0) return "hurt";
  if (G.phase === "popped") return G.last && G.last.by === i ? "hurt" : "idle";
  if (G.phase === "live" && G.turn === i) return "nervous";
  return "idle";
}
function cardsHtml(){
  const me = meIdx();
  return `<div class="vs">${G.players.map((p, i) => {
    const on = ((G.phase === "live" || G.phase === "popped") && G.turn === i && p.lives > 0) || (G.phase === "over" && G.winner === i);
    return `<div class="pl${on ? " on" : ""}${p.lives <= 0 && G.phase !== "over" ? " out" : ""}" id="pl${i}">
      <div class="ptop">${HAS_SP ? `<div class="av">${spr(p.av, G.phase === "over" ? moodOf(i) : "idle")}</div>` : ""}<div class="nm">${esc(p.name)}${i === me ? "<small>YOU</small>" : ""}</div></div>
      <div class="lives">${lifeIcons(p.lives, G.settings.lives)}</div>
      <div class="typing" id="typ${i}"></div></div>`; }).join("")}</div>`;
}
const seatX = i => ((i + .5) / G.players.length) * 100;
function drawMatch(info){
  const me = meIdx();
  if (G.phase === "countdown") {
    sec.innerHTML = cardsHtml() + `<div class="dcard"><span class="eyebrow">Kick-off in</span><div class="cdbig" id="dcd">3</div><p class="muted" style="text-align:center">${G.turn === me ? "<b>You</b> start with the ball." : `<b>${esc(G.players[G.turn].name)}</b> starts with the ball.`}</p></div>`;
    startRaf(); return;
  }
  if (G.phase === "over") {
    const w = G.players[G.winner];
    sec.innerHTML = cardsHtml() + `<div class="dcard">
      <span class="eyebrow">Full time</span>
      ${HAS_SP && w ? `<div style="width:120px">${spr(w.av, "win")}</div>` : ""}
      <p class="winner">${G.winner === me ? "You win" : esc(w ? w.name : "Nobody") + " wins"}</p>
      <ol class="dlog">${G.log.map(l => `<li>${l}</li>`).join("")}</ol>
      <div class="row">${isHost ? (G.players.length >= 2 ? `<button class="deploy" type="button" data-act="start">Rematch</button>` : "") : `<span class="muted">Waiting for ${esc(G.players[0]?.name || "the host")} to start a rematch…</span>`}${back}</div></div>`;
    stopRaf(); bindButtons(); return;
  }
  // live or popped
  const p = promptOf(G.promptId);
  const myTurn = G.turn === me && G.phase === "live";
  const iAmOut = me >= 0 && G.players[me].lives <= 0;
  if (!document.getElementById("dguess")) {
    sec.innerHTML = `<div id="dvs"></div>
      <div class="lane" id="dlane">${G.players.map((_, i) => `<div class="dspi" id="dsp${i}" style="left:${seatX(i)}%"></div>`).join("")}<div class="dball" id="dball">${BIGBALL}</div><div class="fusebar"><i id="dfuse"></i></div></div>
      <div class="dcard" id="dcard">
      <p class="dturn" id="dturn"></p>
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
    inp.oninput = () => { if (G.turn !== meIdx()) return; clearTimeout(tt); tt = setTimeout(() => send({ t: "typing", pid: myPid, text: inp.value }), 80); };
    bindButtons();
  }
  document.getElementById("dvs").innerHTML = cardsHtml();
  document.getElementById("dcard").classList.toggle("mine", myTurn);
  const holder = G.players[G.turn];
  document.getElementById("dturn").textContent = G.phase === "popped" ? "Pop!" : iAmOut ? `You're out · ${holder.name}'s ball` : myTurn ? "Your ball" : `${holder.name}'s ball`;
  document.getElementById("dtag").textContent = p ? `${p.tag || ""} · ${p.a.length} answers` : "";
  const dq = document.getElementById("dq");
  if (dq.textContent !== (p ? p.q : "")) { dq.textContent = p ? p.q : ""; dq.classList.remove("flash"); void dq.offsetWidth; dq.classList.add("flash"); }
  // spiders + ball
  paintLaneSpiders();
  const ball = document.getElementById("dball"), lane = document.getElementById("dlane");
  lane.querySelector(".dburst")?.remove();
  if (G.phase === "popped") {
    ball.style.visibility = "hidden";
    const bx = seatX(G.last?.by ?? G.turn);
    lane.insertAdjacentHTML("beforeend", `<div class="dburst" style="left:${bx}%">${burstSvg()}</div>`);
    const rev = (G.reveal || []).length ? ` Could've said: ${G.reveal.join(", ")}.` : "";
    if (rev && !fb.text.includes("Could've")) fb.text += rev;
  } else {
    ball.style.visibility = "";
    ball.style.left = seatX(G.turn) + "%";
    if (info.passed) { ball.classList.remove("passing"); void ball.offsetWidth; ball.classList.add("passing"); }
  }
  const inp = document.getElementById("dguess");
  inp.placeholder = myTurn ? "Your ball! Type an answer" : iAmOut ? "You're out. Watch the rest." : `${holder.name} has the ball…`;
  inp.disabled = iAmOut;
  inp.classList.toggle("waiting", !myTurn);
  if (info.newPrompt && !myTurn) inp.value = "";
  if (myTurn && (info.newPhase || info.passed)) inp.focus({ preventScroll: true });
  paintFb();
  document.getElementById("dused").innerHTML = G.used.length ? `<span class="eyebrow">Said this category</span><div class="used">${G.used.map(u => `<span style="--c:${(TIERS[u.tier] || TIERS[0]).color}">${esc(u.name)}<em>${esc(G.players[u.by]?.name || "")}</em></span>`).join("")}</div>` : "";
  document.getElementById("dlog").innerHTML = G.log.slice(0, 4).map(l => `<li>${l}</li>`).join("");
  if (info.ev && ["pop", "miss", "repeat"].includes(info.ev.kind) && G.players[info.ev.by]) document.getElementById("pl" + info.ev.by)?.classList.add("flash");
  paintTyping();
  startRaf();
}
function paintLaneSpiders(){
  G.players.forEach((p, i) => {
    const el = document.getElementById("dsp" + i); if (!el) return;
    const mood = moodOf(i), key = p.av + mood + (G.turn === i) + p.lives;
    if (el.dataset.k === key) return;
    el.dataset.k = key;
    el.className = "dspi" + (p.lives <= 0 ? " out" : "") + (G.turn === i && p.lives > 0 ? " on" : "");
    el.innerHTML = (HAS_SP ? spr(p.av, mood) : "") + `<span class="snm">${i === meIdx() ? "You" : esc(p.name)}</span>`;
  });
}
function paintFb(){ const el = document.getElementById("dfb"); if (el) { el.textContent = fb.text; el.className = "dfb " + fb.cls; } }
function paintTyping(){
  if (!G) return;
  G.players.forEach((p, i) => {
    const el = document.getElementById("typ" + i); if (!el || p.pid === myPid) return;
    const t = typing[p.pid];
    el.textContent = t && G.turn === i ? `typing: ${t}` : "";
  });
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
      const f = age / fuseMax(G.settings);
      const fz = document.getElementById("dfuse");
      const len = isHost ? (G.fuseEnd || 0) - (G.fuseStart || 0) : G.fuseLen;   // the host's own copy has the real fuse
      if (fz) fz.style.width = (len > 0 ? Math.min(1, age * 1000 / len) * 100 : 0) + "%";
      ball.querySelector(".inflate").style.transform = `scale(${(1 + Math.min(f, 1.1) * .8).toFixed(3)})`;
      const st = f < .35 ? 0 : f < .6 ? 1 : f < .8 ? 2 : 3;
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
  sec.querySelectorAll("[data-av]").forEach(b => b.onclick = () => {
    store.set("tb-duel-av", b.dataset.av);
    sec.querySelectorAll("[data-av]").forEach(x => { const on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-pressed", on); });
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
    G = { seq: 0, phase: "lobby", settings, players: [{ pid: myPid, name: n, av: myAv(), lives: settings.lives }], turn: 0, used: [], seen: [], log: [], promptId: null };
    V = { screen: "connecting", err: "" }; draw();
    try { await connect(room, onMsg); } catch (e) { isHost = false; V = { screen: "home", err: e.message }; return draw(); }
    history.replaceState(null, "", shareLink());
    hostPush();
    clearInterval(hb); hb = setInterval(() => {
      send({ t: "state", g: snap() });
      const t = performance.now();
      G.players.forEach((p, i) => {   // drop anyone we haven't heard from in a while
        if (p.pid === myPid || !peerSeen[p.pid]) return;
        if (t - peerSeen[p.pid] > 12000) { delete peerSeen[p.pid]; hostDrop(i, G.phase === "lobby" ? "left" : "lost connection"); }
      });
    }, 1000);
    clearInterval(tickH); tickH = setInterval(hostTick, 100);
  }
  if (a === "joincode") {
    const c = (document.getElementById("dcode")?.value || "").trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(c)) { V.err = "Join codes are four letters, like ABCD."; return draw(); }
    room = c; a = "join";
  }
  if (a === "join") {
    const n = readName(); if (!n) { V.err = "Put your name in first."; return draw(); }
    isHost = false; G = null; prevPhase = prevPrompt = prevTurn = null;
    V = { screen: "connecting", err: "" }; draw();
    try { await connect(room, onMsg); } catch (e) { V = { screen: "join", err: e.message }; return draw(); }
    history.replaceState(null, "", shareLink());
    lastStateAt = performance.now();
    const hello = () => send({ t: "hello", pid: myPid, name: n, av: myAv() });
    hello();
    clearInterval(hb); hb = setInterval(() => {
      if (!G || meIdx() < 0) hello(); else send({ t: "ping", pid: myPid });
      if (G && performance.now() - lastStateAt > 10000 && G.phase !== "over") { V = { screen: "join", err: `Lost contact with ${G.players[0]?.name || "the host"}. The game has ended.` }; clearInterval(hb); disconnect(); G = null; return draw(); }
      if (!G && performance.now() - lastStateAt > 30000) { V = { screen: "join", err: "No one's hosting a game with that code. Check it, or ask for a fresh one." }; clearInterval(hb); disconnect(); draw(); }
    }, 1000);
  }
  if (a === "start" && isHost) hostStart();
  if (a === "copycode") { try { await navigator.clipboard.writeText(room); toast("Code copied"); } catch (e) { toast(room); } }
  if (a === "share") {
    const url = shareLink();
    if (navigator.share) { try { await navigator.share({ title: "Where the Spiders Live · Versus", text: `Join my game. Code: ${room}`, url }); return; } catch (e) { if (e.name === "AbortError") return; } }
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
  if (chan && G) send({ t: "bye", pid: myPid });
  clearInterval(hb); clearInterval(tickH); stopRaf(); disconnect();
  G = null; isHost = false; fb = { text: "", cls: "" };
  document.body.classList.remove("duel-on"); sec.hidden = true;
  const u = new URL(location.href); u.searchParams.delete("duel"); history.replaceState(null, "", u.toString());
}
window.addEventListener("pagehide", () => { if (chan && G) send({ t: "bye", pid: myPid }); });
btn.onclick = () => (document.body.classList.contains("duel-on") ? closeDuel() : openDuel());

const q = new URLSearchParams(location.search).get("duel");
if (q && /^[A-Za-z]{4}$/.test(q)) {
  const wait = () => BANK.length ? openDuel(q.toUpperCase()) : setTimeout(wait, 100);
  wait();
}
})();
