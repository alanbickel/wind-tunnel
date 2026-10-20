import styles from "./App.module.css";
import { ProjectScreen } from "./project/ProjectScreen";
import { ProjectsScreen } from "./projects/ProjectsScreen";
import { TopBar } from "./shell/TopBar";
import { StorageHint } from "./storage/StorageHint";
import { useStoragePersistence } from "./storage/useStoragePersistence";
import { useOpenProject } from "./useOpenProject";

/**
 * The app shell: the top bar, and below it the screen that shows. The
 * project list sits in a column; a project fills the window.
 * `main.tsx` puts the providers above it.
 */
export function App() {
  const { opened, lastOpenedId, open, close } = useOpenProject();
  // Here, not in a screen, so it asks once per session and the hint stays.
  const storage = useStoragePersistence();

  return (
    <div className={opened === undefined ? styles.list : styles.project}>
      <TopBar projectName={opened?.name} onProjects={close} />
      <main className={styles.content}>
        <StorageHint status={storage.status} />
        {opened === undefined ? (
          <ProjectsScreen
            onOpen={open}
            onCreated={storage.requestOnce}
            focusId={lastOpenedId}
          />
        ) : (
          <ProjectScreen key={opened.id} id={opened.id} />
        )}
      </main>
    </div>
  );
}
