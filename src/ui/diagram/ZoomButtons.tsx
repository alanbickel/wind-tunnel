import type { ReactNode } from "react";
import { Button } from "../shared/Button";
import { FitIcon, ZoomInIcon, ZoomOutIcon } from "../shared/ZoomIcons";
import type { ZoomActions } from "./zoom-actions";

export interface ZoomButtonsProps {
  /** None until the canvas has loaded: the buttons then say they're unusable. */
  readonly zoom: ZoomActions | undefined;
}

/**
 * Zoom out, zoom in, and fit, as icon buttons. Each one's name is its
 * `label`, and the same text is its tooltip.
 */
export function ZoomButtons({ zoom }: ZoomButtonsProps) {
  const usable = zoom !== undefined;
  return (
    <>
      <ZoomButton text="Zoom out" usable={usable} onClick={zoom?.zoomOut}>
        <ZoomOutIcon />
      </ZoomButton>
      <ZoomButton text="Zoom in" usable={usable} onClick={zoom?.zoomIn}>
        <ZoomInIcon />
      </ZoomButton>
      <ZoomButton text="Fit to screen" usable={usable} onClick={zoom?.fit}>
        <FitIcon />
      </ZoomButton>
    </>
  );
}

interface ZoomButtonProps {
  readonly text: string;
  readonly usable: boolean;
  readonly onClick: (() => void) | undefined;
  /** The icon. */
  readonly children: ReactNode;
}

function ZoomButton({ text, usable, onClick, children }: ZoomButtonProps) {
  return (
    <Button
      variant="icon"
      label={text}
      title={text}
      usable={usable}
      onClick={() => {
        onClick?.();
      }}
    >
      {children}
    </Button>
  );
}
