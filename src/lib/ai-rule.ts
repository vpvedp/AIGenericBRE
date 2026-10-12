import { ActionType, BusinessField, Condition, ConditionGroup, Operator, RuleAction } from "./types";
import { newId } from "./condition-tree";

// Shared contract between the /api/ai-rule route (server) and the
// "Describe with AI" dialog (client). The model never writes BusinessRule
// objects directly — it returns this small draft, which we validate against
// the live Field Catalog before turning it into real tree nodes.

export const AI_OPERATORS: Operator[] = ["=", "!=", ">", "<", ">=", "<=", "contains", "starts_with", "in", "between"];
export const AI_ACTION_TYPES: ActionType[] = ["Approve", "Reject", "Flag for Review", "Show Message", "Assign Value", "Bracket Lookup"];
/** Actions that decide the case. A rule that decides with no conditions would apply to everyone. */
const DECISION_ACTIONS: ActionType[] = ["Approve", "Reject", "Flag for Review"];
/** How many levels of brackets the AI may use: root → group → sub-group → sub-sub-group. */
export const MAX_GROUP_DEPTH = 3;

export interface AiConditionDraft {
  field: string;
  operator: Operator;
  value: string;
  value2?: string;
}

/** A bracketed group of conditions, e.g. the "(B AND C)" in "A OR (B AND C)". Groups can nest. */
export interface AiGroupDraft {
  logic: "AND" | "OR";
  conditions: AiConditionItem[];
}

export type AiConditionItem = AiConditionDraft | AiGroupDraft;

export const isGroupDraft = (c: AiConditionItem): c is AiGroupDraft =>
  Array.isArray((c as AiGroupDraft).conditions);

export interface AiBracketDraft {
  min: number;
  max: number;
  outputValue: string;
}

export interface AiActionDraft {
  type: ActionType;
  reasonCode?: string;
  message?: string;
  outputField?: string;
  outputValue?: string;
  /** Bracket Lookup only: the numeric field tested against each range. */
  bracketField?: string;
  brackets?: AiBracketDraft[];
}

export interface AiRuleDraft {
  name: string;
  /** How the top-level items combine. */
  logic: "AND" | "OR";
  conditions: AiConditionItem[];
  actions: AiActionDraft[];
  elseActions: AiActionDraft[];
  /** Plain-English read-back so the user can confirm the model understood. */
  explanation: string;
  /** Anything the model was unsure about or couldn't map to a field. */
  warnings: string[];
  /** Set by sanitizeDraft when the draft must NOT be applied — the reason why. */
  refusal?: string;
}

/** The slice of the Field Catalog the client sends — no PII values, just schema. */
export type AiFieldSpec = Pick<BusinessField, "key" | "label" | "type" | "options" | "unit">;

export interface AiRuleRequest {
  text: string;
  domain: string;
  fields: AiFieldSpec[];
}

export type AiRuleResponse = { ok: true; draft: AiRuleDraft } | { ok: false; error: string };

/** Models sometimes wrap the answer, e.g. {"rule": {...}}. Unwrap one level. */
export function unwrapDraft(raw: unknown): AiRuleDraft {
  if (raw && typeof raw === "object" && !Array.isArray((raw as AiRuleDraft).conditions)) {
    const inner = Object.values(raw as Record<string, unknown>).find(
      (v) => v && typeof v === "object" && Array.isArray((v as AiRuleDraft).conditions)
    );
    if (inner) return inner as AiRuleDraft;
  }
  return (raw ?? {}) as AiRuleDraft;
}

/** Count leaf conditions (at any depth). */
export function countLeaves(items: AiConditionItem[] | undefined): number {
  return (Array.isArray(items) ? items : []).reduce((n, c) => n + (isGroupDraft(c) ? countLeaves(c.conditions) : 1), 0);
}

const NUMERIC_TYPES = ["number", "currency", "percentage"];

/** Server-side guard: drop anything that references a field or operator the
 *  builder can't represent, and surface each drop as a warning instead of
 *  silently producing a broken rule. Sets `refusal` when the draft is unsafe. */
