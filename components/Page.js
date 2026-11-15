import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ChevronDown, Shuffle, Check, X, RotateCcw } from "lucide-react";
import MediaCard from "./MediaCard";
import styles from "./Page.module.css";

const PLURAL_MAP = {
  country: "All Countries",
  category: "All Categories",
  rating: "All Ratings",
  service: "All Services",
  genre: "All Genres",
  year: "All Years",
  language: "All Languages",
  sort: "Default Sort",
};

export function FilterDropdown({
  filterKey,
  options = [],
  value = "all",
  onChange,
  isOpen,
  onToggle,
  onClose,
  allowAllOption = true,
}) {
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [alignRight, setAlignRight] = useState(false);

  const isSelected = Boolean(value && value !== "all");
  const selectedOption = options.find((opt) => String(opt.value) === String(value));
  const defaultLabel = filterKey.charAt(0).toUpperCase() + filterKey.slice(1);
  const displayLabel = selectedOption ? selectedOption.label : defaultLabel;
  const allOptionLabel = PLURAL_MAP[filterKey.toLowerCase()] || `All ${defaultLabel}s`;

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        onClose();
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Adjust menu alignment and move initial keyboard focus when opened
  useEffect(() => {
    if (!isOpen) return;
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const overflowRight = rect.left + 230 > window.innerWidth;
      setAlignRight(overflowRight);
    }
    const timer = requestAnimationFrame(() => {
      if (!menuRef.current) return;
      const selected = menuRef.current.querySelector('[role="option"][aria-selected="true"]');
      const first = menuRef.current.querySelector('[role="option"]');
      (selected || first)?.focus?.();
    });
    return () => cancelAnimationFrame(timer);
  }, [isOpen]);

  const handleTriggerKeyDown = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!isOpen) {
        onToggle();
      } else {
        const items = menuRef.current?.querySelectorAll('[role="option"]');
        if (items?.length) {
          (e.key === "ArrowUp" ? items[items.length - 1] : items[0]).focus();
        }
      }
    }
  };

  const handleMenuKeyDown = (e) => {
    const items = Array.from(menuRef.current?.querySelectorAll('[role="option"]') || []);
    if (!items.length) return;
    const idx = items.indexOf(document.activeElement);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(idx + 1 + items.length) % items.length].focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length].focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0].focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1].focus();
    } else if (e.key === "Tab") {
      onClose();
    }
  };

  return (
    <div
      ref={containerRef}
      className={`${styles.dropdownWrapper} ${isOpen ? styles.dropdownWrapperOpen : ""}`}
    >
      <div
        className={`${styles.dropdownControl} ${
          isSelected ? styles.dropdownTriggerActive : ""
        } ${isOpen ? styles.dropdownTriggerOpen : ""}`}
      >
        <button
          ref={triggerRef}
          type="button"
          className={styles.dropdownTriggerBtn}
          onClick={onToggle}
          onKeyDown={handleTriggerKeyDown}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label={`${defaultLabel} filter`}
        >
          {isSelected && <span className={styles.activeDot} />}
          <span className={styles.dropdownLabel} title={displayLabel}>
            {displayLabel}
          </span>
          <ChevronDown
            size={13}
            strokeWidth={2.2}
            className={`${styles.dropdownChevron} ${
              isOpen ? styles.dropdownChevronOpen : ""
            }`}
          />
        </button>

        {isSelected && allowAllOption && (
          <button
            type="button"
            className={styles.dropdownClearBtn}
            onClick={(e) => {
              e.stopPropagation();
              onChange(filterKey, "all");
              onClose();
            }}
            title={`Clear ${defaultLabel}`}
            aria-label={`Clear ${defaultLabel}`}
          >
            <X size={11} strokeWidth={2.5} />
          </button>
        )}
      </div>

      {isOpen && (
        <div
          ref={menuRef}
          className={`${styles.dropdownMenu} ${
            alignRight ? styles.dropdownMenuRight : ""
          }`}
          role="listbox"
          aria-label={defaultLabel}
          onKeyDown={handleMenuKeyDown}
        >
          {allowAllOption && (
            <>
              <button
                type="button"
                role="option"
                aria-selected={!isSelected}
                className={`${styles.dropdownItem} ${
                  !isSelected ? styles.dropdownItemActive : ""
                }`}
                onClick={() => {
                  onChange(filterKey, "all");
                  onClose();
                  triggerRef.current?.focus();
                }}
              >
                <span className={styles.dropdownItemLabel}>{allOptionLabel}</span>
                {!isSelected && <Check size={14} strokeWidth={2.2} className={styles.dropdownItemCheck} />}
              </button>
              <div className={styles.dropdownDivider} />
            </>
          )}

          {/* Options List */}
          <div className={styles.dropdownScrollArea}>
            {options.map((opt) => {
              const active = String(opt.value) === String(value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`${styles.dropdownItem} ${
                    active ? styles.dropdownItemActive : ""
                  }`}
                  onClick={() => {
                    onChange(filterKey, opt.value);
                    onClose();
                    triggerRef.current?.focus();
                  }}
                >
                  <span className={styles.dropdownItemLabel}>{opt.label}</span>
                  {active && (
                    <Check
                      size={14}
                      strokeWidth={2.2}
                      className={styles.dropdownItemCheck}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function CatalogFilterBar({
  title,
  category,
  onCategoryChange,
  categories = [],
  filters = {},
  onFilterChange,
  filterOptions = {},
  onShuffle,
  activeFilterCount = 0,
  onReset,
}) {
  const [openFilterKey, setOpenFilterKey] = useState(null);

  return (
    <div className={styles.catalogHeader}>
      <h1 className={styles.catalogTitle}>{title}</h1>
      <div className={styles.filterBar}>
        {/* Left Category Pills */}
        <div className={styles.filterLeftPills} role="group" aria-label={`${title} categories`}>
          {categories.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-pressed={category === c.value}
              className={`${styles.categoryPill} ${
                category === c.value ? styles.categoryPillActive : ""
              }`}
              onClick={() => onCategoryChange(c.value)}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Right Glass Dropdowns */}
        <div className={styles.filterRightSelects}>
          {Object.entries(filterOptions).map(([key, options]) => (
            <FilterDropdown
              key={key}
              filterKey={key}
              options={options}
              value={filters[key] || "all"}
              onChange={onFilterChange}
              isOpen={openFilterKey === key}
              onToggle={() =>
                setOpenFilterKey((prev) => (prev === key ? null : key))
              }
              onClose={() => setOpenFilterKey(null)}
            />
          ))}

          {onReset && activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setOpenFilterKey(null);
                onReset();
              }}
              className={styles.resetBtn}
              title={`Reset ${activeFilterCount} active filter${activeFilterCount === 1 ? "" : "s"}`}
              aria-label="Reset filters"
            >
              <RotateCcw size={13.5} strokeWidth={2.2} />
              <span>Reset</span>
            </button>
          )}

          {onShuffle && (
            <button
              type="button"
              onClick={onShuffle}
              className={styles.shuffleBtn}
              title="Shuffle / Randomize"
              aria-label="Shuffle titles"
            >
              <Shuffle size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function PageHead({ title, sub, children }) {
  return (
    <div className={styles.head}>
      <div>
        <h1 className="pageTitle">{title}</h1>
        {sub && <p className={styles.sub}>{sub}</p>}
      </div>
      {children && <div className={styles.headTools}>{children}</div>}
    </div>
  );
}

export function Grid({ children, wide }) {
  return <div className={`${styles.grid} ${wide ? styles.gridWide : ""}`}>{children}</div>;
}

export function TitleGrid({ items, wide, cardProps }) {
  return (
    <Grid wide={wide}>
      {items.map((t) => (
        <MediaCard key={t.id} title={t} fluid wide={wide} {...(cardProps ? cardProps(t) : {})} />
      ))}
    </Grid>
  );
}

export function Empty({ title, text, href, cta, actionLabel, onAction }) {
  return (
    <div className={styles.empty}>
      <h2>{title}</h2>
      <p>{text}</p>
      {(onAction && actionLabel) || href ? (
        <div className={styles.emptyActions}>
          {onAction && actionLabel && (
            <button type="button" className="btnHero" onClick={onAction}>
              {actionLabel}
            </button>
          )}
          {href && cta && (
            <Link href={href} className={onAction && actionLabel ? "btnHeroGlass" : "btnHero"}>
              {cta}
            </Link>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function Chips({ options, value, onChange, label }) {
  return (
    <div className={styles.chips} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`${styles.chip} ${o.value === value ? styles.chipOn : ""}`}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Select({ id, label, value, onChange, options }) {
  return (
    <label className={styles.select} htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
