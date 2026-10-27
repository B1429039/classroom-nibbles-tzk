export class PinballTableOverlay {
  readonly #element: HTMLElement;

  constructor(container: HTMLElement) {
    this.#element = document.createElement("div");
    this.#element.className = "pinball-table-overlay";
    this.#element.dataset.testid = "pinball-table-overlay";
    this.#element.dataset.visualStyle = "classic-space-pinball";
    this.#element.setAttribute("aria-hidden", "true");

    const leftRail = document.createElement("span");
    leftRail.className = "pinball-table-overlay__rail pinball-table-overlay__rail--left";
    this.#element.append(leftRail);
    container.append(this.#element);
  }

  dispose(): void {
    this.#element.remove();
  }
}
