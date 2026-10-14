// The 13 complex business-rule scenarios, shared by:
//   - scenario-tests.ts     (quick script:  npx tsx ai-training/scenario-tests.ts)
//   - scenarios.test.ts     (Vitest:        npm test)
//
// For each scenario we write the IDEAL answer a perfect AI would give, then
// push it through exactly what the app does after the AI answers:
//   sanitizeDraft()  →  draftToRuleParts()  →  your rule engine (runRulesForCase)
// and check the engine's decision for several test applicants.
// If a scenario fails, the problem is in OUR format/code, not the AI.

import { sanitizeDraft, draftToRuleParts, AiRuleDraft } from "../src/lib/ai-rule";
import { runRulesForCase } from "../src/lib/engine";
import { DEFAULT_FIELD_CATALOG } from "../src/lib/fields";
import type { BusinessRule } from "../src/lib/types";

type Input = Record<string, string | number | boolean>;
export interface Case { input: Input; outcome?: "Approved" | "Rejected" | "Review Required"; values?: Record<string, string | number> }
export interface Scenario { name: string; text: string; domain: string; draft: AiRuleDraft; cases: Case[]; expectRefused?: boolean }

const base = { name: "Test", explanation: "", warnings: [] as string[], elseActions: [] };
const fieldsFor = (domain: string) =>
  DEFAULT_FIELD_CATALOG.filter((f) => f.domain === domain || f.domain === "Common").map(({ key, label, type, options, unit }) => ({ key, label, type, options, unit }));

