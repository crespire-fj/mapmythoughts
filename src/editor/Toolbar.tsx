import {
  ArrowLeft,
  Download,
  History,
  Keyboard,
  ListTree,
  Monitor,
  Moon,
  NotebookPen,
  Palette,
  Presentation,
  Redo2,
  Search,
  Sun,
  Undo2,
  Workflow,
} from 'lucide-react';
import { THEME_IDS, type MapSettings } from '../model/schema';
import type { ColorPreference } from '../theme/colorMode';
import { THEMES } from '../theme/themes';
import { Menu, MenuItem, MenuSection, keepFocus } from '../ui/Menu';
import type { SaveStatus } from './useMapDocument';

export type ExportFormat = 'png' | 'svg' | 'pdf' | 'docx' | 'md' | 'mapfile';
export type SidePanel = 'outline' | 'details' | 'history';

const STATUS_LABEL: Record<SaveStatus, string> = {
  loading: 'Opening…',
  saved: 'Saved',
  saving: 'Saving…',
  offline: 'Offline — reconnecting',
  missing: 'Map not found',
  error: 'Could not open map',
};
export { STATUS_LABEL };

interface Props {
  title: string;
  collection: { id: string; name: string; color: string } | null;
  /** focus mode: exports cover the focused branch */
  focused: boolean;
  status: SaveStatus;
  settings: MapSettings;
  canUndo: boolean;
  canRedo: boolean;
  panels: ReadonlySet<SidePanel>;
  colorPreference: ColorPreference;
  onBack: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSearch: () => void;
  onSettings: (patch: Partial<MapSettings>) => void;
  onLevels: (level: number) => void;
  onPanel: (panel: SidePanel) => void;
  onExport: (format: ExportFormat) => void;
  onPresent: () => void;
  onColorMode: () => void;
  onHelp: () => void;
}

function ToolButton(props: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`tool${props.pressed ? ' is-active' : ''}`}
      aria-label={props.label}
      aria-pressed={props.pressed}
      title={props.shortcut ? `${props.label} (${props.shortcut})` : props.label}
      disabled={props.disabled}
      onMouseDown={keepFocus}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

