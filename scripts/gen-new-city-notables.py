#!/usr/bin/env python3
"""
Generate notables TypeScript files for the 33 new cities.
Reads /tmp/new_notables.txt and generates lore using city-aware templates.
"""

import re
from pathlib import Path

# City character summaries (from the lore entries)
CITY_FLAVOR = {
    "san-antonio": ("the Alamo City", "River Walk", "military contracts"),
    "san-diego": ("America's Finest City", "the Navy", "border trade"),
    "san-jose": ("the Capital of Silicon Valley", "tech campuses", "innovation"),
    "austin": ("the Live Music Capital", "the tech corridor", "weirdness"),
    "jacksonville": ("the River City", "the St. Johns River", "Navy bases"),
    "fort-worth": ("where the West begins", "the stockyards", "cattle"),
    "columbus": ("Ohio's capital", "the university", "test market"),
    "charlotte": ("the Queen City", "banking", "NASCAR"),
    "indianapolis": ("the Circle City", "the 500", "crossroads"),
    "washington": ("the Capital", "government", "power"),
    "el-paso": ("the Pass City", "the border", "binational trade"),
    "oklahoma-city": ("the Big Friendly", "cowboy culture", "tribal nations"),
    "portland": ("the Rose City", "weirdness", "rain"),
    "memphis": ("the Blues City", "Beale Street", "the Mississippi"),
    "louisville": ("Derby City", "the Derby", "bourbon"),
    "milwaukee": ("the Brew City", "beer", "the lakefront"),
    "baltimore": ("Charm City", "the harbor", "neighborhoods"),
    "albuquerque": ("the Duke City", "the high desert", "balloons"),
    "tucson": ("the Old Pueblo", "the desert", "the university"),
    "fresno": ("the Raisin Capital", "agriculture", "the valley"),
    "sacramento": ("the River City", "the capital", "farm-to-fork"),
    "mesa": ("the East Valley", "suburbs", "Mormon roots"),
    "kansas-city": ("the City of Fountains", "barbecue", "jazz"),
    "omaha": ("the Gateway to the West", "Berkshire Hathaway", "the river"),
    "raleigh": ("the City of Oaks", "research", "universities"),
    "long-beach": ("the International City", "the port", "diversity"),
    "virginia-beach": ("the Resort City", "the Navy", "the beach"),
    "oakland": ("The Town", "the port", "activism"),
    "tulsa": ("the Oil Capital", "art deco", "Greenwood"),
    "tampa": ("the Big Guava", "cigars", "the port"),
    "arlington": ("the Entertainment Capital", "stadiums", "sports"),
    "wichita": ("the Air Capital", "aviation", "the plains"),
}

ROLE_LORE = {
    "merchant": "runs the {city} trade house, moving goods through {detail}. {bg} Now {rep}.",
    "artisan": "is {city}'s master {craft}, crafting the {goods} the city depends on. {bg} {rep}.",
    "elder": "is the {elder_role} of {city}'s {community}, the {desc} who {achievement}. {rep}.",
    "fixer": "arranges the quiet deals in {city} — {deals}. {bg} {rep}.",
    "scholar": "is {city}'s foremost {field}, documenting {subject}. {bg} {rep}.",
    "captain": "commands the {city} freight runs, {route_detail}. {bg} {rep}.",
}

def generate_lore(name, title, ethnicity, gender, portrait, type_, power, city_id):
    """Generate 2-sentence lore for a notable."""
    flavor = CITY_FLAVOR.get(city_id, ("the city", "trade", "commerce"))
    city_nick, city_detail, city_trade = flavor

    first = name.split()[0]

    # Role-specific second sentences
    if type_ == "merchant":
        lore = f"{name} runs {city_nick}'s trade network, moving goods through {city_detail}. A fixture of {city_trade}, {first}'s word on a contract is law."
    elif type_ == "artisan":
        lore = f"{name} is {city_nick}'s master craftsperson, whose work defines {city_detail}. The quality is legendary; the waiting list is long."
    elif type_ == "elder":
        lore = f"{name} is the elder of {city_nick}'s community, the voice that guides {city_detail}. Decades of service earned the respect; the wisdom keeps it."
    elif type_ == "fixer":
        lore = f"{name} arranges {city_nick}'s quiet deals — {city_trade}, introductions, problems solved. Discretion is absolute; the success rate is perfect."
    elif type_ == "scholar":
        lore = f"{name} documents {city_nick}'s story, the {city_detail} that defines it. The archive grows; the truth is preserved."
    elif type_ == "captain":
        lore = f"{name} commands {city_nick}'s freight runs through {city_detail}. The schedule holds; the cargo arrives."
    else:
        lore = f"{name} is a fixture of {city_nick}, known through {city_detail}. The reputation is earned."

    return lore

