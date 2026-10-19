import { ProjectScreen } from "./project/ProjectScreen";
import { ProjectsScreen } from "./projects/ProjectsScreen";
import { StorageHint } from "./storage/StorageHint";
import { useStoragePersistence } from "./storage/useStoragePersistence";
import { ThemeControl } from "./theme/ThemeControl";
import { useOpenProject } from "./useOpenProject";

/**
 * The app shell: the layout every screen sits in, and which screen shows.
 * `main.tsx` puts the providers above it.
 */
export function App() {
  const { openId, lastOpenedId, open, close } = useOpenProject();
  // Here, not in a screen, so it asks once per session and the hint stays.
  const storage = useStoragePersistence();

  return (
    <main>
      <h1>Wind Tunnel</h1>
      <ThemeControl />
      <StorageHint status={storage.status} />
      {openId === undefined ? (
        <ProjectsScreen
          onOpen={open}
          onCreated={storage.requestOnce}
          focusId={lastOpenedId}
        />
      ) : (
        <ProjectScreen key={openId} id={openId} onClose={close} />
      )}
    </main>
  );
}