export const SCENARIOS: Scenario[] = [
  {
    name: "1. Two branches, same action (your sentence)",
    text: "Approve if loan amount is below 4 lakh, or above 4 lakh with credit score above 650; otherwise reject",
    domain: "Lending",
    draft: { ...base, logic: "OR",
      conditions: [{ field: "loan_amount", operator: "<", value: "400000" },
        { logic: "AND", conditions: [{ field: "loan_amount", operator: ">", value: "400000" }, { field: "credit_score", operator: ">", value: "650" }] }],
      actions: [{ type: "Approve" }], elseActions: [{ type: "Reject" }] },
    cases: [
      { input: { loan_amount: 300000, credit_score: 600 }, outcome: "Approved" },
      { input: { loan_amount: 500000, credit_score: 700 }, outcome: "Approved" },
      { input: { loan_amount: 500000, credit_score: 600 }, outcome: "Rejected" },
    ],
  },
  {
    name: "2. Age band AND product (group inside AND)",
    text: "Reject home loans if applicant age is below 21 or above 60",
    domain: "Lending",
    draft: { ...base, logic: "AND",
      conditions: [{ field: "loan_type", operator: "=", value: "Home Loan" },
        { logic: "OR", conditions: [{ field: "applicant_age", operator: "<", value: "21" }, { field: "applicant_age", operator: ">", value: "60" }] }],
      actions: [{ type: "Reject", reasonCode: "AGE_OUT_OF_RANGE" }] },
    cases: [
      { input: { loan_type: "Home Loan", applicant_age: 19 }, outcome: "Rejected" },
      { input: { loan_type: "Home Loan", applicant_age: 65 }, outcome: "Rejected" },
      { input: { loan_type: "Home Loan", applicant_age: 35 }, outcome: "Approved" },
      { input: { loan_type: "Personal Loan", applicant_age: 19 }, outcome: "Approved" },
    ],
  },
  {
    name: "3. Two AND-groups joined by OR",
    text: "Flag for review if salaried with income under 30k, or self-employed with income under 50k",
    domain: "Lending",
    draft: { ...base, logic: "OR",
      conditions: [
        { logic: "AND", conditions: [{ field: "employment_type", operator: "=", value: "Salaried" }, { field: "monthly_income", operator: "<", value: "30000" }] },
        { logic: "AND", conditions: [{ field: "employment_type", operator: "=", value: "Self-Employed" }, { field: "monthly_income", operator: "<", value: "50000" }] }],
      actions: [{ type: "Flag for Review" }] },
    cases: [
      { input: { employment_type: "Salaried", monthly_income: 25000 }, outcome: "Review Required" },
      { input: { employment_type: "Salaried", monthly_income: 40000 }, outcome: "Approved" },
      { input: { employment_type: "Self-Employed", monthly_income: 40000 }, outcome: "Review Required" },
      { input: { employment_type: "Government", monthly_income: 20000 }, outcome: "Approved" },
    ],
  },
  {
    name: "4. Group inside a group (2 levels deep)",
    text: "Approve if government employee, or salaried with income above 50k or credit score above 750; otherwise reject",
    domain: "Lending",
    draft: { ...base, logic: "OR",
      conditions: [{ field: "employment_type", operator: "=", value: "Government" },
        { logic: "AND", conditions: [{ field: "employment_type", operator: "=", value: "Salaried" },
          { logic: "OR", conditions: [{ field: "monthly_income", operator: ">", value: "50000" }, { field: "credit_score", operator: ">", value: "750" }] }] }],
      actions: [{ type: "Approve" }], elseActions: [{ type: "Reject" }] } as unknown as AiRuleDraft,
    cases: [
      { input: { employment_type: "Government", monthly_income: 20000, credit_score: 600 }, outcome: "Approved" },
      { input: { employment_type: "Salaried", monthly_income: 30000, credit_score: 800 }, outcome: "Approved" },
      { input: { employment_type: "Salaried", monthly_income: 60000, credit_score: 600 }, outcome: "Approved" },
      { input: { employment_type: "Salaried", monthly_income: 30000, credit_score: 600 }, outcome: "Rejected" },
    ],
  },
  {
    name: "5. Between + one-of list",
    text: "Approve if credit score is between 700 and 900 and city is Mumbai, Delhi or Pune; otherwise flag for review",
    domain: "Lending",
    draft: { ...base, logic: "AND",
      conditions: [{ field: "credit_score", operator: "between", value: "700", value2: "900" }, { field: "city", operator: "in", value: "Mumbai,Delhi,Pune" }],
      actions: [{ type: "Approve" }], elseActions: [{ type: "Flag for Review" }] },
    cases: [
      { input: { credit_score: 720, city: "Delhi" }, outcome: "Approved" },
      { input: { credit_score: 720, city: "Chennai" }, outcome: "Review Required" },
      { input: { credit_score: 650, city: "Mumbai" }, outcome: "Review Required" },
    ],
  },
  {
    name: "6. 'Not one of' (no not-in operator → AND of !=)",
    text: "Reject if employment type is neither Salaried nor Government",
    domain: "Lending",
    draft: { ...base, logic: "AND",
      conditions: [{ field: "employment_type", operator: "!=", value: "Salaried" }, { field: "employment_type", operator: "!=", value: "Government" }],
      actions: [{ type: "Reject" }] },
    cases: [
      { input: { employment_type: "Business Owner" }, outcome: "Rejected" },
      { input: { employment_type: "Government" }, outcome: "Approved" },
    ],
  },
  {
    name: "7. Ratio rule via computed DTI field",
    text: "Reject if monthly liabilities are more than half of monthly income",
    domain: "Lending",
    draft: { ...base, logic: "AND", conditions: [{ field: "dti_ratio", operator: ">", value: "50" }], actions: [{ type: "Reject", reasonCode: "HIGH_DTI" }] },
    cases: [
      { input: { dti_ratio: 60 }, outcome: "Rejected" },
      { input: { dti_ratio: 40 }, outcome: "Approved" },
    ],
  },
  {
    name: "8. Tiered value (interest rate by credit score)",
    text: "Set interest rate to 8.5% for credit score 800 and above, 9.5% for 750-799, and 11% for 700-749",
    domain: "Lending",
    draft: { ...base, logic: "AND", conditions: [],
      actions: [{ type: "Bracket Lookup", outputField: "interest_rate", bracketField: "credit_score",
        brackets: [{ min: 800, max: 900, outputValue: "8.5" }, { min: 750, max: 799, outputValue: "9.5" }, { min: 700, max: 749, outputValue: "11" }] }] } as unknown as AiRuleDraft,
    cases: [
      { input: { credit_score: 820 }, values: { interest_rate: 8.5 } },
      { input: { credit_score: 760 }, values: { interest_rate: 9.5 } },
      { input: { credit_score: 710 }, values: { interest_rate: 11 } },
    ],
  },
  {
    name: "9. Assign a value when matched",
    text: "If credit score is above 750 set approved amount to 50 lakh",
    domain: "Lending",
    draft: { ...base, logic: "AND", conditions: [{ field: "credit_score", operator: ">", value: "750" }],
      actions: [{ type: "Assign Value", outputField: "approved_amount", outputValue: "5000000" }] },
    cases: [{ input: { credit_score: 800 }, values: { approved_amount: 5000000 } }],
  },
  {
    name: "10. Safety: a decision with NO conditions must be refused",
    text: "Reject everyone",
    domain: "Lending",
    draft: { ...base, logic: "AND", conditions: [], actions: [{ type: "Reject" }] },
    cases: [],
    expectRefused: true,
  },
  {
    name: "11. Safety: brackets nested too deep must be refused (not flattened)",
    text: "A or (B and (C or (D and (E or F))))",
    domain: "Lending",
    draft: { ...base, logic: "OR", conditions: [{ field: "credit_score", operator: ">", value: "800" },
      { logic: "AND", conditions: [{ field: "applicant_age", operator: ">", value: "21" },
        { logic: "OR", conditions: [{ field: "monthly_income", operator: ">", value: "50000" },
          { logic: "AND", conditions: [{ field: "loan_amount", operator: "<", value: "500000" },
            { logic: "OR", conditions: [{ field: "dti_ratio", operator: "<", value: "40" }, { field: "ltv_ratio", operator: "<", value: "80" }] }] }] }] }],
      actions: [{ type: "Approve" }] } as unknown as AiRuleDraft,
    cases: [],
    expectRefused: true,
  },
  {
    name: "12. Safety: only unknown fields must be refused",
    text: "Reject if PAN card is missing",
    domain: "Lending",
    draft: { ...base, logic: "AND", conditions: [{ field: "pan_card", operator: "=", value: "missing" }], actions: [{ type: "Reject" }] },
    cases: [],
    expectRefused: true,
  },
  {
    name: "13. Tier ranges with a gap give a warning (still applied)",
    text: "Interest 9% for score 750-900, 12% for 650-700",
    domain: "Lending",
    draft: { ...base, logic: "AND", conditions: [],
      actions: [{ type: "Bracket Lookup", outputField: "interest_rate", bracketField: "credit_score",
        brackets: [{ min: 750, max: 900, outputValue: "9" }, { min: 650, max: 700, outputValue: "12" }] }] } as unknown as AiRuleDraft,
    cases: [{ input: { credit_score: 760 }, values: { interest_rate: 9 } }, { input: { credit_score: 660 }, values: { interest_rate: 12 } }],
  },
];