export function sanitizeDraft(raw: AiRuleDraft, fields: AiFieldSpec[]): AiRuleDraft {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const warnings = Array.isArray(raw.warnings) ? raw.warnings.map(String) : [];
  let tooDeep = false;

  const cleanLeaf = (c: AiConditionDraft): AiConditionDraft | null => {
    // Small models sometimes send 650 instead of "650" — the builder stores
    // values as text, so normalise before checking anything.
    const leaf: AiConditionDraft = {
      field: c.field,
      operator: c.operator,
      value: String(c.value ?? ""),
      ...(c.value2 !== undefined && c.value2 !== null ? { value2: String(c.value2) } : {}),
    };
    const field = byKey.get(leaf.field);
    if (!field) {
      warnings.push(`Skipped a condition on unknown field "${leaf.field}".`);
      return null;
    }
    if (!AI_OPERATORS.includes(leaf.operator)) {
      warnings.push(`Skipped a condition on "${field.label}" with unsupported operator "${leaf.operator}".`);
      return null;
    }
    if (field.type === "enum" && field.options?.length && (leaf.operator === "=" || leaf.operator === "!=")) {
      if (!field.options.includes(leaf.value)) warnings.push(`"${leaf.value}" is not a listed option for ${field.label} — check it.`);
    }
    if (leaf.operator === "between" && !leaf.value2) {
      warnings.push(`"${field.label}" uses between but has no upper value — set it before saving.`);
    }
    return leaf;
  };

  // Recursive: keeps the exact bracket structure. Never flattens — flattening
  // "A AND (B OR C)" into "A AND B AND C" would silently change the meaning.
  const cleanItem = (item: AiConditionItem, depth: number): AiConditionItem | null => {
    if (!isGroupDraft(item)) return cleanLeaf(item);
    if (depth > MAX_GROUP_DEPTH) {
      tooDeep = true;
      return null;
    }
    const children = item.conditions.map((c) => cleanItem(c, depth + 1)).filter((c): c is AiConditionItem => c !== null);
    if (children.length === 0) return null;
    if (children.length === 1) return children[0]; // a group of one is just its member
    return { logic: item.logic === "OR" ? "OR" : "AND", conditions: children };
  };

  const conditions = (Array.isArray(raw.conditions) ? raw.conditions : [])
    .map((c) => cleanItem(c, 1))
    .filter((c): c is AiConditionItem => c !== null);

  const cleanBracketAction = (a: AiActionDraft): AiActionDraft | null => {
    const out = a.outputField ? byKey.get(a.outputField) : undefined;
    const src = a.bracketField ? byKey.get(a.bracketField) : undefined;
    if (!out) {
      warnings.push(`Skipped a tiered value with unknown output field "${a.outputField ?? ""}".`);
      return null;
    }
    if (!src || !NUMERIC_TYPES.includes(src.type)) {
      warnings.push(`Skipped a tiered value: "${a.bracketField ?? ""}" isn't a known number field.`);
      return null;
    }
    const brackets = (Array.isArray(a.brackets) ? a.brackets : [])
      .map((b) => ({ min: Number(b.min), max: Number(b.max), outputValue: String(b.outputValue ?? "") }))
      .filter((b) => Number.isFinite(b.min) && Number.isFinite(b.max) && b.min <= b.max && b.outputValue !== "")
      .sort((x, y) => x.min - y.min);
    if (brackets.length === 0) {
      warnings.push(`Skipped a tiered value for ${out.label}: no valid ranges.`);
      return null;
    }
    for (let i = 1; i < brackets.length; i++) {
      if (brackets[i].min <= brackets[i - 1].max) warnings.push(`Ranges for ${out.label} overlap around ${brackets[i].min} — check them.`);
      else if (brackets[i].min > brackets[i - 1].max + 1) warnings.push(`Gap in ${out.label} ranges between ${brackets[i - 1].max} and ${brackets[i].min} — values there get no ${out.label}.`);
    }
    return { type: "Bracket Lookup", outputField: out.key, bracketField: src.key, brackets };
  };

  const cleanActions = (list: AiActionDraft[] | undefined) =>
    (Array.isArray(list) ? list : [])
      .map((a): AiActionDraft | null => {
        if (!AI_ACTION_TYPES.includes(a.type)) {
          warnings.push(`Skipped unsupported action "${a.type}".`);
          return null;
        }
        if (a.type === "Bracket Lookup") return cleanBracketAction(a);
        if (a.type === "Assign Value" && (!a.outputField || !byKey.has(a.outputField))) {
          warnings.push(`Skipped an Assign Value action with unknown output field "${a.outputField ?? ""}".`);
          return null;
        }
        return a;
      })
      .filter((a): a is AiActionDraft => a !== null);

  const draft: AiRuleDraft = {
    name: String(raw.name ?? "").slice(0, 120),
    logic: raw.logic === "OR" ? "OR" : "AND",
    conditions,
    actions: cleanActions(raw.actions),
    elseActions: cleanActions(raw.elseActions),
    explanation: String(raw.explanation ?? ""),
    warnings,
  };

  // ---- Refusals: drafts that must never be applied --------------------
  const decides = [...draft.actions, ...draft.elseActions].some((a) => DECISION_ACTIONS.includes(a.type));
  if (tooDeep) {
    draft.refusal = `The rule needs more than ${MAX_GROUP_DEPTH} levels of brackets. Split it into simpler rules.`;
  } else if (countLeaves(raw.conditions) > 0 && conditions.length === 0) {
    // Without this, the remaining actions would run for everyone ("reject everyone").
    draft.refusal = `None of the conditions match a known field. ${warnings[0] ?? ""}`.trim();
  } else if (conditions.length === 0 && draft.actions.length === 0 && draft.elseActions.length === 0) {
    draft.refusal = warnings[0] ?? "Couldn't map that description to any fields.";
  } else if (conditions.length === 0 && decides) {
    draft.refusal = "A decision (approve / reject / review) with no conditions would apply to every applicant. Add at least one condition.";
  }
  return draft;
}

