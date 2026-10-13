// Injected at deploy time by deploy-term.py (JSON-encoded bridge-share.py).
const BRIDGE_PY = __BRIDGE_PY_JSON__;

const GROUPS = [["PAX", 0, ["battle-sim","formations","morale","map-render","crowd","hud","economy","assets"]],
                ["DEL", 8, []], ["MILO", 16, []], ["MUTE", 24, []]];

const PAGE = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>crew terminals — 32 live</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css">
<script src="https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js"><\/script>
<style>
html,body{margin:0;padding:0;background:#0d0d12;height:100%;overflow:hidden}
#bar{background:#1a1a24;color:#c8c8d4;font-family:monospace;font-size:12px;padding:6px 10px;display:flex;justify-content:space-between}
#bar .live{color:#7ee787}
.grid{display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:repeat(8,1fr);gap:4px;padding:4px;height:calc(100% - 33px);box-sizing:border-box}
.pane{background:#000;border:1px solid #2a2a3a;border-radius:4px;overflow:hidden;position:relative;min-height:0}
.pane .tag{position:absolute;top:2px;left:6px;z-index:5;font-family:monospace;font-size:10px;color:#7ee787;background:rgba(0,0,0,.6);padding:0 4px;border-radius:3px;pointer-events:none}
.pane.waiting .tag{color:#888}
#gate{position:fixed;inset:0;background:#0d0d12;display:flex;align-items:center;justify-content:center;z-index:50}
#gate div{font-family:monospace;color:#c8c8d4;text-align:center}
#gate input{background:#1a1a24;border:1px solid #3a3a4a;color:#fff;font-family:monospace;font-size:16px;padding:8px 12px;border-radius:4px;margin-top:10px}
</style></head>
<body>
<div id="bar"><span>crew terminals — 32 live (zoom out to see all)</span><span class="live" id="st">locked</span></div>
<div class="grid" id="g"></div>
<div id="gate"><div>Enter terminal password<br><input type="password" id="pw" autocomplete="off"><br><span id="ge" style="color:#f66"></span></div></div>
<script>
const GROUPS=${JSON.stringify(GROUPS)};
const WS_BASE=(location.protocol==="https:"?"wss://":"ws://")+location.host;
let PASS=null;
const terms=[];
function b64e(s){const b=new TextEncoder().encode(s);let r="";for(let i=0;i<b.length;i++)r+=String.fromCharCode(b[i]);return btoa(r);}
function b64d(b){return new TextDecoder().decode(Uint8Array.from(atob(b),c=>c.charCodeAt(0)));}
function gname(gc){for(const [n,off] of GROUPS){if(gc>off&&gc<=off+8)return n;}return "?";}
function glabel(gc){for(const [n,off,tasks] of GROUPS){if(gc>off&&gc<=off+8){const t=tasks[gc-off-1];return n+"-"+(gc-off)+(t?" "+t:"");}}return "ch"+gc;}
function sendResize(T){try{T.fit.fit();T.ws.send(JSON.stringify({resize:[T.term.cols,T.term.rows]}));}catch(e){}}
function connect(){
  const g=document.getElementById("g"); g.innerHTML=""; terms.length=0;
  let up=0;
  document.getElementById("st").textContent="connecting…";
  for(let gc=1;gc<=32;gc++){
    const pane=document.createElement("div"); pane.className="pane waiting";
    const tag=document.createElement("div"); tag.className="tag"; tag.textContent=glabel(gc)+" · waiting";
    pane.appendChild(tag); g.appendChild(pane);
    const term=new Terminal({fontSize:9,theme:{background:"#000000"}});
    const fit=new FitAddon.FitAddon();
    term.loadAddon(fit); term.open(pane); fit.fit();
    const ws=new WebSocket(WS_BASE+"/term");
    const T={term,fit,ws,chan:gc,open:false,tag,pane};
    terms.push(T);
    ws.onopen=()=>{ws.send(JSON.stringify({auth:PASS,chan:gc}));};
    ws.onmessage=e=>{
      const m=JSON.parse(e.data);
      if(m.err){document.getElementById("ge").textContent=m.err;try{ws.close();}catch(x){}return;}
      if(m.ready){T.open=true;T.pane.classList.remove("waiting");T.tag.textContent=glabel(gc);
        sendResize(T);ws.send(JSON.stringify({snapshot:true}));
        document.getElementById("st").textContent="● live ("+(++up)+"/32)";return;}
      if(m.data)term.write(b64d(m.data));
    };
    ws.onclose=()=>{if(T.open){term.writeln("\\r\\n\\x1b[31m— disconnected —\\x1b[0m");T.pane.classList.add("waiting");T.tag.textContent=glabel(gc)+" · waiting";}};
    term.onData(d=>{if(ws.readyState===1)ws.send(JSON.stringify({data:b64e(d)}));});
  }
  window.onresize=()=>{terms.forEach(T=>{try{sendResize(T);}catch(e){}});};
}
document.getElementById("pw").addEventListener("keydown",e=>{
  if(e.key==="Enter"){PASS=e.target.value;document.getElementById("gate").style.display="none";connect();}
});
setTimeout(()=>document.getElementById("pw").focus(),300);
<\/script></body></html>`;

export class TermStore {
  constructor(state, env) {
    this.state = state;
    this.pass = env.TERM_PASS || "";
    this.vmSecret = env.PUSH_SECRET || "";
    this.vms = new Map();   // offset (0/8/16/24) -> vm websocket
    this.terms = new Map(); // chan -> browser websocket
  }
  vmFor(chan) {
    return this.vms.get(Math.floor((chan - 1) / 8) * 8) || null;
  }
  async fetch(req) {
    const url = new URL(req.url);
    const up = req.headers.get("Upgrade") || "";
    if (up.toLowerCase() !== "websocket") return new Response("ws only", {status: 426});
    if (url.pathname === "/vm") {
      const [client, server] = Object.values(new WebSocketPair());
      server.accept();
      let ok = false, off = 0;
      server.addEventListener("message", ev => {
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (!ok) {
          if (m.hello === "vm" && m.secret === this.vmSecret) {
            ok = true;
            off = (typeof m.offset === "number" && m.offset >= 0 && m.offset <= 24) ? m.offset : 0;
            if (this.vms.has(off)) { try { this.vms.get(off).close(); } catch (e) {} }
            this.vms.set(off, server);
          } else { try { server.close(); } catch (e) {} }
          return;
        }
        if (m.chan && this.terms.has(m.chan)) {
          try { this.terms.get(m.chan).send(JSON.stringify({data: m.data})); } catch (e) {}
        }
      });
      const close = () => { if (this.vms.get(off) === server) this.vms.delete(off); };
      server.addEventListener("close", close);
      server.addEventListener("error", close);
      return new Response(null, {status: 101, webSocket: client});
    }
    if (url.pathname === "/term") {
      const [client, server] = Object.values(new WebSocketPair());
      server.accept();
      let chan = 0, authed = false;
      server.addEventListener("message", ev => {
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (!authed) {
          if (m.auth === this.pass && m.chan >= 1 && m.chan <= 32) {
            authed = true; chan = m.chan;
            if (this.terms.has(chan)) { try { this.terms.get(chan).close(); } catch (e) {} }
            this.terms.set(chan, server);
            server.send(JSON.stringify({ready: true}));
            // proactively push current screen content; no browser round-trip needed
            const vm0 = this.vmFor(chan);
            if (vm0) { try { vm0.send(JSON.stringify({chan, snapshot: true})); } catch (e) {} }
          } else {
            try { server.send(JSON.stringify({err: "bad password"})); } catch (e) {}
            try { server.close(); } catch (e) {}
          }
          return;
        }
        const vm = this.vmFor(chan);
        if (vm) {
          try { vm.send(JSON.stringify({chan, data: m.data, resize: m.resize})); }
          catch (e) {}
        }
        if (m.snapshot && vm) {
          try { vm.send(JSON.stringify({chan, snapshot: true})); }
          catch (e) {}
        }
      });
      const close = () => { if (chan && this.terms.get(chan) === server) this.terms.delete(chan); };
      server.addEventListener("close", close);
      server.addEventListener("error", close);
      return new Response(null, {status: 101, webSocket: client});
    }
    return new Response("nf", {status: 404});
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/") {
      return new Response(PAGE, {headers: {"content-type": "text/html"}});
    }
    if (url.pathname === "/bridge.py") {
      return new Response(BRIDGE_PY, {headers: {"content-type": "text/x-python"}});
    }
    const id = env.TERM_STORE.idFromName("main");
    const stub = env.TERM_STORE.get(id);
    return stub.fetch(req);
  }
};
