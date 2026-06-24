
-- Customizable payroll formula engine — additive migration.
-- Empty formula/code fields preserve legacy behavior; existing rows compute identically.

-- ---------- allowance_types ----------
ALTER TABLE public.allowance_types
  ADD COLUMN IF NOT EXISTS short_code text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS formula jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS day_driver text NOT NULL DEFAULT 'ratio',
  ADD COLUMN IF NOT EXISTS counts_in_t_days boolean NOT NULL DEFAULT false;

-- Backfill short_code from existing short_name or name (upper, alphanumeric only)
UPDATE public.allowance_types
   SET short_code = upper(regexp_replace(coalesce(NULLIF(short_name,''), name), '[^A-Za-z0-9]+', '', 'g'))
 WHERE short_code = '' OR short_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS allowance_types_short_code_uniq
  ON public.allowance_types(lower(short_code)) WHERE short_code <> '';

-- ---------- cost_components ----------
ALTER TABLE public.cost_components
  ADD COLUMN IF NOT EXISTS code text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS formula jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS day_driver text NOT NULL DEFAULT 'ratio';

UPDATE public.cost_components
   SET code = upper(regexp_replace(name, '[^A-Za-z0-9]+', '', 'g'))
 WHERE code = '' OR code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cost_components_code_uniq
  ON public.cost_components(lower(code)) WHERE code <> '';

-- ---------- addition_types ----------
ALTER TABLE public.addition_types
  ADD COLUMN IF NOT EXISTS formula jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS default_amount numeric,
  ADD COLUMN IF NOT EXISTS qty_unit text,
  ADD COLUMN IF NOT EXISTS rate_source text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS counts_in_t_days boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS t_days_bucket text;

-- ---------- deduction_types ----------
ALTER TABLE public.deduction_types
  ADD COLUMN IF NOT EXISTS formula jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS default_amount numeric,
  ADD COLUMN IF NOT EXISTS rate_source text NOT NULL DEFAULT 'fixed';

-- ---------- additions / deductions (per-employee rows) ----------
ALTER TABLE public.additions
  ADD COLUMN IF NOT EXISTS qty numeric,
  ADD COLUMN IF NOT EXISTS computed_amount numeric;

ALTER TABLE public.deductions
  ADD COLUMN IF NOT EXISTS qty numeric,
  ADD COLUMN IF NOT EXISTS computed_amount numeric;

-- ---------- supporting indexes for bulk-grid filters ----------
CREATE INDEX IF NOT EXISTS additions_type_date_idx
  ON public.additions(addition_type_id, addition_date DESC);

CREATE INDEX IF NOT EXISTS deductions_type_date_idx
  ON public.deductions(deduction_type_id, deduction_date DESC);
