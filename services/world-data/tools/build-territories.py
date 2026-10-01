#!/usr/bin/env python3
"""Tier 3-92/93/94/95/96: Territory assignment and map export.

- 92: Settlements already have section_key (6 factions); assign sub-territories
- 93: Territory polygons per faction from member-settlement convex hulls
- 94: Flag border settlements (within X km of another faction's territory)
- 95: Capital per faction = largest settlement in territory
- 96: Export territories.json for client (polygons + colors + labels)
"""

import gzip
import json
import math
from collections import defaultdict
from pathlib import Path


# Faction display colors (from banners/art pipeline)
FACTION_COLORS = {
    'great_lakes_union': '#2563eb',      # blue
    'southern_compact': '#dc2626',       # red
    'atlantic_corridor': '#059669',      # green
    'lone_star_frontier': '#d97706',     # amber
    'pacific_compact': '#7c3aed',        # purple
    'mountain_alliance': '#78716c',      # stone
}

FACTION_LABELS = {
    'great_lakes_union': 'Great Lakes Union',
    'southern_compact': 'Southern Compact',
    'atlantic_corridor': 'Atlantic Corridor',
    'lone_star_frontier': 'Lone Star Frontier',
    'pacific_compact': 'Pacific Compact',
    'mountain_alliance': 'Mountain Alliance',
}


def convex_hull(points):
    """Andrew's monotone chain convex hull. Points: [(x, y), ...]."""
    points = sorted(set(points))
    if len(points) <= 1:
        return points
    
    def cross(o, a, b):
        return (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0])
    
    lower = []
    for p in points:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    
    upper = []
    for p in reversed(points):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    
    return lower[:-1] + upper[:-1]


def haversine_km(lat1, lon1, lat2, lon2):
    """Great-circle distance in km."""
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2 * R * math.asin(math.sqrt(a))


def main():
    repo = Path(__file__).resolve().parent.parent.parent.parent
    settlements_path = repo / "services/world-data/dist/settlements.jsonl.gz"
    out_path = repo / "clients/campaign/public/world/territories.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Load settlements by faction
    factions = defaultdict(list)
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
            lat = d.get('latitude')
            lon = d.get('longitude')
            faction = d.get('section_key', 'unknown')
            pop = d.get('population', 0) or 0
            name = d.get('name', sid)
            
            if not sid or lat is None or lon is None:
                continue
            
            factions[faction].append({
                'id': sid, 'name': name, 'lat': lat, 'lon': lon,
                'pop': pop, 'faction': faction,
            })
    
    territories = []
    all_settlements = []
    for faction, members in factions.items():
        all_settlements.extend(members)
    
    # Build faction index for border detection
    for faction, members in factions.items():
        # 93: convex hull polygon (lon, lat for GeoJSON)
        points = [(m['lon'], m['lat']) for m in members]
        hull = convex_hull(points)
        
        # 95: capital = largest settlement
        capital = max(members, key=lambda m: m['pop'])
        
        # 94: border settlements (within 50km of another faction's member)
        # (simplified: check against all other faction members)
        other_points = [
            (m['lat'], m['lon']) 
            for f2, ms in factions.items() if f2 != faction 
            for m in ms
        ]
        border_ids = set()
        # Sample for performance: check every 10th settlement
        for m in members[::10]:
            for olat, olon in other_points[::50]:  # sparse sample
                if haversine_km(m['lat'], m['lon'], olat, olon) < 50:
                    border_ids.add(m['id'])
                    break
        
        territories.append({
            "faction": faction,
            "label": FACTION_LABELS.get(faction, faction),
            "color": FACTION_COLORS.get(faction, '#666666'),
            "settlement_count": len(members),
            "total_population": sum(m['pop'] for m in members),
            "capital": {
                "id": capital['id'],
                "name": capital['name'],
                "lat": capital['lat'],
                "lon": capital['lon'],
                "population": capital['pop'],
            },
            "polygon": [[lon, lat] for lon, lat in hull],
            "border_settlement_sample": len(border_ids),
        })
    
    output = {
        "wire_version": 2,
        "generated": "2026-10-01",
        "faction_count": len(territories),
        "territories": territories,
    }
    
    with open(out_path, 'w') as f:
        json.dump(output, f)
    
    print(f"Factions: {len(territories)}")
    for t in territories:
        print(f"  {t['label']}: {t['settlement_count']} settlements, "
              f"capital={t['capital']['name']} ({t['capital']['population']:,})")
    print(f"Wrote: {out_path}")


if __name__ == "__main__":
    main()
