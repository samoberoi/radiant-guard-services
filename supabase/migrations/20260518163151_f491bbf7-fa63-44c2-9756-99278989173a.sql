-- New canonical India state/UT reference table for Professional Tax and similar modules.
-- The existing public.states table is renamed in UI as "Location Manager" and stays in place.

CREATE TABLE IF NOT EXISTS public.indian_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  kind text NOT NULL DEFAULT 'state' CHECK (kind IN ('state','ut')),
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.indian_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read indian_states"
  ON public.indian_states FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write indian_states"
  ON public.indian_states FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update indian_states"
  ON public.indian_states FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete indian_states"
  ON public.indian_states FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_indian_states_updated_at
  BEFORE UPDATE ON public.indian_states
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed: 28 States + 8 Union Territories (alphabetical within each group)
INSERT INTO public.indian_states (name, code, kind, sort_order) VALUES
  ('Andhra Pradesh','AP','state',10),
  ('Arunachal Pradesh','AR','state',20),
  ('Assam','AS','state',30),
  ('Bihar','BR','state',40),
  ('Chhattisgarh','CG','state',50),
  ('Goa','GA','state',60),
  ('Gujarat','GJ','state',70),
  ('Haryana','HR','state',80),
  ('Himachal Pradesh','HP','state',90),
  ('Jharkhand','JH','state',100),
  ('Karnataka','KA','state',110),
  ('Kerala','KL','state',120),
  ('Madhya Pradesh','MP','state',130),
  ('Maharashtra','MH','state',140),
  ('Manipur','MN','state',150),
  ('Meghalaya','ML','state',160),
  ('Mizoram','MZ','state',170),
  ('Nagaland','NL','state',180),
  ('Odisha','OD','state',190),
  ('Punjab','PB','state',200),
  ('Rajasthan','RJ','state',210),
  ('Sikkim','SK','state',220),
  ('Tamil Nadu','TN','state',230),
  ('Telangana','TG','state',240),
  ('Tripura','TR','state',250),
  ('Uttar Pradesh','UP','state',260),
  ('Uttarakhand','UK','state',270),
  ('West Bengal','WB','state',280),
  ('Andaman and Nicobar Islands','AN','ut',310),
  ('Chandigarh','CH','ut',320),
  ('Dadra and Nagar Haveli and Daman and Diu','DH','ut',330),
  ('Delhi','DL','ut',340),
  ('Jammu and Kashmir','JK','ut',350),
  ('Ladakh','LA','ut',360),
  ('Lakshadweep','LD','ut',370),
  ('Puducherry','PY','ut',380)
ON CONFLICT (code) DO NOTHING;