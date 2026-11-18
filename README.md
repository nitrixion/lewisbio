# lewisb.io

Personal portfolio site. It's plain HTML/CSS/JS with no build step, hosted on GitHub Pages at **https://lewisb.io**.

All content lives in [`site/data/profile.json`](site/data/profile.json), which is generated from a LinkedIn data export.

```
site/                    ← everything that gets published
  index.html, styles.css, app.js
  data/profile.json      ← the content
  CNAME                  ← tells GitHub Pages the domain is lewisb.io
scripts/linkedin_to_profile.py   ← LinkedIn export → profile.json
.github/workflows/pages.yml      ← deploys site/ on every push to main
```

## 1. Fill in your content from LinkedIn

1. On LinkedIn: **Me → Settings & Privacy → Data privacy → Get a copy of your data**.
   Choose *"Want something in particular?"* and tick **Profile, Positions, Education, Skills**
   (plus Projects, Certifications and Languages if you use them), then **Request archive**.
   LinkedIn emails you a download link, usually within about 10 minutes.
2. Run the importer on the zip (don't commit it; `.gitignore` already excludes it):

   ```bash
   python3 scripts/linkedin_to_profile.py ~/Downloads/Basic_LinkedInDataExport_*.zip
   ```

   Only public-profile fields are copied. Your address, birth date, phone numbers and connections are never read.
3. Open `site/data/profile.json` and add what the export doesn't include:
   - `links`: your LinkedIn profile URL, GitHub, and so on
   - `email`: leave it empty if you don't want it public
   - `avatar`: put a photo at `site/avatar.jpg` and set `"avatar": "avatar.jpg"`
   - `resume`: put a PDF at `site/resume.pdf` and set `"resume": "resume.pdf"`

   Re-running the importer later keeps these hand-edited fields.

Preview locally:

```bash
python3 -m http.server -d site 8000
```

Then open http://localhost:8000.

## 2. Turn on GitHub Pages (one time)

1. Merge this into `main`.
2. In the repo, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
   Every push to `main` that touches `site/` now redeploys. You can also run the workflow by hand from the Actions tab.
3. Under **Custom domain**, enter `lewisb.io` and save. Once DNS resolves (step 3), tick **Enforce HTTPS**.

GitHub Pages is free for public repositories. A private repo needs a paid GitHub plan.

## 3. Point the GoDaddy domain at GitHub (one time)

In GoDaddy: **My Products → lewisb.io → DNS → Manage DNS**.

1. Delete the existing `A` record for `@` (GoDaddy's "Parked" page) and any `CNAME` for `www`.
   If **Forwarding** is turned on for the domain, turn it off.
2. Add these records:

| Type  | Name | Value                  | TTL    |
|-------|------|------------------------|--------|
| A     | @    | 185.199.108.153        | 1 hour |
| A     | @    | 185.199.109.153        | 1 hour |
| A     | @    | 185.199.110.153        | 1 hour |
| A     | @    | 185.199.111.153        | 1 hour |
| AAAA  | @    | 2606:50c0:8000::153    | 1 hour |
| AAAA  | @    | 2606:50c0:8001::153    | 1 hour |
| AAAA  | @    | 2606:50c0:8002::153    | 1 hour |
| AAAA  | @    | 2606:50c0:8003::153    | 1 hour |
| CNAME | www  | nitrixion.github.io    | 1 hour |

DNS usually takes minutes to an hour, occasionally longer. Check it with:

```bash
dig +short lewisb.io
```

The HTTPS certificate is issued automatically after GitHub sees the DNS records. Until then, the "Enforce HTTPS" box stays greyed out.

**Optional, recommended:** verify the domain under GitHub **Settings (your account) → Pages → Add a domain**.
This adds a TXT record at GoDaddy and stops anyone else from claiming `lewisb.io` on GitHub Pages.
