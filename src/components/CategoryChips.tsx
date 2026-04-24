import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

// Category picker. When `customKey` is provided (typically "other"),
// selecting that chip reveals a freeform text input the user can type
// into — the typed value is stored in-place of the chip key, so the
// underlying column can hold anything from "korean" to "퓨전 · Fusion".
export function CategoryChips({
  options,
  value,
  onChange,
  scope,
  allowEmpty = false,
  customKey,
}: {
  options: readonly string[];
  value: string | null;
  onChange: (v: string | null) => void;
  scope: "category";
  allowEmpty?: boolean;
  customKey?: string;
}) {
  const { t } = useTranslation();

  const isKnown = value != null && options.includes(value);
  // "Custom" mode is on whenever the user picked the custom chip OR their
  // current value isn't one of the predefined options.
  const isCustom =
    customKey != null &&
    value != null &&
    (value === customKey || !isKnown);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {allowEmpty && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className={cn("chip", value === null && "chip-active")}
          >
            {t("common.all")}
          </button>
        )}
        {options.map((opt) => {
          const active =
            opt === customKey ? isCustom : value === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => {
                if (opt === customKey) {
                  // Enter custom mode — keep any text the user already
                  // typed if we're already in custom mode; otherwise set
                  // to the chip key itself as a placeholder selection.
                  if (!isCustom) onChange(customKey);
                } else {
                  onChange(opt);
                }
              }}
              className={cn("chip", active && "chip-active")}
            >
              {t(`${scope}.${opt}`)}
            </button>
          );
        })}
      </div>
      {customKey != null && isCustom && (
        <input
          type="text"
          className="input-base"
          placeholder="직접 입력 · 自定义"
          // When value equals the sentinel "other", leave the input empty
          // so the placeholder shows.
          value={value === customKey ? "" : (value ?? "")}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v.trim() === "" ? customKey : v);
          }}
          maxLength={40}
        />
      )}
    </div>
  );
}
