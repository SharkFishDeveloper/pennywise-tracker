"use client";

import { CURRENCY, type CurrencyCode } from "@/currency";
import { db } from "@/db";
import { ReportPdf } from "@/pdf";
import { useLiveQuery } from "dexie-react-hooks";
import { Download, FileText, FileUp, X } from "lucide-react";
import { useState } from "react";

const NA_ICON = "Ellipsis";

const splitLine = (line: string) => {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  let index = 0;

  while (index < line.length) {
    const char = line[index];

    if (inQuotes) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      current += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      index += 1;
      continue;
    }

    if (char === ",") {
      cells.push(current.trim());
      current = "";
      index += 1;
      continue;
    }

    current += char;
    index += 1;
  }

  cells.push(current.trim());
  return cells;
};

const parseDate = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (iso) return iso[0];

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;

  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

const parseAmount = (value: string) => {
  const cleaned = value.replace(/[^0-9.\-]/g, "");
  const amount = Number.parseFloat(cleaned);
  return Number.isFinite(amount) ? amount : null;
};

const csvEscape = (value: string) => `"${value.replace(/"/g, '""')}"`;

const formatExportDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });

type ImportResult = {
  expenses: number;
  incomes: number;
  accounts: number;
  categories: number;
  skipped: number;
};

