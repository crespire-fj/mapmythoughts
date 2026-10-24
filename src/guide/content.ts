import {
  ArrowDownUp,
  Bookmark,
  Boxes,
  Brush,
  CircleCheck,
  Copy,
  Crosshair,
  DatabaseBackup,
  Download,
  FileDown,
  FileText,
  FileUp,
  FolderInput,
  FolderOpen,
  GitFork,
  GripVertical,
  Hand,
  History,
  Image,
  Indent,
  Keyboard,
  LayoutTemplate,
  Link,
  ListTree,
  Map as MapIcon,
  MonitorSmartphone,
  MousePointerClick,
  NotebookPen,
  Palette,
  PenLine,
  Presentation,
  RotateCcw,
  Save,
  Search,
  Shapes,
  Share2,
  ShieldCheck,
  Spline,
  SquareDashedMousePointer,
  Tag,
  Trash2,
  Undo2,
  Workflow,
  ZoomIn,
  type LucideIcon,
} from 'lucide-react';
import { alt, mod } from '../editor/ShortcutHelp';

/** A picture drawn from the app's own data, so the guide can't drift from what the app offers. */
export type GuideVisual = 'templates' | 'themes' | 'shapes' | 'markers' | 'keyboard';

export interface Feature {
  title: string;
  Icon: LucideIcon;
  /** `backticks` mark keys; they are drawn as keycaps */
  text: string;
  /** added in the latest batch */
  isNew?: boolean;
  visual?: GuideVisual;
}

export interface GuideSection {
  id: string;
  title: string;
  intro: string;
  Icon: LucideIcon;
  features: Feature[];
}

export const QUICK_START: { keys: string; text: string }[] = [
  { keys: 'Template', text: 'Pick a template on the start page' },
  { keys: 'Tab', text: 'Add a child to the selected node' },
  { keys: 'Enter', text: 'Add a sibling below it' },
  { keys: '← ↑ ↓ →', text: 'Move between nodes' },
  { keys: 'Type', text: 'Start typing to replace the text' },
];

