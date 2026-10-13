// ---- Zone Control (src/game/zones.js): the rules' numbers
export const ZONES = {
  duration: 300,              // 5 minutes (+ overtime)
  count: 100,                 // each team's countdown
  rotateMin: 30, rotateMax: 60,   // the operational objective swaps between the centre and a side zone this often (s)
  finalCentre: 30,            // from this many seconds left (and all through overtime) only the centre is live
  warn: 0.30,                 // the other team's share of a held zone that sounds the "about to flip" warning
  control: 0.80, contest: 0.40,   // ink share to take a zone / to neutralise the other team's
  rateCenter: 1,              // points / s holding the centre
  rateHome: 0.5,              // … holding the side zone on your own half (closer to your spawn)
  rateAway: 2,                // … holding the side zone on the other team's half
  penaltyK: 0.75,             // penalty = ROUND(0.75 × (start − end)) (+1 if start was 100)
  gaugeHeld: 4.5,             // special points / s for the team NOT holding the objective
  gaugeNeutral: 1.5,          // … for the team behind while nobody holds it
  overtimeGrace: 10,          // s off the objective before overtime ends against the team behind
  overtimeMax: 300,           // overtime cap (s)
  sampleHz: 5,                // coverage checks per second
