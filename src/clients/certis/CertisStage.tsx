import { useEffect, useState } from "react";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import certisLogoUrl from "./assets/certis-logo.png";

/** The Certis design is drawn for a 1920×1080 kiosk; other screens get the same layout scaled to fit. */
const STAGE_WIDTH = 1920;
const STAGE_HEIGHT = 1080;

function fitScale(): number {
  return Math.min(window.innerWidth / STAGE_WIDTH, window.innerHeight / STAGE_HEIGHT);
}

function useStageScale(): number {
  const [scale, setScale] = useState(fitScale);

  useEffect(() => {
    const onResize = (): void => setScale(fitScale());
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  return scale;
}

interface CertisStageProps {
  children: ReactNode;
}

export function CertisStage({ children }: CertisStageProps): ReactElement {
  const scale = useStageScale();

  return (
    <div className="certis-viewport">
      <main className="certis-stage" style={{ "--certis-scale": scale } as CSSProperties}>
        <img className="certis-logo" src={certisLogoUrl} alt="Certis" />
        {children}
      </main>
    </div>
  );
}