const ImportExport = ({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => {
  const expenses = useLiveQuery(() => db.expenses.toArray(), []);
  const incomes = useLiveQuery(() => db.incomes.toArray(), []);
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);

  const [mode, setMode] = useState<"menu" | "import">("menu");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  if (!open) return null;

  const close = () => {
    setMode("menu");
    setBusy(false);
    setStatus("");
    setResult(null);
    onClose();
  };

  const handleImport = async (content: string) => {
    setBusy(true);
    setStatus("");
    setResult(null);

    try {
      const lines = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      if (lines.length < 2) {
        setStatus("The file looks empty. Expected a header and at least one row.");
        setBusy(false);
        return;
      }

      const header = splitLine(lines[0]).map((cell) => cell.toLowerCase());
      const column = (name: string) => header.indexOf(name);

      const timeIndex = column("time");
      const typeIndex = column("type");
      const amountIndex = column("amount");
      const categoryIndex = column("category");
      const accountIndex = column("account");
      const notesIndex = column("notes");

      if (amountIndex === -1) {
        setStatus('Could not find an "AMOUNT" column in the header.');
        setBusy(false);
        return;
      }

      const accountIds = new Map<string, number>();
      const categoryIds = new Map<string, number>();
      const accountRows = accounts ?? [];
      const categoryRows = categories ?? [];

      let accountsCreated = 0;
      let categoriesCreated = 0;
      let expenseCount = 0;
      let incomeCount = 0;
      let skipped = 0;

      const ensureAccount = async (raw: string) => {
        const name = raw.trim() || "NA";
        const key = name.toLowerCase();
        const cached = accountIds.get(key);
        if (cached !== undefined) return String(cached);

        const existing = accountRows.find(
          (item) => item.name.toLowerCase() === key
        );
        if (existing?.id !== undefined) {
          accountIds.set(key, existing.id);
          return String(existing.id);
        }

        const id = (await db.accounts.add({
          name,
          icon: NA_ICON,
        })) as number;
        accountIds.set(key, id);
        accountsCreated += 1;
        return String(id);
      };

      const ensureCategory = async (raw: string) => {
        const name = raw.trim() || "NA";
        const key = name.toLowerCase();
        const cached = categoryIds.get(key);
        if (cached !== undefined) return cached;

        const existing = categoryRows.find(
          (item) => item.name.toLowerCase() === key
        );
        if (existing?.id !== undefined) {
          categoryIds.set(key, existing.id);
          return existing.id;
        }

        const id = (await db.categories.add({
          name,
          icon: NA_ICON,
        })) as number;
        categoryIds.set(key, id);
        categoriesCreated += 1;
        return id;
      };

      await db.transaction(
        "rw",
        db.accounts,
        db.categories,
        db.expenses,
        db.incomes,
        async () => {
          for (let i = 1; i < lines.length; i += 1) {
            const cells = splitLine(lines[i]);

            const rawType = typeIndex >= 0 ? cells[typeIndex] ?? "" : "";
            const rawAmount = amountIndex >= 0 ? cells[amountIndex] ?? "" : "";
            const rawDate = timeIndex >= 0 ? cells[timeIndex] ?? "" : "";
            const rawCategory =
              categoryIndex >= 0 ? cells[categoryIndex] ?? "" : "";
            const rawAccount =
              accountIndex >= 0 ? cells[accountIndex] ?? "" : "";
            const rawNotes = notesIndex >= 0 ? cells[notesIndex] ?? "" : "";

            const amount = parseAmount(rawAmount);
            const date = parseDate(rawDate);

            if (amount === null || amount <= 0 || !date) {
              skipped += 1;
              continue;
            }

            const isIncome = /income|\(\+\)/i.test(rawType);

            if (isIncome) {
              const account = rawAccount.trim()
                ? await ensureAccount(rawAccount)
                : null;

              await db.incomes.add({
                title: rawNotes.trim() || null,
                amount,
                currency: "INR",
                categoryId: null,
                account,
                date,
              });
              incomeCount += 1;
            } else {
              const categoryId = await ensureCategory(rawCategory);
              const account = await ensureAccount(rawAccount);

              await db.expenses.add({
                title: rawNotes.trim() || null,
                amount,
                currency: "INR",
                categoryId,
                account,
                date,
              });
              expenseCount += 1;
            }
          }
        }
      );

      setResult({
        expenses: expenseCount,
        incomes: incomeCount,
        accounts: accountsCreated,
        categories: categoriesCreated,
        skipped,
      });
    } catch (error) {
      console.error("Failed to import CSV:", error);
      setStatus("Something went wrong while importing. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const content = await file.text();
    await handleImport(content);
  };

  const handleExport = () => {
    const header = ["TIME", "TYPE", "AMOUNT", "CATEGORY", "ACCOUNT", "NOTES"];
    const lines = [header.map(csvEscape).join(",")];

    const categoryNames = new Map(
      (categories ?? []).map((item) => [item.id, item.name])
    );
    const accountNames = new Map(
      (accounts ?? []).map((item) => [String(item.id), item.name])
    );

    (expenses ?? []).forEach((item) => {
      lines.push(
        [
          formatExportDate(item.date),
          "(-) Expense",
          item.amount.toFixed(2),
          categoryNames.get(item.categoryId) ?? "",
          accountNames.get(item.account) ?? "",
          item.title ?? "",
        ]
          .map(csvEscape)
          .join(",")
      );
    });

    (incomes ?? []).forEach((item) => {
      lines.push(
        [
          formatExportDate(item.date),
          "(+) Income",
          item.amount.toFixed(2),
          "",
          item.account ? accountNames.get(item.account) ?? "" : "",
          item.title ?? "",
        ]
          .map(csvEscape)
          .join(",")
      );
    });

    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pennywise-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus("CSV report downloaded.");
  };

  const handleExportPdf = () => {
    const expenseRows = expenses ?? [];
    const incomeRows = incomes ?? [];
    const categoryNames = new Map(
      (categories ?? []).map((item) => [item.id, item.name])
    );
    const accountNames = new Map(
      (accounts ?? []).map((item) => [String(item.id), item.name])
    );

    const currencyCount = new Map<string, number>();
    [...expenseRows, ...incomeRows].forEach((item) => {
      currencyCount.set(
        item.currency,
        (currencyCount.get(item.currency) ?? 0) + 1
      );
    });
    const topCurrency =
      ([...currencyCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] as
        | CurrencyCode
        | undefined) ?? "INR";
    const symbol = CURRENCY[topCurrency]?.symbol ?? "";

    const totalIncome = incomeRows.reduce((sum, item) => sum + item.amount, 0);
    const totalExpense = expenseRows.reduce((sum, item) => sum + item.amount, 0);
    const net = totalIncome - totalExpense;

    const categoryTotals = new Map<string, number>();
    expenseRows.forEach((item) => {
      const name = categoryNames.get(item.categoryId) ?? "Uncategorized";
      categoryTotals.set(name, (categoryTotals.get(name) ?? 0) + item.amount);
    });

    const categoryRows = [...categoryTotals.entries()].sort(
      (a, b) => b[1] - a[1]
    );

    const transactions = [
      ...expenseRows.map((item) => ({
        date: item.date,
        type: "Expense" as const,
        title: item.title ?? "",
        category: categoryNames.get(item.categoryId) ?? "Uncategorized",
        account: accountNames.get(item.account) ?? "",
        amount: item.amount,
      })),
      ...incomeRows.map((item) => ({
        date: item.date,
        type: "Income" as const,
        title: item.title ?? "",
        category: "",
        account: item.account ? accountNames.get(item.account) ?? "" : "",
        amount: item.amount,
      })),
    ].sort((a, b) => (a.date < b.date ? 1 : -1));

    const generated = new Date().toLocaleDateString("en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const GRAY_PDF: [number, number, number] = [0.42, 0.45, 0.5];
    const GREEN_PDF: [number, number, number] = [0.09, 0.64, 0.29];
    const RED_PDF: [number, number, number] = [0.86, 0.15, 0.15];

    const clip = (value: string, max: number) =>
      value.length > max ? `${value.slice(0, max - 1)}…` : value;
    const money = (value: number) => `${symbol}${value.toLocaleString()}`;

    const doc = new ReportPdf();
    const right = doc.width - doc.margin;

    doc.text("PennyWise Report", { size: 20, bold: true });
    doc.gap(20);
    doc.text(`Generated ${generated}`, { size: 10, color: GRAY_PDF });
    doc.gap(24);

    doc.text("Summary", { size: 13, bold: true });
    doc.gap(18);
    doc.text("Income", { size: 10, color: GRAY_PDF });
    doc.text(money(totalIncome), {
      size: 11,
      bold: true,
      color: GREEN_PDF,
      x: right,
      align: "right",
    });
    doc.gap(16);
    doc.text("Expenses", { size: 10, color: GRAY_PDF });
    doc.text(money(totalExpense), {
      size: 11,
      bold: true,
      color: RED_PDF,
      x: right,
      align: "right",
    });
    doc.gap(16);
    doc.text("Net balance", { size: 10, color: GRAY_PDF });
    doc.text(money(net), { size: 11, bold: true, x: right, align: "right" });
    doc.gap(30);

    doc.text("Expenses by category", { size: 13, bold: true });
    doc.gap(18);
    doc.text("Category", { size: 9, bold: true, color: GRAY_PDF });
    doc.text("Amount", {
      size: 9,
      bold: true,
      color: GRAY_PDF,
      x: doc.margin + 330,
      align: "right",
    });
    doc.text("Share", {
      size: 9,
      bold: true,
      color: GRAY_PDF,
      x: right,
      align: "right",
    });
    doc.gap(4);
    doc.line(doc.margin, right);
    doc.gap(16);

    if (categoryRows.length === 0) {
      doc.text("No expenses.", { size: 10, color: GRAY_PDF });
      doc.gap(16);
    } else {
      categoryRows.forEach(([name, value]) => {
        const pct = totalExpense > 0 ? (value / totalExpense) * 100 : 0;
        doc.text(clip(name, 34), { size: 10 });
        doc.text(money(value), { size: 10, x: doc.margin + 330, align: "right" });
        doc.text(pct >= 1 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`, {
          size: 10,
          x: right,
          align: "right",
        });
        doc.gap(16);
      });
    }

    doc.gap(18);
    doc.text("All transactions", { size: 13, bold: true });
    doc.gap(18);
    doc.text("Date", { size: 9, bold: true, color: GRAY_PDF, x: doc.margin });
    doc.text("Title", { size: 9, bold: true, color: GRAY_PDF, x: doc.margin + 60 });
    doc.text("Category", {
      size: 9,
      bold: true,
      color: GRAY_PDF,
      x: doc.margin + 180,
    });
    doc.text("Account", {
      size: 9,
      bold: true,
      color: GRAY_PDF,
      x: doc.margin + 285,
    });
    doc.text("Amount", {
      size: 9,
      bold: true,
      color: GRAY_PDF,
      x: right,
      align: "right",
    });
    doc.gap(4);
    doc.line(doc.margin, right);
    doc.gap(16);

    if (transactions.length === 0) {
      doc.text("No transactions.", { size: 10, color: GRAY_PDF });
    } else {
      transactions.forEach((item) => {
        doc.text(clip(formatExportDate(item.date), 12), {
          size: 9,
          x: doc.margin,
        });
        doc.text(clip(item.title, 20), { size: 9, x: doc.margin + 60 });
        doc.text(clip(item.category, 18), { size: 9, x: doc.margin + 180 });
        doc.text(clip(item.account, 16), { size: 9, x: doc.margin + 285 });
        doc.text(
          `${item.type === "Expense" ? "-" : "+"}${money(item.amount)}`,
          {
            size: 9,
            x: right,
            align: "right",
            color: item.type === "Expense" ? RED_PDF : GREEN_PDF,
          }
        );
        doc.gap(15);
      });
    }

    const blob = doc.build();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pennywise-${new Date().toISOString().slice(0, 10)}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus("PDF report downloaded.");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-3xl">
        <div className="mb-5 flex items-center justify-between gap-2">
          <h2 className="text-xl font-bold">
            {mode === "import" ? "Import CSV" : "CSV"}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="rounded-full p-2 text-gray-600 hover:bg-gray-100"
          >
            <X size={22} />
          </button>
        </div>

        {mode === "menu" ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => {
                setMode("import");
                setStatus("");
                setResult(null);
              }}
              className="flex w-full items-center gap-3 rounded-2xl border border-gray-200 p-4 text-left transition hover:bg-gray-50"
            >
              <span className="rounded-xl bg-blue-50 p-3 text-blue-600">
                <FileUp size={22} />
              </span>
              <span className="min-w-0">
                <span className="block font-medium text-gray-900">
                  Import CSV
                </span>
                <span className="block text-xs text-gray-500">
                  Add expenses from a CSV file. Unknown accounts and categories
                  are created automatically.
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={handleExport}
              className="flex w-full items-center gap-3 rounded-2xl border border-gray-200 p-4 text-left transition hover:bg-gray-50"
            >
              <span className="rounded-xl bg-green-50 p-3 text-green-600">
                <Download size={22} />
              </span>
              <span className="min-w-0">
                <span className="block font-medium text-gray-900">
                  Export CSV report
                </span>
                <span className="block text-xs text-gray-500">
                  Download all your expenses and income as a CSV file.
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={handleExportPdf}
              className="flex w-full items-center gap-3 rounded-2xl border border-gray-200 p-4 text-left transition hover:bg-gray-50"
            >
              <span className="rounded-xl bg-red-50 p-3 text-red-600">
                <FileText size={22} />
              </span>
              <span className="min-w-0">
                <span className="block font-medium text-gray-900">
                  Export PDF report
                </span>
                <span className="block text-xs text-gray-500">
                  Download a formatted report with totals and transactions.
                </span>
              </span>
            </button>

            {status && (
              <p role="status" className="text-sm text-gray-600">
                {status}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Expected columns: TIME, TYPE, AMOUNT, CATEGORY, ACCOUNT, NOTES.
            </p>

            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-300 p-6 text-center transition hover:border-blue-400 hover:bg-blue-50/40">
              <FileUp size={26} className="text-blue-600" />
              <span className="text-sm font-medium text-gray-700">
                {busy ? "Importing..." : "Choose a CSV file"}
              </span>
              <span className="text-xs text-gray-500">.csv files only</span>
              <input
                type="file"
                accept=".csv,text/csv"
                disabled={busy}
                className="hidden"
                onChange={(event) => {
                  void handleFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>

            {status && (
              <p
                role="alert"
                className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800"
              >
                {status}
              </p>
            )}

            {result && (
              <div className="rounded-xl bg-green-50 p-3 text-sm text-green-800">
                <p className="font-semibold">Import complete</p>
                <p className="mt-1">
                  {result.expenses} expenses, {result.incomes} income entries ·{" "}
                  {result.accounts} new accounts, {result.categories} new
                  categories
                  {result.skipped > 0 ? ` · ${result.skipped} rows skipped` : ""}
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setMode("menu");
                setStatus("");
              }}
              className="text-sm font-medium text-gray-500 hover:text-gray-800"
            >
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImportExport;
