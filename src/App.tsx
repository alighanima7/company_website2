import { useEffect } from "react";
import type { JSX } from "react";

import { initScroll } from "./scroll";
import { Experience } from "./three/Experience";
import { Hud } from "./ui/Hud";
import { LangToggle } from "./ui/LangToggle";
import { Sections } from "./ui/Sections";
import { ThemeToggle } from "./ui/ThemeToggle";

export function App(): JSX.Element {
  useEffect(() => initScroll(), []);

  return (
    <>
      <Experience />
      <Sections />
      <Hud />
      <ThemeToggle />
      <LangToggle />
    </>
  );
}
