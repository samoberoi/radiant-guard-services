import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

const baseClasses =
  "flex h-10 w-full rounded-lg border border-border/70 bg-card px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-accent/50 focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/15 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

const DateInput = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, value, defaultValue, onChange, disabled, name, id, placeholder, min, max, ...props }, ref) => {
    const [open, setOpen] = React.useState(false);
    const [internal, setInternal] = React.useState<string>(
      typeof value === "string" ? value : typeof defaultValue === "string" ? defaultValue : "",
    );
    const hiddenRef = React.useRef<HTMLInputElement>(null);
    React.useImperativeHandle(ref, () => hiddenRef.current as HTMLInputElement);

    React.useEffect(() => {
      if (typeof value === "string") {
        setInternal(value);
      }
    }, [value]);

    const strValue = internal;
    const parsed = strValue ? parse(strValue, "yyyy-MM-dd", new Date()) : undefined;
    const selected = parsed && isValid(parsed) ? parsed : undefined;
    const display = selected ? format(selected, "dd/MM/yyyy") : "";

    const fireChange = (v: string) => {
      setInternal(v);
      const el = hiddenRef.current;
      if (el) {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        )?.set;
        setter?.call(el, v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        onChange?.({
          target: el,
          currentTarget: el,
        } as React.ChangeEvent<HTMLInputElement>);
      } else {
        onChange?.({
          target: { value: v, name, id } as EventTarget & HTMLInputElement,
          currentTarget: { value: v, name, id } as EventTarget & HTMLInputElement,
        } as React.ChangeEvent<HTMLInputElement>);
      }
    };

    const minDate = typeof min === "string" && min ? parse(min, "yyyy-MM-dd", new Date()) : undefined;
    const maxDate = typeof max === "string" && max ? parse(max, "yyyy-MM-dd", new Date()) : undefined;

    return (
      <Popover open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(baseClasses, "flex items-center justify-between text-left font-normal", !selected && "text-muted-foreground", className)}
          >
            <span>{display || placeholder || "dd/mm/yyyy"}</span>
            <CalendarIcon className="ml-2 h-4 w-4 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected ?? new Date()}
            captionLayout="dropdown"
            onSelect={(d) => {
              if (d) {
                fireChange(format(d, "yyyy-MM-dd"));
                setOpen(false);
              } else {
                fireChange("");
              }
            }}
            disabled={
              minDate || maxDate
                ? (date) => (minDate && date < minDate) || (maxDate && date > maxDate) || false
                : undefined
            }
          />
        </PopoverContent>
        <input
          ref={hiddenRef}
          type="hidden"
          name={name}
          id={id}
          value={strValue}
          onChange={onChange}
          {...props}
        />
      </Popover>
    );
  },
);
DateInput.displayName = "DateInput";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    if (type === "date") {
      return <DateInput className={className} {...props} ref={ref} />;
    }
    return (
      <input
        type={type}
        className={cn(baseClasses, className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
