import { renderOptions } from "./options";

const root = document.getElementById("app");
if (root) {
  renderOptions(root).catch((error) => {
    root.textContent = `Couldn't load settings: ${error?.message}`;
  });
}
