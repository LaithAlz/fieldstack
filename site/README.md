# getonside.ca — marketing & support site

Static site (no build step) that serves as the App Store **Support URL** and
**Marketing URL**, plus the required **Privacy** and **Terms** pages.

```
site/
  index.html      → https://getonside.ca/
  support.html    → https://getonside.ca/support   (App Store Support URL)
  privacy.html    → https://getonside.ca/privacy   (App Store Privacy Policy URL)
  terms.html      → https://getonside.ca/terms
  styles.css
  assets/         icon + app screenshots
```

It's plain HTML/CSS — open `index.html` locally to preview, or serve the
folder with `python3 -m http.server` from inside `site/`.

`vercel.json` sets `cleanUrls`, so `/support`, `/privacy`, and `/terms` serve
without the `.html` extension (matching the URLs the app links to).

## Deploy (Vercel)

The repo is a monorepo, so point Vercel at the `site/` folder only.

**Dashboard:**
1. Vercel → **Add New → Project → Import** this GitHub repo.
2. **Root Directory → Edit → select `site`.**
3. Framework Preset: **Other**. Build command: *(empty)*. Output dir: *(empty —
   it's already static).*
4. Deploy → you get a `*.vercel.app` URL to verify.
5. **Project → Settings → Domains → add `getonside.ca`** (and `www`), then set
   the DNS records Vercel shows (an `A` record to Vercel's IP, or a `CNAME` for
   `www`). If the domain is registered elsewhere, add those records there.

**Or CLI** (from repo root):
```sh
npm i -g vercel
cd site && vercel --prod
```
`vercel` run inside `site/` treats it as the project root automatically.

## Email
The site and app use `support@getonside.ca`. Set up free forwarding to your
inbox — on Vercel-managed DNS use any email-routing provider (e.g. Cloudflare
Email Routing, or your registrar's forwarding) to forward `support@` to your
address.

## After the app is live
Replace the placeholder App Store links in `index.html` (search for
`id000000000`) with the real `https://apps.apple.com/app/onside/id…` URL.
