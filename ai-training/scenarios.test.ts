import { describe, it, expect } from "vitest";
import { SCENARIOS, runScenario } from "./scenarios";

// One Vitest test per business-rule scenario. Each one builds the rule and
// lets the REAL rule engine decide several test applicants.
describe("complex business rules (AI draft → builder → engine)", () => {
  for (const sc of SCENARIOS) {
    it(sc.name, () => {
      const { problems } = runScenario(sc);
      // An empty list means every applicant got the expected decision.
      expect(problems).toEqual([]);
    });
  }
});
