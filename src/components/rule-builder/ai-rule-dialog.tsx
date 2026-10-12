"use client";

import { useState } from "react";
import { Sparkles, Loader2, AlertTriangle, ArrowRight } from "lucide-react";
import { BusinessField } from "@/lib/types";
import { AiConditionDraft, AiConditionItem, AiRuleDraft, AiRuleResponse, isGroupDraft } from "@/lib/ai-rule";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const EXAMPLES = [
  "Reject home loan if applicant age is below 21",
  "Flag for review if credit score is between 650 and 700 and loan amount is more than 50 lakh",
  "Approve if employment type is Salaried or Government and monthly income is at least 40000, otherwise reject",
  "Approve if loan amount is below 4 lakh, or if it is above 4 lakh and credit score is above 650; otherwise reject",
  "Set interest rate to 8.5% for credit score 800 and above, 9.5% for 750-799 and 11% for 700-749",
];

const OPERATOR_TEXT: Record<string, string> = {
  "=": "is", "!=": "is not", ">": ">", "<": "<", ">=": "≥", "<=": "≤",
  contains: "contains", starts_with: "starts with", in: "is one of", between: "is between",
};

// Recursive: a group renders as a dashed box that can hold more groups.
function ConditionList({ items, logic, labelFor }: { items: AiConditionItem[]; logic: string; labelFor: (key?: string) => string }) {
  return (
    <>
      {items.map((c, i) => (
        <div key={i} className="flex flex-wrap items-start gap-1.5">
          {i > 0 && <Badge variant="outline">{logic}</Badge>}
          {isGroupDraft(c) ? (
            <div className="space-y-1 rounded-lg border border-dashed px-2.5 py-1.5">
              <ConditionList items={c.conditions} logic={c.logic} labelFor={labelFor} />
            </div>
          ) : (
            <p className="flex flex-wrap items-center gap-1.5">
              <ConditionText c={c} labelFor={labelFor} />
            </p>
          )}
        </div>
      ))}
    </>
  );
}

function ConditionText({ c, labelFor }: { c: AiConditionDraft; labelFor: (key?: string) => string }) {
  return (
    <>
      <span className="font-medium">{labelFor(c.field)}</span>
      <span className="text-muted-foreground">{OPERATOR_TEXT[c.operator] ?? c.operator}</span>
      <span className="font-mono">{c.operator === "between" ? `${c.value} and ${c.value2 ?? "?"}` : c.value}</span>
    </>
  );
}

export function AiRuleDialog({
  open,
  onOpenChange,
  domain,
  fields,
  onApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  domain: string;
  fields: BusinessField[];
  onApply: (draft: AiRuleDraft) => void;
}) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<AiRuleDraft | null>(null);

  const labelFor = (key?: string) => fields.find((f) => f.key === key)?.label ?? key ?? "";

  const generate = async () => {
    setLoading(true);
    setError(null);
    setDraft(null);
    try {
      const res = await fetch("/api/ai-rule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text,
          domain,
          // Schema only — never send applicant data to the model.
          fields: fields.map(({ key, label, type, options, unit }) => ({ key, label, type, options, unit })),
        }),
      });
      const data = (await res.json()) as AiRuleResponse;
      if (data.ok) setDraft(data.draft);
      else setError(data.error);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const close = (v: boolean) => {
    onOpenChange(v);
    if (!v) {
      setDraft(null);
      setError(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> Describe with AI
          </DialogTitle>
          <DialogDescription>
            Write the rule in plain English. You&apos;ll see a preview before anything changes in the builder.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && text.trim() && !loading) generate();
            }}
            placeholder="e.g. Reject if credit score is below 650"
            rows={3}
            maxLength={1000}
          />
          {!draft && (
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setText(ex)}
                  className="min-h-11 rounded-lg border bg-card px-2.5 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  {ex}
                </button>
              ))}
            </div>
          )}

          {error && (
            <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {error}
            </p>
          )}

          {draft && (
            <div className="max-h-80 space-y-3 overflow-y-auto rounded-xl border bg-muted/30 p-3.5 text-sm">
              <div>
                <p className="font-semibold">{draft.name || "Untitled rule"}</p>
                <p className="text-muted-foreground">{draft.explanation}</p>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">If</p>
                <ConditionList items={draft.conditions} logic={draft.logic} labelFor={labelFor} />
                {draft.conditions.length === 0 && <p className="text-muted-foreground">No conditions — applies to every case.</p>}
              </div>

              {([["Then", draft.actions], ["Else", draft.elseActions]] as const).map(([label, list]) =>
                list.length > 0 ? (
                  <div key={label} className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                    {list.map((a, i) => (
                      <p key={i} className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={a.type === "Reject" ? "destructive" : "secondary"}>{a.type}</Badge>
                        {a.type === "Assign Value" && <span>{labelFor(a.outputField)} = <span className="font-mono">{a.outputValue}</span></span>}
                        {a.type === "Bracket Lookup" && (
                          <span className="w-full space-y-0.5 pl-1">
                            <span className="block text-muted-foreground">{labelFor(a.outputField)} by {labelFor(a.bracketField)}:</span>
                            {a.brackets?.map((b, k) => (
                              <span key={k} className="block font-mono">
                                {b.min} – {b.max} → {b.outputValue}
                              </span>
                            ))}
                          </span>
                        )}
                        {a.reasonCode && <span className="font-mono text-muted-foreground">{a.reasonCode}</span>}
                        {a.message && <span className="text-muted-foreground">— {a.message}</span>}
                      </p>
                    ))}
                  </div>
                ) : null
              )}

              {draft.warnings.length > 0 && (
                <ul className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-amber-700 dark:text-amber-400">
                  {draft.warnings.map((w, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {w}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {draft ? (
              <>
                <Button variant="outline" onClick={() => setDraft(null)}>Edit description</Button>
                <Button className="gap-1.5" onClick={() => onApply(draft)}>
                  Apply to builder <ArrowRight className="size-3.5" />
                </Button>
              </>
            ) : (
              <Button className="gap-1.5" disabled={!text.trim() || loading} onClick={generate}>
                {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                {loading ? "Generating…" : "Generate rule"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
