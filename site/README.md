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

## Deploy (Cloudflare Pages — free, easy `.ca` custom domain)

1. Push this repo to GitHub (done).
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
3. Pick this repo. Build settings:
   - **Framework preset:** None
   - **Build command:** *(leave empty)*
   - **Build output directory:** `site`
4. Deploy. You'll get a `*.pages.dev` URL to verify.
5. **Custom domains → Add `getonside.ca`** and follow the DNS steps (Cloudflare
   adds the records automatically if the domain is on Cloudflare DNS).

Netlify/Vercel work the same way — set the publish/output directory to `site`
and no build command.

### Clean URLs (so `/support` works without `.html`)
Cloudflare Pages and Netlify serve `support.html` at `/support` automatically.
On a host that doesn't, either keep the `.html` links or add rewrites.

## Email
The site and app use `support@getonside.ca`. Set up free forwarding to your
inbox with **Cloudflare Email Routing** (Email → Email Routing → add
`support@` → forward to your address).

## After the app is live
Replace the placeholder App Store links in `index.html` (search for
`id000000000`) with the real `https://apps.apple.com/app/onside/id…` URL.