/** Client-side: turn a validated draft into real builder nodes with fresh ids. */
export function draftToRuleParts(draft: AiRuleDraft): { rootGroup: ConditionGroup; actions: RuleAction[]; elseActions: RuleAction[] } {
  const toNode = (c: AiConditionItem, i: number, parentLogic: "AND" | "OR"): Condition | ConditionGroup =>
    isGroupDraft(c)
      ? {
          id: newId("grp"),
          type: "group",
          logic: c.logic,
          ...(i > 0 ? { connector: parentLogic } : {}),
          children: c.conditions.map((child, j) => toNode(child, j, c.logic)),
        }
      : {
          id: newId("cond"),
          type: "condition",
          field: c.field,
          operator: c.operator,
          value: String(c.value ?? ""),
          ...(c.operator === "between" && c.value2 ? { value2: String(c.value2) } : {}),
          prefix: "IF",
          sourceType: "BUSINESS_FIELD",
          rhsType: "STATIC",
          ...(i > 0 ? { connector: parentLogic } : {}),
        };

  const toAction = (a: AiActionDraft): RuleAction => ({
    id: newId("act"),
    type: a.type,
    ...(a.reasonCode ? { reasonCode: a.reasonCode } : {}),
    ...(a.message ? { message: a.message } : {}),
    ...(a.type === "Assign Value"
      ? { outputTarget: "BUSINESS_FIELD" as const, outputField: a.outputField, outputValue: a.outputValue ?? "" }
      : {}),
    ...(a.type === "Bracket Lookup"
      ? {
          outputTarget: "BUSINESS_FIELD" as const,
          outputField: a.outputField,
          bracketField: a.bracketField,
          brackets: (a.brackets ?? []).map((b) => ({ id: newId("brk"), ...b })),
        }
      : {}),
  });

  return {
    rootGroup: { id: newId("grp"), type: "group", logic: draft.logic, children: draft.conditions.map((c, i) => toNode(c, i, draft.logic)) },
    actions: draft.actions.map(toAction),
    elseActions: draft.elseActions.map(toAction),
  };
}
