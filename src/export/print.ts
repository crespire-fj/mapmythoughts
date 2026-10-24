import { MARKER_INFO } from '../editor/markers';
import { childrenOf, ROOT_ID, type MapSnapshot } from '../model/schema';

const escape = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Prints the map (first page) and its outline with notes (following pages). In the print dialog,
 * choose "Save as PDF" for a PDF.
 */
export function printMap(snapshot: MapSnapshot, svg: string): void {
  const outline = (ids: string[]): string =>
    ids.length
      ? `<ul>${ids
          .map((id) => {
            const node = snapshot.nodes.get(id)!;
            const marker = node.marker
              ? `<span class="print-marker">${MARKER_INFO[node.marker].glyph}</span> `
              : '';
            const text = escape(node.text).replace(/\n/g, '<br>');
            const label = node.link ? `<a href="${escape(node.link)}">${text}</a>` : text;
            const note = node.note
              ? `<p class="print-note">${escape(node.note).replace(/\n/g, '<br>')}</p>`
              : '';
            return `<li>${marker}${label}${note}${outline(snapshot.children.get(id) ?? [])}</li>`;
          })
          .join('')}</ul>`
      : '';

  const root = document.createElement('div');
  root.id = 'print-root';
  root.innerHTML = `
    <section class="print-page print-page--map">${svg}</section>
    <section class="print-outline">
      <h1>${escape(snapshot.title || 'Untitled map')}</h1>
      ${outline([...childrenOf(snapshot, ROOT_ID, 'right'), ...childrenOf(snapshot, ROOT_ID, 'left')].map((n) => n.id))}
    </section>`;
  const svgElement = root.querySelector('svg');
  svgElement?.removeAttribute('width');
  svgElement?.removeAttribute('height');
  document.body.append(root);
  document.body.classList.add('is-printing');
  const cleanup = () => {
    root.remove();
    document.body.classList.remove('is-printing');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  // Let the SVG lay out before the print snapshot is taken.
  requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
}
