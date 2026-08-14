export class Tooltip {
  constructor(private readonly element: HTMLElement) {}

  show(html: string, clientX: number, clientY: number): void {
    this.element.innerHTML = html;
    this.element.style.left = `${clientX}px`;
    this.element.style.top = `${clientY}px`;
    this.element.hidden = false;
  }

  hide(): void {
    this.element.hidden = true;
  }
}
