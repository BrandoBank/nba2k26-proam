"""
Run: python3 sub_game_ids.py input.sql output.sql
Substitutes GAME_ID_HERE in Part 1 with real Supabase game UUIDs.
Part 2 (rankings) uses series names directly and needs no changes.
"""

import re, sys

# (series_key, score_without_spaces) → game UUID
# Scores match "Team A X – Y Team B" comment lines (en-dash)
GAME_MAP = {
    # Series 1 · baseline era, 0-4 loss  (series 42923b20)
    ("Series1", "45–50"): "3aad79a8-fe28-4672-91d9-21e1a42694ac",
    ("Series1", "42–53"): "3a73c696-0767-44e2-952d-f0e57391fe36",
    ("Series1", "54–59"): "0a02f10c-edf2-405f-b9a2-9ca69dc7d50a",
    ("Series1", "47–52"): "e999fa28-b312-454c-a6da-bb4341db51a1",

    # Series 2 · redraft, 4-0 sweep  (series a08fd083)
    ("Series2", "48–43"): "724b4399-d73c-4765-b432-432373b304c9",
    ("Series2", "59–57"): "61fc806a-6c64-4264-83da-7171500e806b",
    ("Series2", "66–45"): "e7fbecce-b66b-4259-a977-e1fa8ee42524",
    ("Series2", "65–47"): "a489ebe8-63eb-45d1-a111-8ae3a896c8bf",

    # Series 3 · CASHINOUT_DOPE debut  (series cd21196b — these games have stats)
    ("Series3", "67–56"): "12f085ec-3849-422f-b9c8-29eba67dbf7a",
    ("Series3", "65–41"): "c3ca9ddd-b892-49d9-8ee4-17f445892880",
    ("Series3", "64–34"): "b3e4d8fb-7a92-4b50-b433-05ac189bc06c",
    ("Series3", "43–40"): "4fe62c73-329e-4d56-b54e-64cca9bcea65",

    # Series 4 · highest-scoring  (series b187a16d — these games have stats)
    ("Series4", "72–50"): "03630239-20bb-4da4-b25b-04ed89ce5d85",
    ("Series4", "65–63"): "e0af0a8b-a956-4a1a-86ee-7fb9f39f998b",
    ("Series4", "52–59"): "34bcf516-b48c-4051-b5d3-bfd9a7fb27d3",

    # Tandem Set  (series ca20cf45)
    ("Tandem", "42–43"):  "8290c562-af6b-477e-995f-da16b4323aeb",
    ("Tandem", "33–40"):  "67ce5ae8-357b-4c85-aa50-47800fb2a384",

    # Series 5 · threes and steals  (series 463dd523 — these games have stats)
    ("Series5", "64–42"): "7a9df029-ef35-43b6-bafe-55e00e6f3535",
    ("Series5", "50–39"): "b47462a1-81d6-4885-99a4-6c53a37e8279",
    ("Series5", "46–48"): "8477872e-07e8-4af1-a6a2-0b7939c48436",
    ("Series5", "49–39"): "f0e8ee28-7d05-4ff6-a2ae-3ae1f369c108",

    # Series 6 · one-game opener  (series c91c93fb)
    ("Series6", "51–33"): "d77f4c09-b2eb-4b12-8b34-b701957358b1",

    # Series 7 · 4-0 sweep  (series 749b2b2c)
    ("Series7", "69–57"): "d2af0ab1-40b6-43bf-9bc0-c09d1a48c8d6",
    ("Series7", "60–48"): "39f51aba-3db1-46b7-a3fa-c0fef5f65e9c",
    ("Series7", "51–35"): "1ff6e275-d2b0-409b-8bdd-3ac91378892d",
    ("Series7", "59–43"): "63201741-2d11-42f9-946c-ab275beefc75",
}

def normalize_score(raw):
    """Strip spaces around en-dash variants."""
    s = raw.replace(' – ', '–').replace(' - ', '–').replace('-', '–')
    return s

def series_key(name):
    m = re.search(r'Series (\d+)', name)
    if m:
        return f"Series{m.group(1)}"
    if 'Tandem' in name:
        return "Tandem"
    return None

if len(sys.argv) < 3:
    print("Usage: python3 sub_game_ids.py input.sql output.sql")
    sys.exit(1)

with open(sys.argv[1], encoding='utf-8') as f:
    lines = f.readlines()

current_series_key = None
current_uuid = None
out = []
subs = 0
warnings = []

for i, line in enumerate(lines):
    stripped = line.rstrip('\n')

    # Detect series section header (===== or ----- or -- 2K27 Series N style)
    if '=====' in stripped or '-----' in stripped or re.search(r'-- 2K27 (Series \d+|Tandem Set)', stripped):
        m = re.search(r'2K27 (Series \d+|Tandem Set)', stripped)
        if m:
            current_series_key = series_key(m.group(0))
            current_uuid = None

    # Detect game score line
    # matches: -- Game N: Team A 45 – 50 Team B
    g_match = re.search(r'Game \d+: Team A ([\d]+ [–\-] [\d]+) Team B', stripped)
    if g_match:
        raw_score = g_match.group(1)
        score = normalize_score(raw_score)
        key = (current_series_key, score)
        if key in GAME_MAP:
            current_uuid = GAME_MAP[key]
        else:
            current_uuid = None
            warnings.append(f"Line {i+1}: no UUID for {key!r}")

    # Substitute placeholder
    if "'GAME_ID_HERE'" in stripped:
        if current_uuid:
            stripped = stripped.replace("'GAME_ID_HERE'", f"'{current_uuid}'")
            subs += 1
        else:
            warnings.append(f"Line {i+1}: unmatched GAME_ID_HERE (series={current_series_key!r})")

    out.append(stripped + '\n')

with open(sys.argv[2], 'w', encoding='utf-8') as f:
    f.writelines(out)

print(f"✓ {subs} UUIDs substituted → {sys.argv[2]}")
if warnings:
    print(f"⚠ {len(warnings)} warnings:")
    for w in warnings:
        print(f"  {w}")
else:
    print("No warnings — all placeholders resolved.")
