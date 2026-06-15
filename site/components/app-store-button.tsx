// App Store CTA. Placeholder href until the app is approved — swap the id.
const APP_STORE_URL = "https://apps.apple.com/app/onside/id000000000";

export function AppStoreButton({ label = "Download Onside on the App Store" }: { label?: string }) {
  return (
    <a className="appstore" href={APP_STORE_URL} aria-label={label}>
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M16.36 12.78c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.71-3.19-1.73-1.36-.14-2.65.8-3.34.8-.69 0-1.75-.78-2.88-.76-1.48.02-2.85.86-3.61 2.19-1.54 2.67-.39 6.62 1.1 8.79.73 1.06 1.6 2.25 2.74 2.21 1.1-.05 1.51-.71 2.84-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.93-1.08 2.65-2.15.84-1.23 1.18-2.42 1.2-2.48-.03-.01-2.29-.88-2.31-3.5zM14.2 6.3c.6-.74 1.01-1.76.9-2.78-.87.04-1.93.58-2.56 1.31-.56.65-1.05 1.69-.92 2.68.97.08 1.97-.49 2.58-1.21z" />
      </svg>
      <span>
        <span className="small">Download on the</span>
        <span className="big">App Store</span>
      </span>
    </a>
  );
}
