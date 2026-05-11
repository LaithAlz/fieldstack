# FieldStack mobile app

Expo + React Native client for the FieldStack venue/field directory.

## Getting started

```bash
npm install
npx expo start
```

Open the dev server in Expo Go (iOS / Android), the iOS simulator, or an Android emulator. The app expects `EXPO_PUBLIC_API_URL` to point at the Fastify backend (see the root `README.md` for backend setup).

## Maps

The Map View screen uses [`react-native-maps`](https://github.com/react-native-maps/react-native-maps):

- **iOS**: Apple Maps — no API key, no extra configuration.
- **Android**: Google Maps — the Expo Go binary ships with a development key, so you can run in Expo Go without setup. For a standalone production build, drop your own Google Maps API key into `app.json` under `android.config.googleMaps.apiKey`.
- Works in Expo Go on both platforms — no dev build is required to develop the map screen.

(We evaluated Mapbox and switched to `react-native-maps` to avoid the Mapbox account + dev-build requirement; the F5.4 ticket was originally written for Mapbox.)

## Scripts

| script | purpose |
|---|---|
| `npx expo start` | dev server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `expo lint` |
