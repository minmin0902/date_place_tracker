import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export function CategoryChips<T extends string>({
  options,
  value,
  onChange,
  scope,
  allowEmpty = false,
}: {
  options: readonly T[];
  value: T | null;
  onChange: (v: T | null) => void;
  scope: "category";
  allowEmpty?: boolean;
}) {
  const { t } = useTranslation();
  return (
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
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={cn("chip", value === opt && "chip-active")}
        >
          {t(`${scope}.${opt}`)}
        </button>
      ))}
    </div>
  );
}
