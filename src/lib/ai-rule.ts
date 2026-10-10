import { ActionType, BusinessField, Condition, ConditionGroup, Operator, RuleAction } from "./types";
import { newId } from "./condition-tree";

// Shared contract between the /api/ai-rule route (server) and the
// "Describe with AI" dialog (client). The model never writes BusinessRule
// objects directly — it returns this small, flat draft, which we validate

export const AI_OPERATORS: Operator[] = ["=", "!=", ">", "<", ">=", "<=", "contains", "starts_with", "in", "between"];
export const AI_ACTION_TYPES: ActionType[] = ["Approve", "Reject", "Flag for Review", "Show Message", "Assign Value"];

export interface AiConditionDraft {
  field: string;
  operator: Operator;
  value: string;
  value2?: string;
}

export interface AiActionDraft {
  type: ActionType;
  reasonCode?: string;
  message?: string;
  outputField?: string;
  outputValue?: string;
}

export interface AiRuleDraft {
  name: string;
  /** How the conditions combine. Kept to a single flat group for v1 —
   *  nested AND/OR trees can be refined by hand in the builder afterwards. */
  logic: "AND" | "OR";
  conditions: AiConditionDraft[];
  actions: AiActionDraft[];
  elseActions: AiActionDraft[];
  /** Plain-English read-back so the user can confirm the model understood. */
  explanation: string;
  /** Anything the model was unsure about or couldn't map to a field. */
  warnings: string[];
}

/** The slice of the Field Catalog the client sends — no PII values, just schema. */
export type AiFieldSpec = Pick<BusinessField, "key" | "label" | "type" | "options" | "unit">;

export interface AiRuleRequest {
  text: string;
  domain: string;
  fields: AiFieldSpec[];
}

export type AiRuleResponse = { ok: true; draft: AiRuleDraft } | { ok: false; error: string };

/** Server-side guard: drop anything that references a field or operator the
 *  builder can't represent, and surface each drop as a warning instead of
 *  silently producing a broken rule. */
export function sanitizeDraft(raw: AiRuleDraft, fields: AiFieldSpec[]): AiRuleDraft {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const warnings = [...(raw.warnings ?? [])];

  const conditions = (raw.conditions ?? []).filter((c) => {
    const field = byKey.get(c.field);
    if (!field) {
      warnings.push(`Skipped a condition on unknown field "${c.field}".`);
      return false;
    }
    if (!AI_OPERATORS.includes(c.operator)) {
      warnings.push(`Skipped a condition on "${field.label}" with unsupported operator "${c.operator}".`);
      return false;
    }
    if (field.type === "enum" && field.options?.length && (c.operator === "=" || c.operator === "!=")) {
      if (!field.options.includes(c.value)) warnings.push(`"${c.value}" is not a listed option for ${field.label} — check it.`);
    }
    if (c.operator === "between" && !c.value2) {
      warnings.push(`"${field.label}" uses between but has no upper value — set it before saving.`);
    }
    return true;
  });

  const cleanActions = (list: AiActionDraft[] | undefined) =>
    (list ?? []).filter((a) => {
      if (!AI_ACTION_TYPES.includes(a.type)) {
        warnings.push(`Skipped unsupported action "${a.type}".`);
        return false;
      }
      if (a.type === "Assign Value" && (!a.outputField || !byKey.has(a.outputField))) {
        warnings.push(`Skipped an Assign Value action with unknown output field "${a.outputField ?? ""}".`);
        return false;
      }
      return true;
    });

  return {
    name: String(raw.name ?? "").slice(0, 120),
    logic: raw.logic === "OR" ? "OR" : "AND",
    conditions,
    actions: cleanActions(raw.actions),
    elseActions: cleanActions(raw.elseActions),
    explanation: String(raw.explanation ?? ""),
    warnings,
  };
}

/** Client-side: turn a validated draft into real builder nodes with fresh ids. */
export function draftToRuleParts(draft: AiRuleDraft): { rootGroup: ConditionGroup; actions: RuleAction[]; elseActions: RuleAction[] } {
  const children: Condition[] = draft.conditions.map((c, i) => ({
    id: newId("cond"),
    type: "condition",
    field: c.field,
    operator: c.operator,
    value: String(c.value ?? ""),
    ...(c.operator === "between" && c.value2 ? { value2: String(c.value2) } : {}),
    prefix: "IF",
    sourceType: "BUSINESS_FIELD",
    rhsType: "STATIC",
    ...(i > 0 ? { connector: draft.logic } : {}),
  }));

  const toAction = (a: AiActionDraft): RuleAction => ({
    id: newId("act"),
    type: a.type,
    ...(a.reasonCode ? { reasonCode: a.reasonCode } : {}),
    ...(a.message ? { message: a.message } : {}),
    ...(a.type === "Assign Value"
      ? { outputTarget: "BUSINESS_FIELD" as const, outputField: a.outputField, outputValue: a.outputValue ?? "" }
      : {}),
  });

  return {
    rootGroup: { id: newId("grp"), type: "group", logic: draft.logic, children },
    actions: draft.actions.map(toAction),
    elseActions: draft.elseActions.map(toAction),
  };
}
