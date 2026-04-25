import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

// Category picker.
//   single-mode: pick exactly one. Previous behavior — kept for the
//     timeline filter dropdown which still needs a single value.
//   multi-mode (default for forms): toggle each chip on / off, returns
//     a string[]. Custom "기타" input adds whatever the user types as
//     an extra entry alongside the built-in chips.
//
// Internally driven by two mutually-exclusive prop shapes; callers pick
// which one based on whether they need single or multi.
type Common = {
  options: readonly string[];
  scope: "category";
  customKey?: string;
};

type SingleProps = Common & {
  multiple?: false;
  value: string | null;
  onChange: (v: string | null) => void;
  allowEmpty?: boolean;
};

type MultiProps = Common & {
  multiple: true;
  value: string[];
  onChange: (v: string[]) => void;
};

export function CategoryChips(props: SingleProps | MultiProps) {
  if (props.multiple) {
    return <MultiCategoryChips {...props} />;
  }
  return <SingleCategoryChips {...props} />;
}

function SingleCategoryChips({
  options,
  value,
  onChange,
  scope,
  allowEmpty = false,
  customKey,
}: SingleProps) {
  const { t } = useTranslation();

  const isKnown = value != null && options.includes(value);
  // "Custom" mode is on whenever the user picked the custom chip OR
  // their current value isn't one of the predefined options.
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
          const active = opt === customKey ? isCustom : value === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => {
                if (opt === customKey) {
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

function MultiCategoryChips({
  options,
  value,
  onChange,
  scope,
  customKey,
}: MultiProps) {
  const { t } = useTranslation();

  // Custom entries: anything in value that isn't a built-in option
  // (and isn't the customKey sentinel itself).
  const builtInSet = new Set<string>(options);
  const customs = value.filter(
    (v) => !builtInSet.has(v) && v !== customKey
  );
  // The custom input is shown if the user toggled the customKey chip
  // (we keep an empty-string placeholder visible) OR if there's already
  // at least one custom entry.
  const customMode =
    customKey != null && (value.includes(customKey) || customs.length > 0);

  function toggle(opt: string) {
    if (value.includes(opt)) {
      onChange(value.filter((v) => v !== opt));
    } else {
      onChange([...value, opt]);
    }
  }

  function setCustomEntry(input: string) {
    const trimmed = input.trim();
    // Strip out previous custom entries + the sentinel — we replace
    // them with whatever's in the input (or the sentinel if empty).
    const withoutCustoms = value.filter(
      (v) => builtInSet.has(v) && v !== customKey
    );
    if (trimmed === "") {
      // Keep the sentinel so the input stays mounted.
      onChange(customKey ? [...withoutCustoms, customKey] : withoutCustoms);
    } else {
      onChange([...withoutCustoms, trimmed]);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const active =
            opt === customKey ? customMode : value.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => {
                if (opt === customKey) {
                  if (customMode) {
                    // Turn custom mode off: drop the sentinel and any
                    // freeform entries.
                    onChange(
                      value.filter(
                        (v) => builtInSet.has(v) && v !== customKey
                      )
                    );
                  } else {
                    onChange([...value, customKey]);
                  }
                } else {
                  toggle(opt);
                }
              }}
              className={cn("chip", active && "chip-active")}
            >
              {t(`${scope}.${opt}`)}
            </button>
          );
        })}
      </div>
      {customMode && (
        <input
          type="text"
          className="input-base"
          placeholder="직접 입력 · 自定义"
          value={customs[0] ?? ""}
          onChange={(e) => setCustomEntry(e.target.value)}
          maxLength={40}
        />
      )}
    </div>
  );
}
