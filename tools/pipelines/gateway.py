#!/usr/bin/env python3
"""gateway.py - resilient client for the local MCP gateway.

The 3D asset pipeline depends on a gateway process that may not be
running (it dies on VM reboot). This module wraps every call with:

- configurable endpoint via the MCP_GATEWAY_URL environment variable
- a fast health check before expensive analysis calls
- exponential-backoff retries for transient failures
- distinct exception types so callers can tell "gateway is down"
  apart from "the model failed analysis"

Nothing here imports validate.py; the two modules stay independent.
"""

import json
import os
import time
import urllib.error
import urllib.request

#: Default gateway endpoint. Override with MCP_GATEWAY_URL in the
#: environment (useful in CI or when the gateway moves ports).
DEFAULT_GATEWAY_URL = "http://127.0.0.1:8931/mcp/"

#: How long to wait between retries (seconds), doubled each attempt.
RETRY_BASE_DELAY = 1.0

#: Maximum attempts for a single tool call (1 initial + retries).
MAX_ATTEMPTS = 3


class GatewayError(RuntimeError):
    """Base class for gateway failures."""


class GatewayUnreachable(GatewayError):
    """The gateway process is not answering at all (down, wrong port,
    rebooted VM). Retrying will not help until it is restarted."""


class GatewayTimeout(GatewayError):
    """The gateway accepted the request but did not answer in time."""


class GatewayToolError(GatewayError):
    """The gateway answered but the tool itself reported an error."""


def gateway_url():
    """Endpoint URL, honoring the MCP_GATEWAY_URL override."""
    return os.environ.get("MCP_GATEWAY_URL", DEFAULT_GATEWAY_URL)


def gateway_health(timeout=5):
    """Fast liveness probe. Returns True if the gateway answers,
    False otherwise. Never raises."""
    try:
        req = urllib.request.Request(
            gateway_url(), data=b"{}",
            headers={"Content-Type": "application/json"},
            method="GET")
        with urllib.request.urlopen(req, timeout=timeout):
            return True
    except Exception:  # noqa: BLE001 - health check must never raise
        return False


def _post_once(tool, args, timeout):
    """One attempt at a tool call. Raises GatewayError subclasses."""
    body = json.dumps(
        {"jsonrpc": "2.0", "id": 1, "method": "tools/call",
         "params": {"name": tool, "arguments": args}}
    ).encode()
    req = urllib.request.Request(
        gateway_url(), data=body,
        headers={"Content-Type": "application/json",
                 "Accept": "application/json, text/event-stream"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", "replace")
    except urllib.error.URLError as e:
        reason = getattr(e, "reason", e)
        if isinstance(reason, TimeoutError) or "timed out" in str(reason):
            raise GatewayTimeout(
                f"gateway timed out after {timeout}s calling {tool}")
        raise GatewayUnreachable(
            f"gateway unreachable at {gateway_url()}: {reason}. "
            f"Is the gateway running? "
            f"(cd ~/workspace/mcp-gateway && .venv/bin/python gateway.py)")
    except TimeoutError:
        raise GatewayTimeout(
            f"gateway timed out after {timeout}s calling {tool}")
    except OSError as e:
        raise GatewayUnreachable(
            f"gateway unreachable at {gateway_url()}: {e}")

    payload = None
    for line in raw.splitlines():
        line = line.strip()
        if line.startswith("data:"):
            try:
                payload = json.loads(line[5:].strip())
                break
            except ValueError:
                continue
    if payload is None:
        try:
            payload = json.loads(raw)
        except ValueError:
            raise GatewayError(
                f"unparseable gateway response: {raw[:200]!r}")
    if payload.get("error"):
        raise GatewayToolError(f"gateway error: {payload['error']}")
    result = payload.get("result", {})
    chunks = result.get("content", []) if isinstance(result, dict) else []
    texts = [c.get("text", "") for c in chunks if isinstance(c, dict)]
    for t in texts:
        try:
            return json.loads(t)
        except (ValueError, TypeError):
            continue
    raise GatewayError(f"no JSON payload in tool result for {tool}")


def gateway_call(tool, args, timeout=60, retries=MAX_ATTEMPTS - 1):
    """Call a gateway tool with exponential-backoff retries.

    Transient failures (timeouts, unparseable responses) are retried up
    to `retries` times with delays of 1s, 2s, 4s, ... . GatewayUnreachable
    is NOT retried - if the process is down, hammering it helps nothing
    and the error message already says how to restart it.
    GatewayToolError is NOT retried either - the tool itself failed, so
    the same call would fail the same way.
    """
    attempt = 0
    while True:
        try:
            return _post_once(tool, args, timeout)
        except (GatewayUnreachable, GatewayToolError):
            raise
        except GatewayError:
            attempt += 1
            if attempt > retries:
                raise
            delay = RETRY_BASE_DELAY * (2 ** (attempt - 1))
            time.sleep(delay)
