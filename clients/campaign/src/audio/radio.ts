/**
 * In-game radio news bulletins, generated from live world state.
 *
 * ART_AND_AUDIO.md 8.2: a tunable channel playing original era-styled music
 * and news bulletins generated from real world state. Bulletins name only
 * places the simulation knows — never real living people or parties.
 */
import type { TownState } from "../data/types.js";

export interface Bulletin {
  /** Short headline for the tuner display. */
  headline: string;
  /** Full bulletin text. */
  text: string;
  /** What triggered it, for debugging. */
  kind: "unrest" | "food" | "health" | "prosperity" | "roads" | "general";
}

const STATION_ID = "KHRD";
const STATION_NAME = "Heartland Radio";

export function stationIntro(): string {
  return `You're listening to ${STATION_ID}, ${STATION_NAME}. Here's the latest from across the region.`;
}

export function stationOutro(): string {
  return `That's the news for now. Stay tuned for more music, right here on ${STATION_ID}, ${STATION_NAME}.`;
}

/**
 * Pick the most newsworthy towns and write bulletins. Deterministic for a
 * given snapshot: sorted by severity, then name.
 */
export function generateBulletins(towns: TownState[], count = 4): Bulletin[] {
  const scored: { score: number; bulletin: Bulletin }[] = [];

  for (const t of towns) {
    const name = t.name;
    // Unrest
    if (t.unrest > 0.55) {
      const level = t.unrest > 0.8 ? "Tensions are running high" : "Unease is spreading";
      scored.push({
        score: t.unrest * 100,
        bulletin: {
          headline: `Unrest in ${name}`,
          text: `${level} in ${name}. Local leaders urge calm and say talks are underway. Travelers are advised to keep plans flexible.`,
          kind: "unrest",
        },
      });
    }
    // Food shortage
    const days = t.foodDemand > 0 ? t.foodStock / t.foodDemand : 999;
    if (days < 14 && t.population && t.population > 0) {
      scored.push({
        score: 90 - days,
        bulletin: {
          headline: `Food concerns in ${name}`,
          text: `Markets in ${name} report tightening supplies, with roughly ${Math.max(1, Math.round(days))} days of food on hand. Merchants expect prices to firm through the week.`,
          kind: "food",
        },
      });
    }
    // Disease
    if (t.infected > 0.08) {
      scored.push({
        score: t.infected * 80,
        bulletin: {
          headline: `Health advisory for ${name}`,
          text: `Health officials in ${name} report illness spreading. Residents are asked to limit gatherings and keep the sick at home.`,
          kind: "health",
        },
      });
    }
    // Prosperity boom
    if (t.prosperity > 0.75) {
      scored.push({
        score: t.prosperity * 40,
        bulletin: {
          headline: `${name} booming`,
          text: `${name} is thriving — workshops busy, markets full. The town council credits steady trade and good harvests.`,
          kind: "prosperity",
        },
      });
    }
    // Dangerous roads
    if (t.roadSafety < 0.4) {
      scored.push({
        score: (1 - t.roadSafety) * 60,
        bulletin: {
          headline: `Travel warning near ${name}`,
          text: `Road report: the routes around ${name} are unsafe after dark. Convoys should travel in daylight and keep fuel topped up.`,
          kind: "roads",
        },
      });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.bulletin.headline.localeCompare(b.bulletin.headline));
  const seen = new Set<string>();
  const out: Bulletin[] = [];
  for (const s of scored) {
    if (seen.has(s.bulletin.headline)) continue;
    seen.add(s.bulletin.headline);
    out.push(s.bulletin);
    if (out.length >= count) break;
  }
  if (out.length === 0) {
    out.push({
      headline: "Quiet across the region",
      text: "A quiet day across the region. Markets steady, roads open, no major incidents reported.",
      kind: "general",
    });
  }
  return out;
}

/** Era-styled station beds shipped as audio. */
export const RADIO_BEDS = [
  { id: "heartland-rock", file: "bed-heartland-rock.mp3", label: "Heartland Rock" },
  { id: "country-lope", file: "bed-country-lope.mp3", label: "Country Lope" },
  { id: "night-synth", file: "bed-night-synth.mp3", label: "Night Synth" },
] as const;

export type RadioBedId = (typeof RADIO_BEDS)[number]["id"];

export function radioBedUrl(bed: RadioBedId, basePath = "audio/"): string {
  const found = RADIO_BEDS.find((b) => b.id === bed);
  return `${basePath}radio/${found ? found.file : RADIO_BEDS[0].file}`;
}
