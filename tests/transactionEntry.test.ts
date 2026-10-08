import { describe, expect, test } from "vitest";
import { postTransactionEntry } from "../src/lib/accountingEngine";

describe("logged payments/expenses", () => {
  test("only the amount is required -- a blank name still posts a balanced, readable ledger entry", () => {
    const income = postTransactionEntry({ id: "t1", type: "income", source: "manual", amount: 250, description: "", date: "2025-03-14", createdAt: "2026-10-08T00:00:00Z" } as any);
    expect(income.memo).toBe("Income");
    expect(income.date).toBe("2025-03-14");
    const expense = postTransactionEntry({ id: "t2", type: "expense", source: "manual", amount: 40, description: "", date: "2024-11-02", createdAt: "2026-10-08T00:00:00Z" } as any);
    expect(expense.memo).toBe("Expense");
    for (const entry of [income, expense]) {
      const debit = entry.lines.reduce((s, l) => s + l.debit, 0);
      const credit = entry.lines.reduce((s, l) => s + l.credit, 0);
      expect(debit).toBe(credit);
    }
  });

  test("a named entry keeps its name in the memo", () => {
    expect(postTransactionEntry({ id: "t3", type: "expense", source: "manual", amount: 5, description: "Lowes", date: "2026-01-01", createdAt: "x" } as any).memo).toBe("Expense: Lowes");
  });
});
