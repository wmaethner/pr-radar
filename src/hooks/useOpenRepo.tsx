import { createContext, useContext } from "react";

/** Opens a repo's local clone in the editor. App provides it, so the buttons anywhere in the tree need no props. */
const OpenRepoContext = createContext<(repo: string) => void>(() => {});

export const OpenRepoProvider = OpenRepoContext.Provider;
export const useOpenRepo = () => useContext(OpenRepoContext);
