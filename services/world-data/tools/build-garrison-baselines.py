#!/usr/bin/env python3
"""Tier 3-88/89: Compute garrison and militia baselines per settlement.

- 88: baseline garrison = population × faction policy factor
- 89: militia pool = adult-population estimate × mobilization rate

Faction policy factors (from section_key in settlements):
- Larger/more militarized factions get higher factors.
"""

import gzip
import json
from pathlib import Path


# Faction policy factors by section_key prefix
# (tuned: major powers higher, minor factions lower)
FACTION_FACTORS = {
    'northeast': 0.012,
    'southeast': 0.010,
    'midwest': 0.008,
    'southwest': 0.009,
    'west': 0.011,
    'pacific': 0.010,
}
DEFAULT_FACTOR = 0.008

# Adult population fraction (US ~77% over 18, use 0.75 for militia-eligible)
ADULT_FRACTION = 0.75
# Militia mobilization rate (fraction of adults who'd muster)
MOBILIZATION_RATE = 0.08


def faction_factor(section_key):
    """Get garrison policy factor for a faction."""
    if not section_key:
        return DEFAULT_FACTOR
    key = section_key.lower()
    for prefix, factor in FACTION_FACTORS.items():
        if prefix in key:
            return factor
    return DEFAULT_FACTOR


def main():
    repo = Path(__file__).resolve().parent.parent.parent.parent
    settlements_path = repo / "services/world-data/dist/settlements.jsonl.gz"
    out_path = repo / "services/world-data/dist/garrison-baselines.jsonl.gz"
    
    results = []
    with gzip.open(settlements_path, 'rt') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
                if '_header' in d:
                    continue
            except:
                continue
            
            sid = d.get('settlement_id') or d.get('osmId')
            if not sid:
                continue
            
            pop = d.get('population', 0) or 0
            section_key = d.get('section_key', '')
            
            factor = faction_factor(section_key)
            garrison = int(pop * factor)
            # Minimum garrison of 2 for any populated place
            if pop > 0 and garrison < 2:
                garrison = 2
            
            adults = int(pop * ADULT_FRACTION)
            militia = int(adults * MOBILIZATION_RATE)
            
            results.append({
                "settlement_id": sid,
                "population": pop,
                "section_key": section_key,
                "garrison_baseline": garrison,
                "garrison_factor": factor,
                "militia_pool": militia,
                "adult_population": adults,
            })
    
    with gzip.open(out_path, 'wt') as out:
        for r in results:
            out.write(json.dumps(r) + '\n')
    
    total_garrison = sum(r['garrison_baseline'] for r in results)
    total_militia = sum(r['militia_pool'] for r in results)
    
    print(f"Settlements: {len(results)}")
    print(f"Total garrison baseline: {total_garrison:,}")
    print(f"Total militia pool: {total_militia:,}")
    print(f"Wrote: {out_path}")


if __name__ == "__main__":
    main()
