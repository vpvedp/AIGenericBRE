import { describe, it, expect } from "vitest";
import { sanitizeDraft, draftToRuleParts, unwrapDraft, AiRuleDraft, AiFieldSpec } from "./ai-rule";

// Unit tests for the safety layer between the AI and the rule builder.
// Pattern for every test:  arrange (input) → act (call the function) → assert (expect).

const FIELDS: AiFieldSpec[] = [
  { key: "credit_score", label: "Credit Score", type: "number" },
  { key: "applicant_age", label: "Applicant Age", type: "number" },
  { key: "loan_type", label: "Loan Type", type: "enum", options: ["Home Loan", "Personal Loan"] },
  { key: "interest_rate", label: "Interest Rate", type: "number" },
];

const draft = (over: Partial<AiRuleDraft>): AiRuleDraft => ({
  name: "Test", logic: "AND", conditions: [], actions: [], elseActions: [], explanation: "", warnings: [], ...over,
});

describe("sanitizeDraft", () => {
  it("drops a condition on an unknown field and warns about it", () => {
    const out = sanitizeDraft(
      draft({ conditions: [{ field: "credit_score", operator: "<", value: "650" }, { field: "cibil", operator: ">", value: "1" }], actions: [{ type: "Reject" }] }),
      FIELDS
    );
    expect(out.conditions).toHaveLength(1);
    expect(out.warnings.join(" ")).toContain('unknown field "cibil"');
    expect(out.refusal).toBeUndefined();
  });

  it("turns numbers into text (small models send 650 instead of \"650\")", () => {
    const out = sanitizeDraft(draft({ conditions: [{ field: "credit_score", operator: "<", value: 650 as unknown as string }], actions: [{ type: "Reject" }] }), FIELDS);
    expect(out.conditions[0]).toMatchObject({ value: "650" });
  });

  it("warns when an option value isn't in the field's list", () => {
    const out = sanitizeDraft(draft({ conditions: [{ field: "loan_type", operator: "=", value: "Gold Loan" }], actions: [{ type: "Reject" }] }), FIELDS);
    expect(out.warnings.join(" ")).toContain("not a listed option");
  });

  it("refuses when every condition was invalid (would reject everyone)", () => {
    const out = sanitizeDraft(draft({ conditions: [{ field: "pan_card", operator: "=", value: "missing" }], actions: [{ type: "Reject" }] }), FIELDS);
    expect(out.refusal).toMatch(/None of the conditions/);
  });

  it("refuses a decision with no conditions at all", () => {
    const out = sanitizeDraft(draft({ actions: [{ type: "Approve" }] }), FIELDS);
    expect(out.refusal).toMatch(/every applicant/);
  });

  it("keeps nested brackets instead of flattening them", () => {
    const out = sanitizeDraft(
      draft({
        logic: "OR",
        conditions: [
          { field: "applicant_age", operator: ">", value: "60" },
          { logic: "AND", conditions: [{ field: "credit_score", operator: ">", value: "700" }, { logic: "OR", conditions: [{ field: "loan_type", operator: "=", value: "Home Loan" }, { field: "applicant_age", operator: "<", value: "30" }] }] },
        ],
        actions: [{ type: "Approve" }],
      }),
      FIELDS
    );
    expect(out.refusal).toBeUndefined();
    expect(JSON.stringify(out.conditions)).toContain('"logic":"OR","conditions":[{"field":"loan_type"');
  });

  it("accepts a tiered value (Bracket Lookup) with no conditions and sorts the ranges", () => {
    const out = sanitizeDraft(
      draft({ actions: [{ type: "Bracket Lookup", outputField: "interest_rate", bracketField: "credit_score", brackets: [{ min: 800, max: 900, outputValue: "8.5" }, { min: 700, max: 799, outputValue: "10" }] }] }),
      FIELDS
    );
    expect(out.refusal).toBeUndefined();
    expect(out.actions[0].brackets?.map((b) => b.min)).toEqual([700, 800]);
  });

  it("warns about overlapping tier ranges", () => {
    const out = sanitizeDraft(
      draft({ actions: [{ type: "Bracket Lookup", outputField: "interest_rate", bracketField: "credit_score", brackets: [{ min: 700, max: 800, outputValue: "10" }, { min: 750, max: 900, outputValue: "9" }] }] }),
      FIELDS
    );
    expect(out.warnings.join(" ")).toContain("overlap");
  });
});

describe("unwrapDraft", () => {
  it("unwraps an answer like {\"rule\": {...}}", () => {
    const out = unwrapDraft({ rule: { conditions: [], actions: [] } });
    expect(Array.isArray(out.conditions)).toBe(true);
  });
});

describe("draftToRuleParts", () => {
  it("builds builder nodes with ids and joins later conditions with the group's logic", () => {
    const parts = draftToRuleParts(
      draft({ logic: "OR", conditions: [{ field: "credit_score", operator: "<", value: "650" }, { field: "applicant_age", operator: "<", value: "21" }], actions: [{ type: "Reject" }] })
    );
    expect(parts.rootGroup.children).toHaveLength(2);
    expect(parts.rootGroup.children[0].id).toBeTruthy();
    expect(parts.rootGroup.children[1]).toMatchObject({ connector: "OR" });
    expect(parts.actions[0]).toMatchObject({ type: "Reject" });
  });
});
