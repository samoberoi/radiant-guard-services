"use client";

import * as React from "react";
import {
  addDays,
  addMonths,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type CalendarProps = Omit<React.HTMLAttributes<HTMLDivElement>, "onSelect"> & {
  mode?: "single";
  selected?: Date;
  defaultMonth?: Date;
  startMonth?: Date;
  endMonth?: Date;
  captionLayout?: "label" | "dropdown";
  onSelect?: (date: Date | undefined) => void;
  disabled?: boolean | ((date: Date) => boolean);
};

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = Array.from({ length: 12 }, (_, index) => ({
  value: index,
  label: format(new Date(2026, index, 1), "MMM"),
}));

function clampMonth(month: Date, min?: Date, max?: Date) {
  const normalized = startOfMonth(month);
  const minMonth = min ? startOfMonth(min) : undefined;
  const maxMonth = max ? startOfMonth(max) : undefined;

  if (minMonth && isBefore(normalized, minMonth)) return minMonth;
  if (maxMonth && isAfter(normalized, maxMonth)) return maxMonth;
  return normalized;
}

function isDateDisabled(date: Date, disabled?: CalendarProps["disabled"]) {
  if (typeof disabled === "boolean") return disabled;
  return disabled?.(date) ?? false;
}

function Calendar({
  className,
  selected,
  defaultMonth,
  startMonth,
  endMonth,
  captionLayout = "dropdown",
  onSelect,
  disabled,
  ...props
}: CalendarProps) {
  const initialMonth = React.useMemo(
    () => clampMonth(defaultMonth ?? selected ?? new Date(), startMonth, endMonth),
    [defaultMonth, selected, startMonth, endMonth],
  );
  const [displayMonth, setDisplayMonth] = React.useState(initialMonth);

  React.useEffect(() => {
    setDisplayMonth(initialMonth);
  }, [initialMonth]);

  const years = React.useMemo(() => {
    const startYear = (startMonth ?? new Date(new Date().getFullYear() - 100, 0)).getFullYear();
    const endYear = (endMonth ?? new Date(new Date().getFullYear() + 50, 11)).getFullYear();
    return Array.from({ length: Math.max(1, endYear - startYear + 1) }, (_, index) => startYear + index);
  }, [startMonth, endMonth]);

  const firstGridDate = startOfWeek(startOfMonth(displayMonth));
  const days = Array.from({ length: 42 }, (_, index) => addDays(firstGridDate, index));
  const atStart = startMonth ? !isAfter(displayMonth, startOfMonth(startMonth)) : false;
  const atEnd = endMonth ? !isBefore(displayMonth, startOfMonth(endMonth)) : false;

  const moveMonth = (nextMonth: Date) => {
    setDisplayMonth(clampMonth(nextMonth, startMonth, endMonth));
  };

  return (
    <div
      data-slot="calendar"
      className={cn(
        "w-[18rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-border bg-popover p-3 text-popover-foreground shadow-[0_22px_48px_-20px_color-mix(in_oklab,var(--foreground)_40%,transparent)]",
        className,
      )}
      {...props}
    >
      <div className="mb-2 grid grid-cols-[2rem_1fr_2rem] items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          disabled={atStart}
          onClick={() => moveMonth(subMonths(displayMonth, 1))}
          aria-label="Previous month"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </Button>

        {captionLayout === "dropdown" ? (
          <div className="grid grid-cols-[1fr_4.75rem] gap-1.5">
            <select
              className="h-8 min-w-0 rounded-full border border-input bg-muted px-2 text-center text-xs font-semibold text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              value={displayMonth.getMonth()}
              onChange={(event) => {
                const next = new Date(displayMonth);
                next.setMonth(Number(event.target.value));
                moveMonth(next);
              }}
              aria-label="Month"
            >
              {MONTHS.map((month) => (
                <option key={month.value} value={month.value}>
                  {month.label}
                </option>
              ))}
            </select>
            <select
              className="h-8 min-w-0 rounded-full border border-input bg-muted px-2 text-center text-xs font-semibold text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              value={displayMonth.getFullYear()}
              onChange={(event) => {
                const next = new Date(displayMonth);
                next.setFullYear(Number(event.target.value));
                moveMonth(next);
              }}
              aria-label="Year"
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="text-center text-sm font-semibold text-foreground">
            {format(displayMonth, "MMMM yyyy")}
          </div>
        )}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          disabled={atEnd}
          onClick={() => moveMonth(addMonths(displayMonth, 1))}
          aria-label="Next month"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((weekday) => (
          <div key={weekday} className="h-6 text-[10px] font-semibold uppercase leading-6 text-muted-foreground">
            {weekday}
          </div>
        ))}
        {days.map((day) => {
          const inCurrentMonth = isSameMonth(day, displayMonth);
          const isSelected = selected ? isSameDay(day, selected) : false;
          const blocked = isDateDisabled(day, disabled);

          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={blocked}
              className={cn(
                "grid h-8 w-8 place-items-center rounded-lg text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                !inCurrentMonth && "text-muted-foreground/55",
                isSelected && "bg-primary text-primary-foreground hover:bg-primary",
                blocked && "cursor-not-allowed opacity-35 hover:bg-transparent",
              )}
              onClick={() => onSelect?.(day)}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CalendarDayButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} />;
}

export { Calendar, CalendarDayButton };