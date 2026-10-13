# Freebuff Guide: Working with bannerlord-clone via GitHub API (No Clone)

## Why No Clone?

This machine cannot clone the repo (no temp space / git issues).
Work directly against the GitHub API instead. You never need a local copy.

## Setup

You need a GitHub personal access token with `repo` scope.
Set it as an environment variable (do NOT hardcode it in files):

```bash
export GITHUB_TOKEN="your-token-here"
```

## Reading Files (No Clone Needed)

Fetch any file's content via the API:

```bash
# Get a file's content (base64 encoded)
curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
  "https://api.github.com/repos/Mrfentmen/bannerlord-clone/contents/clients/campaign/src/scene/BattleScene.ts" \
  | python3 -c "import json,sys,base64; d=json.load(sys.stdin); print(base64.b64decode(d['content']).decode())"
```

List a directory:

```bash
curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
  "https://api.github.com/repos/Mrfentmen/bannerlord-clone/contents/clients/campaign/src/scene" \
  | python3 -c "import json,sys; [print(x['name'], x['type']) for x in json.load(sys.stdin)]"
```

## Pushing Changes (No Clone, No Push — Use the API)

You cannot `git push`. Instead, create commits via the Git Data API.
This is a 4-step process per commit:

### Step 1: Get the current main SHA

```bash
curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
  "https://api.github.com/repos/Mrfentmen/bannerlord-clone/git/refs/heads/main" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['object']['sha'])"
```

Save this as `$BASE_SHA`.

### Step 2: Create blobs for each changed file

For each file you want to add/update:

```bash
# Read your local file, base64 encode, create a blob
CONTENT=$(base64 -w0 /path/to/your/file.ts)
BLOB_SHA=$(curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
  -X POST "https://api.github.com/repos/Mrfentmen/bannerlord-clone/git/blobs" \
  -d "{\"content\":\"$CONTENT\",\"encoding\":\"base64\"}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['sha'])")
echo $BLOB_SHA
```

### Step 3: Create a tree

```bash
# Get the base tree SHA from the base commit
BASE_TREE=$(curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
  "https://api.github.com/repos/Mrfentmen/bannerlord-clone/git/commits/$BASE_SHA" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['tree']['sha'])")

# Create a new tree (repeat the tree array for multiple files)
TREE_SHA=$(curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
  -X POST "https://api.github.com/repos/Mrfentmen/bannerlord-clone/git/trees" \
  -d "{
    \"base_tree\": \"$BASE_TREE\",
    \"tree\": [
      {\"path\": \"clients/campaign/src/scene/MyFile.ts\", \"mode\": \"100644\", \"type\": \"blob\", \"sha\": \"$BLOB_SHA\"}
    ]
  }" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['sha'])")
```

### Step 4: Create the commit and update main

```bash
COMMIT_SHA=$(curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
  -X POST "https://api.github.com/repos/Mrfentmen/bannerlord-clone/git/commits" \
  -d "{
    \"message\": \"Your commit message here\",
    \"tree\": \"$TREE_SHA\",
    \"parents\": [\"$BASE_SHA\"],
    \"author\": {\"name\": \"YourName\", \"email\": \"you@example.com\"},
    \"committer\": {\"name\": \"YourName\", \"email\": \"you@example.com\"}
  }" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['sha'])")

# Update main to point to the new commit (fast-forward only, never force)
curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
  -X PATCH "https://api.github.com/repos/Mrfentmen/bannerlord-clone/git/refs/heads/main" \
  -d "{\"sha\":\"$COMMIT_SHA\"}"
```

## Python Helper (Recommended)

Instead of bash, use this Python pattern for reliability:

```python
import base64, json, urllib.request, os

TOKEN = os.environ["GITHUB_TOKEN"]
REPO = "Mrfentmen/bannerlord-clone"
BASE = f"https://api.github.com/repos/{REPO}"

def api(method, path, data=None):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(data).encode() if data else None,
        method=method,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req) as r:
        return json.load(r)

def push_files(files: dict[str, str], message: str, author: str, email: str):
    """
    files: dict of {repo_path: local_file_path or file_content_string}
    Pushes directly to main via Git Data API. No clone needed.
    """
    # 1. Get current main
    main_sha = api("GET", "/git/refs/heads/main")["object"]["sha"]
    base_tree = api("GET", f"/git/commits/{main_sha}")["tree"]["sha"]

    # 2. Create blobs
    tree_items = []
    for repo_path, content in files.items():
        # content can be a string (file contents) or a path starting with /
        if content.startswith("/") and os.path.exists(content):
            with open(content, "rb") as f:
                raw = f.read()
        else:
            raw = content.encode()
        blob = api("POST", "/git/blobs", {
            "content": base64.b64encode(raw).decode(),
            "encoding": "base64",
        })
        tree_items.append({
            "path": repo_path, "mode": "100644",
            "type": "blob", "sha": blob["sha"],
        })

    # 3. Create tree and commit
    tree = api("POST", "/git/trees", {"base_tree": base_tree, "tree": tree_items})
    commit = api("POST", "/git/commits", {
        "message": message,
        "tree": tree["sha"],
        "parents": [main_sha],
        "author": {"name": author, "email": email},
        "committer": {"name": author, "email": email},
    })

    # 4. Fast-forward main
    api("PATCH", "/git/refs/heads/main", {"sha": commit["sha"]})
    return commit["sha"]

# Example usage:
# push_files(
#     {"docs/NOTES.md": "# My notes\nHello!"},
#     "Add notes",
#     "Freebuff", "freebuff@example.com",
# )
```

## Rules

1. **Always push directly to `main`.** No PRs, no branches.
2. **Never force-push.** The PATCH to `refs/heads/main` must be a fast-forward. If it fails with 422, re-fetch main and retry (someone else pushed first).
3. **Check main before every push.** The crew pushes constantly. Always get the latest main SHA right before creating your commit.
4. **One logical change per commit.** Don't bundle unrelated work.
5. **Author AND committer email are required.** The API returns 422 without both.

## Helping with the Game

The repo is `Mrfentmen/bannerlord-clone` — a Mount & Blade: Bannerlord-style web game.

- **Client:** `clients/campaign/` — Babylon.js 8 + TypeScript + Vite
- **Sim:** `services/simulation/` — Go battle simulation
- **World data:** `tools/world-data/` — Python

Key docs to read first (via the API `contents` endpoint):
- `docs/MASTER_PLAN.md` — the full task list
- `docs/FACTION_BACKSTORY.md` — the game's story/lore
- `docs/AUDIO_PIPELINE.md` — audio system

Pax's 100-task list: `.agent-specs/pax-100-tasks.md`

## If the API Returns 422 on Push

Someone pushed before you. Re-fetch main SHA and rebuild your commit on the new base. Never use `force: true`.
