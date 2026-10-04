/**
 * Combat events: the honest feed behind the battle HUD's combat cluster.
 *
 * Tasks 31, 45-48 (kill feed, damage direction, hit marker, kill confirm,
 * combo counter) all read the same truth: what the unit brains actually did.
 * Nothing here invents a kill — every event is emitted from a real strike in
 * `battleUnit.ts`, wired through `BattleLoop`, so a feed entry always means a
 * soldier actually fell and a hit marker always means a blow actually landed.
 *
 * The bus is pure: no DOM, no clock of its own. Listeners get plain data and
 * decide what to show.
 */

export interface KillEvent {
  /** Team of the soldier that died. 0 = player, 1 = enemy. */
  victimTeam: number;
  /** Team of the brain that struck the killing blow. */
  killerTeam: number;
}

export interface StrikeEvent {
  /** Team of the brain that struck. */
  attackerTeam: number;
  /** Team of the soldier that was hit. */
  victimTeam: number;
  /**
   * World-space direction from the victim toward the attacker — where the hit
   * came from, on the ground plane. The damage-direction indicator rotates
   * this against the camera to put the arc on the right screen edge.
   */
  fromDirection: { x: number; z: number };
  /** True when this strike killed. */
  killed: boolean;
}

export interface CombatEventSource {
  onKill(fn: (e: KillEvent) => void): () => void;
  onStrike(fn: (e: StrikeEvent) => void): () => void;
}

export class CombatEventBus implements CombatEventSource {
  private readonly killListeners = new Set<(e: KillEvent) => void>();
  private readonly strikeListeners = new Set<(e: StrikeEvent) => void>();

  onKill(fn: (e: KillEvent) => void): () => void {
    this.killListeners.add(fn);
    return () => {
      this.killListeners.delete(fn);
    };
  }

  onStrike(fn: (e: StrikeEvent) => void): () => void {
    this.strikeListeners.add(fn);
    return () => {
      this.strikeListeners.delete(fn);
    };
  }

  /** A blow landed. Emitted for every strike, lethal or not. */
  emitStrike(e: StrikeEvent): void {
    for (const fn of [...this.strikeListeners]) fn({ ...e });
  }

  /** A soldier died. Always paired with the lethal strike, never alone. */
  emitKill(e: KillEvent): void {
    for (const fn of [...this.killListeners]) fn({ ...e });
  }
}
