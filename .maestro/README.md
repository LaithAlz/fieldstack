# Maestro E2E flows

Local-only end-to-end smoke flows that drive the iOS simulator through real
user paths. Catches regressions like "filter chips stopped opening the sheet"
that pass typecheck + unit tests but break the app at runtime.

## One-time setup

1. **Install Maestro CLI** (macOS):
   ```sh
   curl -fsSL "https://get.maestro.mobile.dev" | bash
   ```
   Or via Homebrew: `brew tap mobile-dev-inc/tap && brew install maestro`.

2. **Boot an iOS simulator** with Expo Go installed.

## Running the smoke flow

In one terminal, start Metro:

```sh
cd fieldstack-app
bun run start
```

Open Expo Go on the sim and connect to the dev URL.

Then in another terminal:

```sh
maestro test .maestro/smoke.yaml
```

Maestro prints each step + a pass/fail summary, with a stack trace + screenshot
on failure.

## Why not in CI

iOS simulators only run on macOS GitHub-hosted runners ($0.08/min vs $0.008 for
Ubuntu), and the runs require building Expo Go and a working JS bundle — which
can take 2–3 minutes per CI run. Manual local execution before a risky PR is
the right cost/benefit for this project's scale. Revisit if regression rate
goes up.

## Adding a flow

Each file is a sequence of steps; `assertVisible`, `tapOn`, `back`, `swipe`,
`inputText` cover ~90% of cases. See [Maestro docs](https://maestro.mobile.dev/).

Focus new flows on whatever class of bugs you've shipped twice — that's the
signal a code-level test isn't catching it and you need device-level coverage.
