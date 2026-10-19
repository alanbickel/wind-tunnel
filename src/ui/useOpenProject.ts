import { useState } from "react";

export interface OpenProjectState {
  /** The project on screen; undefined while the project list shows. */
  readonly openId: string | undefined;
  /** The project the user last had open, so the list can focus it again. */
  readonly lastOpenedId: string | undefined;
  readonly open: (id: string) => void;
  /** Back to the project list. */
  readonly close: () => void;
}

/** Which project is open, and which was open last. */
export function useOpenProject(): OpenProjectState {
  const [openId, setOpenId] = useState<string>();
  const [lastOpenedId, setLastOpenedId] = useState<string>();

  const open = (id: string) => {
    setOpenId(id);
    setLastOpenedId(id);
  };
  const close = () => {
    setOpenId(undefined);
  };
  return { openId, lastOpenedId, open, close };
}
