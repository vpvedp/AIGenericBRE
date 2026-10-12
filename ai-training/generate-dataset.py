"""Builds the English rule dataset for the BRE "Describe with AI" feature.

Every example is generated from the real Field Catalog (fields.json), so the
expected answer is correct by construction - no hand-typed JSON mistakes.

Output:
  rules-dataset.jsonl   one example per line: text -> expected rule (all examples)
  train.jsonl / test.jsonl   80/20 split (test is never shown to the model)
  finetune-chat.jsonl   train split in chat format, ready for future fine-tuning

Run:  python ai-training/generate-dataset.py
"""
import json, random, pathlib

random.seed(42)  # same dataset every run
HERE = pathlib.Path(__file__).parent
FIELDS = json.loads((HERE / "fields.json").read_text(encoding="utf-8"))

# ---- English phrasings ---------------------------------------------------
# Several ways people say the same operator. This variety is the point:
# the model must learn that "under", "below" and "less than" all mean "<".
OP_PHRASES = {
    "<":  ["is below", "is less than", "is under", "falls below", "is lower than"],
    "<=": ["is at most", "is up to", "does not exceed", "is not more than", "is less than or equal to"],
    ">":  ["is above", "is more than", "is greater than", "exceeds", "is over"],
    ">=": ["is at least", "is a minimum of", "is not less than", "is greater than or equal to", "is equal to or above"],
}
ACTION_WORDS = {
    "Reject": ["Reject the application", "Reject", "Decline the case", "Deny the request"],
    "Approve": ["Approve the application", "Approve", "Accept the case"],
    "Flag for Review": ["Flag for review", "Send it for manual review", "Refer to an underwriter", "Flag for manual check"],
}
ELSE_WORDS = {"Approve": ["otherwise approve", "else approve it"], "Reject": ["otherwise reject", "else reject it"]}

def money_phrases(n):
    """Indian ways to write an amount -> always the same plain number."""
    out = [f"{n:,}", f"₹{n:,}", str(n)]
    if n % 100000 == 0 and n < 10000000:
        out.append(f"{n // 100000} lakh")
    if n % 10000000 == 0:
        out.append(f"{n // 10000000} crore")
    if n % 1000 == 0 and n < 100000:
        out.append(f"{n // 1000}k")
    return out

NUMBER_VALUES = {  # realistic values per field
    "applicant_age": [18, 21, 25, 60, 65, 70], "credit_score": [600, 650, 700, 750, 800],
    "monthly_income": [25000, 40000, 50000, 100000], "monthly_liabilities": [20000, 50000],
    "loan_amount": [500000, 2500000, 5000000, 10000000], "dti_ratio": [40, 50, 60], "ltv_ratio": [75, 80, 90],
    "property_value": [3000000, 10000000], "bmi": [18, 30, 35], "sum_assured": [5000000, 10000000],
    "base_premium": [10000, 50000], "appraised_value": [100000, 500000], "purity_grade": [18, 22],
    "ltv_requested": [75, 80], "annual_income": [300000, 600000, 1200000], "requested_credit_limit": [100000, 500000],
    "credit_utilization_ratio": [30, 50, 80], "existing_cards_count": [3, 5], "investment_amount": [100000, 1000000],
    "net_worth": [5000000, 10000000], "investment_horizon_years": [3, 5, 10],
}
BOOL_PHRASES = {  # field -> (true phrase, false phrase)
    "smoker": ("the applicant is a smoker", "the applicant is a non-smoker"),
    "medical_history": ("there is a medical history flag", "there is no medical history"),
    "late_payment_history": ("the applicant has late payment history", "the applicant has no late payments"),
    "kyc_verified": ("KYC is verified", "KYC is not verified"),
}

def usable(domain):
    return [f for f in FIELDS[domain]]

def numeric_fields(domain):
    return [f for f in usable(domain) if f["type"] in ("number", "currency") and f["key"] in NUMBER_VALUES]

