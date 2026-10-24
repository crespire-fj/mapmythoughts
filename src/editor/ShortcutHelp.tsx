import { BookOpen, X } from 'lucide-react';

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
export const mod = isMac ? '⌘' : 'Ctrl';
export const alt = isMac ? '⌥' : 'Alt';

export const SHORTCUT_GROUPS: [string, [string, string][]][] = [
  [
    'Build',
    [
      ['Tab', 'Add child (also while typing)'],
      ['Enter', 'Add sibling (also while typing)'],
      [`Shift+Enter or ${mod}+Enter`, 'Line break inside a node'],
      ['Type, F2 or double-click', 'Edit (typing replaces the text)'],
      [`${mod}+D`, 'Duplicate branch'],
      ['Delete or Backspace', 'Delete branch'],
    ],
  ],
  [
    'Move around',
    [
      ['Arrow keys', 'Move between nodes'],
      [`${mod}+F`, 'Find in map'],
      [`${mod}+A`, 'Select all nodes'],
      ['Shift-click, Shift-drag', 'Select several nodes'],
      ['Escape', 'Stop editing, then clear the selection'],
    ],
  ],
  [
    'Restructure',
    [
      [`${alt}+↑ / ${alt}+↓`, 'Move up / down among siblings'],
      [`${alt}+→ / ${alt}+←`, 'Indent / outdent (in a left/right map)'],
      ['Drag a node', 'Move its branch; drop on a node to nest it'],
      [`${mod}+C / X / V`, 'Copy, cut, paste branches (also as text)'],
      [`${alt}+L`, 'Cross-link to another node (click it next)'],
      ['Enter / Delete on a link', 'Edit its label / remove it'],
    ],
  ],
  [
    'View',
    [
      [`${mod}+.`, 'Collapse or expand the branch'],
      [`${alt}+F`, 'Focus on the branch (Escape to leave)'],
      [`${alt}+P`, 'Present: arrows or Space step, Escape ends'],
      [`${alt}+1 / 2 / 3 / 0`, 'Show 1, 2, 3 or all levels'],
      [`${mod}+I`, 'Notes and link'],
      [`${mod}+= / ${mod}+− / ${mod}+0`, 'Zoom in / out / fit'],
      [`Pinch or ${mod}+scroll`, 'Zoom'],
      [`${mod}+Z / ${mod}+Shift+Z`, 'Undo / redo'],
    ],
  ],
];

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  return (
    <aside className="help" aria-label="Keyboard shortcuts">
      <header className="panel__header">
        <h2>Keyboard shortcuts</h2>
        <button className="icon-button" onClick={onClose} aria-label="Close shortcuts">
          <X size={18} />
        </button>
      </header>
      <div className="help__groups">
        {SHORTCUT_GROUPS.map(([title, rows]) => (
          <section key={title}>
            <h3>{title}</h3>
            <dl>
              {rows.map(([keys, action]) => (
                <div key={keys} className="help__row">
                  <dt>
                    <kbd>{keys}</kbd>
                  </dt>
                  <dd>{action}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <a className="help__guide" href="#/guide">
        <BookOpen size={16} /> See everything Map My Thoughts can do
      </a>
    </aside>
  );
}
