/**
 * Field checks for untrusted payloads, in one house style.
 *
 * CONSTITUTION.md section 1.3: every external call is untrusted. A bare
 * `await response.json() as SimSnapshot` is a promise to the rest of the client that
 * the server sent exactly the shape it was asked for, and the failure mode when that is
 * not true is a blank panel, a `NaN` in the top bar, or a `TypeError` thrown from three
 * frames away in a panel nobody was looking at.
 *
 * So each payload is checked at the boundary and refused with a sentence the player can
 * read. These helpers return the *first* thing wrong with a value, as a developer-
 * readable fragment naming the field, or `null` when it is sound. `null` is the only
 * success value, so a check that forgets to test its own result is a type error rather
 * than a silent pass.
 *
 * This mirrors `validateRegion` / `validateSettlements` / `validateNetwork` in
 * `src/world/load.ts`, deliberately: one house pattern for untrusted payloads, not two.
 */

/** A JSON object, which is what every table and every nested record must be. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A finite number. `NaN` and `Infinity` are refused: both render as garbage. */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

/** A non-empty string. An empty id or label is a missing one wearing a disguise. */
export function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * A string of any length, including an empty one.
 *
 * `isString` refuses an empty string because an empty id or label is a missing one. That
 * is right for a name and wrong for a field whose job is to be able to hold nothing: the
 * campaign server's `wire.TradeResult.CausedBy` carries no `omitempty`, so a refused
 * trade sends `"causedBy": ""`. The key is present and the value is empty, because the
 * refusal wrote no row. Checking that with `isString` refused the server's own refusals,
 * which cost the player every sentence `campaign/trade.go` writes — "Golden has 480 to
 * sell, not 5000" and the rest — and replaced them with a complaint about the payload.
 */
export function isText(value: unknown): value is string {
  return typeof value === "string";
}

export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/** One of a closed set. Used for the fields that drive a type union. */
export function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

/**
 * Check the named fields of a record, each with its own check.
 *
 * The order is the order written, so the reported problem is the first one a reader
 * would find reading the payload themselves rather than an arbitrary one.
 */
export function fieldsProblem(fields: readonly (readonly [name: string, ok: boolean])[]): string | null {
  for (const [name, ok] of fields) {
    if (!ok) return name;
  }
  return null;
}

/**
 * Check every element of a list with one per-element rule.
 *
 * `describe` names the element in the problem, so a bad element at index 3 is reported
 * as `row 3 has no tick` rather than `rows is invalid`, which is the difference between
 * a report a developer can act on and one they have to re-fetch to understand.
 */
export function listProblem(
  value: unknown,
  itemCheck: (item: unknown) => string | null,
  describe: (index: number) => string,
): string | null {
  if (!isArray(value)) return null;
  for (const [index, item] of value.entries()) {
    const problem = itemCheck(item);
    if (problem) return `${describe(index)} ${problem}`;
  }
  return null;
}

/** Check every entry of a table keyed by id, where each value has the same shape. */
export function tableProblem(
  value: unknown,
  itemCheck: (item: unknown) => string | null,
  describe: (key: string) => string,
): string | null {
  if (!isRecord(value)) return null;
  for (const [key, item] of Object.entries(value)) {
    const problem = itemCheck(item);
    if (problem) return `${describe(key)} ${problem}`;
  }
  return null;
}

/** A `{ x, z }` map point, the shape every polyline and marker in this client uses. */
export function pointProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "is not a JSON object";
  if (!isFiniteNumber(raw.x)) return "has no x";
  if (!isFiniteNumber(raw.z)) return "has no z";
  return null;
}

/** A list of map points, which is what a route is. */
export function polylineProblem(raw: unknown): string | null {
  if (!isArray(raw)) return "is not a list";
  for (const [index, point] of raw.entries()) {
    const problem = pointProblem(point);
    if (problem) return `point ${index} ${problem}`;
  }
  return null;
}