def fmt_value(field, n):
    return random.choice(money_phrases(n)) if field["type"] == "currency" else (f"{n}%" if field.get("unit") == "%" else str(n))

NICE_NAMES = {"purity_grade": "gold purity", "bmi": "BMI", "ltv_ratio": "LTV", "ltv_requested": "requested LTV",
              "dti_ratio": "DTI ratio", "credit_score": "credit score", "existing_cards_count": "number of existing cards"}

def name_of(f):
    return NICE_NAMES.get(f["key"], f["label"].replace(" Metric", "").replace(" Capital", "").replace(" Asset", "").lower())

examples = []
def add(domain, text, conditions, actions, else_actions=None, logic="AND", tags=()):
    examples.append({
        "domain": domain, "text": text,
        "expected": {"logic": logic, "conditions": conditions, "actions": [{"type": a} for a in actions],
                     "elseActions": [{"type": a} for a in (else_actions or [])]},
        "tags": list(tags),
    })

def cond_numeric(domain, f=None, op=None, n=None):
    f = f or random.choice(numeric_fields(domain))
    op = op or random.choice(list(OP_PHRASES))
    n = n if n is not None else random.choice(NUMBER_VALUES[f["key"]])
    phrase = f"{name_of(f)} {random.choice(OP_PHRASES[op])} {fmt_value(f, n)}"
    return phrase, {"field": f["key"], "operator": op, "value": str(n)}

def cond_enum(domain, negate=False):
    f = random.choice([f for f in usable(domain) if f["type"] == "enum"])
    opt = random.choice([o for o in f["options"] if o != "Other"])
    phrase = f"{name_of(f)} is {'not ' if negate else ''}{opt}"
    return phrase, {"field": f["key"], "operator": "!=" if negate else "=", "value": opt}

DOMAINS = list(FIELDS)

# 1) single numeric comparison - every operator phrasing
for domain in DOMAINS:
    for _ in range(5):
        p, c = cond_numeric(domain)
        act = random.choice(list(ACTION_WORDS))
        add(domain, f"{random.choice(ACTION_WORDS[act])} if {p}", [c], [act], tags=["numeric"])

# 2) Indian amounts - lakh / crore / k / ₹ with commas
for domain in DOMAINS:
    money = [f for f in numeric_fields(domain) if f["type"] == "currency"]
    for f in money[:2]:
        n = max(NUMBER_VALUES[f["key"]])
        for phrase in [p for p in money_phrases(n) if "lakh" in p or "crore" in p or "k" in p][:2]:
            op = random.choice(["<", ">", ">=", "<="])
            add(domain, f"{random.choice(ACTION_WORDS['Reject'])} if {name_of(f)} {random.choice(OP_PHRASES[op])} {phrase}",
                [{"field": f["key"], "operator": op, "value": str(n)}], ["Reject"], tags=["indian-amount"])

# 3) enum = / != / one-of
for domain in DOMAINS:
    for negate in (False, True):
        p, c = cond_enum(domain, negate)
        act = random.choice(["Reject", "Flag for Review"])
        add(domain, f"{random.choice(ACTION_WORDS[act])} if {p}", [c], [act], tags=["enum"])
    f = random.choice([f for f in usable(domain) if f["type"] == "enum" and len(f["options"]) >= 3])
    opts = random.sample(f["options"], 2)
    add(domain, f"Approve if {name_of(f)} is {opts[0]} or {opts[1]}",
        [{"field": f["key"], "operator": "in", "value": ",".join(opts)}], ["Approve"], tags=["enum-in"])

# 4) booleans in natural English
for domain in DOMAINS:
    for f in [f for f in usable(domain) if f["key"] in BOOL_PHRASES]:
        yes, no = BOOL_PHRASES[f["key"]]
        add(domain, f"Flag for review if {yes}", [{"field": f["key"], "operator": "=", "value": "true"}], ["Flag for Review"], tags=["boolean"])
        add(domain, f"Reject if {no}", [{"field": f["key"], "operator": "=", "value": "false"}], ["Reject"], tags=["boolean"])

