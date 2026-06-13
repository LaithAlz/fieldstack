# Releasing & over-the-air updates

How Onside ships: native builds through the App Store / Play Store, and
JS/asset fixes over-the-air (OTA) via EAS Update — including to a build that's
already live.

---

## One-time setup

1. `cd fieldstack-app`
2. `eas update:configure` — writes `extra.eas.projectId` and `updates.url`
   into `app.json` from your EAS account. (We keep those out of source; the
   command is idempotent.)
3. Fill the real Apple IDs in `eas.json` → `submit.production.ios`
   (`appleId`, `ascAppId`, `appleTeamId`).

`runtimeVersion` is already set to `{ "policy": "fingerprint" }` and
`expo-updates` is installed — nothing else to wire.

---

## Versioning model

- `eas.json` uses `appVersionSource: "remote"` with `autoIncrement` on the
  production profile, so **build numbers bump automatically** on EAS — you
  never hand-edit `buildNumber` / `versionCode`.
- Bump the **marketing version** (`expo.version`, e.g. `1.0.0` → `1.1.0`) by
  hand when you cut a release users will see as "new".

---

## The two kinds of update

### 1. Native build (App Store review required)

Needed whenever native code changes: a new native module, an Expo SDK bump, or
any `app.json` field that affects the native project (permissions, plugins,
icons, entitlements like `usesAppleSignIn`).

```
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

The **fingerprint** runtimeVersion changes automatically when native code
changes, which is the safety net: an OTA update built against new native code
can never be delivered to an older binary that lacks it (it would crash). If
the fingerprint changed, you *must* ship a binary — OTA can't carry native
changes.

### 2. OTA update (no review — for live builds)

JS-only and asset-only fixes (copy, layout, logic, bug fixes) go out instantly
to builds already in users' hands:

```
eas update --branch production --message "Fix venue card price wrap"
```

Allowed by App Store Guideline 2.5.6 and Play policy as long as it doesn't
change the app's primary purpose. The update only reaches builds whose
fingerprint runtimeVersion matches — older/newer native builds are skipped
automatically.

Channels (set per build profile in `eas.json`: `development` / `preview` /
`production`) map to update branches of the same name. So a `production`-channel
build receives `--branch production` updates.

---

## Updating WHILE a build is in review  ⚠️

Apple reviews the *exact binary* you submitted. An OTA update that changes what
the reviewer sees undermines that and risks rejection. So:

- **Do not** run `eas update --branch production` while a production build is
  "In Review". Wait until it's **Approved / Ready for Sale**.
- Keep developing safely by shipping to the **preview** branch instead
  (`eas update --branch preview`), which only reaches internal TestFlight
  builds on the `preview` channel — never the in-review binary.
- Once the build is live, `eas update --branch production` is the fast path for
  hotfixes — no resubmission, live in minutes.

If you genuinely must hotfix the in-review build (rare), expect to either pull
the submission or have the change re-reviewed; treat it as a last resort.

---

## Quick reference

| Change | How to ship |
|---|---|
| Copy / layout / logic / JS bug fix | `eas update --branch production` (live build) |
| New native module / SDK bump / permission / entitlement | `eas build` + `eas submit` (review) |
| Marketing version users should see change | bump `expo.version`, then build |
| Test something before production | `eas update --branch preview` |
