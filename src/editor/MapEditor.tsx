import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type * as Y from 'yjs';
import {
  addChild,
  buildMapFromBranch,
  countOccurrences,
  addLink,
  addSibling,
  deleteLink,
  deleteNodes,
  duplicateNodes,
  indentNode,
  insertSubtrees,
  moveAmongSiblings,
  moveSubtree,
  outdentNode,
  replaceBranchWithLink,
  replaceContent,
  replaceText,
  revealNode,
  serializeSubtrees,
  setCollapsed,
  setLink,
  setLinkLabel,
  setNote,
  setSettings,
  setStyle,
  setText,
  showLevels,
  type MoveTarget,
  type OutlineNode,
} from '../commands/commands';
import { crossLink, edgePoint, treeConnector } from '../connectors/connectors';
import { FILE_EXTENSION, buildMapFile } from '../export/mapfile';
import { buildSvg, download, safeFilename, svgToPng } from '../export/image';
import { exportMarkdown } from '../export/markdown';
import { printMap } from '../export/print';
import { buildThumbnail } from '../export/thumbnail';
import { ShortcutRegistry, type ShortcutConsumer } from '../keyboard/registry';
import {
  boxOf,
  computeLayout,
  intersects,
  layoutBounds,
  type Box,
  type LayoutNode,
  type Phantom,
  type Size,
} from '../layout/layout';
import { ChevronLeft, ChevronRight, Focus, X } from 'lucide-react';
import { api, type Collection, type VersionSummary } from '../maps/api';
import {
  ROOT_ID,
  ancestorsOf,
  childrenOf,
  descendantsOf,
  getNodeText,
  getNodes,
  type MapSettings,
  type MapSnapshot,
  type Side,
} from '../model/schema';
import { navigate, structuralMove, type Direction } from '../selection/navigation';
import { useColorMode } from '../theme/colorMode';
import { THEMES, branchColors, nodeAppearance, rootAppearance } from '../theme/themes';
import { useToast } from '../ui/Toast';
import { nodesFromClipboard, rememberCopy } from './clipboard';
import { PLACEHOLDER_ID, isNoOpMove, placeholderFor, resolveDropTarget } from './dragDrop';
import { focusSnapshot } from './focus';
import { Minimap } from './Minimap';
import { NodeView, type EditMode } from './NodeView';
import { DetailsPanel } from './panels/DetailsPanel';
import { OpenItemsPanel, openItems } from './panels/OpenItemsPanel';
import { OutlinePanel } from './panels/OutlinePanel';
import { VersionsPanel } from './panels/VersionsPanel';
import { findMatches } from './search';
import { internalLink } from './url';
import { SearchBar } from './SearchBar';
import { ShortcutHelp } from './ShortcutHelp';
import { StyleBar } from './StyleBar';
import { STATUS_LABEL, Toolbar, type ExportFormat, type SidePanel } from './Toolbar';
import { useMapDocument, type SaveStatus } from './useMapDocument';
import { ensureVisible, fitBounds, toWorld, zoomAt, type Insets, type Viewport } from './viewport';

interface DragState {
  nodeId: string;
  startWorld: { x: number; y: number };
  currentWorld: { x: number; y: number };
  active: boolean;
  /** visible boxes of the dragged subtree when the drag started, for the ghost preview */
  ghost: Map<string, LayoutNode>;
  target: MoveTarget | null;
  phantom: Phantom | null;
}

interface Marquee {
  start: { x: number; y: number };
  current: { x: number; y: number };
  base: string[];
}

function readPref<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : (JSON.parse(value) as T);
  } catch {
    return fallback;
  }
}
function writePref(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable (private mode): the preference lasts for this page only
  }
}

/** The collection a map is in (for the breadcrumb and the Back button), if any. */
function useMapCollection(mapId: string): Collection | null {
  const [collection, setCollection] = useState<Collection | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .get(mapId)
      .then((map) => (map.collectionId ? api.collections.get(map.collectionId) : null))
      .then((found) => {
        if (!cancelled) setCollection(found);
      })
      .catch(() => {
        if (!cancelled) setCollection(null);
      });
    return () => {
      cancelled = true;
    };
  }, [mapId]);
  return collection;
}

export function MapEditorPage({
  mapId,
  nodeId,
  onExit,
}: {
  mapId: string;
  /** a node to jump to, from a #/map/<id>/node/<nodeId> link */
  nodeId?: string | null;
  onExit: (collectionId?: string | null) => void;
}) {
  const result = useMapDocument(mapId);
  const collection = useMapCollection(mapId);
  if (!('doc' in result)) {
    return (
      <div className="screen-message">
        <div className="loader" aria-hidden="true" />
        <p>{STATUS_LABEL[result.status]}</p>
        {result.status !== 'loading' && (
          <button className="button" onClick={() => onExit(collection?.id)}>
            Back to maps
          </button>
        )}
      </div>
    );
  }
  return (
    <MapEditor
      key={mapId}
      mapId={mapId}
      doc={result.doc}
      undo={result.undo}
      snapshot={result.snapshot}
      status={result.status}
      collection={collection}
      targetNodeId={nodeId ?? null}
      onExit={onExit}
    />
  );
}

interface EditorProps {
  mapId: string;
  doc: Y.Doc;
  undo: Y.UndoManager;
  snapshot: MapSnapshot;
  status: SaveStatus;
  collection: Collection | null;
  targetNodeId: string | null;
  onExit: (collectionId?: string | null) => void;
}