# 5) between
for domain in DOMAINS:
    f = random.choice(numeric_fields(domain))
    vals = sorted(random.sample(NUMBER_VALUES[f["key"]], 2)) if len(NUMBER_VALUES[f["key"]]) > 1 else None
    if vals:
        lo, hi = vals
        add(domain, f"Send it for manual review if {name_of(f)} is between {fmt_value(f, lo)} and {fmt_value(f, hi)}",
            [{"field": f["key"], "operator": "between", "value": str(lo), "value2": str(hi)}], ["Flag for Review"], tags=["between"])

# 6) two conditions joined with AND / OR
for domain in DOMAINS:
    for logic in ("AND", "OR"):
        for _ in range(2):
            fs = random.sample(numeric_fields(domain), 2) if len(numeric_fields(domain)) >= 2 else None
            if not fs:
                continue
            p1, c1 = cond_numeric(domain, fs[0])
            p2, c2 = cond_numeric(domain, fs[1])
            act = random.choice(["Reject", "Flag for Review"])
            add(domain, f"{random.choice(ACTION_WORDS[act])} if {p1} {logic.lower()} {p2}", [c1, c2], [act], logic=logic, tags=[f"two-{logic.lower()}"])
    # numeric + enum mix
    p1, c1 = cond_enum(domain)
    p2, c2 = cond_numeric(domain)
    add(domain, f"Reject if {p1} and {p2}", [c1, c2], ["Reject"], tags=["mixed"])

# 7) THEN + ELSE ("otherwise ...")
for domain in DOMAINS:
    for _ in range(2):
        p, c = cond_numeric(domain, op=random.choice([">=", ">"]))
        add(domain, f"Approve if {p}, {random.choice(ELSE_WORDS['Reject'])}", [c], ["Approve"], ["Reject"], tags=["else"])

# 8) grouped conditions: "A, or (B and C)" - several cases leading to one action
GROUPED = {
    "Lending": [("loan_amount", 400000, "credit_score", 650), ("loan_amount", 2500000, "monthly_income", 100000)],
    "Insurance": [("sum_assured", 5000000, "bmi", 30)],
    "CreditCards": [("requested_credit_limit", 100000, "annual_income", 600000)],
    "Wealth": [("investment_amount", 100000, "net_worth", 5000000)],
    "NBFC": [("appraised_value", 100000, "purity_grade", 22)],
}
for domain, cases in GROUPED.items():
    by = {f["key"]: f for f in FIELDS[domain]}
    for small_key, limit, extra_key, extra_val in cases:
        fs, fx = by[small_key], by[extra_key]
        small = fmt_value(fs, limit)
        templates = [
            f"Approve if {name_of(fs)} is below {small}, or if {name_of(fs)} is above {small} and {name_of(fx)} is above {fmt_value(fx, extra_val)}; otherwise reject",
            f"If {name_of(fs)} is under {small} approve it, and if {name_of(fs)} is more than {small} it needs {name_of(fx)} over {fmt_value(fx, extra_val)} to approve, else reject",
        ]
        add(domain, random.choice(templates),
            [{"field": small_key, "operator": "<", "value": str(limit)},
             {"logic": "AND", "conditions": [{"field": small_key, "operator": ">", "value": str(limit)},
                                              {"field": extra_key, "operator": ">", "value": str(extra_val)}]}],
            ["Approve"], ["Reject"], logic="OR", tags=["grouped"])

