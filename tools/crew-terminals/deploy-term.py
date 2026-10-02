#!/usr/bin/env python3
"""Deploy the oc-term-viewer Worker (interactive tmux terminals)."""
import io, json, sys, urllib.request, urllib.error
sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
from dynamic_credentials import add_surrogate_to_request, read_json_response
BASE = "https://api.cloudflare.com/client/v4"

def api(method, path, body=None, raw=None, ctype=None):
    data, headers = None, {}
    if body is not None:
        data = json.dumps(body).encode(); headers["Content-Type"] = "application/json"
    if raw is not None:
        data, headers["Content-Type"] = raw, ctype
    req = urllib.request.Request(BASE + path, data=data, method=method.upper())
    for k, v in headers.items(): req.add_header(k, v)
    add_surrogate_to_request(req, "custom.cloudflare", entry_name="access_token",
                             allowed_hosts=["api.cloudflare.com"])
    try:
        with urllib.request.urlopen(req, timeout=60) as resp: return read_json_response(resp)
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"{method} {path} -> {exc.code}: {exc.read().decode()[:500]}")

def check(resp, what):
    if not resp.get("success"): raise RuntimeError(f"{what}: {json.dumps(resp.get('errors'))[:400]}")
    return resp["result"]

def multipart(fields):
    boundary = "----cfwkr1234567890abcdef"
    buf = io.BytesIO()
    for name, fname, ctype, payload in fields:
        disp = f'form-data; name="{name}"' + (f'; filename="{fname}"' if fname else '')
        buf.write(f"--{boundary}\r\nContent-Disposition: {disp}\r\nContent-Type: {ctype}\r\n\r\n".encode())
        buf.write(payload); buf.write(b"\r\n")
    buf.write(f"--{boundary}--\r\n".encode())
    return buf.getvalue(), f"multipart/form-data; boundary={boundary}"

acct = check(api("GET", "/accounts"), "accounts")[0]["id"]
script = open("/home/hatch/workspace/oc-work/term-viewer.js", "r").read()
bridge_py = open("/home/hatch/workspace/oc-work/bridge-share.py", "r").read()
script = script.replace("__BRIDGE_PY_JSON__", json.dumps(bridge_py))
script = script.encode()
meta = {"main_module": "term-viewer.js",
        "bindings": [{"type": "durable_object_namespace", "name": "TERM_STORE",
                      "class_name": "TermStore"}]}
body, ctype = multipart([
    ("metadata", None, "application/json", json.dumps(meta).encode()),
    ("term-viewer.js", "term-viewer.js", "application/javascript+module", script)])
check(api("PUT", f"/accounts/{acct}/workers/scripts/oc-term-viewer", raw=body, ctype=ctype), "upload")
for name, path in [("PUSH_SECRET", "/home/hatch/workspace/oc-work/.vm-secret"),
                   ("TERM_PASS", "/home/hatch/workspace/oc-work/.term-pass")]:
    secret = open(path).read().strip()
    check(api("PUT", f"/accounts/{acct}/workers/scripts/oc-term-viewer/secrets",
              {"name": name, "text": secret, "type": "secret_text"}), f"secret {name}")
check(api("POST", f"/accounts/{acct}/workers/scripts/oc-term-viewer/subdomain",
          {"enabled": True}), "subdomain")
sub = check(api("GET", f"/accounts/{acct}/workers/subdomain"), "subdomain")["subdomain"]
print("URL: https://oc-term-viewer." + sub + ".workers.dev")