function MapEditor({
  mapId,
  doc,
  undo,
  snapshot: fullSnapshot,
  status,
  collection,
  targetNodeId,
  onExit,
}: EditorProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  // Focus mode: one branch is shown as if it were the whole map. `snapshot` below is that view;
  // `fullSnapshot` is the real map. Ids are shared, except the focused node appears as ROOT_ID.
  const [focusId, setFocusId] = useState<string | null>(null);
  const focus = focusId && fullSnapshot.nodes.has(focusId) ? focusId : null;
  const snapshot = useMemo(
    () => (focus ? focusSnapshot(fullSnapshot, focus) : fullSnapshot),
    [fullSnapshot, focus],
  );
  const focusRef = useRef(focus);
  focusRef.current = focus;
  /** View id → document id (the focused node is shown as the root). */
  const toReal = useCallback((id: string) => (id === ROOT_ID && focusRef.current) || id, []);
  /** Document id → view id. */
  const toView = useCallback((id: string) => (id === focusRef.current ? ROOT_ID : id), []);
  // Cross-links: the selected link, a link being drawn, and a link label being edited.
  const [selectedLink, setSelectedLink] = useState<string | null>(null);
  const [linking, setLinking] = useState<{
    from: string;
    pointer: { x: number; y: number } | null;
  } | null>(null);
  const [editingLink, setEditingLink] = useState<string | null>(null);
  // Presentation: index into the steps (overview, then each main branch); null when not presenting.
  const [presenting, setPresenting] = useState<number | null>(null);
  const fitPending = useRef(false);
  const { mode: colorMode, preference: colorPreference, cycle: cycleColorMode } = useColorMode();
  const [selection, setSelection] = useState<string[]>([ROOT_ID]);
  const primary = selection.at(-1) ?? null;
  const selected = useMemo(() => new Set(selection), [selection]);
  const [editing, setEditing] = useState<{ id: string; mode: EditMode } | null>(null);
  const [viewport, setViewportState] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const sizesRef = useRef(new Map<string, Size>());
  const [sizeVersion, setSizeVersion] = useState(0);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [panels, setPanels] = useState<Set<SidePanel>>(
    () => new Set(readPref<SidePanel[]>('eqapmap:panels', [])),
  );
  const [search, setSearch] = useState<{
    query: string;
    index: number;
    replacing?: boolean;
    replacement?: string;
  } | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  /** Other maps, for linking to them; loaded when the details panel opens. */
  const [maps, setMaps] = useState<{ id: string; title: string }[]>([]);
  const [minimapVisible, setMinimapVisible] = useState(() => readPref('eqapmap:minimap', true));
  const [notesOnMap, setNotesOnMap] = useState(() => readPref('eqapmap:notes-on-map', false));
  /** The note shown while the pointer is over a node's note badge. */
  const [notePreview, setNotePreview] = useState<{ id: string; rect: DOMRect } | null>(null);
  const onNoteHover = useCallback(
    (id: string, rect: DOMRect | null) => setNotePreview(rect ? { id, rect } : null),
    [],
  );
  const toast = useToast();
  /** Last box object per node; reused when unchanged so memoised nodes skip re-rendering. */
  const boxCache = useRef(new Map<string, Box>());
  const revealPending = useRef(false);
  const fitted = useRef(false);
  const animation = useRef(0);
  /** Where a running view animation is heading, so repeated zoom clicks build on it. */
  const animationTarget = useRef<Viewport | null>(null);
  const panRef = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(
    null,
  );

  const theme = THEMES[snapshot.settings.theme];
  const colors = useMemo(() => branchColors(snapshot, theme), [snapshot, theme]);
  const rootLook = rootAppearance(theme);
  const orientation = snapshot.settings.orientation;
  // Floating panels cover part of the canvas; reveal and fit keep nodes clear of them.
  const insets: Insets = {
    left: panels.has('outline') ? 324 : 0,
    right: panels.has('details') || panels.has('history') || panels.has('open') ? 364 : 0,
  };

  // ----- layout -------------------------------------------------------------------------------
  const onSize = useCallback((id: string, width: number, height: number) => {
    const previous = sizesRef.current.get(id);
    if (previous && previous.width === width && previous.height === height) return;
    sizesRef.current.set(id, { width, height });
    setSizeVersion((v) => v + 1);
  }, []);

  /* eslint-disable react-hooks/exhaustive-deps -- sizesRef is read when sizeVersion changes */
  const baseLayout = useMemo(
    () => computeLayout(snapshot, sizesRef.current),
    [snapshot, sizeVersion],
  );
  // Hit-testing layout during a drag: the dragged subtree removed, no placeholder.
  const dropLayout = useMemo(
    () =>
      drag?.active
        ? computeLayout(snapshot, sizesRef.current, { exclude: new Set([drag.nodeId]) })
        : null,
    [snapshot, sizeVersion, drag?.active, drag?.nodeId],
  );
  const layout = useMemo(
    () =>
      drag?.active
        ? computeLayout(snapshot, sizesRef.current, {
            exclude: new Set([drag.nodeId]),
            phantom: drag.phantom,
          })
        : baseLayout,
    [baseLayout, snapshot, sizeVersion, drag?.active, drag?.nodeId, drag?.phantom],
  );
  /* eslint-enable react-hooks/exhaustive-deps */

  const matches = useMemo(
    () => (search?.query ? findMatches(snapshot, search.query) : []),
    [snapshot, search?.query],
  );
  const currentMatch = search && matches.length ? matches[search.index % matches.length] : null;
  const occurrences = useMemo(
    () => (search?.replacing && search.query ? countOccurrences(snapshot, search.query) : 0),
    [snapshot, search?.replacing, search?.query],
  );
  const matchSet = useMemo(() => new Set(matches), [matches]);

  // ----- latest values for event handlers -----------------------------------------------------
  const state = useRef({
    selection,
    primary,
    editing,
    snapshot,
    layout,
    viewport,
    canvasSize,
    drag,
    dropLayout,
    search,
    matches,
    panels,
    insets,
    linking,
    selectedLink,
    presenting,
    fullSnapshot,
  });
  state.current = {
    selection,
    primary,
    editing,
    snapshot,
    layout,
    viewport,
    canvasSize,
    drag,
    dropLayout,
    search,
    matches,
    panels,
    insets,
    linking,
    selectedLink,
    presenting,
    fullSnapshot,
  };

  // Leave focus mode if the focused node is deleted (here or in another tab).
  useEffect(() => {
    if (focusId && !fullSnapshot.nodes.has(focusId)) setFocusId(null);
  }, [focusId, fullSnapshot]);

  // Selection must always point at visible nodes that exist (checked against the document
  // itself, which can be a moment ahead of the snapshot).
  useEffect(() => {
    const exists = (id: string) => id === ROOT_ID || getNodes(doc).has(id);
    const visible = (id: string) =>
      id === ROOT_ID || baseLayout.nodes.has(id) || !snapshot.nodes.has(id);
    let next = selection.filter(exists);
    next = next.map((id) => {
      if (visible(id)) return id;
      return ancestorsOf(snapshot, id).find((a) => baseLayout.nodes.has(a)) ?? ROOT_ID;
    });
    next = [...new Set(next)];
    if (next.length !== selection.length || next.some((id, i) => id !== selection[i])) {
      setSelection(next.length || selection.length === 0 ? next : [ROOT_ID]);
    }
    if (editing && !exists(editing.id)) setEditing(null);
  }, [doc, snapshot, baseLayout, selection, editing]);

  // ----- viewport -----------------------------------------------------------------------------
  const setViewport = useCallback((next: Viewport | ((v: Viewport) => Viewport)) => {
    cancelAnimationFrame(animation.current);
    animationTarget.current = null;
    setViewportState(next);
  }, []);

  const animateTo = useCallback((target: Viewport) => {
    cancelAnimationFrame(animation.current);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      animationTarget.current = null;
      setViewportState(target);
      return;
    }
    animationTarget.current = target;
    const from = state.current.viewport;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 240);
      const e = 1 - (1 - t) ** 3;
      setViewportState({
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
        scale: from.scale + (target.scale - from.scale) * e,
      });
      if (t < 1) animation.current = requestAnimationFrame(step);
      else animationTarget.current = null;
    };
    animation.current = requestAnimationFrame(step);
  }, []);

  useLayoutEffect(() => {
    const element = canvasRef.current!;
    const measure = () =>
      setCanvasSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    element.focus({ preventScroll: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(animation.current);
    };
  }, []);

  const allMeasured = useMemo(
    () =>
      sizesRef.current.has(ROOT_ID) &&
      [...baseLayout.nodes.keys()].every((id) => sizesRef.current.has(id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseLayout, sizeVersion],
  );

  const fitView = useCallback(
    (animate = true) => {
      const { layout: current, canvasSize: size } = state.current;
      if (!size.width) return;
      const target = fitBounds(
        layoutBounds(current),
        size.width,
        size.height,
        64,
        state.current.insets,
      );
      if (animate) animateTo(target);
      else setViewport(target);
    },
    [animateTo, setViewport],
  );

  // Open where you left off, or fit the whole map the first time.
  const viewKey = `eqapmap:view:${mapId}`;
  useLayoutEffect(() => {
    if (fitted.current || !allMeasured || !canvasSize.width) return;
    fitted.current = true;
    const saved = readPref<Viewport | null>(viewKey, null);
    if (saved && Number.isFinite(saved.scale)) setViewport(saved);
    else fitView(false);
  }, [allMeasured, canvasSize, fitView, setViewport, viewKey]);

  useEffect(() => {
    if (!fitted.current) return;
    const timer = window.setTimeout(() => writePref(viewKey, viewport), 400);
    return () => window.clearTimeout(timer);
  }, [viewport, viewKey]);

  // Opening or closing a panel re-checks that the selected node is clear of it.
  useLayoutEffect(() => {
    if (fitted.current) revealPending.current = true;
  }, [insets.left, insets.right]);

  // Keep the selected node in view after keyboard moves, node creation and search.
  useLayoutEffect(() => {
    if (!revealPending.current || !primary) return;
    const box = boxOf(layout, primary);
    if (!box || (primary !== ROOT_ID && !sizesRef.current.has(primary))) return;
    revealPending.current = false;
    const next = ensureVisible(
      state.current.viewport,
      box,
      canvasSize.width,
      canvasSize.height,
      72,
      state.current.insets,
    );
    if (next !== state.current.viewport) animateTo(next);
  }, [layout, primary, canvasSize, animateTo, insets.left, insets.right]);

  const zoomBy = useCallback(
    (factor: number) => {
      const { canvasSize: size } = state.current;
      const v = animationTarget.current ?? state.current.viewport;
      animateTo(zoomAt(v, v.scale * factor, size.width / 2, size.height / 2));
    },
    [animateTo],
  );

  const centerOn = useCallback(
    (x: number, y: number, animate: boolean) => {
      const { canvasSize: size, viewport: v } = state.current;
      const target = {
        scale: v.scale,
        x: size.width / 2 - x * v.scale,
        y: size.height / 2 - y * v.scale,
      };
      if (animate) animateTo(target);
      else setViewport(target);
    },
    [animateTo, setViewport],
  );

  useEffect(() => {
    const element = canvasRef.current!;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const unit = event.deltaMode === 1 ? 16 : 1;
      if (event.ctrlKey || event.metaKey) {
        // Trackpad pinch arrives as ctrl+wheel.
        const factor = Math.exp(-event.deltaY * unit * 0.01);
        setViewport((v) =>
          zoomAt(v, v.scale * factor, event.clientX - rect.left, event.clientY - rect.top),
        );
      } else {
        setViewport((v) => ({ ...v, x: v.x - event.deltaX * unit, y: v.y - event.deltaY * unit }));
      }
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [setViewport]);

  // ----- commands -----------------------------------------------------------------------------
  /** Runs a command as its own undo step. */
  const run = useCallback(
    <T,>(command: () => T): T => {
      undo.stopCapturing();
      const result = command();
      undo.stopCapturing();
      return result;
    },
    [undo],
  );

  const select = useCallback((ids: string | string[] | null, reveal = false) => {
    revealPending.current = reveal;
    setSelectedLink(null);
    setSelection(ids === null ? [] : typeof ids === 'string' ? [ids] : ids);
  }, []);

  const focusCanvas = useCallback(() => canvasRef.current?.focus({ preventScroll: true }), []);

  const startEdit = useCallback(
    (id: string, mode: EditMode, seed?: string) => {
      undo.stopCapturing();
      if (seed !== undefined) setText(doc, toReal(id), seed);
      select(id, true);
      setEditing({ id, mode });
    },
    [doc, undo, select, toReal],
  );

  const stopEdit = useCallback(() => {
    if (!state.current.editing) return;
    undo.stopCapturing();
    setEditing(null);
    focusCanvas();
  }, [undo, focusCanvas]);

  const togglePanel = useCallback((panel: SidePanel, force?: boolean) => {
    setPanels((current) => {
      const next = new Set(current);
      const open = force ?? !next.has(panel);
      if (open) {
        // details, history and open items share the right-hand side
        if (panel !== 'outline')
          for (const right of ['details', 'history', 'open'] as const) next.delete(right);
        next.add(panel);
      } else {
        next.delete(panel);
      }
      writePref('eqapmap:panels', [...next]);
      return next;
    });
  }, []);

  const deleteMap = useCallback(async () => {
    const title = state.current.fullSnapshot.title || 'this map';
    if (!window.confirm(`Delete “${title}” and everything in it? This can't be undone.`)) return;
    await api.remove(mapId);
    onExit(collection?.id);
  }, [mapId, onExit, collection]);

  const nonRoot = (ids: string[]) => ids.filter((id) => id !== ROOT_ID);

  /** What ⌘C copies: the selected branches, or the whole map when only the root is selected. */
  const copySelection = useCallback((): OutlineNode[] => {
    const { selection: sel, snapshot: s } = state.current;
    const ids = nonRoot(sel);
    if (ids.length) return serializeSubtrees(s, ids);
    if (sel.includes(ROOT_ID)) {
      const all = [...childrenOf(s, ROOT_ID, 'right'), ...childrenOf(s, ROOT_ID, 'left')].map(
        (n) => n.id,
      );
      return [{ text: s.title, children: serializeSubtrees(s, all) }];
    }
    return [];
  }, []);

  const actions = useMemo(
    () => ({
      addChild(from: string, side?: Side) {
        const parent = toReal(from);
        const id = run(() => addChild(doc, parent, parent === ROOT_ID && side ? { side } : {}));
        startEdit(id, 'selectAll');
      },
      addSibling(from: string) {
        const id = run(() =>
          from === ROOT_ID ? addChild(doc, toReal(ROOT_ID)) : addSibling(doc, from),
        );
        startEdit(id, 'selectAll');
      },
      remove() {
        if (state.current.selectedLink) {
          const link = state.current.selectedLink;
          run(() => deleteLink(doc, link));
          setSelectedLink(null);
          return;
        }
        const ids = nonRoot(state.current.selection);
        if (!ids.length) {
          if (!state.current.selection.includes(ROOT_ID)) return;
          if (focusRef.current) toast.show({ text: 'Leave focus mode to delete the whole map.' });
          else void deleteMap();
          return;
        }
        select(toView(run(() => deleteNodes(doc, ids))), true);
      },
      startLink() {
        const { selection: sel, primary: from } = state.current;
        if (sel.length === 2) {
          const created = run(() => addLink(doc, toReal(sel[0]!), toReal(sel[1]!)));
          if (created) {
            select(null);
            setSelectedLink(created);
            toast.show({ text: 'Linked. Press Enter to add a label.' }, 3000);
          } else {
            toast.show({ text: 'Those two nodes are already linked.' }, 2500);
          }
          return;
        }
        if (!from) return;
        setLinking({ from, pointer: null });
        toast.show({ text: 'Click the node to link to. Escape cancels.' }, 3500);
      },
      finishLink(to: string) {
        const from = state.current.linking?.from;
        setLinking(null);
        if (!from || from === to) return;
        const created = run(() => addLink(doc, toReal(from), toReal(to)));
        if (created) {
          select(null);
          setSelectedLink(created);
          toast.show({ text: 'Linked. Press Enter to add a label.' }, 3000);
        } else {
          toast.show({ text: 'Those two nodes are already linked.' }, 2500);
        }
      },
      /** Moves the selected branch into a new map (same collection) and links to it. */
      async moveToNewMap() {
        const id = state.current.primary;
        if (!id || id === ROOT_ID || state.current.selection.length !== 1) return;
        const real = toReal(id);
        const full = state.current.fullSnapshot;
        if (!(full.children.get(real)?.length ?? 0)) {
          toast.show({ text: 'Only a node with children can become its own map.' });
          return;
        }
        const title = full.nodes.get(real)?.text.replace(/\s+/g, ' ') || 'Untitled map';
        const { orientation: o, connector, theme: t } = full.settings;
        let newId: string;
        try {
          newId = await api.create(
            buildMapFromBranch(full, real, { orientation: o, connector, theme: t }),
            collection?.id ?? null,
          );
        } catch {
          toast.show({ text: 'Could not create the new map.' });
          return;
        }
        run(() => replaceBranchWithLink(doc, real, internalLink(newId)));
        select(id, true);
        toast.show(
          {
            text: `Moved to the new map “${title}”. Undo puts the branch back here.`,
            action: { label: 'Open it', run: () => (window.location.hash = internalLink(newId)) },
          },
          6000,
        );
      },
      toggleSteps() {
        const { selection: sel, snapshot: s } = state.current;
        const ids = nonRoot(sel);
        if (!ids.length) return;
        const on = ids.some((id) => !s.nodes.get(id)?.steps);
        run(() => setStyle(doc, ids, { steps: on }));
        if (on && ids.every((id) => !(s.children.get(id)?.length ?? 0))) {
          toast.show({ text: 'Steps layout is on: children you add will flow downward.' }, 3000);
        }
      },
      toggleFocus() {
        const { primary: id } = state.current;
        if (focusRef.current && (!id || id === ROOT_ID)) {
          const previous = focusRef.current;
          setFocusId(null);
          fitPending.current = true;
          select(previous, true);
          return;
        }
        if (!id || id === ROOT_ID) return;
        setFocusId(id);
        fitPending.current = true;
        select(ROOT_ID);
      },
      navigate(direction: Direction) {
        const { snapshot: s, layout: l, primary: from } = state.current;
        if (!from) return select(ROOT_ID, true);
        const result = navigate(s, l, from, direction);
        if (!result) return;
        if (result.expand) run(() => setCollapsed(doc, result.expand!, false));
        select(result.target, true);
      },
      restructure(direction: Direction) {
        const { snapshot: s, layout: l, primary: id } = state.current;
        if (!id || id === ROOT_ID) return;
        const laid = l.nodes.get(id);
        const move = structuralMove(
          direction,
          laid?.flow ?? l.orientation,
          laid?.flowSide ?? s.nodes.get(id)!.side,
        );
        const done = run(() =>
          move === 'earlier'
            ? moveAmongSiblings(doc, id, -1)
            : move === 'later'
              ? moveAmongSiblings(doc, id, 1)
              : move === 'indent'
                ? indentNode(doc, id)
                : outdentNode(doc, id),
        );
        if (done) select(id, true);
      },
      toggleCollapse() {
        const { snapshot: s, selection: sel } = state.current;
        const ids = nonRoot(sel).filter((id) => (s.children.get(id)?.length ?? 0) > 0);
        if (!ids.length) return;
        const collapse = ids.some((id) => !s.nodes.get(id)?.collapsed);
        run(() => ids.forEach((id) => setCollapsed(doc, id, collapse)));
      },
      duplicate() {
        const ids = nonRoot(state.current.selection);
        if (ids.length)
          select(
            run(() => duplicateNodes(doc, ids)),
            true,
          );
      },
      selectAll() {
        select(
          [ROOT_ID, ...state.current.layout.nodes.keys()].filter((id) => id !== PLACEHOLDER_ID),
        );
      },
      levels(level: number) {
        run(() => showLevels(doc, level));
        toast.show(
          {
            text:
              level === Infinity
                ? 'Expanded everything'
                : `Showing ${level} level${level > 1 ? 's' : ''}`,
          },
          1800,
        );
      },
      paste(text: string) {
        const nodes = nodesFromClipboard(text);
        if (!nodes.length) return;
        const target = toReal(state.current.primary ?? ROOT_ID);
        const ids = run(() => insertSubtrees(doc, target, nodes));
        select(ids, true);
        toast.show({ text: `Pasted ${ids.length} branch${ids.length === 1 ? '' : 'es'}` }, 2000);
      },
      undo() {
        stopEdit();
        undo.undo();
      },
      redo() {
        stopEdit();
        undo.redo();
      },
    }),
    [doc, undo, run, startEdit, stopEdit, select, deleteMap, toast, toReal, toView, collection?.id],
  );
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  // Restore the selection that was current when an undo step was recorded.
  useEffect(() => {
    type StackEvent = { stackItem: { meta: Map<string, unknown> } };
    const onAdded = (event: StackEvent) =>
      event.stackItem.meta.set('selection', state.current.selection.map(toReal));
    const onPopped = (event: StackEvent) => {
      const saved = event.stackItem.meta.get('selection');
      if (Array.isArray(saved) && saved.length) select((saved as string[]).map(toView), true);
    };
    undo.on('stack-item-added', onAdded);
    undo.on('stack-item-popped', onPopped);
    return () => {
      undo.off('stack-item-added', onAdded);
      undo.off('stack-item-popped', onPopped);
    };
  }, [undo, select, toReal, toView]);

  // ----- search -------------------------------------------------------------------------------
  useEffect(() => {
    if (!currentMatch) return;
    revealNode(doc, currentMatch, false);
    select(currentMatch, true);
  }, [doc, currentMatch, select]);

  const openSearch = useCallback(
    (replacing = false) => {
      stopEdit();
      setSearch((s) => ({ query: '', index: 0, ...s, ...(replacing ? { replacing } : {}) }));
    },
    [stopEdit],
  );

  /** Replace in the current match, or (all) everywhere in view: the whole map, or the focus. */
  const replaceMatches = (all: boolean) => {
    if (!search?.query) return;
    const replacement = search.replacement ?? '';
    const scope = all
      ? focus
        ? [...snapshot.nodes.keys(), focus]
        : undefined
      : currentMatch
        ? [currentMatch]
        : [];
    const count = run(() => replaceText(doc, search.query, replacement, scope));
    if (all) {
      toast.show({
        text: count
          ? `Replaced ${count} ${count === 1 ? 'time' : 'times'}. Undo puts them back.`
          : 'Nothing to replace.',
      });
    } else if (!count) {
      // the node matched the words but not the exact phrase: move on
      setSearch((x) => x && { ...x, index: x.index + 1 });
    }
  };

  const closeSearch = useCallback(() => {
    setSearch(null);
    focusCanvas();
  }, [focusCanvas]);

  useEffect(() => {
    if (!panels.has('details')) return;
    let cancelled = false;
    api
      .list()
      .then((list) => {
        if (!cancelled) setMaps(list.map((m) => ({ id: m.id, title: m.title })));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [panels]);

  const copyLink = useCallback(
    async (id: string) => {
      const real = toReal(id);
      const url = `${window.location.origin}/${internalLink(mapId, real === ROOT_ID ? null : real)}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.show({ text: 'Link copied. Paste it into a node’s link, in any map.' }, 3500);
      } catch {
        toast.show({ text: `Copy this link: ${url}` }, 8000);
      }
    },
    [mapId, toReal, toast],
  );

  // ----- links to a node ----------------------------------------------------------------------
  // A #/map/<id>/node/<nodeId> link opens the map with that node selected and in view. The address
  // then goes back to #/map/<id>, so following the same link again works.
  useEffect(() => {
    if (!targetNodeId || status === 'loading') return;
    window.location.replace(internalLink(mapId));
    if (!fullSnapshot.nodes.has(targetNodeId)) {
      toast.show({ text: 'That node is no longer in this map.' });
      return;
    }
    if (focusRef.current) {
      setFocusId(null);
      fitPending.current = false;
    }
    revealNode(doc, targetNodeId, false);
    select(targetNodeId, true);
    // Only when a new link arrives or the map finishes loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetNodeId, status === 'loading']);

  // ----- presentation -------------------------------------------------------------------------
  /** Overview first, then each main branch (right side, then left). */
  const steps = useMemo(
    () => [
      ROOT_ID,
      ...childrenOf(snapshot, ROOT_ID, 'right').map((n) => n.id),
      ...childrenOf(snapshot, ROOT_ID, 'left').map((n) => n.id),
    ],
    [snapshot],
  );
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  const startPresentation = useCallback(() => {
    stopEdit();
    setSearch(null);
    setLinking(null);
    select(null);
    setPresenting(0);
    editorRef.current?.requestFullscreen?.().catch(() => {
      // Full screen may be refused (e.g. not from a click); presenting still works in the window.
    });
  }, [stopEdit, select]);

  const stopPresentation = useCallback(() => {
    setPresenting(null);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    fitPending.current = true;
    focusCanvas();
  }, [focusCanvas]);

  const stepPresentation = useCallback((delta: number) => {
    setPresenting((index) => {
      if (index === null) return index;
      const last = stepsRef.current.length - 1;
      return Math.max(0, Math.min(last, index + delta));
    });
  }, []);

  // Leaving full screen (e.g. the browser's own Escape) ends the presentation.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement && state.current.presenting !== null) stopPresentation();
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [stopPresentation]);

  /** The nodes shown at full strength on the current presentation step. */
  const presented = useMemo(() => {
    if (presenting === null || presenting === 0) return null;
    const branch = steps[presenting];
    return branch ? new Set([ROOT_ID, branch, ...descendantsOf(snapshot, branch)]) : null;
  }, [presenting, steps, snapshot]);

  // Each step fits its branch (or the whole map) to the screen.
  useLayoutEffect(() => {
    if (presenting === null || !canvasSize.width) return;
    const boxes = [layout.root];
    for (const node of layout.nodes.values()) {
      if (!presented || presented.has(node.id)) boxes.push(node.box);
    }
    const x = Math.min(...boxes.map((b) => b.x));
    const y = Math.min(...boxes.map((b) => b.y));
    const right = Math.max(...boxes.map((b) => b.x + b.width));
    const bottom = Math.max(...boxes.map((b) => b.y + b.height));
    animateTo(
      fitBounds(
        { x, y, width: right - x, height: bottom - y },
        canvasSize.width,
        canvasSize.height,
        96,
        undefined,
        1.6,
      ),
    );
  }, [presenting, presented, layout, canvasSize, animateTo]);

  // ----- keyboard -----------------------------------------------------------------------------
  const registry = useMemo(() => new ShortcutRegistry(), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inCanvas = !target || target === document.body || canvasRef.current?.contains(target);
      if (!inCanvas) return;
      // Form fields on the canvas (e.g. a link label) handle their own keys.
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      registry.handle(event, { editing: state.current.editing !== null });
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [registry]);

  // Always-on editor shortcuts.
  useEffect(() => {
    const levels = (level: number) => () => actionsRef.current.levels(level);
    const consumer: ShortcutConsumer = {
      name: 'editor',
      bindings: [
        {
          key: 'Escape',
          whileEditing: true,
          run: () => {
            const {
              editing: e,
              drag: d,
              selection: s,
              linking: l,
              selectedLink: sl,
            } = state.current;
            if (d) setDrag(null);
            else if (l) setLinking(null);
            else if (e) stopEdit();
            else if (sl) setSelectedLink(null);
            else if (s.length) select(null);
            else if (focusRef.current) actionsRef.current.toggleFocus();
            else return false;
          },
        },
        { key: 'z', mod: true, whileEditing: true, run: () => actionsRef.current.undo() },
        {
          key: 'z',
          mod: true,
          shift: true,
          whileEditing: true,
          run: () => actionsRef.current.redo(),
        },
        { key: 'y', mod: true, whileEditing: true, run: () => actionsRef.current.redo() },
        { key: 'f', mod: true, whileEditing: true, run: () => openSearch() },
        { code: 'KeyF', mod: true, alt: true, whileEditing: true, run: () => openSearch(true) },
        { key: 'a', mod: true, run: () => actionsRef.current.selectAll() },
        { key: 'i', mod: true, whileEditing: true, run: () => togglePanel('details') },
        { key: '=', mod: true, run: () => zoomBy(1.2) },
        { key: '+', mod: true, shift: true, run: () => zoomBy(1.2) },
        { key: '-', mod: true, run: () => zoomBy(1 / 1.2) },
        { key: '0', mod: true, run: () => fitView() },
        { key: '/', mod: true, run: () => setShowHelp((v) => !v) },
        { code: 'Digit1', alt: true, run: levels(1) },
        { code: 'Digit2', alt: true, run: levels(2) },
        { code: 'Digit3', alt: true, run: levels(3) },
        { code: 'Digit0', alt: true, run: levels(Infinity) },
        { code: 'KeyF', alt: true, run: () => actionsRef.current.toggleFocus() },
        { code: 'KeyP', alt: true, run: () => startPresentation() },
      ],
    };
    return registry.register(consumer);
  }, [registry, stopEdit, select, zoomBy, fitView, openSearch, togglePanel, startPresentation]);

  // Mind-map shortcuts: registered while something is selected, so they take priority.
  useEffect(() => {
    if (primary === null) return;
    const current = () => state.current.primary ?? ROOT_ID;
    const a = () => actionsRef.current;
    const consumer: ShortcutConsumer = {
      name: 'mindmap',
      isAvailable: () => state.current.primary !== null,
      bindings: [
        { key: 'Tab', whileEditing: true, run: () => a().addChild(current()) },
        { key: 'Enter', whileEditing: true, run: () => a().addSibling(current()) },
        { key: 'ArrowUp', run: () => a().navigate('up') },
        { key: 'ArrowDown', run: () => a().navigate('down') },
        { key: 'ArrowLeft', run: () => a().navigate('left') },
        { key: 'ArrowRight', run: () => a().navigate('right') },
        { key: 'ArrowUp', alt: true, run: () => a().restructure('up') },
        { key: 'ArrowDown', alt: true, run: () => a().restructure('down') },
        { key: 'ArrowLeft', alt: true, run: () => a().restructure('left') },
        { key: 'ArrowRight', alt: true, run: () => a().restructure('right') },
        { key: 'Delete', run: () => a().remove() },
        { key: 'Backspace', run: () => a().remove() },
        { key: 'F2', run: () => startEdit(current(), 'end') },
        { key: '.', mod: true, run: () => a().toggleCollapse() },
        { key: 'd', mod: true, run: () => a().duplicate() },
        { code: 'KeyL', alt: true, run: () => a().startLink() },
        { code: 'KeyS', alt: true, run: () => a().toggleSteps() },
        { key: 'printable', run: (event) => startEdit(current(), 'end', event.key) },
      ],
    };
    return registry.register(consumer);
  }, [registry, primary, startEdit]);

  // A selected cross-link: Delete removes it, Enter edits its label.
  useEffect(() => {
    if (!selectedLink) return;
    const consumer: ShortcutConsumer = {
      name: 'link',
      bindings: [
        { key: 'Delete', run: () => actionsRef.current.remove() },
        { key: 'Backspace', run: () => actionsRef.current.remove() },
        { key: 'Enter', run: () => setEditingLink(selectedLink) },
        { key: 'F2', run: () => setEditingLink(selectedLink) },
      ],
    };
    return registry.register(consumer);
  }, [registry, selectedLink]);

  // Presenting: arrows, space and page keys step; everything else is swallowed.
  useEffect(() => {
    if (presenting === null) return;
    const step = (delta: number) => () => stepPresentation(delta);
    const consumer: ShortcutConsumer = {
      name: 'presentation',
      bindings: [
        ...['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].map((key) => ({
          key,
          run: step(1),
        })),
        ...['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].map((key) => ({ key, run: step(-1) })),
        { key: 'Home', run: step(-Infinity) },
        { key: 'End', run: step(Infinity) },
        { key: 'Escape', run: () => stopPresentation() },
        { key: 'Tab', run: () => {} },
        { key: 'Delete', run: () => {} },
        { key: 'printable', run: () => {} },
      ],
    };
    return registry.register(consumer);
  }, [registry, presenting, stepPresentation, stopPresentation]);

  // Copy, cut and paste use the browser's clipboard events, so they work with other apps.
  useEffect(() => {
    const inCanvas = (event: Event) => {
      const target = event.target as Node | null;
      return (
        !state.current.editing &&
        (!target || target === document.body || !!canvasRef.current?.contains(target))
      );
    };
    const onCopy = (event: ClipboardEvent, cut: boolean) => {
      if (!inCanvas(event)) return;
      const nodes = copySelection();
      if (!nodes.length) return;
      event.preventDefault();
      event.clipboardData?.setData('text/plain', rememberCopy(nodes));
      const count = nodes.length;
      if (cut && nonRoot(state.current.selection).length) {
        select(toView(run(() => deleteNodes(doc, nonRoot(state.current.selection)))), true);
        toast.show({ text: `Cut ${count} branch${count === 1 ? '' : 'es'}` }, 2000);
      } else {
        toast.show({ text: `Copied ${count} branch${count === 1 ? '' : 'es'}` }, 2000);
      }
    };
    const copy = (event: ClipboardEvent) => onCopy(event, false);
    const cut = (event: ClipboardEvent) => onCopy(event, true);
    const paste = (event: ClipboardEvent) => {
      if (!inCanvas(event)) return;
      const text = event.clipboardData?.getData('text/plain') ?? '';
      if (!text.trim()) return;
      event.preventDefault();
      actionsRef.current.paste(text);
    };
    document.addEventListener('copy', copy);
    document.addEventListener('cut', cut);
    document.addEventListener('paste', paste);
    return () => {
      document.removeEventListener('copy', copy);
      document.removeEventListener('cut', cut);
      document.removeEventListener('paste', paste);
    };
  }, [doc, run, select, toast, copySelection, toView]);

  // ----- pointer: pan, marquee, select, drag --------------------------------------------------
  const localPoint = (event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const worldPoint = (event: { clientX: number; clientY: number }) => {
    const p = localPoint(event);
    return toWorld(state.current.viewport, p.x, p.y);
  };

  const onCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    if (state.current.linking) {
      setLinking(null);
      return;
    }
    canvasRef.current!.setPointerCapture(event.pointerId);
    cancelAnimationFrame(animation.current);
    animationTarget.current = null;
    if (event.shiftKey && event.button === 0) {
      const p = localPoint(event);
      setMarquee({ start: p, current: p, base: state.current.selection });
      return;
    }
    panRef.current = {
      x: event.clientX,
      y: event.clientY,
      vx: viewport.x,
      vy: viewport.y,
      moved: false,
    };
  };

  const onNodePointerDown = useCallback(
    (id: string, event: React.PointerEvent<HTMLDivElement>) => {
      event.stopPropagation();
      if (state.current.editing?.id === id) return; // let the text editor handle it
      if (event.button !== 0) return;
      event.preventDefault();
      if (state.current.presenting !== null) {
        stepPresentation(1);
        return;
      }
      if (state.current.linking) {
        actionsRef.current.finishLink(id);
        return;
      }
      if (state.current.editing) stopEdit();
      focusCanvas();
      if (event.shiftKey || event.metaKey || event.ctrlKey) {
        const current = state.current.selection;
        select(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
        return;
      }
      select(id);
      if (id === ROOT_ID) return;
      // The pointer is captured only once a drag starts; capturing here would retarget the
      // browser's click/dblclick events to the canvas and break double-click to edit.
      const rect = canvasRef.current!.getBoundingClientRect();
      const world = toWorld(
        state.current.viewport,
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
      setDrag({
        nodeId: id,
        startWorld: world,
        currentWorld: world,
        active: false,
        ghost: new Map(),
        target: null,
        phantom: null,
      });
    },
    [stopEdit, focusCanvas, select, stepPresentation],
  );

  const onCanvasPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (linking) {
      setLinking({ ...linking, pointer: worldPoint(event) });
      return;
    }
    if (marquee) {
      const current = localPoint(event);
      const v = state.current.viewport;
      const a = toWorld(v, marquee.start.x, marquee.start.y);
      const b = toWorld(v, current.x, current.y);
      const rect = {
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        width: Math.abs(a.x - b.x),
        height: Math.abs(a.y - b.y),
      };
      const hits = [...state.current.layout.nodes.values()]
        .filter((n) => intersects(rect, n.box))
        .map((n) => n.id);
      if (intersects(rect, state.current.layout.root)) hits.unshift(ROOT_ID);
      setMarquee({ ...marquee, current });
      setSelection([...new Set([...marquee.base, ...hits])]);
      return;
    }
    const pan = panRef.current;
    if (pan) {
      const dx = event.clientX - pan.x;
      const dy = event.clientY - pan.y;
      if (!pan.moved && Math.hypot(dx, dy) < 3) return;
      pan.moved = true;
      setViewport((v) => ({ ...v, x: pan.vx + dx, y: pan.vy + dy }));
      return;
    }
    const current = state.current.drag;
    if (!current) return;
    const world = worldPoint(event);
    if (!current.active) {
      const distance =
        Math.hypot(world.x - current.startWorld.x, world.y - current.startWorld.y) *
        state.current.viewport.scale;
      if (distance < 4) return;
      const { snapshot: s, layout: l } = state.current;
      const ghost: DragState['ghost'] = new Map();
      for (const id of [current.nodeId, ...descendantsOf(s, current.nodeId)]) {
        const node = l.nodes.get(id);
        if (node) ghost.set(id, node);
      }
      if (state.current.editing) stopEdit();
      canvasRef.current!.setPointerCapture(event.pointerId);
      setDrag({ ...current, active: true, ghost, currentWorld: world });
      return;
    }
    const hitLayout = state.current.dropLayout;
    if (!hitLayout) {
      setDrag({ ...current, currentWorld: world });
      return;
    }
    const target = resolveDropTarget(state.current.snapshot, hitLayout, current.nodeId, world);
    const size = sizesRef.current.get(current.nodeId) ?? { width: 120, height: 40 };
    const phantom = placeholderFor(hitLayout, target, size);
    const same =
      current.phantom &&
      current.phantom.parentId === phantom.parentId &&
      current.phantom.side === phantom.side &&
      current.phantom.index === phantom.index;
    setDrag({ ...current, currentWorld: world, target, phantom: same ? current.phantom : phantom });
  };

  const onCanvasPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (marquee) {
      setMarquee(null);
      return;
    }
    const pan = panRef.current;
    panRef.current = null;
    if (pan) {
      if (!pan.moved && event.target === event.currentTarget) {
        if (state.current.presenting !== null) stepPresentation(1);
        else {
          stopEdit();
          select(null);
        }
      }
      return;
    }
    const current = state.current.drag;
    setDrag(null);
    if (current?.active && current.target) {
      const { snapshot: s } = state.current;
      if (!isNoOpMove(s, current.nodeId, current.target)) {
        const target = realTarget(current.nodeId, current.target);
        run(() => moveSubtree(doc, current.nodeId, target));
        select(current.nodeId, true);
      }
    }
  };

  const onCanvasPointerCancel = () => {
    panRef.current = null;
    setMarquee(null);
    setDrag(null);
  };

  /**
   * In focus mode the focused node's children are spread over two sides of a virtual root; turn a
   * drop target in that view into one in the real document.
   */
  const realTarget = (nodeId: string, target: MoveTarget): MoveTarget => {
    const focusNode = focusRef.current;
    if (!focusNode || target.parentId !== ROOT_ID) return target;
    const viewSiblings = childrenOf(snapshot, ROOT_ID, target.side).filter((n) => n.id !== nodeId);
    const real = childrenOf(fullSnapshot, focusNode)
      .filter((n) => n.id !== nodeId)
      .map((n) => n.id);
    const before = viewSiblings[target.index];
    const last = viewSiblings.at(-1);
    const index = before ? real.indexOf(before.id) : last ? real.indexOf(last.id) + 1 : real.length;
    return { parentId: focusNode, index };
  };

  // After entering or leaving focus mode or a presentation, fit the new view once it's measured.
  useLayoutEffect(() => {
    if (!fitPending.current || !allMeasured || presenting !== null) return;
    fitPending.current = false;
    fitView();
  }, [allMeasured, layout, presenting, fitView]);

  // ----- card thumbnail -----------------------------------------------------------------------
  // A picture of the map's shape for its card on the start page, saved a few seconds after edits
  // settle. Not while focused or presenting, when only part of the map is laid out.
  const lastThumbnail = useRef<string | null>(null);
  useEffect(() => {
    if (focus || presenting !== null || !allMeasured || drag?.active) return;
    const timer = window.setTimeout(() => {
      const svg = buildThumbnail(snapshot, baseLayout);
      if (svg === lastThumbnail.current) return;
      lastThumbnail.current = svg;
      void api.setThumbnail(mapId, svg).catch(() => {
        lastThumbnail.current = null;
      });
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [mapId, snapshot, baseLayout, allMeasured, focus, presenting, drag?.active]);

  // ----- export and history -------------------------------------------------------------------
  const exportAs = async (format: ExportFormat) => {
    const name = safeFilename(snapshot.title);
    try {
      if (format === 'mapfile') {
        const data = await api.exportMap(mapId);
        const file = buildMapFile([
          {
            title: data.title,
            state: data.state,
            thumbnail: data.thumbnail,
            collection: collection ? { name: collection.name, color: collection.color } : null,
          },
        ]);
        download(
          new Blob([file], { type: 'application/json' }),
          `${safeFilename(fullSnapshot.title)}${FILE_EXTENSION}`,
        );
        return;
      }
      if (format === 'md') {
        download(new Blob([exportMarkdown(snapshot)], { type: 'text/markdown' }), `${name}.md`);
        return;
      }
      const svg = await buildSvg(snapshot, baseLayout, { notes: notesOnMap });
      if (format === 'svg') download(new Blob([svg], { type: 'image/svg+xml' }), `${name}.svg`);
      else if (format === 'png') download(await svgToPng(svg), `${name}.png`);
      else if (format === 'pdf') printMap(snapshot, svg);
      else if (format === 'docx') {
        toast.show({ text: 'Preparing the Word document…' }, 2000);
        const bounds = layoutBounds(baseLayout);
        const png = await svgToPng(svg, 2);
        const { buildWord } = await import('../export/word');
        const blob = await buildWord(snapshot, png, {
          width: bounds.width + 96,
          height: bounds.height + 96,
        });
        download(blob, `${name}.docx`);
      }
    } catch (error) {
      console.error(error);
      toast.show({ text: 'Export failed. Please try again.' });
    }
  };

  const restoreVersion = async (version: VersionSummary) => {
    const when = new Date(version.createdAt).toLocaleString();
    try {
      await api.versions.create(mapId, `Before restoring “${version.label}” (${when})`);
      const old = await api.versions.load(mapId, version.id);
      run(() => replaceContent(doc, old));
      select(ROOT_ID);
      toast.show(
        {
          text: `Restored “${version.label}” from ${when}`,
          action: { label: 'Undo', run: () => actionsRef.current.undo() },
        },
        8000,
      );
    } catch {
      toast.show({ text: 'Could not restore that version.' });
    }
  };

  // ----- render -------------------------------------------------------------------------------
  const onTextChange = useCallback(
    (id: string, text: string) => setText(doc, toReal(id), text),
    [doc, toReal],
  );
  const onEditEnd = useCallback(
    (id: string) => {
      if (state.current.editing?.id === id) {
        undo.stopCapturing();
        setEditing(null);
      }
    },
    [undo],
  );
  const onDoubleClick = useCallback((id: string) => startEdit(id, 'end'), [startEdit]);
  const onOpenDetails = useCallback(
    (id: string) => {
      select(id);
      togglePanel('details', true);
    },
    [select, togglePanel],
  );

  const scale = viewport.scale;
  const dragDelta = drag?.active
    ? { x: drag.currentWorld.x - drag.startWorld.x, y: drag.currentWorld.y - drag.startWorld.y }
    : null;
  const lookOf = (id: string, depth: number) => {
    const data = snapshot.nodes.get(id);
    return data
      ? nodeAppearance(
          data.color,
          data.shape,
          depth,
          colors.get(id) ?? theme.branches[0]!,
          colorMode,
        )
      : null;
  };

  // Connector paths only change with the layout or colours, not while panning or zooming.
  const connectors = useMemo(() => {
    const paths: React.ReactNode[] = [];
    for (const node of layout.nodes.values()) {
      const parent = node.parentId === ROOT_ID ? layout.root : layout.nodes.get(node.parentId)?.box;
      if (!parent) continue;
      const isPlaceholder = node.id === PLACEHOLDER_ID;
      const data = snapshot.nodes.get(node.id);
      const look =
        isPlaceholder || !data
          ? null
          : nodeAppearance(
              data.color,
              data.shape,
              node.depth,
              colors.get(node.id) ?? theme.branches[0]!,
              colorMode,
            );
      paths.push(
        <path
          key={node.id}
          className={`${isPlaceholder ? 'connector connector--placeholder' : 'connector'}${presented && !presented.has(node.id) ? ' is-dimmed' : ''}`}
          style={look ? { stroke: look.line, strokeWidth: look.lineWidth } : undefined}
          d={treeConnector(
            snapshot.settings.connector,
            parent,
            snapshot.nodes.get(node.parentId)?.shape,
            node,
            data?.shape,
          )}
        />,
      );
    }
    return paths;
  }, [layout, snapshot, colors, theme, colorMode, presented]);
  const ghostConnectors: React.ReactNode[] = [];
  if (drag?.active && dragDelta) {
    const shift = (box: Box): Box => ({ ...box, x: box.x + dragDelta.x, y: box.y + dragDelta.y });
    for (const [id, ghost] of drag.ghost) {
      const parent = drag.ghost.get(ghost.parentId);
      const look = lookOf(id, ghost.depth);
      if (parent) {
        ghostConnectors.push(
          <path
            key={`ghost-${id}`}
            className="connector connector--ghost"
            style={look ? { stroke: look.line, strokeWidth: look.lineWidth } : undefined}
            d={treeConnector(
              snapshot.settings.connector,
              shift(parent.box),
              snapshot.nodes.get(ghost.parentId)?.shape,
              { ...ghost, box: shift(ghost.box) },
              snapshot.nodes.get(id)?.shape,
            )}
          />,
        );
      }
    }
  }

  const controls: React.ReactNode[] = [];
  const control = (
    key: string,
    point: { x: number; y: number },
    label: string,
    onClick: () => void,
    extra = '',
    content: React.ReactNode = '+',
    style?: React.CSSProperties,
  ) =>
    controls.push(
      <button
        key={key}
        type="button"
        className={`control ${extra}`}
        style={{ ...style, transform: `translate(${point.x}px, ${point.y}px) scale(${1 / scale})` }}
        aria-label={label}
        title={label}
        onPointerDown={(event) => {
          event.stopPropagation();
          event.preventDefault();
        }}
        onClick={(event) => {
          event.stopPropagation();
          onClick();
          focusCanvas();
        }}
      >
        {content}
      </button>,
    );
  /** A point `distance` screen pixels beyond the edge of `box` facing `side` along `flow`. */
  const beyond = (box: Box, side: Side, distance: number, flow = orientation) => {
    const edge = edgePoint(box, side, flow);
    const d = ((side === 'right' ? 1 : -1) * distance) / scale;
    return flow === 'vertical' ? { x: edge.x, y: edge.y + d } : { x: edge.x + d, y: edge.y };
  };
  /** Where a node's children hang: its own side, or below/after it inside a steps branch. */
  const childEdge = (node: LayoutNode): { side: Side; flow: typeof orientation } =>
    node.childFlow === orientation
      ? { side: node.side, flow: orientation }
      : { side: 'right', flow: node.childFlow };

  if (!drag?.active && presenting === null && !linking) {
    for (const node of layout.nodes.values()) {
      const kids = snapshot.children.get(node.id)?.length ?? 0;
      if (!kids || node.id === PLACEHOLDER_ID) continue;
      const data = snapshot.nodes.get(node.id);
      const collapsed = !!data?.collapsed;
      const edge = childEdge(node);
      control(
        `collapse-${node.id}`,
        beyond(node.box, edge.side, 12, edge.flow),
        collapsed ? 'Expand branch' : 'Collapse branch',
        () => {
          select(node.id);
          run(() => setCollapsed(doc, node.id));
        },
        collapsed
          ? 'control--count'
          : `control--collapse${selected.has(node.id) ? ' is-visible' : ''}`,
        collapsed ? String(descendantsOf(snapshot, node.id).length) : '−',
        { '--branch': colors.get(node.id) } as React.CSSProperties,
      );
    }
    if (primary && selection.length === 1 && !editing) {
      const box = boxOf(layout, primary);
      if (box && primary === ROOT_ID) {
        control(
          'add-right',
          beyond(box, 'right', 24),
          orientation === 'vertical' ? 'Add branch below' : 'Add branch on the right',
          () => actions.addChild(ROOT_ID, 'right'),
        );
        control(
          'add-left',
          beyond(box, 'left', 24),
          orientation === 'vertical' ? 'Add branch above' : 'Add branch on the left',
          () => actions.addChild(ROOT_ID, 'left'),
        );
      } else if (box) {
        const node = layout.nodes.get(primary)!;
        const hasKids = (snapshot.children.get(primary)?.length ?? 0) > 0;
        const edge = childEdge(node);
        /** A point `along` px past the edge facing the children, `across` px off centre. */
        const band = (along: number, across: number) =>
          node.childFlow === 'vertical'
            ? { x: box.x + box.width / 2 + across / scale, y: box.y + box.height + along / scale }
            : { x: box.x + box.width + along / scale, y: box.y + box.height / 2 + across / scale };
        /** Past the edge where the next sibling goes, in the way the node hangs. */
        const nextSibling = (distance: number) =>
          node.flow === 'vertical'
            ? { x: box.x + box.width + distance / scale, y: box.y + box.height / 2 }
            : { x: box.x + box.width / 2, y: box.y + box.height + distance / scale };
        const inSteps = node.childFlow !== orientation;
        // Inside a steps branch the next step is only a short gap away, so the buttons share
        // that gap instead of sitting on top of the first step.
        control(
          'add-child',
          inSteps
            ? band(hasKids ? 12 : 24, hasKids ? 26 : 0)
            : beyond(box, edge.side, hasKids ? 46 : 24, edge.flow),
          'Add child (Tab)',
          () => actions.addChild(primary),
        );
        control(
          'add-sibling',
          !inSteps
            ? nextSibling(24)
            : node.flow === node.childFlow
              ? nextSibling(14)
              : band(12, -26),
          'Add sibling (Enter)',
          () => actions.addSibling(primary),
        );
      }
    }
  }

  const stableBox = (id: string, box: Box): Box => {
    const previous = boxCache.current.get(id);
    if (
      previous &&
      previous.x === box.x &&
      previous.y === box.y &&
      previous.width === box.width &&
      previous.height === box.height
    ) {
      return previous;
    }
    boxCache.current.set(id, box);
    return box;
  };

  const renderNode = (id: string, rawBox: Box, depth: number, ghost = false) => {
    const isRoot = id === ROOT_ID;
    const data = isRoot ? null : snapshot.nodes.get(id);
    if (!isRoot && !data) return null;
    const box = ghost ? rawBox : stableBox(id, rawBox);
    const editMode = !ghost && editing?.id === id ? editing.mode : null;
    const look = isRoot ? null : lookOf(id, depth);
    return (
      <NodeView
        key={ghost ? `ghost-${id}` : id}
        id={id}
        isRoot={isRoot}
        text={
          editMode
            ? (getNodeText(doc, toReal(id))?.toString() ?? '')
            : isRoot
              ? snapshot.title
              : data!.text
        }
        shape={data?.shape ?? 'rounded'}
        background={
          look ? look.background : `linear-gradient(135deg, ${rootLook.from}, ${rootLook.to})`
        }
        border={look ? look.border : rootLook.from}
        textColor={look ? look.text : rootLook.text}
        accent={look ? look.line : rootLook.to}
        glow={isRoot ? `${rootLook.to}55` : undefined}
        marker={data?.marker ?? null}
        hasNote={!!data?.note}
        visibleNote={notesOnMap && !ghost ? (data?.note ?? '') : ''}
        link={data?.link ?? ''}
        box={box}
        depth={depth}
        selected={!ghost && selected.has(id)}
        primary={!ghost && primary === id}
        match={currentMatch === id ? 'current' : matchSet.has(id) ? 'match' : 'none'}
        editMode={editMode}
        hasChildren={(snapshot.children.get(id)?.length ?? 0) > 0}
        collapsed={!!data?.collapsed}
        ghost={ghost}
        dimmed={!!presented && !presented.has(id)}
        onSize={onSize}
        onPointerDown={onNodePointerDown}
        onDoubleClick={onDoubleClick}
        onTextChange={onTextChange}
        onEditEnd={onEditEnd}
        onOpenDetails={onOpenDetails}
        onNoteHover={onNoteHover}
      />
    );
  };

  const linkLayer: React.ReactNode[] = [];
  const linkLabels: React.ReactNode[] = [];
  for (const link of snapshot.links) {
    const from = boxOf(layout, link.from);
    const to = boxOf(layout, link.to);
    if (!from || !to) continue; // an end is inside a collapsed branch
    const geometry = crossLink(from, to);
    const isSelected = selectedLink === link.id;
    const dim = presented && !(presented.has(link.from) && presented.has(link.to));
    const name = `Link from ${link.from === ROOT_ID ? snapshot.title : snapshot.nodes.get(link.from)?.text} to ${link.to === ROOT_ID ? snapshot.title : snapshot.nodes.get(link.to)?.text}`;
    linkLayer.push(
      <g
        key={link.id}
        className={`xlink${isSelected ? ' is-selected' : ''}${dim ? ' is-dimmed' : ''}`}
      >
        <path className="xlink__line" d={geometry.path} markerEnd="url(#xlink-arrow)" />
        <path
          className="xlink__hit"
          d={geometry.path}
          role="button"
          aria-label={name}
          onPointerDown={(event) => {
            event.stopPropagation();
            event.preventDefault();
            if (state.current.presenting !== null) return;
            focusCanvas();
            select(null);
            setSelectedLink(link.id);
          }}
          onDoubleClick={() => setEditingLink(link.id)}
        />
      </g>,
    );
    if (link.label || editingLink === link.id || isSelected) {
      linkLabels.push(
        <div
          key={link.id}
          className={`xlink-label${isSelected ? ' is-selected' : ''}${dim ? ' is-dimmed' : ''}${!link.label && editingLink !== link.id ? ' is-empty' : ''}`}
          style={{
            transform: `translate(${geometry.middle.x}px, ${geometry.middle.y}px) translate(-50%, -50%)`,
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
            select(null);
            setSelectedLink(link.id);
          }}
          onDoubleClick={() => setEditingLink(link.id)}
        >
          {editingLink === link.id ? (
            <input
              autoFocus
              className="xlink-label__input"
              defaultValue={link.label}
              placeholder="Label"
              aria-label="Link label"
              onFocus={(event) => event.currentTarget.select()}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Enter') event.currentTarget.blur();
                if (event.key === 'Escape') {
                  setEditingLink(null);
                  focusCanvas();
                }
              }}
              onBlur={(event) => {
                const value = event.currentTarget.value;
                setEditingLink(null);
                run(() => setLinkLabel(doc, link.id, value));
                focusCanvas();
              }}
            />
          ) : (
            link.label || 'Add label'
          )}
        </div>,
      );
    }
  }
  if (linking) {
    const from = boxOf(layout, linking.from);
    if (from && linking.pointer) {
      linkLayer.push(
        <path
          key="linking"
          className="xlink__preview"
          d={crossLink(from, linking.pointer).path}
          markerEnd="url(#xlink-arrow)"
        />,
      );
    }
  }

  const placeholder = layout.nodes.get(PLACEHOLDER_ID);
  const openCount = useMemo(() => openItems(fullSnapshot, mapId).length, [fullSnapshot, mapId]);
  const selectedNodes = nonRoot(selection)
    .map((id) => snapshot.nodes.get(id))
    .filter((n) => n !== undefined);
  const primaryNode = primary && primary !== ROOT_ID ? (snapshot.nodes.get(primary) ?? null) : null;
  const selectedText = primary === ROOT_ID ? snapshot.title : (primaryNode?.text ?? '');
  const marqueeBox = marquee && {
    left: Math.min(marquee.start.x, marquee.current.x),
    top: Math.min(marquee.start.y, marquee.current.y),
    width: Math.abs(marquee.start.x - marquee.current.x),
    height: Math.abs(marquee.start.y - marquee.current.y),
  };

  return (
    <div
      ref={editorRef}
      className={`editor${presenting !== null ? ' is-presenting' : ''}`}
      style={
        {
          '--canvas': theme.canvas[colorMode],
          '--inset-left': `${insets.left}px`,
          '--inset-right': `${insets.right}px`,
        } as React.CSSProperties
      }
    >
      <Toolbar
        title={fullSnapshot.title}
        focused={!!focus}
        onPresent={startPresentation}
        status={status}
        settings={snapshot.settings}
        canUndo={undo.canUndo()}
        canRedo={undo.canRedo()}
        panels={panels}
        openCount={openCount}
        notesOnMap={notesOnMap}
        onNotesOnMap={() =>
          setNotesOnMap((v) => {
            writePref('eqapmap:notes-on-map', !v);
            return !v;
          })
        }
        colorPreference={colorPreference}
        collection={collection}
        onBack={() => onExit(collection?.id)}
        onUndo={() => actions.undo()}
        onRedo={() => actions.redo()}
        onSearch={() => openSearch()}
        onSettings={(patch: Partial<MapSettings>) => {
          run(() => setSettings(doc, patch));
          if (patch.orientation) requestAnimationFrame(() => fitView());
        }}
        onLevels={(level) => actions.levels(level)}
        onPanel={(panel) => togglePanel(panel)}
        onExport={(format) => void exportAs(format)}
        onColorMode={cycleColorMode}
        onHelp={() => setShowHelp((v) => !v)}
      />

      <div className="workspace">
        <div
          ref={canvasRef}
          className={`canvas${drag?.active ? ' is-dragging' : ''}${linking ? ' is-linking' : ''}`}
          tabIndex={0}
          aria-label="Mind map canvas"
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          onPointerCancel={onCanvasPointerCancel}
        >
          <div
            className="world"
            style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${scale})` }}
            role="tree"
            aria-label={snapshot.title || 'Untitled map'}
            aria-multiselectable="true"
          >
            <svg className="connectors" width="1" height="1" aria-hidden="true">
              {connectors}
              {ghostConnectors}
            </svg>
            <svg className="xlinks" width="1" height="1">
              <defs>
                <marker
                  id="xlink-arrow"
                  viewBox="0 0 10 10"
                  refX="7"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
                </marker>
              </defs>
              {linkLayer}
            </svg>
            {linkLabels}
            {placeholder && (
              <div
                className="placeholder"
                style={{
                  transform: `translate(${placeholder.box.x}px, ${placeholder.box.y}px)`,
                  width: placeholder.box.width,
                  height: placeholder.box.height,
                }}
              />
            )}
            {renderNode(ROOT_ID, layout.root, 0)}
            {[...layout.nodes.values()]
              .filter((n) => n.id !== PLACEHOLDER_ID)
              .map((n) => renderNode(n.id, n.box, n.depth))}
            {drag?.active &&
              dragDelta &&
              [...drag.ghost].map(([id, g]) =>
                renderNode(
                  id,
                  { ...g.box, x: g.box.x + dragDelta.x, y: g.box.y + dragDelta.y },
                  g.depth,
                  true,
                ),
              )}
            {controls}
          </div>
          {marqueeBox && <div className="marquee" style={marqueeBox} />}
        </div>

        {focus && presenting === null && (
          <nav className="focusbar" aria-label="Focus">
            <Focus size={16} aria-hidden="true" />
            <ol className="focusbar__crumbs">
              <li>
                <button
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    const previous = focus;
                    setFocusId(null);
                    fitPending.current = true;
                    select(previous, true);
                  }}
                >
                  {fullSnapshot.title || 'Untitled map'}
                </button>
              </li>
              {[...ancestorsOf(fullSnapshot, focus)].reverse().map((id) => (
                <li key={id}>
                  <button
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setFocusId(id);
                      fitPending.current = true;
                      select(ROOT_ID);
                    }}
                  >
                    {fullSnapshot.nodes.get(id)?.text.split('\n')[0] || 'Untitled'}
                  </button>
                </li>
              ))}
              <li aria-current="location">{snapshot.title.split('\n')[0] || 'Untitled'}</li>
            </ol>
            <button
              className="icon-button"
              aria-label="Leave focus mode"
              title="Leave focus mode (Escape)"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                const previous = focus;
                setFocusId(null);
                fitPending.current = true;
                select(previous, true);
              }}
            >
              <X size={16} />
            </button>
          </nav>
        )}

        {presenting !== null && (
          <div className="presenter" role="toolbar" aria-label="Presentation">
            <button
              className="icon-button"
              aria-label="Previous"
              disabled={presenting === 0}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => stepPresentation(-1)}
            >
              <ChevronLeft size={20} />
            </button>
            <span className="presenter__label" aria-live="polite">
              <strong>
                {presenting === 0
                  ? snapshot.title || 'Untitled map'
                  : snapshot.nodes.get(steps[presenting]!)?.text.split('\n')[0]}
              </strong>
              <span>
                {presenting + 1} / {steps.length}
              </span>
            </span>
            <button
              className="icon-button"
              aria-label="Next"
              disabled={presenting === steps.length - 1}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => stepPresentation(1)}
            >
              <ChevronRight size={20} />
            </button>
            <button
              className="icon-button"
              aria-label="End presentation"
              title="End presentation (Escape)"
              onMouseDown={(event) => event.preventDefault()}
              onClick={stopPresentation}
            >
              <X size={18} />
            </button>
          </div>
        )}

        {search && (
          <SearchBar
            query={search.query}
            count={matches.length}
            index={matches.length ? search.index % matches.length : 0}
            onQuery={(query) => setSearch((x) => ({ ...x, query, index: 0 }))}
            onStep={(delta) =>
              setSearch(
                (s) =>
                  s && {
                    ...s,
                    index:
                      (s.index + delta + Math.max(matches.length, 1)) % Math.max(matches.length, 1),
                  },
              )
            }
            onClose={closeSearch}
            replacing={!!search.replacing}
            replacement={search.replacement ?? ''}
            occurrences={occurrences}
            onToggleReplace={() => setSearch((x) => x && { ...x, replacing: !x.replacing })}
            onReplacement={(replacement) => setSearch((x) => x && { ...x, replacement })}
            onReplace={() => replaceMatches(false)}
            onReplaceAll={() => replaceMatches(true)}
          />
        )}

        {panels.has('outline') && (
          <OutlinePanel
            snapshot={snapshot}
            selection={selected}
            primary={primary}
            branchColors={colors}
            onSelect={(id) => {
              revealNode(doc, id, false);
              select(id, true);
            }}
            onRename={(id, text) => run(() => setText(doc, toReal(id), text))}
            onToggle={(id) => run(() => setCollapsed(doc, id))}
            onClose={() => togglePanel('outline', false)}
          />
        )}
        {panels.has('details') && primary && (
          <DetailsPanel
            nodeId={primary}
            node={primaryNode}
            title={snapshot.title}
            count={selection.length}
            onText={(text) => setText(doc, toReal(primary), text)}
            onNote={(note) => setNote(doc, primary, note)}
            onLink={(link) => run(() => setLink(doc, primary, link))}
            onMarker={(marker) => run(() => setStyle(doc, primary, { marker }))}
            onEditSession={() => undo.stopCapturing()}
            onClose={() => togglePanel('details', false)}
            mapId={mapId}
            maps={maps}
            onCopyLink={() => void copyLink(primary)}
          />
        )}
        {panels.has('details') && !primary && (
          <aside className="panel panel--right" aria-label="Node details">
            <header className="panel__header">
              <h2>Details</h2>
            </header>
            <p className="panel__hint">Select a node to add a note, a link or a marker.</p>
          </aside>
        )}
        {panels.has('open') && (
          <OpenItemsPanel
            mapId={mapId}
            snapshot={fullSnapshot}
            collection={collection}
            onSelect={(id) => {
              if (focus && !snapshot.nodes.has(id)) setFocusId(null);
              revealNode(doc, id, false);
              select(id, true);
            }}
            onClose={() => togglePanel('open', false)}
          />
        )}
        {panels.has('history') && (
          <VersionsPanel
            mapId={mapId}
            onRestore={restoreVersion}
            onClose={() => togglePanel('history', false)}
          />
        )}

        {selectedNodes.length > 0 && !drag?.active && (
          <StyleBar
            nodes={selectedNodes}
            autoPreview={`conic-gradient(${theme.branches.slice(0, 5).join(', ')}, ${theme.branches[0]})`}
            onShape={(shape) => run(() => setStyle(doc, nonRoot(selection), { shape }))}
            onColor={(color) => run(() => setStyle(doc, nonRoot(selection), { color }))}
            onMarker={(marker) => run(() => setStyle(doc, nonRoot(selection), { marker }))}
            onDetails={() => togglePanel('details', true)}
            onLink={() => actions.startLink()}
            onFocus={() => actions.toggleFocus()}
            onSteps={() => actions.toggleSteps()}
            onMoveToMap={() => void actions.moveToNewMap()}
            canMoveToMap={
              selection.length === 1 &&
              (fullSnapshot.children.get(toReal(primary ?? ROOT_ID))?.length ?? 0) > 0
            }
            insideSteps={selectedNodes.every((n) =>
              ancestorsOf(snapshot, n.id).some((a) => snapshot.nodes.get(a)?.steps),
            )}
            canLinkPair={selection.length === 2}
          />
        )}

        <Minimap
          layout={baseLayout}
          colors={colors}
          rootColor={rootLook.to}
          viewport={viewport}
          canvas={canvasSize}
          visible={minimapVisible}
          onToggle={() => {
            setMinimapVisible((v) => {
              writePref('eqapmap:minimap', !v);
              return !v;
            });
          }}
          onCenter={centerOn}
          onZoom={zoomBy}
          onFit={() => fitView()}
        />

        {showHelp && <ShortcutHelp onClose={() => setShowHelp(false)} />}
        {notePreview && fullSnapshot.nodes.get(notePreview.id)?.note && !notesOnMap && (
          <div
            className="note-preview"
            role="tooltip"
            style={{
              left: Math.min(notePreview.rect.left, window.innerWidth - 376),
              top: notePreview.rect.bottom + 8,
            }}
          >
            {fullSnapshot.nodes.get(notePreview.id)!.note}
          </div>
        )}
      </div>
      {toast.view}
      <div className="sr-only" aria-live="polite">
        {selection.length > 1
          ? `${selection.length} nodes selected`
          : primary
            ? `Selected: ${selectedText || 'empty node'}`
            : 'Nothing selected'}
      </div>
    </div>
  );
}