# 9) two levels of brackets: "A, or (B and (C or D))"
NESTED = [
    ("Lending", "Approve if employment type is Government, or if employment type is Salaried and either monthly income is above 50,000 or credit score is above 750; otherwise reject",
     "OR", [{"field": "employment_type", "operator": "=", "value": "Government"},
            {"logic": "AND", "conditions": [{"field": "employment_type", "operator": "=", "value": "Salaried"},
                                            {"logic": "OR", "conditions": [{"field": "monthly_income", "operator": ">", "value": "50000"},
                                                                           {"field": "credit_score", "operator": ">", "value": "750"}]}]}]),
    ("Insurance", "Flag for review if the applicant is a smoker, or if BMI is above 30 and either the applicant age is over 50 or there is a medical history flag; otherwise approve",
     "OR", [{"field": "smoker", "operator": "=", "value": "true"},
            {"logic": "AND", "conditions": [{"field": "bmi", "operator": ">", "value": "30"},
                                            {"logic": "OR", "conditions": [{"field": "applicant_age", "operator": ">", "value": "50"},
                                                                           {"field": "medical_history", "operator": "=", "value": "true"}]}]}]),
    ("CreditCards", "Approve if annual income is at least 12 lakh, or if credit utilization ratio is below 30% and either existing cards held is under 3 or there is no late payment history; otherwise reject",
     "OR", [{"field": "annual_income", "operator": ">=", "value": "1200000"},
            {"logic": "AND", "conditions": [{"field": "credit_utilization_ratio", "operator": "<", "value": "30"},
                                            {"logic": "OR", "conditions": [{"field": "existing_cards_count", "operator": "<", "value": "3"},
                                                                           {"field": "late_payment_history", "operator": "=", "value": "false"}]}]}]),
]
for domain, text, logic, conds in NESTED:
    then = "Flag for Review" if text.startswith("Flag") else "Approve"
    els = "Approve" if then == "Flag for Review" else "Reject"
    add(domain, text, conds, [then], [els], logic=logic, tags=["nested"])

# 10) tiered values -> one Bracket Lookup action, no conditions
TIERED = [
    ("Lending", "Set interest rate to 8.5% for credit score 800 and above, 9.5% for 750 to 799, and 11% for 700 to 749",
     "interest_rate", "credit_score", [(800, 900, "8.5"), (750, 799, "9.5"), (700, 749, "11")]),
    ("Lending", "Interest rate should be 12% when credit score is 650-699, 10% for 700-749 and 9% for 750 or more",
     "interest_rate", "credit_score", [(650, 699, "12"), (700, 749, "10"), (750, 900, "9")]),
    ("Lending", "Eligible loan amount is 5 lakh for monthly income 25000 to 49999, 15 lakh for 50000 to 99999, and 40 lakh for 1 lakh to 10 lakh",
     "eligible_loan_amount", "monthly_income", [(25000, 49999, "500000"), (50000, 99999, "1500000"), (100000, 1000000, "4000000")]),
]
for domain, text, out, src, ranges in TIERED:
    examples.append({"domain": domain, "text": text,
        "expected": {"logic": "AND", "conditions": [], "elseActions": [],
                     "actions": [{"type": "Bracket Lookup", "outputField": out, "bracketField": src,
                                  "brackets": [{"min": a, "max": b, "outputValue": v} for a, b, v in ranges]}]},
        "tags": ["tiered"]})

# 11) tricky wording: "neither ... nor", "unless"
for domain, text, conds, act in [
    ("Lending", "Reject if employment type is neither Salaried nor Government",
     [{"field": "employment_type", "operator": "!=", "value": "Salaried"}, {"field": "employment_type", "operator": "!=", "value": "Government"}], "Reject"),
    ("Wealth", "Reject unless KYC is verified", [{"field": "kyc_verified", "operator": "=", "value": "false"}], "Reject"),
    ("Insurance", "Flag for review unless occupation risk tier is Low Risk", [{"field": "occupation_type", "operator": "!=", "value": "Low Risk"}], "Flag for Review"),
    ("CreditCards", "Reject if card type requested is neither Standard nor Gold",
     [{"field": "card_type_requested", "operator": "!=", "value": "Standard"}, {"field": "card_type_requested", "operator": "!=", "value": "Gold"}], "Reject"),
]:
    add(domain, text, conds, [act], tags=["tricky-wording"])

