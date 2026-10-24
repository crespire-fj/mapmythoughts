/**
 * Keyboard shortcut registry. Consumers register sets of bindings; the most recently registered
 * consumer is asked first. A binding that handles a key stops the event, so Tab never moves
 * browser focus and arrows never scroll the page.
 */

export interface KeyBinding {
  /** KeyboardEvent.key, case-insensitive, or 'printable' for any single printable character */
  key?: string;
  /** KeyboardEvent.code, for keys whose character changes with modifiers (e.g. ⌥1 types ¡) */
  code?: string;
  /** ⌘ on macOS or Ctrl elsewhere (either is accepted) */
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** whether the binding is active while a node's text is being edited */
  whileEditing?: boolean;
  /** return false to let the next consumer (or the browser) handle the key */
  run: (event: KeyboardEvent) => boolean | void;
}

export interface ShortcutConsumer {
  name: string;
  bindings: KeyBinding[];
  isAvailable?: () => boolean;
}

export interface KeyContext {
  editing: boolean;
}

/** Shape of KeyboardEvent the registry reads; keeps matching testable without a DOM. */
export type KeyEventLike = Pick<
  KeyboardEvent,
  'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'isComposing' | 'keyCode'
> & { code?: string };

export function matches(binding: KeyBinding, event: KeyEventLike): boolean {
  const mod = event.metaKey || event.ctrlKey;
  if (!!binding.mod !== mod || !!binding.alt !== event.altKey) return false;
  if (binding.key === 'printable') {
    return event.key.length === 1 && !mod && !event.altKey;
  }
  if (!!binding.shift !== event.shiftKey) return false;
  if (binding.code) return binding.code === event.code;
  return !!binding.key && binding.key.toLowerCase() === event.key.toLowerCase();
}

export class ShortcutRegistry {
  private consumers: ShortcutConsumer[] = [];

  register(consumer: ShortcutConsumer): () => void {
    this.consumers = this.consumers.filter((c) => c !== consumer);
    this.consumers.push(consumer);
    return () => {
      this.consumers = this.consumers.filter((c) => c !== consumer);
    };
  }

  /** Returns true if a binding handled the event (and the event was stopped). */
  handle(event: KeyboardEvent, context: KeyContext): boolean {
    if (event.isComposing || event.keyCode === 229) return false; // IME composition in progress
    for (const consumer of [...this.consumers].reverse()) {
      if (consumer.isAvailable && !consumer.isAvailable()) continue;
      for (const binding of consumer.bindings) {
        if (context.editing && !binding.whileEditing) continue;
        if (!matches(binding, event)) continue;
        if (binding.run(event) === false) break;
        event.preventDefault();
        event.stopPropagation();
        return true;
      }
    }
    return false;
  }
}
