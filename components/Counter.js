import React, { useId } from "react";
import styles from "./Counter.module.css";

/**
 * Mechanical Rolling Tabular Counter
 * Renders smooth rolling numeric digits using vertical translateY transitions
 * and mask-image fading.
 *
 * @param {number|string} value - The number or formatted string to display (e.g. 2, 4.8, "12").
 * @param {string} [className] - Optional extra class name.
 * @param {string} [ariaLabel] - Optional custom accessible label.
 */
export default function Counter({ value, className = "", ariaLabel }) {
  const compId = useId();
  const str = String(value ?? "");

  return (
    <span className={`${styles.counter} ${className}`}>
      <span className={styles.sr}>{ariaLabel || str}</span>
      <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center" }}>
        {str.split("").map((ch, idx) => {
          if (/\d/.test(ch)) {
            const digit = parseInt(ch, 10);
            return (
              <span key={`${compId}-d-${idx}`} className={styles.digit}>
                <span className={styles.ghost}>0</span>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <span
                    key={n}
                    className={styles.face}
                    style={{
                      transform: n === digit ? "none" : `translateY(${(n - digit) * 100}%)`,
                    }}
                  >
                    {n}
                  </span>
                ))}
              </span>
            );
          }
          return (
            <span key={`${compId}-s-${idx}`} className={styles.symbol}>
              {ch}
            </span>
          );
        })}
      </span>
    </span>
  );
}
