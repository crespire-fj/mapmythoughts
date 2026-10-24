import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/** Keeps focus on the canvas when a toolbar control is clicked. */
export const keepFocus = (event: React.MouseEvent) => event.preventDefault();

interface MenuProps {
  label: ReactNode;
  title: string;
  className?: string;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
}

/** A toolbar dropdown that closes on outside click, Escape or after choosing an item. */
export function Menu({ label, title, className = '', children, align = 'right' }: MenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div className={`menu ${className}`} ref={ref}>
      <button
        type="button"
        className={`tool${open ? ' is-active' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        title={title}
        aria-label={title}
        onMouseDown={keepFocus}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
      </button>
      {open && (
        <div id={id} className={`menu__list menu__list--${align}`} role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  onSelect,
  children,
  checked,
  shortcut,
}: {
  onSelect: () => void;
  children: ReactNode;
  checked?: boolean;
  shortcut?: string;
}) {
  return (
    <button
      type="button"
      role={checked === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={checked}
      className={`menu__item${checked ? ' is-checked' : ''}`}
      onMouseDown={keepFocus}
      onClick={onSelect}
    >
      <span className="menu__label">{children}</span>
      {shortcut && <kbd>{shortcut}</kbd>}
    </button>
  );
}

export function MenuSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="menu__section" role="group" aria-label={title}>
      <div className="menu__heading">{title}</div>
      {children}
    </div>
  );
}
