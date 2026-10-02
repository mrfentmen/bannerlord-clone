# Milo tasks 151-156: production build + playtest

## Task 151: production build
`npx vite build` on clients/campaign at origin/main: exit 0, 2m 16s (agents paused).
Output: dist/ 194MB total.
- index.html 1.9kB, CSS 87kB, JS 467kB, Babylon.js 6.4MB (1.4MB gzipped).

## Task 152
First attempt OOM-killed (box had 127MB free with agents holding memory).
Retry after agents paused and memory freed (2.9GB free): build succeeded.
Both runs recorded.

## Tasks 153-156: BLOCKED — browser cannot reach VM localhost
The managed browser task runs on remote infrastructure and cannot navigate to
http://127.0.0.1:4173/ (connection fails; task ends on about:blank). The VM has
no public IP and no tunnel is configured. A real playtest needs a publicly
reachable URL (deploy the dist/ or run a tunnel).

Verified without browser:
- dist/index.html is valid, references the built JS/CSS bundles.
- All bundles present (6.4MB Babylon, 467kB app JS, 87kB CSS).
- tsc clean, so no type errors in the shipped code.

Console-error count, pause-menu behavior, and F5 quicksave remain unverified
until the build is reachable from a browser.
