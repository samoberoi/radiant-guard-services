import { useEffect, useState, useCallback } from "react";

/**
 * Local-first admin data store.
 * Persists states & branches in localStorage and broadcasts updates across
 * components and tabs. TODO: replace with backend (Lovable Cloud) once API
 * is ready — keep the function signatures stable so swap-in is trivial.
 */

const STATES_KEY = "radiant.admin.states";
const BRANCHES_KEY = "radiant.admin.branches";
const CUSTOMERS_KEY = "radiant.admin.customers";
const SEED_FLAG = "radiant.admin.seeded.v1";
const CUSTOMERS_SEED_FLAG = "radiant.admin.customers.seeded.v1";

export type State = {
  id: string;
  name: string;
};

export type Branch = {
  id: string;
  code: string; // e.g. "BR1", "BR22"
  name: string; // human label, often same as state
  description: string;
  stateId: string;
};

export type CustomerStatus = "active" | "inactive";

export type Customer = {
  id: string;
  code: string; // e.g. "ORG1", "ORG22"
  name: string; // organisation name
  website: string;
  phone: string;
  address: string;
  contractStartDate: string; // ISO yyyy-mm-dd
  status: CustomerStatus;
};

// 28 Indian states + 8 UTs
const INDIA_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
];

// Extra location labels used in the existing branch dataset (cities / regions).
// Treated as additional state-level entries so historical mappings still work.
const EXTRA_LOCATIONS = [
  "PUNE",
  "BANGALORE",
  "GANDHINAGAR",
  "NAGPUR",
  "NASHIK",
  "MUMBAI",
  "SANGLI",
  "SATARA",
  "KOLHAPUR",
  "AURANGABAD",
  "AHMADNAGAR",
  "KONKAN",
  "JALGAON",
  "SOLAPUR",
  "Ahmedabad",
  "Radiant",
];

