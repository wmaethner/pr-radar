import { useEffect, useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { checkForUpdate, installUpdate } from "../platform/update";

/** How often to re-check while the app stays open. The check is one small request for the release manifest. */
const UPDATE_POLL_MS = 2 * 60 * 60 * 1000;

/** Checks for a newer release on mount and every 2 hours after, and offers to install it. Renders nothing when up to date. */
export function UpdateBanner() {
  const [newVersion, setNewVersion] = useState<Update | null>(null);
  const [installing, setInstalling] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = () =>
      checkForUpdate().then((u) => {
        // A failed or empty re-check must not hide an update we already found.
        if (u && !cancelled) setNewVersion(u);
      });
    check();
    const id = setInterval(check, UPDATE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!newVersion) return null;
  return (
    <div className="update-banner">
      <span>Version {newVersion.version} is available.</span>
      <button
        disabled={installing}
        onClick={async () => {
          setInstalling(true);
          setUpdateError(null);
          try {
            await installUpdate(newVersion);
          } catch (e) {
            setUpdateError(String(e));
            setInstalling(false);
          }
        }}
      >
        {installing ? "Installing…" : "Update and restart"}
      </button>
      {updateError && <span className="error">{updateError}</span>}
    </div>
  );
}
