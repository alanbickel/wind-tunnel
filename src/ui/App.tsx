import { useState } from "react";
import { ProjectScreen } from "./project/ProjectScreen";
import { ProjectsScreen } from "./projects/ProjectsScreen";

/**
 * The app shell: the layout every screen sits in, and which screen shows.
 * `main.tsx` puts the providers above it.
 */
export function App() {
  const [openId, setOpenId] = useState<string>();

  return (
    <main>
      <h1>Wind Tunnel</h1>
      {openId === undefined ? (
        <ProjectsScreen onOpen={setOpenId} />
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
