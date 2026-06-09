import {
  resolveFieldOfficersForUnit,
  resolveGuardsForUnit,
  useCandidateUnits,
  useEmployeesLite,
  useScopeAssignments,
} from "@/lib/deployment";
import { Shield, UserCog } from "lucide-react";

/**
 * Compact, read-only listing of people deployed to a unit:
 *   • Field Officers (mapped via unit / branch / org / state, or candidate_units)
 *   • Security Guards (assigned to the unit)
 *
 * Used inside the org-manager tree and the "View full hierarchy" dialog.
 */
export function UnitDeployedPeople({
  unitId,
  branchId,
  customerId,
  stateName,
  className = "",
}: {
  unitId: string;
  branchId: string | null;
  customerId: string | null;
  stateName: string;
  className?: string;
}) {
  const sa = useScopeAssignments();
  const emp = useEmployeesLite();
  const cu = useCandidateUnits();

  const loading = sa.isLoading || emp.isLoading || cu.isLoading;
  const assignments = sa.data ?? [];
  const employees = emp.data ?? [];
  const candidateUnits = cu.data ?? [];

  const ctx = { id: unitId, branch_id: branchId, customer_id: customerId, state_name: stateName };
  const fms = resolveFieldOfficersForUnit(ctx, assignments, employees, candidateUnits);
  const guards = resolveGuardsForUnit(ctx, employees, assignments, candidateUnits);

  if (loading) {
    return <div className={`text-[11px] text-muted-foreground ${className}`}>Loading deployment…</div>;
  }

  if (fms.length === 0 && guards.length === 0) {
    return (
      <div className={`text-[11px] italic text-muted-foreground ${className}`}>
        No one deployed yet.
      </div>
    );
  }

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div>
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">
          <UserCog className="h-3 w-3" /> Field officers ({fms.length})
        </div>
        {fms.length === 0 ? (
          <div className="ml-4 text-[11px] italic text-muted-foreground">None mapped.</div>
        ) : (
          <ul className="ml-4 space-y-0.5">
            {fms.map(({ fm }) => (
              <li key={fm.id} className="flex items-center gap-1.5 text-[11px]">
                <span className="text-foreground">{fm.full_name}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{fm.employee_code}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
          <Shield className="h-3 w-3" /> Security guards ({guards.length})
        </div>
        {guards.length === 0 ? (
          <div className="ml-4 text-[11px] italic text-muted-foreground">None deployed.</div>
        ) : (
          <ul className="ml-4 space-y-0.5">
            {guards.map((g) => {
              const mgr = employees.find((e) => e.id === g.reports_to);
              return (
                <li key={g.id} className="flex items-center gap-1.5 text-[11px]">
                  <span className="text-foreground">{g.full_name}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{g.employee_code}</span>
                  {mgr && (
                    <span className="text-[10px] text-muted-foreground">→ {mgr.full_name}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
