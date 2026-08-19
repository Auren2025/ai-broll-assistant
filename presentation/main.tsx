import { createRoot } from "react-dom/client";
import { parsePresentationData } from "../src/presentation/presentationData";
import { Presentation } from "./Presentation";
import "./presentation.css";

declare global {
  var __AI_BROLL_PRESENTATION__: unknown;
}

function render() {
  const rootElement = document.getElementById("root");
  if (!rootElement) throw new Error("Missing #root element");

  try {
    const data = parsePresentationData(globalThis.__AI_BROLL_PRESENTATION__);
    document.title = `${data.project.name} · Presentation`;
    createRoot(rootElement).render(<Presentation data={data} />);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    rootElement.innerHTML = `<main class="presentation-error"><h1>演示无法打开</h1><pre></pre></main>`;
    const pre = rootElement.querySelector("pre");
    if (pre) pre.textContent = message;
  }
}

render();
