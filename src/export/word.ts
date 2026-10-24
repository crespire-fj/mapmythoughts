import { MARKER_INFO } from '../editor/markers';
import { treeOrder, depthOf, type MapSnapshot } from '../model/schema';

/**
 * A Word document: the map as a picture, then the outline. First-level branches become
 * Heading 1, second-level Heading 2, deeper levels bullets; notes follow as paragraphs.
 * The docx library is loaded only when this runs.
 */
export async function buildWord(
  snapshot: MapSnapshot,
  png: Blob,
  pngSize: { width: number; height: number },
): Promise<Blob> {
  const { Document, ExternalHyperlink, HeadingLevel, ImageRun, Packer, Paragraph, TextRun } =
    await import('docx');

  const maxWidth = 620; // points of usable page width
  const scale = Math.min(1, maxWidth / pngSize.width);
  const children = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun(snapshot.title || 'Untitled map')],
    }),
    new Paragraph({
      children: [
        new ImageRun({
          type: 'png',
          data: await png.arrayBuffer(),
          transformation: {
            width: Math.round(pngSize.width * scale),
            height: Math.round(pngSize.height * scale),
          },
        }),
      ],
    }),
  ];

  for (const id of treeOrder(snapshot)) {
    const node = snapshot.nodes.get(id)!;
    const depth = depthOf(snapshot, id);
    const prefix = node.marker ? `${MARKER_INFO[node.marker].glyph} ` : '';
    const label = `${prefix}${node.text.replace(/\n+/g, ' ')}`;
    const runs = node.link
      ? [
          new ExternalHyperlink({
            link: node.link,
            children: [new TextRun({ text: label, style: 'Hyperlink' })],
          }),
        ]
      : [new TextRun(label)];
    if (depth === 1)
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: runs }));
    else if (depth === 2)
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: runs }));
    else
      children.push(new Paragraph({ bullet: { level: Math.min(depth - 3, 8) }, children: runs }));
    if (node.note) {
      for (const line of node.note.split('\n')) {
        children.push(
          new Paragraph({
            indent: depth >= 3 ? { left: 720 * (depth - 2) } : undefined,
            children: [new TextRun({ text: line, italics: true, color: '555555' })],
          }),
        );
      }
    }
  }

  const document = new Document({
    creator: 'Map My Thoughts',
    title: snapshot.title,
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ children }],
  });
  return Packer.toBlob(document);
}
