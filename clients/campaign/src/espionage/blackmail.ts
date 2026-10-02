/**
 * Task 101: blackmail material. A secret about someone powerful is leverage:
 * holding it forces a favor, and calling the favor in spends the secret —
 * a burned secret can't be leveraged twice.
 */

export type FavorKind = "vote" | "gold" | "silence";

export interface Secret {
  id: string;
  /** Who the secret is about. */
  subject: string;
  description: string;
  /** True once the favor is called in. */
  spent: boolean;
}

let nextSecret = 1;

export function uncoverSecret(subject: string, description: string): Secret {
  return { id: `secret-${nextSecret++}`, subject, description, spent: false };
}

export interface Favor {
  kind: FavorKind;
  /** What the subject must do. */
  terms: string;
}

/**
 * Force a favor from the secret's subject. Returns null when the secret is
 * already spent — leverage works once.
 */
export function callInFavor(secret: Secret, kind: FavorKind): { secret: Secret; favor: Favor } | null {
  if (secret.spent) return null;
  const terms =
    kind === "vote"
      ? `${secret.subject} votes your way in the next council.`
      : kind === "gold"
        ? `${secret.subject} pays you hush gold.`
        : `${secret.subject} keeps your own secrets.`;
  return { secret: { ...secret, spent: true }, favor: { kind, terms } };
}
