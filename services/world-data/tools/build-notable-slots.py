#!/usr/bin/env python3
"""Tier 3-75/76: Derive notable counts per settlement from population tiers.

Reads settlements from dist/settlements.jsonl.gz and computes notable
slots per settlement based on population bands:
- village (< 2,500): 1-2 notables
- town (2,500-50,000): 3-8 notables  
- city (> 50,000): 9-25 notables

Exports notable slots (location type + count) without invented names.
"""

import gzip
import json
import sys
from pathlib import Path


def population_band(pop):
    """Return (band_name, min_slots, max_slots) for a population."""
    if pop is None or pop < 2500:
        return ("village", 1, 2)
    elif pop < 50000:
        return ("town", 3, 8)
    else:
        return ("city", 9, 25)


def notable_slots(pop, settlement_id):
    """Compute deterministic notable slots for a settlement."""
    band, min_slots, max_slots = population_band(pop)
    
    # Deterministic count from settlement_id hash
    h = hash(settlement_id) % 1000 / 1000.0
    count = min_slots + int(h * (max_slots - min_slots + 1))
    count = min(count, max_slots)
    
    # Slot types by band
    if band == "village":
        types = ["headman", "trader"]
    elif band == "town":
        types = ["headman", "trader", "blacksmith", "tavern_keeper", "priest"]
    else:
        types = ["mayor", "trader", "blacksmith", "tavern_keeper", 
                 "priest", "captain", "merchant_lord", "spymaster"]
    
    slots = []
    for i in range(count):
        slots.append({
            "slot_id": f"{settlement_id}-S{i+1:02d}",
            "location_type": types[i % len(types)],
            "band": band,
        })
    
    return {
        "settlement_id": settlement_id,
        "population": pop,
        "band": band,
        "slot_count": count,
        "slots": slots,
    }


def main():
    # tools/ -> world-data/ -> services/ -> repo
    repo = Path(__file__).resolve().parent.parent.parent.parent
    settlements_path = repo / "services/world-data/dist/settlements.jsonl.gz"
    out_path = repo / "services/world-data/dist/notable-slots.jsonl.gz"
    
    if not settlements_path.exists():
        print(f"ERROR: {settlements_path} not found", file=sys.stderr)
        sys.exit(1)
    
    results = []
    with gzip.open(settlements_path, 'rt') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('{'):
                # Skip header lines
                try:
                    d = json.loads(line)
                    if '_header' in d:
                        continue
                except:
                    continue
            try:
                d = json.loads(line)
            except:
                continue
            
            sid = d.get('settlement_id') or d.get('osmId')
            pop = d.get('population')
            if not sid:
                continue
            
            results.append(notable_slots(pop, sid))
    
    with gzip.open(out_path, 'wt') as out:
        for r in results:
            out.write(json.dumps(r) + '\n')
    
    # Summary
    bands = {}
    for r in results:
        bands[r['band']] = bands.get(r['band'], 0) + 1
    total_slots = sum(r['slot_count'] for r in results)
    
    print(f"Settlements: {len(results)}")
    print(f"Bands: {bands}")
    print(f"Total slots: {total_slots}")
    print(f"Wrote: {out_path}")


if __name__ == "__main__":
    main()