const SEED_BRANCHES: Array<{ code: string; state: string }> = [
  { code: "BR1", state: "PUNE" },
  { code: "BR2", state: "BANGALORE" },
  { code: "BR3", state: "GANDHINAGAR" },
  { code: "BR4", state: "NAGPUR" },
  { code: "BR5", state: "NASHIK" },
  { code: "BR6", state: "MUMBAI" },
  { code: "BR9", state: "Madhya Pradesh" },
  { code: "BR10", state: "GOA" },
  { code: "BR11", state: "Gujarat" },
  { code: "BR12", state: "SANGLI" },
  { code: "BR13", state: "SATARA" },
  { code: "BR14", state: "KOLHAPUR" },
  { code: "BR15", state: "AURANGABAD" },
  { code: "BR16", state: "AHMADNAGAR" },
  { code: "BR17", state: "KONKAN" },
  { code: "BR18", state: "JALGAON" },
  { code: "BR19", state: "SOLAPUR" },
  { code: "BR20", state: "Karnataka" },
  { code: "BR22", state: "Ahmedabad" },
  { code: "BR26", state: "Radiant" },
  { code: "BR27", state: "Telangana" },
  { code: "BR28", state: "Uttar Pradesh" },
  { code: "BR29", state: "Rajasthan" },
  { code: "BR30", state: "Tamil Nadu" },
  { code: "BR31", state: "Andhra Pradesh" },
  { code: "BR32", state: "Delhi" },
  { code: "BR33", state: "West Bengal" },
  { code: "BR34", state: "Odisha" },
  { code: "BR35", state: "Jharkhand" },
  { code: "BR36", state: "Bihar" },
  { code: "BR37", state: "Haryana" },
  { code: "BR38", state: "Punjab" },
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

// 10 real Indian banks — used as initial customer seed (illustrative example data).
const SEED_CUSTOMERS: Array<Omit<Customer, "id">> = [
  {
    code: "ORG1",
    name: "State Bank of India",
    website: "sbi.co.in",
    phone: "+91 22 2274 0841",
    address: "State Bank Bhavan, Madame Cama Road, Nariman Point, Mumbai 400021",
    contractStartDate: "2024-04-01",
    status: "active",
  },
  {
    code: "ORG2",
    name: "HDFC Bank",
    website: "hdfcbank.com",
    phone: "+91 22 6160 6161",
    address: "HDFC Bank House, Senapati Bapat Marg, Lower Parel, Mumbai 400013",
    contractStartDate: "2024-05-15",
    status: "active",
  },
  {
    code: "ORG3",
    name: "ICICI Bank",
    website: "icicibank.com",
    phone: "+91 22 3366 7777",
    address: "ICICI Bank Tower, Bandra-Kurla Complex, Bandra (E), Mumbai 400051",
    contractStartDate: "2024-06-01",
    status: "active",
  },
  {
    code: "ORG4",
    name: "Axis Bank",
    website: "axisbank.com",
    phone: "+91 22 2425 2525",
    address: "Axis House, Wadia International Centre, Worli, Mumbai 400025",
    contractStartDate: "2024-07-10",
    status: "active",
  },
  {
    code: "ORG5",
    name: "Kotak Mahindra Bank",
    website: "kotak.com",
    phone: "+91 22 6166 0001",
    address: "27BKC, C 27, G Block, Bandra Kurla Complex, Bandra (E), Mumbai 400051",
    contractStartDate: "2024-08-01",
    status: "active",
  },
  {
    code: "ORG6",
    name: "Punjab National Bank",
    website: "pnbindia.in",
    phone: "+91 11 2610 2303",
    address: "Plot No. 4, Sector 10, Dwarka, New Delhi 110075",
    contractStartDate: "2024-08-20",
    status: "active",
  },
  {
    code: "ORG7",
    name: "Bank of Baroda",
    website: "bankofbaroda.in",
    phone: "+91 22 6698 5000",
    address: "Baroda Corporate Centre, C-26, G-Block, Bandra Kurla Complex, Mumbai 400051",
    contractStartDate: "2024-09-05",
    status: "active",
  },
  {
    code: "ORG8",
    name: "Canara Bank",
    website: "canarabank.com",
    phone: "+91 80 2222 1581",
    address: "112, J C Road, Bangalore 560002",
    contractStartDate: "2024-09-15",
    status: "active",
  },
  {
    code: "ORG9",
    name: "Yes Bank",
    website: "yesbank.in",
    phone: "+91 22 5091 9800",
    address: "YES BANK Tower, IFC 2, 15th Floor, Senapati Bapat Marg, Elphinstone (W), Mumbai 400013",
    contractStartDate: "2024-10-01",
    status: "inactive",
  },
  {
    code: "ORG10",
    name: "IndusInd Bank",
    website: "indusind.com",
    phone: "+91 22 6641 2200",
    address: "8th Floor, Tower 1, One World Center, Senapati Bapat Marg, Mumbai 400013",
    contractStartDate: "2024-10-20",
    status: "active",
  },
];

function seedIfNeeded() {
  if (typeof window === "undefined") return;

  if (!window.localStorage.getItem(SEED_FLAG)) {
    // Build state list (dedupe by case-insensitive name)
    const seen = new Set<string>();
    const states: State[] = [];
    for (const name of [...INDIA_STATES, ...EXTRA_LOCATIONS]) {
      const k = name.trim().toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      states.push({ id: uid(), name: name.trim() });
    }

    const stateByName = new Map(
      states.map((s) => [s.name.trim().toLowerCase(), s] as const),
    );

    const branches: Branch[] = SEED_BRANCHES.map(({ code, state }) => {
      const s = stateByName.get(state.trim().toLowerCase());
      return {
        id: uid(),
        code,
        name: state,
        description: "",
        stateId: s ? s.id : "",
      };
    }).filter((b) => b.stateId);

    writeJson(STATES_KEY, states);
    writeJson(BRANCHES_KEY, branches);
    window.localStorage.setItem(SEED_FLAG, "1");
  }

  // Customer seed runs independently so existing users also pick it up.
  if (!window.localStorage.getItem(CUSTOMERS_SEED_FLAG)) {
    const existing = readJson<Customer[]>(CUSTOMERS_KEY, []);
    if (existing.length === 0) {
      const seeded: Customer[] = SEED_CUSTOMERS.map((c) => ({ ...c, id: uid() }));
      writeJson(CUSTOMERS_KEY, seeded);
    }
    window.localStorage.setItem(CUSTOMERS_SEED_FLAG, "1");
  }
}

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
  // also fire a synthetic storage event for cross-tab parity
}

function useStore<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(fallback);

  useEffect(() => {
    seedIfNeeded();
    setValue(readJson<T>(key, fallback));
    const sync = () => setValue(readJson<T>(key, fallback));
    listeners.add(sync);
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) sync();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(sync);
      window.removeEventListener("storage", onStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = useCallback(
    (v: T) => {
      writeJson(key, v);
      emit();
    },
    [key],
  );

  return [value, set];
}

export function useStates() {
  const [states, setStates] = useStore<State[]>(STATES_KEY, []);

  const addState = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return { ok: false as const, error: "Name is required" };
      const exists = states.some(
        (s) => s.name.trim().toLowerCase() === trimmed.toLowerCase(),
      );
      if (exists) return { ok: false as const, error: "State already exists" };
      setStates([...states, { id: uid(), name: trimmed }].sort((a, b) =>
        a.name.localeCompare(b.name),
      ));
      return { ok: true as const };
    },
    [states, setStates],
  );

  const updateState = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return { ok: false as const, error: "Name is required" };
      const dup = states.some(
        (s) =>
          s.id !== id &&
          s.name.trim().toLowerCase() === trimmed.toLowerCase(),
      );
      if (dup) return { ok: false as const, error: "Another state has this name" };
      setStates(
        states
          .map((s) => (s.id === id ? { ...s, name: trimmed } : s))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      return { ok: true as const };
    },
    [states, setStates],
  );

  const deleteState = useCallback(
    (id: string) => {
      setStates(states.filter((s) => s.id !== id));
    },
    [states, setStates],
  );

  return { states, addState, updateState, deleteState };
}