def parse_notables():
    """Parse /tmp/new_notables.txt into structured data."""
    with open("/tmp/new_notables.txt") as f:
        content = f.read()

    cities = {}
    current_city = None
    for line in content.split("\n"):
        city_match = re.match(r"// ([a-z-]+)", line)
        if city_match:
            current_city = city_match.group(1)
            cities[current_city] = []
            continue
        m = re.match(r'\s+\{ name: "([^"]+)", title: "([^"]+)", ethnicityId: "([^"]+)", gender: "([^"]+)", portraitKey: "([^"]+)", type: "([^"]+)", power: (\d+) \},', line)
        if m and current_city:
            cities[current_city].append({
                "name": m.group(1),
                "title": m.group(2),
                "ethnicityId": m.group(3),
                "gender": m.group(4),
                "portraitKey": m.group(5),
                "type": m.group(6),
                "power": int(m.group(7)),
            })
    return cities

def generate_ts(city_id, notables):
    """Generate TypeScript file content for a city."""
    lines = [
        f"/**",
        f" * {city_id} notables (del order 2026-10-04).",
        f" * Generated via pipeline from the seeded name generator.",
        f" */",
        "",
        'import { addNotables } from "../cityNotables.js";',
        "",
        f'addNotables("{city_id}", [',
    ]
    for n in notables:
        lore = generate_lore(n["name"], n["title"], n["ethnicityId"], n["gender"], n["portraitKey"], n["type"], n["power"], city_id)
        # Escape quotes in lore
        lore = lore.replace('"', '\\"')
        lines.append("  {")
        lines.append(f'    name: "{n["name"]}", title: "{n["title"]}", ethnicityId: "{n["ethnicityId"]}", gender: "{n["gender"]}",')
        lines.append(f'    portraitKey: "{n["portraitKey"]}", type: "{n["type"]}", power: {n["power"]},')
        lines.append(f'    lore: "{lore}",')
        lines.append("  },")
    lines.append("]);")
    return "\n".join(lines)

def main():
    cities = parse_notables()
    print(f"Parsed {len(cities)} cities")

    # Group into 3 files of 11 cities each
    city_list = sorted(cities.keys())
    groups = [city_list[i:i+11] for i in range(0, len(city_list), 11)]

    out_dir = Path("/home/hatch/workspace/bannerlord-clone/clients/campaign/src/data/notables")
    for idx, group in enumerate(groups, 1):
        filename = f"newCities{idx}.ts"
        with open(out_dir / filename, "w") as f:
            f.write(f"/**\n * New cities batch {idx} (del order 2026-10-04).\n * Generated via pipeline.\n */\n\n")
            f.write('import { addNotables } from "../cityNotables.js";\n\n')
            for city_id in group:
                notables = cities[city_id]
                # Generate addNotables call
                f.write(f'addNotables("{city_id}", [\n')
                for n in notables:
                    lore = generate_lore(n["name"], n["title"], n["ethnicityId"], n["gender"], n["portraitKey"], n["type"], n["power"], city_id)
                    lore = lore.replace('"', '\\"')
                    f.write("  {\n")
                    f.write(f'    name: "{n["name"]}", title: "{n["title"]}", ethnicityId: "{n["ethnicityId"]}", gender: "{n["gender"]}",\n')
                    f.write(f'    portraitKey: "{n["portraitKey"]}", type: "{n["type"]}", power: {n["power"]},\n')
                    f.write(f'    lore: "{lore}",\n')
                    f.write("  },\n")
                f.write("]);\n\n")
        print(f"  Wrote {filename}: {len(group)} cities")

    print("Done. Update index.ts to import the new files.")

if __name__ == "__main__":
    main()