export const GUIDE: GuideSection[] = [
  {
    id: 'start',
    title: 'Getting started',
    intro: 'Make a map in a couple of clicks. It saves itself as you go.',
    Icon: LayoutTemplate,
    features: [
      {
        title: 'Templates',
        Icon: LayoutTemplate,
        text: 'Start a blank map or use a ready-made structure. Each template comes with its own theme, which you can change later.',
        visual: 'templates',
      },
      {
        title: 'Import a Markdown outline',
        Icon: FileUp,
        text: 'Click Import on the start page and choose a .md or .txt outline. Headings and bullets become branches. Quoted lines (starting with `>`) become notes, and [text](url) becomes a web link.',
      },
      {
        title: 'Saves automatically',
        Icon: Save,
        text: 'Every change is saved as you make it. The dot next to the map title shows Saved, Saving… or Offline. If the connection drops, you can keep working, and your changes are saved once it comes back.',
      },
      {
        title: 'Light, dark or system',
        Icon: MonitorSmartphone,
        text: 'The sun or moon button switches between light mode, dark mode and following your Mac. You choose this per Mac, not per map.',
      },
    ],
  },
  {
    id: 'build',
    title: 'Build a map',
    intro: 'Build the whole map from the keyboard.',
    Icon: GitFork,
    features: [
      {
        title: 'Add children and siblings',
        Icon: GitFork,
        text: '`Tab` adds a child and `Enter` adds a sibling. Both also work while you are typing, so you can write a whole branch without touching the mouse.',
      },
      {
        title: 'Edit text',
        Icon: PenLine,
        text: 'Start typing to replace a node’s text, or press `F2` or double-click to edit it. `Shift+Enter` adds a line break. `Escape` stops editing.',
      },
      {
        title: 'Paste text as branches',
        Icon: FileText,
        text: `Paste an indented list or bullet points with \`${mod}+V\`. Each line becomes a node, and indentation becomes nesting.`,
      },
      {
        title: 'Duplicate and delete',
        Icon: Copy,
        text: `\`${mod}+D\` duplicates a branch. \`Delete\` or \`Backspace\` removes a branch. Deleting the central topic deletes the whole map, but it asks first.`,
      },
      {
        title: 'Undo and redo',
        Icon: Undo2,
        text: `\`${mod}+Z\` and \`${mod}+Shift+Z\` undo and redo. Every action is one step, including restoring an older version.`,
      },
    ],
  },
  {
    id: 'rearrange',
    title: 'Rearrange',
    intro: 'Move ideas around as your thinking changes.',
    Icon: ArrowDownUp,
    features: [
      {
        title: 'Drag and drop',
        Icon: GripVertical,
        text: 'Drag a node to move its whole branch. Drop it between siblings to reorder, or onto another node to put it under that node.',
      },
      {
        title: 'Move with the keyboard',
        Icon: Indent,
        text: `\`${alt}+↑\` and \`${alt}+↓\` move a node up and down among its siblings. \`${alt}+→\` indents it under the sibling above, and \`${alt}+←\` moves it out a level.`,
      },
      {
        title: 'Copy, cut and paste',
        Icon: Copy,
        text: `\`${mod}+C\`, \`${mod}+X\` and \`${mod}+V\` work on whole branches, including between maps. Copied branches also paste into other apps as an indented text list.`,
      },
      {
        title: 'Select several nodes',
        Icon: SquareDashedMousePointer,
        text: `Shift-click nodes, Shift-drag a box around them, or press \`${mod}+A\` to select all. You can then style, move or delete them together.`,
      },
    ],
  },
  {
    id: 'style',
    title: 'Style and meaning',
    intro:
      'Use shape, colour and markers to show what matters. Select a node and the style bar appears at the bottom.',
    Icon: Brush,
    features: [
      {
        title: 'Shapes',
        Icon: Shapes,
        text: 'Choose from four shapes. Underline gives a lighter look for detail-level ideas.',
        visual: 'shapes',
      },
      {
        title: 'Colours',
        Icon: Palette,
        text: 'By default a node follows its branch’s theme colour. You can pick a colour for one node, or for several selected nodes. Text colour is set automatically so it stays readable.',
      },
      {
        title: 'Markers',
        Icon: CircleCheck,
        text: `Show status or importance on a node. Set markers from the style bar or the details panel (\`${mod}+I\`). Markers also appear in picture, PDF and Word exports.`,
        visual: 'markers',
      },
      {
        title: 'Themes',
        Icon: Palette,
        text: 'A theme sets the colour of the central topic, the branches and the background. Choose one from the palette button in the toolbar. The new SPC theme uses the Pacific Community brand colours.',
        visual: 'themes',
        isNew: true,
      },
      {
        title: 'Layout and connectors',
        Icon: Workflow,
        text: 'Branches can spread left and right or top and bottom, with curved or elbow connectors. Find these options under the layout button in the toolbar.',
      },
    ],
  },
  {
    id: 'details',
    title: 'Notes and links',
    intro:
      'Add detail to a node without cluttering the map, and connect ideas on different branches.',
    Icon: NotebookPen,
    features: [
      {
        title: 'Notes',
        Icon: NotebookPen,
        text: `\`${mod}+I\` opens the details panel for the selected node, where you can write longer notes. A small note badge on the node shows that it has one. Click the badge to read it.`,
      },
      {
        title: 'Web links',
        Icon: Link,
        text: 'Add a web address in the details panel. A link badge appears on the node; click it to open the page in a new tab.',
      },
      {
        title: 'Cross-links',
        Icon: Spline,
        text: `Connect ideas on different branches with a dashed arrow. Select a node, press \`${alt}+L\` (or the link button in the style bar), then click the other node. You can also select two nodes and press the link button.`,
        isNew: true,
      },
      {
        title: 'Label or remove a cross-link',
        Icon: Tag,
        text: 'Click a cross-link to select it. `Enter` lets you write a label such as “depends on”, and `Delete` removes the link. If you delete a node, its cross-links go with it, and undo brings them back.',
        isNew: true,
      },
    ],
  },
  {
    id: 'navigate',
    title: 'Find your way around',
    intro: 'Move around large maps quickly.',
    Icon: MapIcon,
    features: [
      {
        title: 'Pan',
        Icon: Hand,
        text: 'Drag an empty part of the canvas, or scroll with two fingers on the trackpad.',
      },
      {
        title: 'Zoom',
        Icon: ZoomIn,
        text: `Pinch on the trackpad or ${mod}+scroll. \`${mod}+=\` zooms in, \`${mod}+−\` zooms out, and \`${mod}+0\` fits the whole map on screen.`,
      },
      {
        title: 'Overview map',
        Icon: MapIcon,
        text: 'The small map in the corner shows the whole map and where you are. Click it to jump to that part. Use the button next to it to hide it.',
      },
      {
        title: 'Find in map',
        Icon: Search,
        text: `\`${mod}+F\` searches every node, including hidden ones. Collapsed branches open to show each match.`,
      },
      {
        title: 'Collapse and levels',
        Icon: ListTree,
        text: `\`${mod}+.\` collapses or expands a branch, and a badge shows how many nodes are hidden. \`${alt}+1\`, \`${alt}+2\` and \`${alt}+3\` show that many levels, and \`${alt}+0\` expands everything.`,
      },
      {
        title: 'Outline',
        Icon: ListTree,
        text: 'The outline button shows the map as a list beside the canvas. Click a line to go to that node, or double-click it to rename the node.',
      },
    ],
  },
  {
    id: 'present',
    title: 'Focus and present',
    intro: 'Work on one branch at a time, or walk people through the map.',
    Icon: Presentation,
    features: [
      {
        title: 'Focus on a branch',
        Icon: Crosshair,
        text: `\`${alt}+F\` (or the focus button in the style bar) shows one branch as if it were the whole map. Edits go into the real map. The bar at the top shows where you are, and \`Escape\` takes you back.`,
        isNew: true,
      },
      {
        title: 'Present',
        Icon: Presentation,
        text: `\`${alt}+P\` (or the Present button) goes full screen. It starts with an overview, then shows each main branch in turn with the rest dimmed. Move on with the arrow keys, \`Space\` or a click, and press \`Escape\` to stop.`,
        isNew: true,
      },
    ],
  },
  {
    id: 'organise',
    title: 'Organise your maps',
    intro: 'Keep related maps together, for example one collection per project.',
    Icon: FolderOpen,
    features: [
      {
        title: 'Collections',
        Icon: FolderOpen,
        text: 'Click + next to Collections in the sidebar and give it a name, such as “FEMS”. New maps, templates and imports you start inside a collection go into it.',
      },
      {
        title: 'Move maps',
        Icon: FolderInput,
        text: 'Drag a map card onto a collection in the sidebar, or use the card’s ⋯ menu. Drop a card on “Not in a collection” to take it out.',
      },
      {
        title: 'Rename, recolour, delete',
        Icon: Brush,
        text: 'A collection’s page has buttons to rename it, change its colour and delete it. When you delete it, you choose whether to keep its maps or delete them too.',
      },
      {
        title: 'Map cards',
        Icon: Image,
        text: 'Each card shows a small picture of the map’s actual shape and colours, which updates a few seconds after you edit. Once you have more than three maps, use the filter box to find one by title.',
        isNew: true,
      },
      {
        title: 'Duplicate and delete maps',
        Icon: Trash2,
        text: 'A card’s ⋯ menu can duplicate the map (in the same collection) or delete it. Deleting can’t be undone, but backups keep a copy.',
      },
    ],
  },
  {
    id: 'history',
    title: 'Version history',
    intro: 'Go back to how a map looked earlier.',
    Icon: History,
    features: [
      {
        title: 'Named versions',
        Icon: Bookmark,
        text: 'Open History from the toolbar and save a version with a name, such as “Before the workshop”.',
      },
      {
        title: 'Automatic versions',
        Icon: History,
        text: 'While you edit, a version is also saved automatically every 30 minutes. The last 100 automatic versions of each map are kept.',
      },
      {
        title: 'Restore',
        Icon: RotateCcw,
        text: `Restoring brings back the whole map, cross-links included. If you change your mind, \`${mod}+Z\` undoes the restore.`,
      },
    ],
  },
  {
    id: 'share',
    title: 'Share and export',
    intro: 'Send maps to colleagues, or take them into other documents.',
    Icon: Share2,
    features: [
      {
        title: 'Share with a colleague',
        Icon: Share2,
        text: 'Save a .mmt file from a card’s ⋯ menu, from Export in a map, or from the export button on a collection’s page (which saves the whole collection). Your colleague clicks Import on their start page (files from before the rename, .eqapmap, still work). Everything comes across, and each map goes back into a collection with the same name.',
        isNew: true,
      },
      {
        title: 'Pictures',
        Icon: Image,
        text: 'PNG and SVG images of the whole map, including cross-links and markers, ready for slides and reports.',
      },
      {
        title: 'PDF',
        Icon: FileDown,
        text: 'Opens the print dialog: the map on the first page, then the outline with notes. Choose “Save as PDF” there.',
      },
      {
        title: 'Word and Markdown',
        Icon: FileText,
        text: 'Word gives you a picture of the map, then the outline as headings and bullets, with notes. Markdown gives you the outline as text, and you can import it again.',
      },
      {
        title: 'Export while focused',
        Icon: Download,
        text: 'If you export while focused on a branch, images and documents cover only that branch. A .mmt file always contains the whole map.',
      },
    ],
  },
  {
    id: 'data',
    title: 'Your data',
    intro: 'Everything stays on this Mac.',
    Icon: ShieldCheck,
    features: [
      {
        title: 'Private to this Mac',
        Icon: ShieldCheck,
        text: 'Map My Thoughts runs in Docker on this Mac and can only be opened from this Mac. Nothing is sent anywhere unless you share a file yourself.',
      },
      {
        title: 'Daily backups',
        Icon: DatabaseBackup,
        text: 'While the app is running, a backup of every map is saved to the EqapMap-backups folder in your home folder once a day. Backups are kept for 14 days.',
      },
      {
        title: 'Back up or restore on demand',
        Icon: Boxes,
        text: 'In Terminal, inside the EqapMap folder, run `npm run backup` to back up now, or `npm run restore` followed by a backup file’s path to restore it. Restoring asks you to confirm first.',
      },
    ],
  },
  {
    id: 'keyboard',
    title: 'Keyboard shortcuts',
    intro: `The full list. Inside a map, \`${mod}+/\` shows it next to your work.`,
    Icon: Keyboard,
    features: [
      {
        title: 'All shortcuts',
        Icon: MousePointerClick,
        text: 'Shortcuts for building, moving around, rearranging and viewing.',
        visual: 'keyboard',
      },
    ],
  },
];