export function Toolbar(props: Props) {
  const { settings } = props;
  const ColorIcon =
    props.colorPreference === 'dark' ? Moon : props.colorPreference === 'light' ? Sun : Monitor;
  return (
    <header className="toolbar">
      <div className="toolbar__start">
        <button
          className="tool tool--text"
          onMouseDown={keepFocus}
          onClick={props.onBack}
          title={props.collection ? `Back to ${props.collection.name}` : 'All maps'}
          aria-label={props.collection ? `Back to ${props.collection.name}` : undefined}
        >
          <ArrowLeft size={18} />
          {props.collection ? (
            <>
              <span className="crumb-dot" style={{ background: props.collection.color }} />
              <span className="crumb">{props.collection.name}</span>
            </>
          ) : (
            <span>Maps</span>
          )}
        </button>
        <span className="toolbar__slash" aria-hidden="true">
          /
        </span>
        <h1 className="toolbar__title">{props.title || 'Untitled map'}</h1>
        <span className={`save-status save-status--${props.status}`} aria-live="polite">
          <span className="save-status__dot" />
          {STATUS_LABEL[props.status]}
        </span>
      </div>

      <div className="toolbar__end">
        <ToolButton label="Undo" shortcut="⌘Z" onClick={props.onUndo} disabled={!props.canUndo}>
          <Undo2 size={18} />
        </ToolButton>
        <ToolButton label="Redo" shortcut="⇧⌘Z" onClick={props.onRedo} disabled={!props.canRedo}>
          <Redo2 size={18} />
        </ToolButton>
        <span className="toolbar__divider" />
        <ToolButton label="Find in map" shortcut="⌘F" onClick={props.onSearch}>
          <Search size={18} />
        </ToolButton>
        <Menu label={<Workflow size={18} />} title="Layout and levels">
          {(close) => (
            <>
              <MenuSection title="Layout">
                <MenuItem
                  checked={settings.orientation === 'horizontal'}
                  onSelect={() => {
                    props.onSettings({ orientation: 'horizontal' });
                    close();
                  }}
                >
                  Left and right
                </MenuItem>
                <MenuItem
                  checked={settings.orientation === 'vertical'}
                  onSelect={() => {
                    props.onSettings({ orientation: 'vertical' });
                    close();
                  }}
                >
                  Top and bottom
                </MenuItem>
              </MenuSection>
              <MenuSection title="Connectors">
                <MenuItem
                  checked={settings.connector === 'curved'}
                  onSelect={() => {
                    props.onSettings({ connector: 'curved' });
                    close();
                  }}
                >
                  Curved
                </MenuItem>
                <MenuItem
                  checked={settings.connector === 'elbow'}
                  onSelect={() => {
                    props.onSettings({ connector: 'elbow' });
                    close();
                  }}
                >
                  Elbow
                </MenuItem>
              </MenuSection>
              <MenuSection title="Show levels">
                {[1, 2, 3].map((level) => (
                  <MenuItem
                    key={level}
                    shortcut={`⌥${level}`}
                    onSelect={() => {
                      props.onLevels(level);
                      close();
                    }}
                  >
                    {level === 1 ? 'Main branches only' : `${level} levels`}
                  </MenuItem>
                ))}
                <MenuItem
                  shortcut="⌥0"
                  onSelect={() => {
                    props.onLevels(Infinity);
                    close();
                  }}
                >
                  Expand everything
                </MenuItem>
              </MenuSection>
            </>
          )}
        </Menu>
        <Menu label={<Palette size={18} />} title="Theme">
          {(close) => (
            <MenuSection title="Theme">
              {THEME_IDS.map((id) => (
                <MenuItem
                  key={id}
                  checked={settings.theme === id}
                  onSelect={() => {
                    props.onSettings({ theme: id });
                    close();
                  }}
                >
                  <span className="theme-option">
                    <span className="theme-option__swatches" aria-hidden="true">
                      <span
                        style={{
                          background: `linear-gradient(135deg, ${THEMES[id].root[0]}, ${THEMES[id].root[1]})`,
                        }}
                      />
                      {THEMES[id].branches.slice(0, 4).map((color) => (
                        <span key={color} style={{ background: color }} />
                      ))}
                    </span>
                    <span>
                      <strong>{THEMES[id].name}</strong>
                      <small>{THEMES[id].description}</small>
                    </span>
                  </span>
                </MenuItem>
              ))}
            </MenuSection>
          )}
        </Menu>
        <span className="toolbar__divider" />
        <ToolButton
          label="Outline"
          pressed={props.panels.has('outline')}
          onClick={() => props.onPanel('outline')}
        >
          <ListTree size={18} />
        </ToolButton>
        <ToolButton
          label="Notes and link"
          shortcut="⌘I"
          pressed={props.panels.has('details')}
          onClick={() => props.onPanel('details')}
        >
          <NotebookPen size={18} />
        </ToolButton>
        <ToolButton
          label="History"
          pressed={props.panels.has('history')}
          onClick={() => props.onPanel('history')}
        >
          <History size={18} />
        </ToolButton>
        <span className="toolbar__divider" />
        <ToolButton label="Present" shortcut="⌥P" onClick={props.onPresent}>
          <Presentation size={18} />
        </ToolButton>
        <Menu label={<Download size={18} />} title="Export">
          {(close) => (
            <>
              <MenuSection title={props.focused ? 'Export the focused branch' : 'Export'}>
                {(
                  [
                    ['png', 'PNG image'],
                    ['svg', 'SVG image'],
                    ['pdf', 'PDF (print)'],
                    ['docx', 'Word document'],
                    ['md', 'Markdown outline'],
                  ] as const
                ).map(([format, label]) => (
                  <MenuItem
                    key={format}
                    onSelect={() => {
                      close();
                      props.onExport(format);
                    }}
                  >
                    {label}
                  </MenuItem>
                ))}
              </MenuSection>
              <MenuSection title="Share with a colleague">
                <MenuItem
                  onSelect={() => {
                    close();
                    props.onExport('mapfile');
                  }}
                >
                  Map My Thoughts file (.mmt)
                </MenuItem>
              </MenuSection>
            </>
          )}
        </Menu>
        <ToolButton label={`Colour mode: ${props.colorPreference}`} onClick={props.onColorMode}>
          <ColorIcon size={18} />
        </ToolButton>
        <ToolButton label="Keyboard shortcuts" shortcut="⌘/" onClick={props.onHelp}>
          <Keyboard size={18} />
        </ToolButton>
      </div>
    </header>
  );
}
