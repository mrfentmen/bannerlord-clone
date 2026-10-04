# Detailed image prompt template (Pollinations, free, no key)

Del-approved 2026-09-30: Pollinations quality is acceptable when prompts are
very detailed with artifact guards. Use this structure for every 2D image.

## Template

[Style + subject], [color/material], [exact view], [use case, e.g. "military game asset style"].
[EXACT COUNTS in caps, e.g. "EXACTLY ONE single cannon barrel, one barrel only, no duplicate barrels"].
[Key parts list, each named once].
[Lighting], [background: "plain light gray seamless background"], [shadow].
[Texture/material detail].
[Composition guards]: "Clean symmetrical silhouette, correct proportions, centered composition, highly detailed".
[Negative guards]: "no text, no watermark, no logo, no people, no animals, no extra limbs, no duplicate parts, no floating objects, no distorted anatomy".

## Rules

- Always state exact counts for repeated parts (barrels, wheels, limbs, heads).
- Always include the negative guards; adapt the people/animals ban per subject.
- Plain ASCII only, no em dashes.
- Generate, visually inspect, refine prompt, regenerate until clean.
- API: https://image.pollinations.ai/prompt/{urlencoded}?width=1024&height=1024&nologo=true&model=flux
