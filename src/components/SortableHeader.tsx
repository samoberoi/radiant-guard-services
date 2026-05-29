import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc";
export type SortState<K extends string> = { key: K; dir: SortDir } | null;

export function useSort<K extends string>(initial: SortState<K> = null) {
  const [sort, setSort] = useState<SortState<K>>(initial);
  function toggle(key: K) {
    setSort((curr) => {
      if (!curr || curr.key !== key) return { key, dir: "asc" };
      if (curr.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }
  return { sort, toggle, setSort };
}

/** Sort an array by a key extractor. Strings compared case-insensitive; null/undefined sink to bottom. */
export function sortRows<T, K extends string>(
  rows: T[],
  sort: SortState<K>,
  getValue: (row: T, key: K) => unknown,
): T[] {
  if (!sort) return rows;
  const { key, dir } = sort;
  const factor = dir === "asc" ? 1 : -1;
  const out = [...rows];
  out.sort((a, b) => {
    const av = getValue(a, key);
    const bv = getValue(b, key);
    const aNil = av == null || av === "";
    const bNil = bv == null || bv === "";
    if (aNil && bNil) return 0;
    if (aNil) return 1; // nulls last
    if (bNil) return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
    if (av instanceof Date && bv instanceof Date) return (av.getTime() - bv.getTime()) * factor;
    return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" }) * factor;
  });
  return out;
}

export function SortHeader<K extends string>({
  label,
  sortKey,
  sort,
  onToggle,
  align = "left",
  className,
}: {
  label: React.ReactNode;
  sortKey: K;
  sort: SortState<K>;
  onToggle: (key: K) => void;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  const active = sort?.key === sortKey;
  const Icon = useMemo(() => {
    if (!active) return ArrowUpDown;
    return sort?.dir === "asc" ? ArrowUp : ArrowDown;
  }, [active, sort?.dir]);
  return (
    <th
      className={cn(
        "px-4 py-3 select-none",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 text-inherit uppercase hover:text-foreground transition",
          align === "right" && "flex-row-reverse",
          active && "text-foreground",
        )}
      >
        <span>{label}</span>
        <Icon className={cn("h-3 w-3", active ? "opacity-100" : "opacity-50")} />
      </button>
    </th>
  );
}
