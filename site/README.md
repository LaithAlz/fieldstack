# getonside.ca — marketing & support site (Next.js)

Next.js (App Router, TypeScript) site that serves as the App Store **Support
URL** and **Marketing URL**, plus the required **Privacy** and **Terms** pages.
Built as a Next app (not static HTML) so it can grow into a real web app —
add app routes, API routes, and auth later, sharing `api.getonside.ca`.

```
site/
  app/
    layout.tsx        fonts (next/font), metadata, Vercel Analytics + Speed Insights
    page.tsx          landing  → /
    support/page.tsx  → /support   (App Store Support URL)
    privacy/page.tsx  → /privacy   (App Store Privacy Policy URL)
    terms/page.tsx    → /terms
    globals.css       "Night Kickoff" brand styles
  components/         nav, footer, app-store-button
  public/            mark.svg + app screenshots
```

## Develop / build

```sh
cd site
npm install
npm run dev      # http://localhost:3000
npm run build    # production build (also runs TypeScript checks)
```

## Deploy (Vercel)

Monorepo, so point Vercel at the `site/` folder:
1. Vercel → project → **Settings → Build & Deployment → Root Directory → `site`**.
2. Framework Preset: **Next.js** (auto-detected). No other config needed.
3. **Settings → Domains → add `getonside.ca` + `www`** and set the DNS records.

Analytics: **Settings → Analytics → Enable Web Analytics** and **Speed Insights**
(the `<Analytics/>` + `<SpeedInsights/>` components are already in the layout).

## Email
The site uses `support@getonside.ca`. Set up free forwarding (Cloudflare Email
Routing, or your registrar) to your inbox.

## After the app is live
Replace the placeholder App Store URL in `components/app-store-button.tsx`
(`id000000000`) with the real `https://apps.apple.com/app/onside/id…`.

## Later: the app on the web
The phone app (`../fieldstack-app`) can target web via Expo (react-native-web):
`expo export --platform web`. The natural home is a subdomain like
`app.getonside.ca`, reusing the RN code — while this Next.js site stays the
SEO-friendly marketing front door. (react-native-maps needs a web map swap;
some native modules no-op on web.)
