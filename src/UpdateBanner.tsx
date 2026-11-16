import { useEffect, useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { checkForUpdate, installUpdate } from "./update";

/** Checks for a newer release once on mount and offers to install it. Renders nothing when up to date. */
export function UpdateBanner() {
  const [newVersion, setNewVersion] = useState<Update | null>(null);
  const [installing, setInstalling] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => {
    checkForUpdate().then(setNewVersion);
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