/** Runs one scenario; returns problems (empty = pass) and non-fatal warnings. */
export function runScenario(sc: Scenario): { problems: string[]; warnings: string[] } {
  const problems: string[] = [];
  const draft = sanitizeDraft(structuredClone(sc.draft), fieldsFor(sc.domain));
  const refused = !!draft.refusal;

  if (sc.expectRefused) {
    if (!refused) problems.push("should be refused, but was accepted");
    return { problems, warnings: [] };
  }
  if (refused) problems.push(`refused: ${draft.refusal}`);

  const parts = draftToRuleParts(draft);
  const rule = { id: "AI-TEST", name: sc.name, domain: sc.domain, category: "t", priority: 3, status: "Published",
    owner: "t", createdAt: "", updatedAt: "", version: 1, simulatable: true, ...parts } as BusinessRule;
  for (const c of sc.cases) {
    const r = runRulesForCase([rule], c.input, DEFAULT_FIELD_CATALOG);
    if (c.outcome && r.outcome !== c.outcome) problems.push(`input ${JSON.stringify(c.input)} → ${r.outcome}, expected ${c.outcome}`);
    for (const [k, v] of Object.entries(c.values ?? {})) {
      if (r.calculatedValues[k] !== v) problems.push(`input ${JSON.stringify(c.input)} → ${k}=${r.calculatedValues[k]}, expected ${v}`);
    }
  }
  return { problems, warnings: draft.warnings };
}