# 12) things that CANNOT be mapped - model must not invent fields
UNMAPPABLE = ["Reject if the PAN card is missing", "Flag for review if the applicant has a criminal record",
              "Reject if the customer's email domain is gmail", "Approve if the applicant owns a pet"]
for i, text in enumerate(UNMAPPABLE):
    add(DOMAINS[i % len(DOMAINS)], text, [], [], tags=["unmappable"])

# ---- write files -----------------------------------------------------------
random.shuffle(examples)
for i, ex in enumerate(examples):
    ex["id"] = f"ex-{i + 1:03d}"

test_ids = set()
by_tag = {}
for ex in examples:
    by_tag.setdefault(ex["tags"][0], []).append(ex)
for tag, group in by_tag.items():  # stratified: ~20% of EVERY category goes to test
    for ex in group[: max(1, round(len(group) * 0.2))]:
        test_ids.add(ex["id"])

def dump(name, rows):
    with open(HERE / name, "w", encoding="utf-8") as fh:
        for r in rows:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")

train = [e for e in examples if e["id"] not in test_ids]
test = [e for e in examples if e["id"] in test_ids]
dump("rules-dataset.jsonl", examples)
dump("train.jsonl", train)
dump("test.jsonl", test)

# chat format (system / user / assistant) - the standard shape fine-tuning tools expect
SYSTEM = "Convert the business rule into JSON using only the given field keys."
dump("finetune-chat.jsonl", [{"messages": [
    {"role": "system", "content": SYSTEM + " Fields: " + ", ".join(f["key"] for f in FIELDS[e["domain"]])},
    {"role": "user", "content": e["text"]},
    {"role": "assistant", "content": json.dumps(e["expected"], ensure_ascii=False)},
]} for e in train])

print(f"total {len(examples)}  train {len(train)}  test {len(test)}")
for tag, group in sorted(by_tag.items()):
    print(f"  {tag:14} {len(group):3}")

# ---- few-shot examples for the app ---------------------------------------
# One solved example per category, taken ONLY from the train split, written
# into the app so every prompt "shows" the model how to answer.
# Per category: one Lending example (the main industry) + one from another
# industry, so every industry sees most patterns.
picked, seen = [], set()
for want_lending in (True, False):
    for e in train:
        tag = e["tags"][0]
        key = (tag, want_lending)
        if tag == "unmappable" or key in seen or (e["domain"] == "Lending") != want_lending:
            continue
        seen.add(key)
        picked.append({"text": e["text"], "expected": e["expected"]})
ts = HERE.parent / "src" / "lib" / "ai-rule-examples.ts"
ts.write_text(
    "// AUTO-GENERATED by ai-training/generate-dataset.py — do not edit by hand.\n"
    "// Solved examples shown to the model inside the prompt (few-shot learning).\n"
    "// Taken from the TRAIN split only, so test scores stay honest.\n\n"
    "export interface AiExampleCondition { field: string; operator: string; value: string; value2?: string }\n"
    "export interface AiExampleGroup { logic: \"AND\" | \"OR\"; conditions: (AiExampleCondition | AiExampleGroup)[] }\n\n"
    "export interface AiRuleExample {\n  text: string;\n  expected: {\n    logic: \"AND\" | \"OR\";\n"
    "    conditions: (AiExampleCondition | AiExampleGroup)[];\n"
    "    actions: { type: string; [key: string]: unknown }[];\n    elseActions: { type: string; [key: string]: unknown }[];\n  };\n}\n\n"
    "export const AI_RULE_EXAMPLES: AiRuleExample[] = "
    + json.dumps(picked, ensure_ascii=False, indent=2) + ";\n",
    encoding="utf-8",
)
print(f"few-shot examples written: {len(picked)} -> src/lib/ai-rule-examples.ts")
