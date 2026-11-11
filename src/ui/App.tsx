import styles from "./App.module.css";
import { ProjectScreen } from "./project/ProjectScreen";
import { ProjectsScreen } from "./projects/ProjectsScreen";
import { TopBar } from "./shell/TopBar";
import { StorageHint } from "./storage/StorageHint";
import { useStoragePersistence } from "./storage/useStoragePersistence";
import { useOpenProject } from "./useOpenProject";

/**
 * The app shell: the screen that shows. The project list sits in a column
 * under the top bar. A project fills the window, and draws its own top
 * bar, since its controls sit in it. `main.tsx` puts the providers above it.
 */
export function App() {
  const { opened, lastOpenedId, open, close, showName } = useOpenProject();
  // Here, not in a screen, so it asks once per session and the hint stays.
  const storage = useStoragePersistence();

  if (opened !== undefined) {
    const hint = <StorageHint status={storage.status} slim />;
    return (
      <ProjectScreen
        key={opened.id}
        id={opened.id}
        name={opened.name}
        shell={{ onProjects: close, hint }}
        onProjectNameChange={showName}
      />
    );
  }
  return (
    <div className={styles.list}>
      <TopBar current={undefined} onProjects={close} />
      <main className={styles.content}>
        <StorageHint status={storage.status} />
        <ProjectsScreen
          onOpen={open}
          onCreated={storage.requestOnce}
          focusId={lastOpenedId}
        />
      </main>
    </div>
  );
}
