#!/usr/bin/env python3
"""
Crew terminal bridge — streams 8 local terminals to the shared crew viewer.

Each Muse runs this on their own VM. Your 8 terminals appear as one column
of 8 boxes on the shared page.

Setup:
  1. Set your column:  CHAN_OFFSET=0  (PAX) | 8 (DEL) | 16 (MILO) | 24 (MUTE)
  2. Save the VM secret:  echo -n "<secret-from-boss>" > ~/.crew-vm-secret
  3. Customize spawn_pty() below to choose what each of your 8 boxes shows
     (default: tails ~/workspace/oc-work/agent-N.log like PAX does).
  4. Run:  CHAN_OFFSET=8 python3 crew-bridge.py   (use nohup & to keep it alive)

Viewer: https://oc-term-viewer.contactae2000.workers.dev  (page password from boss)
"""
import os, sys, pty, json, time, base64, socket, ssl, select, subprocess, urllib.parse

HOST = "oc-term-viewer.contactae2000.workers.dev"
CHAN_OFFSET = int(os.environ.get("CHAN_OFFSET", "0"))
NCHANS = 8

SECRET_FILE = os.path.expanduser("~/.crew-vm-secret")

def log(*a):
    print(*a, flush=True)

# ---------------------------------------------------------------------------
# CUSTOMIZE THIS: what each of your 8 terminal boxes shows.
# chan is 1..8 (your column). Return (pid, fd) of a pty running anything.
# Examples:
#   - tail a log:        os.execvp("tail", ["tail", "-n", "0", "-f", "/path/to.log"])
#   - watch a command:   os.execvp("watch", ["watch", "-n", "5", "your-cmd"])
#   - plain shell:       os.execvp("bash", ["bash"])
# ---------------------------------------------------------------------------
def spawn_pty(chan):
    pid, fd = pty.fork()
    if pid == 0:
        os.environ["TERM"] = "xterm-256color"
        os.execvp("tail", ["tail", "-n", "0", "-f",
                           os.path.expanduser(f"~/workspace/oc-work/agent-{chan}.log")])
    return pid, fd

def snapshot_data(chan):
    """What a newly-connected viewer sees immediately (history, not just live)."""
    try:
        cap = subprocess.run(
            ["tail", "-n", "150",
             os.path.expanduser(f"~/workspace/oc-work/agent-{chan}.log")],
            capture_output=True, timeout=5).stdout
        return cap
    except Exception:
        return b""

# ---------------------------------------------------------------------------
# WebSocket plumbing (no dependencies beyond stdlib). Do not edit below.
# ---------------------------------------------------------------------------
def gchan(chan):
    return CHAN_OFFSET + chan

def connect_ws():
    proxy = os.environ["HTTPS_PROXY"]
    u = urllib.parse.urlparse(proxy)
    s = socket.create_connection((u.hostname, u.port or 3128), timeout=20)
    auth = base64.b64encode(f"{u.username}:{u.password}".encode()).decode()
    s.sendall(f"CONNECT {HOST}:443 HTTP/1.1\r\nHost: {HOST}:443\r\n"
              f"Proxy-Authorization: Basic {auth}\r\n\r\n".encode())
    if b"200" not in s.recv(1024):
        raise ConnectionError("proxy refused")
    s = ssl.create_default_context().wrap_socket(s, server_hostname=HOST)
    key = base64.b64encode(os.urandom(16)).decode()
    s.sendall(f"GET /vm HTTP/1.1\r\nHost: {HOST}\r\nUpgrade: websocket\r\n"
              f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\n"
              f"Sec-WebSocket-Version: 13\r\n\r\n".encode())
    if b"101" not in s.recv(1024):
        raise ConnectionError("ws upgrade failed")
    return s

def ws_send(s, obj):
    p = json.dumps(obj).encode()
    h = bytearray([0x82])
    if len(p) < 126:
        h.append(len(p))
    elif len(p) < 65536:
        h.append(126); h += len(p).to_bytes(2, "big")
    else:
        h.append(127); h += len(p).to_bytes(8, "big")
    s.sendall(bytes(h) + p)

def recvn(s, n):
    data = b""
    while len(data) < n:
        chunk = s.recv(n - len(data))
        if not chunk:
            raise ConnectionError("closed")
        data += chunk
    return data

def ws_recv(s):
    h = recvn(s, 2)
    ln = h[1] & 0x7F
    if ln == 126:
        ln = int.from_bytes(recvn(s, 2), "big")
    elif ln == 127:
        ln = int.from_bytes(recvn(s, 8), "big")
    mask = recvn(s, 4) if (h[1] & 0x80) else None
    payload = recvn(s, ln)
    if mask:
        payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
    if h[0] & 0x8:
        raise ConnectionError("close frame")
    return payload

def set_winsize(fd, cols, rows):
    import fcntl, termios, struct
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))

def main():
    secret = open(SECRET_FILE).read().strip()
    ptys = {}
    while True:
        try:
            s = connect_ws()
            ws_send(s, {"hello": "vm", "secret": secret, "offset": CHAN_OFFSET})
            log("bridge connected (offset %d)" % CHAN_OFFSET)
            for c in range(1, NCHANS + 1):
                pid, fd = spawn_pty(c)
                ptys[c] = (pid, fd)
                set_winsize(fd, 90, 30)
                log(f"pty {c} -> pid {pid}")
            s.setblocking(False)
            for _, fd in ptys.values():
                os.set_blocking(fd, False)
            connected_at = time.time()
            while True:
                if time.time() - connected_at > 600:
                    raise Exception("proactive reconnect")
                r, _, _ = select.select([s] + [fd for _, fd in ptys.values()], [], [], 30)
                if s in r:
                    try:
                        raw = ws_recv(s)
                    except BlockingIOError:
                        pass
                    except ConnectionError:
                        raise
                    else:
                        try:
                            m = json.loads(raw)
                        except Exception:
                            continue
                        gc = m.get("chan")
                        c = gc - CHAN_OFFSET if isinstance(gc, int) else None
                        if c in ptys:
                            if m.get("snapshot"):
                                cap = snapshot_data(c)
                                if cap:
                                    ws_send(s, {"chan": gchan(c),
                                                "data": base64.b64encode(cap).decode()})
                            if m.get("resize"):
                                cols, rows = m["resize"]
                                try:
                                    set_winsize(ptys[c][1], cols, rows)
                                except Exception:
                                    pass
                            if m.get("data"):
                                try:
                                    os.write(ptys[c][1], base64.b64decode(m["data"]))
                                except Exception:
                                    pass
                for c, (pid, fd) in list(ptys.items()):
                    if fd in r:
                        try:
                            out = os.read(fd, 65536)
                        except (BlockingIOError, OSError):
                            continue
                        if out:
                            ws_send(s, {"chan": gchan(c),
                                        "data": base64.b64encode(out).decode()})
                        else:
                            try:
                                os.close(fd)
                            except Exception:
                                pass
                            npid, nfd = spawn_pty(c)
                            os.set_blocking(nfd, False)
                            set_winsize(nfd, 90, 30)
                            ptys[c] = (npid, nfd)
        except Exception as e:
            log("bridge error:", e, "- reconnecting in 5s")
            for _, fd in ptys.values():
                try:
                    os.close(fd)
                except Exception:
                    pass
            ptys.clear()
            time.sleep(5)

if __name__ == "__main__":
    main()
