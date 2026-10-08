import { Composition } from "remotion";
import { Demo, DEMO_FRAMES } from "./Demo";

export const Root = () => (
  <Composition
    id="Demo"
    component={Demo}
    durationInFrames={DEMO_FRAMES}
    fps={30}
    width={1280}
    height={720}
  />
);
