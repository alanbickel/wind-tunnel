import { useState } from "react";
import { ProjectScreen } from "./project/ProjectScreen";
import { ProjectsScreen } from "./projects/ProjectsScreen";
import { StorageHint } from "./storage/StorageHint";
import { useStoragePersistence } from "./storage/useStoragePersistence";

/**
 * The app shell: the layout every screen sits in, and which screen shows.
 * `main.tsx` puts the providers above it.
 */
export function App() {
  const [openId, setOpenId] = useState<string>();
  // Back on the list, focus returns to the project the user had open.
  const [lastOpenedId, setLastOpenedId] = useState<string>();
  // Here, not in a screen, so it asks once per session and the hint stays.
  const storage = useStoragePersistence();

  const open = (id: string) => {
    setOpenId(id);
    setLastOpenedId(id);
  };

  return (
    <main>
      <h1>Wind Tunnel</h1>
      <StorageHint status={storage.status} />
      {openId === undefined ? (
        <ProjectsScreen
          onOpen={open}
          onCreated={storage.requestOnce}
          focusId={lastOpenedId}
        />
      ) : (
        <ProjectScreen
          key={openId}
          id={openId}
          onClose={() => {
            setOpenId(undefined);
          }}
        />
      )}
    </main>
  );
}
