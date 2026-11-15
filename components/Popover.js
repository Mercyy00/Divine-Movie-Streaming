import { useEffect, useRef, useState } from "react";
import styles from "./Popover.module.css";

// Button + dropdown panel that closes on outside click and Escape, with roving keyboard navigation.
export default function Popover({
  trigger,
  label,
  children,
  className = "",
  panelClass = "",
  triggerClassName = "",
  modal = false,
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    const getFocusable = () => {
      if (!panelRef.current) return [];
      return Array.from(
        panelRef.current.querySelectorAll(
          '[role="menuitem"]:not(:disabled), [role="tab"]:not(:disabled), a[href], button:not(:disabled), input:not(:disabled)'
        )
      ).filter((el) => el.offsetParent !== null);
    };

    const down = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };

    const key = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }

      const items = getFocusable();
      if (!items.length) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const idx = items.indexOf(document.activeElement);
        const next = idx === -1 ? 0 : (idx + 1) % items.length;
        items[next]?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const idx = items.indexOf(document.activeElement);
        const prev = idx <= 0 ? items.length - 1 : idx - 1;
        items[prev]?.focus();
      } else if (e.key === "Home") {
        if (panelRef.current?.contains(document.activeElement)) {
          e.preventDefault();
          items[0]?.focus();
        }
      } else if (e.key === "End") {
        if (panelRef.current?.contains(document.activeElement)) {
          e.preventDefault();
          items[items.length - 1]?.focus();
        }
      } else if (modal && e.key === "Tab") {
        const first = items[0];
        const last = items[items.length - 1];
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open, modal]);

  return (
    <div className={`${styles.wrap} ${className}`} ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger} ${triggerClassName}`}
        aria-label={label}
        aria-haspopup={modal ? "dialog" : "menu"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {typeof trigger === "function" ? trigger(open) : trigger}
      </button>
      {open && (
        <div
          ref={panelRef}
          className={`${styles.panel} ${panelClass}`}
          role={modal ? "dialog" : "menu"}
          aria-modal={modal ? "true" : undefined}
          aria-label={label}
          data-lenis-prevent
          onClick={(e) => {
            if (e.target.closest("button[data-close], a, [role='menuitem']")) {
              setOpen(false);
            }
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
