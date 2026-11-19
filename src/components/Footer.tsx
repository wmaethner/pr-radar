import { useAppVersion } from "../hooks/useAppVersion";

/** The bottom of the window: which version is running. */
export function Footer() {
  const version = useAppVersion();
  return <footer className="app-footer muted">PR Radar{version && ` ${version}`}</footer>;
}