export function useBranches() {
  const [branches, setBranches] = useStore<Branch[]>(BRANCHES_KEY, []);

  const addBranch = useCallback(
    (data: Omit<Branch, "id">) => {
      const code = data.code.trim();
      if (!code) return { ok: false as const, error: "Branch code is required" };
      if (!data.stateId) return { ok: false as const, error: "Pick a state" };
      const codeDup = branches.some(
        (b) => b.code.trim().toLowerCase() === code.toLowerCase(),
      );
      if (codeDup) return { ok: false as const, error: "Branch code already exists" };
      const stateDup = branches.some((b) => b.stateId === data.stateId);
      if (stateDup) return { ok: false as const, error: "State already mapped to a branch" };
      setBranches([
        ...branches,
        {
          id: uid(),
          code,
          name: data.name.trim(),
          description: data.description.trim(),
          stateId: data.stateId,
        },
      ]);
      return { ok: true as const };
    },
    [branches, setBranches],
  );

  const updateBranch = useCallback(
    (id: string, data: Omit<Branch, "id">) => {
      const code = data.code.trim();
      if (!code) return { ok: false as const, error: "Branch code is required" };
      if (!data.stateId) return { ok: false as const, error: "Pick a state" };
      const codeDup = branches.some(
        (b) =>
          b.id !== id && b.code.trim().toLowerCase() === code.toLowerCase(),
      );
      if (codeDup) return { ok: false as const, error: "Branch code already exists" };
      const stateDup = branches.some(
        (b) => b.id !== id && b.stateId === data.stateId,
      );
      if (stateDup) return { ok: false as const, error: "State already mapped to a branch" };
      setBranches(
        branches.map((b) =>
          b.id === id
            ? {
                ...b,
                code,
                name: data.name.trim(),
                description: data.description.trim(),
                stateId: data.stateId,
              }
            : b,
        ),
      );
      return { ok: true as const };
    },
    [branches, setBranches],
  );

  const deleteBranch = useCallback(
    (id: string) => {
      setBranches(branches.filter((b) => b.id !== id));
    },
    [branches, setBranches],
  );

  return { branches, addBranch, updateBranch, deleteBranch };
}

export function nextCustomerCode(customers: { code: string }[]) {
  const nums = customers
    .map((c) => parseInt(c.code.replace(/\D/g, ""), 10))
    .filter((n) => Number.isFinite(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `ORG${max + 1}`;
}

export function useCustomers() {
  const [customers, setCustomers] = useStore<Customer[]>(CUSTOMERS_KEY, []);

  const addCustomer = useCallback(
    (data: Omit<Customer, "id">) => {
      const code = data.code.trim();
      const name = data.name.trim();
      if (!code) return { ok: false as const, error: "Organisation ID is required" };
      if (!name) return { ok: false as const, error: "Organisation name is required" };
      const codeDup = customers.some(
        (c) => c.code.trim().toLowerCase() === code.toLowerCase(),
      );
      if (codeDup) return { ok: false as const, error: "Organisation ID already exists" };
      const nameDup = customers.some(
        (c) => c.name.trim().toLowerCase() === name.toLowerCase(),
      );
      if (nameDup) return { ok: false as const, error: "Organisation name already exists" };
      setCustomers([
        ...customers,
        {
          id: uid(),
          code,
          name,
          website: data.website.trim(),
          phone: data.phone.trim(),
          address: data.address.trim(),
          contractStartDate: data.contractStartDate,
          status: data.status,
        },
      ]);
      return { ok: true as const };
    },
    [customers, setCustomers],
  );

  const updateCustomer = useCallback(
    (id: string, data: Omit<Customer, "id">) => {
      const code = data.code.trim();
      const name = data.name.trim();
      if (!code) return { ok: false as const, error: "Organisation ID is required" };
      if (!name) return { ok: false as const, error: "Organisation name is required" };
      const codeDup = customers.some(
        (c) => c.id !== id && c.code.trim().toLowerCase() === code.toLowerCase(),
      );
      if (codeDup) return { ok: false as const, error: "Organisation ID already exists" };
      const nameDup = customers.some(
        (c) => c.id !== id && c.name.trim().toLowerCase() === name.toLowerCase(),
      );
      if (nameDup) return { ok: false as const, error: "Organisation name already exists" };
      setCustomers(
        customers.map((c) =>
          c.id === id
            ? {
                ...c,
                code,
                name,
                website: data.website.trim(),
                phone: data.phone.trim(),
                address: data.address.trim(),
                contractStartDate: data.contractStartDate,
                status: data.status,
              }
            : c,
        ),
      );
      return { ok: true as const };
    },
    [customers, setCustomers],
  );

  const deleteCustomer = useCallback(
    (id: string) => {
      setCustomers(customers.filter((c) => c.id !== id));
    },
    [customers, setCustomers],
  );

  return { customers, addCustomer, updateCustomer, deleteCustomer };
}
