// components/CustomDropdown.jsx
import { useState } from "react";
import styles from "./CustomDropdown.module.css";

export default function CustomDropdown({ value, onChange, options }) {
  const [open, setOpen] = useState(false);

  const selectedLabel =
    options?.find((opt) => String(opt.value) === String(value))?.label || "";

  return (
    <div className={styles.dropdown}>
      <div className={styles.selected} onClick={() => setOpen((prev) => !prev)}>
        {selectedLabel || "건물 선택"}
        <img
          src={open ? "/arrow-up.svg" : "/arrow-down.svg"}
          alt="드롭다운 화살표"
          className={styles.arrow}
        />
      </div>
      {open && (
        <ul className={styles.menu}>
          {options.map((opt) => (
            <li
              key={opt.value}
              className={styles.item}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
