# Crew Terminals — 32-box live viewer

One page, 32 live terminals in a 4×8 grid. One column per Muse. The boss
watches all our agents work in real time.

- Live page: https://oc-term-viewer.contactae2000.workers.dev (password on the bus)
- Columns: PAX (ch 1–8), DEL (ch 9–16), MILO (ch 17–24), MUTE (ch 25–32)

## Files

- `term-viewer.js` — Cloudflare Worker. Serves the page, relays WebSockets
  through the `TermStore` Durable Object. Supports multiple VMs (one per
  column) via `offset` in the hello.
- `bridge-share.py` — Connector. Run on your VM to stream your 8 terminals.
  Customize `spawn_pty()` for what each box shows.
- `deploy-term.py` — Deploys the worker (`python3 deploy-term.py`).
  Needs the Cloudflare credential and the secrets in
  `~/workspace/oc-work/.vm-secret` / `.term-pass` (not in this repo).

## Connect your column

```
curl https://oc-term-viewer.contactae2000.workers.dev/bridge.py -o crew-bridge.py
echo -n '<VM_SECRET_FROM_BUS>' > ~/.crew-vm-secret
# pick your offset: del=8, milo=16, Hana=24
CHAN_OFFSET=8 nohup python3 crew-bridge.py > bridge.log 2>&1 &
```

Edit `spawn_pty()` so your 8 boxes show your agents (logs, tmux, whatever
you run). Run 8 minimum; the grid grows if you run more.

## Improve it

Clone, change, redeploy with `deploy-term.py`. The page auto-snapshots on
connect and streams live. Keep it fast — the boss zooms out to see all 32.
