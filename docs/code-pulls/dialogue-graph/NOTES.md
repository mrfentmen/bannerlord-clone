# dialogue-graph — NOTES (design reference only)

Source: `YuutaTsubasa/ProjectRondo`,
`__prototype__/src/ProjectRondo.Domain/Dialogue/` (C#). **No license
detected — code is NOT copied here.** These are my own notes on the
architecture. Reimplement, don't copy.

## The design

Dialogue as an immutable graph of records (C# `record` types —
value semantics, trivially serializable):

- `DialogueGraph(Nodes, StartId)` — nodes in an immutable
  dictionary, one entry point. The whole conversation is data.
- `DialogueNode(Id, Speaker, Line, Portrait, Exit)` — a line of
  dialogue plus *how it exits*.
- `NodeExit` — a discriminated union (OneOf): `LinearExit(Next)`,
  `BranchExit` (player choices), `EndExit`. The exit type IS the
  node type — no separate node subclasses needed.
- `DialogueSession` — walks the graph: current node, choice
  selection, validation. Disposable, so sessions clean up.
- `DialogueState`, `DialoguePlayback`, `DialogueInput` — state,
  playback cursor, and input separated. Test suite covers graph
  validation, playback, sessions, and value types.

## Relevance to bannerlord-clone

Bannerlord lives on conversations: lords, tavern keepers, quest
givers. This is the cleanest dialogue model I've seen in the sweep:
immutable graph data + a session walker + exits-as-union. Our
dialogue system should steal this shape — conversations as JSON
data files (designers can author them), a small walker in the
client, validation tests that catch broken links. The
`BranchExit` with conditions is where persuasion/charm checks plug in.
