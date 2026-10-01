#!/usr/bin/env python3
"""Tier 3-77/78/79/80: Tag POI locations per settlement.

- 77: tavern/bar locations (from notable slots)
- 78: marketplace locations (towns and cities)
- 79: arena/fight-venue locations (population > 500k)
- 80: town-hall / civic-center locations

Derives from notable-slots.jsonl.gz + settlements data.
"""

import gzip
import json
import sys
from pathlib import Path


def main():
    repo = Path(__file__).resolve().parent.parent.parent.parent
    slots_path = repo / "services/world-data/dist/notable-slots.jsonl.gz"
    settlements_path = repo / "services/world-data/dist/settlements.jsonl.gz"
    out_path = repo / "services/world-data/dist/poi-tags.jsonl.gz"
    
    # Load populations
    pops = {}
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
            if sid:
                pops[sid] = d.get('population', 0) or 0
    
    # Load slots and tag POIs
    results = []
    with gzip.open(slots_path, 'rt') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            d = json.loads(line)
            sid = d['settlement_id']
            pop = pops.get(sid, 0)
            band = d['band']
            
            pois = []
            
            # 77: tavern/bar from slots
            taverns = [s for s in d['slots'] if s['location_type'] == 'tavern_keeper']
            for t in taverns:
                pois.append({
                    "poi_type": "tavern",
                    "slot_id": t['slot_id'],
                    "source": "notable_slot",
                })
            
            # 78: marketplace in towns and cities
            if band in ('town', 'city'):
                pois.append({
                    "poi_type": "marketplace",
                    "slot_id": f"{sid}-POI-MKT",
                    "source": "band_rule",
                })
            
            # 79: arena in major cities (>500k)
            if pop and pop > 500000:
                pois.append({
                    "poi_type": "arena",
                    "slot_id": f"{sid}-POI-ARENA",
                    "source": "population_rule",
                })
            
            # 80: town-hall / civic-center for all
            pois.append({
                "poi_type": "town_hall",
                "slot_id": f"{sid}-POI-HALL",
                "source": "universal",
            })
            
            results.append({
                "settlement_id": sid,
                "population": pop,
                "band": band,
                "poi_count": len(pois),
                "pois": pois,
            })
    
    with gzip.open(out_path, 'wt') as out:
        for r in results:
            out.write(json.dumps(r) + '\n')
    
    # Summary
    poi_types = {}
    for r in results:
        for p in r['pois']:
            poi_types[p['poi_type']] = poi_types.get(p['poi_type'], 0) + 1
    
    print(f"Settlements: {len(results)}")
    print(f"POI types: {poi_types}")
    print(f"Wrote: {out_path}")


if __name__ == "__main__":
    main()
