#!/usr/bin/env python3
"""Build site/data/profile.json from a LinkedIn data export.

Get the export: LinkedIn > Settings & Privacy > Data privacy >
"Get a copy of your data" > pick the files you want (or "the works"). LinkedIn
emails a link to a .zip, usually within ~10 minutes for the basic set.

Usage:
    python3 scripts/linkedin_to_profile.py path/to/export.zip
    python3 scripts/linkedin_to_profile.py path/to/unzipped-folder

Only public-profile fields are copied (name, headline, about, positions,
education, skills, projects, certifications, languages). Address, birth date,
phone numbers, email addresses, connections and messages are never read.

Fields you set by hand in the existing profile.json (email, avatar, resume,
links, contactBlurb) are kept unless the export provides a value.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT / "site" / "data" / "profile.json"

MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}

# Fields that never come from LinkedIn and should survive a re-import.
HAND_EDITED = ("email", "avatar", "resume", "contactBlurb")


class Export:
    """Reads CSVs from either a .zip or a directory, matching by file name."""

    def __init__(self, path: Path):
        self.path = path
        if path.is_file() and zipfile.is_zipfile(path):
            self.zip = zipfile.ZipFile(path)
            self.names = {Path(n).name.lower(): n for n in self.zip.namelist() if n.lower().endswith(".csv")}
        elif path.is_dir():
            self.zip = None
            self.names = {p.name.lower(): str(p) for p in path.rglob("*.csv")}
        else:
            sys.exit(f"Not a zip file or directory: {path}")

    def rows(self, filename: str) -> list[dict[str, str]]:
        key = self.names.get(filename.lower())
        if not key:
            return []
        raw = self.zip.read(key) if self.zip else Path(key).read_bytes()
        text = raw.decode("utf-8-sig", errors="replace")
        lines = text.splitlines(keepends=True)
        # Some LinkedIn CSVs start with a "Notes:" preamble; skip to the header row.
        start = next((i for i, l in enumerate(lines) if "," in l and not l.lower().startswith("notes")), 0)
        reader = csv.DictReader(io.StringIO("".join(lines[start:])))
        return [{(k or "").strip(): (v or "").strip() for k, v in row.items()} for row in reader]


def col(row: dict[str, str], *names: str) -> str:
    """First non-empty value among several possible column names."""
    lower = {k.lower(): v for k, v in row.items()}
    for n in names:
        v = lower.get(n.lower(), "")
        if v:
            return v
    return ""


def date_key(s: str) -> tuple[int, int]:
    """Sortable (year, month) for strings like 'Mar 2021', '2021', '2021-03'."""
    if not s:
        return (9999, 12)  # empty = ongoing = newest
    m = re.search(r"(\d{4})", s)
    year = int(m.group(1)) if m else 0
    mon = 0
    mm = re.match(r"([A-Za-z]{3})", s)
    if mm:
        mon = MONTHS.get(mm.group(1).lower(), 0)
    else:
        mm = re.match(r"\d{4}-(\d{1,2})", s)
        if mm:
            mon = int(mm.group(1))
    return (year, mon)


def parse_websites(s: str) -> list[dict[str, str]]:
    """LinkedIn stores websites like '[PERSONAL:https://a.com],[COMPANY:b.com]'."""
    links = []
    for part in re.findall(r"\[([^\]]+)\]", s) or ([s] if s else []):
        label, _, url = part.partition(":") if re.match(r"^[A-Z_]+:", part) else ("", "", part)
        url = url.strip()
        if not url:
            continue
        if not re.match(r"^https?://", url):
            url = "https://" + url
        label = {"PERSONAL": "Website", "OTHER": "Website", "RSS": "Blog"}.get(label, label.replace("_", " ").title())
        links.append({"label": label or "Website", "url": url})
    return links


def build(export: Export, existing: dict) -> dict:
    prof_rows = export.rows("Profile.csv")
    prof = prof_rows[0] if prof_rows else {}
    if not prof:
        print("warning: Profile.csv not found; name/headline/summary left as-is", file=sys.stderr)

    name = " ".join(filter(None, [col(prof, "First Name"), col(prof, "Last Name")])) or existing.get("name", "")
    location = col(prof, "Geo Location", "Location") or existing.get("location", "")

    experience = [{
        "company": col(r, "Company Name", "Company"),
        "title": col(r, "Title"),
        "location": col(r, "Location"),
        "start": col(r, "Started On", "Start Date"),
        "end": col(r, "Finished On", "End Date"),
        "description": col(r, "Description"),
    } for r in export.rows("Positions.csv")]
    # Newest first; stable so LinkedIn's own order breaks ties.
    experience.sort(key=lambda j: (date_key(j["end"]), date_key(j["start"])), reverse=True)

    education = [{
        "school": col(r, "School Name"),
        "degree": ", ".join(filter(None, [col(r, "Degree Name"), col(r, "Field Of Study", "Field of Study")])),
        "start": col(r, "Start Date", "Started On"),
        "end": col(r, "End Date", "Finished On"),
        "notes": col(r, "Notes"),
        "activities": col(r, "Activities"),
    } for r in export.rows("Education.csv")]
    education.sort(key=lambda e: date_key(e["end"]), reverse=True)

    projects = [{
        "title": col(r, "Title"),
        "description": col(r, "Description"),
        "url": col(r, "Url", "URL"),
        "start": col(r, "Started On"),
        "end": col(r, "Finished On"),
    } for r in export.rows("Projects.csv")]
    projects.sort(key=lambda p: date_key(p["end"]), reverse=True)

    certifications = [{
        "name": col(r, "Name"),
        "authority": col(r, "Authority"),
        "url": col(r, "Url", "URL"),
        "start": col(r, "Started On"),
        "end": col(r, "Finished On"),
    } for r in export.rows("Certifications.csv")]

    skills = [col(r, "Name") for r in export.rows("Skills.csv") if col(r, "Name")]
    languages = [{"name": col(r, "Name"), "proficiency": col(r, "Proficiency")}
                 for r in export.rows("Languages.csv") if col(r, "Name")]

    # Links: keep hand-added ones, add any websites from the profile not already present.
    links = list(existing.get("links", []))
    seen = {l.get("url", "").rstrip("/").lower() for l in links}
    for l in parse_websites(col(prof, "Websites")):
        if l["url"].rstrip("/").lower() not in seen:
            links.append(l)
            seen.add(l["url"].rstrip("/").lower())

    out = {
        "name": name,
        "headline": col(prof, "Headline") or existing.get("headline", ""),
        "location": location,
        **{k: existing.get(k, "") for k in HAND_EDITED},
        "links": links,
        "summary": col(prof, "Summary") or existing.get("summary", ""),
        "experience": experience or existing.get("experience", []),
        "projects": projects or existing.get("projects", []),
        "education": education or existing.get("education", []),
        "certifications": certifications or existing.get("certifications", []),
        "skills": skills or existing.get("skills", []),
        "languages": languages or existing.get("languages", []),
    }
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("export", type=Path, help="LinkedIn export .zip or unzipped folder")
    ap.add_argument("-o", "--out", type=Path, default=DEFAULT_OUT, help=f"output JSON (default: {DEFAULT_OUT.relative_to(ROOT)})")
    ap.add_argument("--fresh", action="store_true", help="ignore the existing profile.json instead of merging hand-edited fields")
    args = ap.parse_args()

    existing = {}
    if args.out.exists() and not args.fresh:
        existing = json.loads(args.out.read_text())
        if "_comment" in existing and "PLACEHOLDER" in existing["_comment"]:
            # Don't carry placeholder content forward, but keep real-looking links.
            existing = {"links": [l for l in existing.get("links", []) if "your-handle" not in l.get("url", "")]}

    profile = build(Export(args.export), existing)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(profile, indent=2, ensure_ascii=False) + "\n")

    counts = ", ".join(f"{len(profile[k])} {k}" for k in ("experience", "education", "projects", "certifications", "skills"))
    print(f"Wrote {args.out} for {profile['name'] or '(no name)'}: {counts}")
    if not any("linkedin.com" in l.get("url", "") for l in profile["links"]):
        print("tip: add your LinkedIn URL to \"links\" in profile.json (the export doesn't include it)")


if __name__ == "__main__":
    main()
