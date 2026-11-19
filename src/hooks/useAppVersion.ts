import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useState } from "react";

/** The running app's version, or "" until known (and outside the Tauri shell). */
export function useAppVersion(): string {
  const [version, setVersion] = useState("");
  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(""));
  }, []);
  return version;
}
