"use client";

import { CURRENCY, type CurrencyCode } from "@/currency";
import { db } from "@/db";
import { INCOME_ICONS } from "@/IncomeIcons";
import { AVAILABLE_ICONS } from "@/ExpenseIcons";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Calculator, ChevronDown, Trash2 } from "lucide-react";

export type EditableTransaction = {
  id: number;
  type: "Expense" | "Income";
  title: string | null;
  amount: number;
  currency: CurrencyCode;
  categoryId: number | null;
  account: string | null;
  date: string;
};

type TransactionProps = {
  transaction?: EditableTransaction | null;
  onSaved?: () => void;
};

const getToday = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};

const evaluateExpression = (expr: string): number | null => {
  const tokens = expr.match(/\d+\.?\d*%?|[+\-*/]/g);
  if (!tokens) return null;

  const values: number[] = [];
  const operators: string[] = [];

  for (const token of tokens) {
    if (token === "+" || token === "-" || token === "*" || token === "/") {
      operators.push(token);
    } else {
      const isPercent = token.endsWith("%");
      const n = Number(isPercent ? token.slice(0, -1) : token);
      if (Number.isNaN(n)) return null;

      if (isPercent) {
        const op = operators[operators.length - 1];
        const left = values[values.length - 1];
        if ((op === "+" || op === "-") && left !== undefined) {
          values.push((left * n) / 100);
        } else {
          values.push(n / 100);
        }
      } else {
        values.push(n);
      }
    }
  }

  if (values.length === 0 || values.length !== operators.length + 1) {
    return null;
  }

  for (let i = 0; i < operators.length; ) {
    if (operators[i] === "*" || operators[i] === "/") {
      const a = values[i];
      const b = values[i + 1];
      if (operators[i] === "/" && b === 0) return null;
      values.splice(i, 2, operators[i] === "*" ? a * b : a / b);
      operators.splice(i, 1);
    } else {
      i++;
    }
  }

  let result = values[0];
  for (let i = 0; i < operators.length; i++) {
    result =
      operators[i] === "+" ? result + values[i + 1] : result - values[i + 1];
  }
  return result;
};

const CALC_KEYS: {
  label: string;
  key: string;
  className?: string;
  span?: boolean;
}[] = [
  { label: "C", key: "C", className: "bg-red-50 text-red-600" },
  { label: "⌫", key: "BS" },
  { label: "%", key: "%" },
  { label: "÷", key: "/", className: "bg-blue-50 text-blue-700" },
  { label: "7", key: "7" },
  { label: "8", key: "8" },
  { label: "9", key: "9" },
  { label: "×", key: "*", className: "bg-blue-50 text-blue-700" },
  { label: "4", key: "4" },
  { label: "5", key: "5" },
  { label: "6", key: "6" },
  { label: "−", key: "-", className: "bg-blue-50 text-blue-700" },
  { label: "1", key: "1" },
  { label: "2", key: "2" },
  { label: "3", key: "3" },
  { label: "+", key: "+", className: "bg-blue-50 text-blue-700" },
  { label: "0", key: "0", span: true },
  { label: ".", key: "." },
  { label: "=", key: "=", className: "bg-blue-600 text-white" },
];

const Transaction = ({ transaction, onSaved }: TransactionProps) => {
  const [transacType, setTransacType] = useState<"Income" | "Expense">(
    transaction?.type ?? "Expense"
  );
  const [currency, setCurrency] = useState<CurrencyCode>(
    transaction?.currency ?? "INR"
  );
  const [title, setTitle] = useState(transaction?.title ?? "");
  const [amount, setAmount] = useState<number | "">(
    transaction?.amount ?? ""
  );
  const [accountId, setAccountId] = useState<number | null>(
    transaction?.account ? Number(transaction.account) : null
  );
  const [categoryId, setCategoryId] = useState<number | null>(
    transaction?.categoryId ?? null
  );
  const [date, setDate] = useState(transaction?.date ?? getToday());
  const [message, setMessage] = useState("");
  const [openPicker, setOpenPicker] = useState<"account" | "category" | null>(
    null
  );
  const [showCalc, setShowCalc] = useState(false);
  const [calcExpr, setCalcExpr] = useState("");

  const isEditing = Boolean(transaction);

  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const expenses = useLiveQuery(() => db.expenses.toArray(), []);
  const incomes = useLiveQuery(() => db.incomes.toArray(), []);

  const selectedAccount = accounts?.find((item) => item.id === accountId);
  const selectedCategory = categories?.find((item) => item.id === categoryId);

  const categoryUsage = new Map<number, number>();
  expenses?.forEach((item) =>
    categoryUsage.set(
      item.categoryId,
      (categoryUsage.get(item.categoryId) ?? 0) + 1
    )
  );

  const accountUsage = new Map<string, number>();
  const countAccount = (key: string) =>
    accountUsage.set(key, (accountUsage.get(key) ?? 0) + 1);

  expenses?.forEach((item) => countAccount(item.account));
  incomes?.forEach((item) => {
    if (item.account) countAccount(item.account);
  });

  const sortedAccounts = accounts
    ? [...accounts].sort(
        (a, b) =>
          (accountUsage.get(String(b.id)) ?? 0) -
          (accountUsage.get(String(a.id)) ?? 0)
      )
    : [];

  const sortedCategories = categories
    ? [...categories].sort(
        (a, b) =>
          (categoryUsage.get(b.id ?? -1) ?? 0) -
          (categoryUsage.get(a.id ?? -1) ?? 0)
      )
    : [];

  const SelectedAccountIcon = selectedAccount
    ? INCOME_ICONS[selectedAccount.icon]
    : null;
  const SelectedCategoryIcon = selectedCategory
    ? AVAILABLE_ICONS[selectedCategory.icon] ?? AVAILABLE_ICONS.Ellipsis
    : null;

  const calcPreview = (() => {
    if (!calcExpr) return "";
    const result = evaluateExpression(calcExpr);
    if (result === null || !Number.isFinite(result)) return "";
    return String(Math.round(result * 1e10) / 1e10);
  })();

  const pressCalc = (key: string) => {
    if (key === "C") {
      setCalcExpr("");
      return;
    }

    if (key === "BS") {
      setCalcExpr((prev) => prev.slice(0, -1));
      return;
    }

    if (key === "=") {
      const result = evaluateExpression(calcExpr);
      if (result === null || !Number.isFinite(result)) {
        setMessage("Invalid calculation.");
        return;
      }
      const rounded = Math.round(result * 1e10) / 1e10;
      setAmount(rounded);
      setShowCalc(false);
      return;
    }

    if (key === "%" || key === ".") {
      setCalcExpr((prev) => {
        const last = prev.slice(-1);
        if (prev === "" || "+-*/".includes(last) || last === "%") return prev;

        if (key === ".") {
          const lastOp = Math.max(
            prev.lastIndexOf("+"),
            prev.lastIndexOf("-"),
            prev.lastIndexOf("*"),
            prev.lastIndexOf("/")
          );
          if (prev.slice(lastOp + 1).includes(".")) return prev;
          return prev + ".";
        }

        return prev + "%";
      });
      return;
    }

    if ("+-*/".includes(key)) {
      setCalcExpr((prev) => {
        if (prev === "") return prev;
        const last = prev.slice(-1);
        if ("+-*/".includes(last)) return prev.slice(0, -1) + key;
        return prev + key;
      });
      return;
    }

    setCalcExpr((prev) => prev + key);
  };

  const handleSave = async () => {
    setMessage("");

    if (!accounts || accounts.length === 0) {
      setMessage("Please add at least one account.");
      return;
    }

    if (accountId === null) {
      setMessage("Please select an account.");
      return;
    }

    if (transacType === "Expense") {
      if (!categories || categories.length === 0) {
        setMessage("Please add at least one category.");
        return;
      }

      if (categoryId === null) {
        setMessage("Please select a category.");
        return;
      }
    }

    if (amount === "" || amount <= 0) {
      setMessage("Please enter a valid amount.");
      return;
    }

    if (!date) {
      setMessage("Please choose a date.");
      return;
    }

    try {
      if (transacType === "Expense") {
        if (categoryId === null) return;

        const payload = {
          title: title.trim() || null,
          amount,
          currency,
          categoryId,
          account: String(accountId),
          date,
        };

        if (transaction) {
          await db.expenses.update(transaction.id, payload);
        } else {
          await db.expenses.add(payload);
        }
      } else {
        const payload = {
          title: title.trim() || null,
          amount,
          currency,
          categoryId: null,
          account: String(accountId),
          date,
        };

        if (transaction) {
          await db.incomes.update(transaction.id, payload);
        } else {
          await db.incomes.add(payload);
        }
      }

      if (onSaved) {
        onSaved();
        return;
      }

      setTitle("");
      setAmount("");
      setAccountId(null);
      setCategoryId(null);
      setDate(getToday());
      setShowCalc(false);
      setCalcExpr("");
      setMessage(`${transacType} saved successfully.`);
    } catch (error) {
      console.error("Failed to save transaction:", error);
      setMessage("Could not save transaction. Please try again.");
    }
  };

  const handleDelete = async () => {
    if (!transaction) return;
    if (
      !window.confirm(
        `Delete this ${transaction.type.toLowerCase()}? This cannot be undone.`
      )
    ) {
      return;
    }

    try {
      if (transaction.type === "Expense") {
        await db.expenses.delete(transaction.id);
      } else {
        await db.incomes.delete(transaction.id);
      }

      if (onSaved) onSaved();
    } catch (error) {
      console.error("Failed to delete transaction:", error);
      setMessage("Could not delete transaction. Please try again.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-lg space-y-5 px-4 pb-32 pt-6 sm:px-6">
      <h1 className="text-2xl font-bold">
        {isEditing ? "Edit Transaction" : "Add Transaction"}
      </h1>

      {message && (
        <p
          role="status"
          className={`rounded-xl p-3 text-sm ${
            message.includes("successfully")
              ? "bg-green-50 text-green-700"
              : "bg-amber-50 text-amber-800"
          }`}
        >
          {message}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-gray-100 p-1">
        {(["Expense", "Income"] as const).map((item) => (
          <button
            key={item}
            type="button"
            disabled={isEditing}
            onClick={() => {
              setTransacType(item);
              setTitle("");
              setMessage("");
            }}
            className={`rounded-xl p-3 font-medium transition disabled:cursor-not-allowed ${
              transacType === item
                ? "bg-white text-blue-700 shadow-sm ring-1 ring-blue-600"
                : "text-gray-600 enabled:hover:text-gray-900 disabled:opacity-50"
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      {/* Currency and amount */}
      <div className="flex gap-2">
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
          className="w-2/5 rounded-lg border border-gray-200 bg-white p-2 text-sm outline-none focus:border-blue-500 sm:w-1/3"
          aria-label="Currency"
        >
          {Object.entries(CURRENCY).map(([code, details]) => (
            <option key={code} value={code}>
              {details.symbol} - {code}
            </option>
          ))}
        </select>

        <input
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          value={amount}
          onChange={(e) =>
            setAmount(e.target.value === "" ? "" : Number(e.target.value))
          }
          placeholder="Amount"
          className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white p-2 text-sm outline-none focus:border-blue-500"
        />

        <button
          type="button"
          onClick={() => {
            const next = !showCalc;
            setShowCalc(next);
            setOpenPicker(null);
            setMessage("");
            if (next) setCalcExpr(amount === "" ? "" : String(amount));
          }}
          aria-label="Toggle calculator"
          aria-expanded={showCalc}
          className={`shrink-0 rounded-lg border px-3 outline-none transition ${
            showCalc
              ? "border-blue-500 bg-blue-50 text-blue-600"
              : "border-gray-200 bg-white text-gray-500 hover:text-gray-700"
          }`}
        >
          <Calculator size={18} />
        </button>
      </div>

      {/* Calculator */}
      {showCalc && (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
          <div className="mb-2 rounded-xl bg-white px-3 py-2 text-right">
            <p className="min-h-[1rem] truncate text-xs text-gray-400">
              {calcExpr.replace(/\*/g, "×").replace(/\//g, "÷") || "\u00A0"}
            </p>
            <p className="truncate text-lg font-semibold tabular-nums">
              {calcPreview || "0"}
            </p>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {CALC_KEYS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => pressCalc(item.key)}
                className={`rounded-lg p-2.5 text-sm font-medium transition active:scale-95 ${
                  item.span ? "col-span-2" : ""
                } ${item.className ?? "bg-white text-gray-900"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Title */}
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        className="w-full rounded-xl border border-gray-200 bg-white p-3 outline-none focus:border-blue-500"
      />

      {/* Date */}
      <div>
        <label
          htmlFor="transaction-date"
          className="mb-1 block text-sm font-medium text-gray-600"
        >
          Date
        </label>
        <input
          id="transaction-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-white p-2.5 text-sm outline-none focus:border-blue-500"
        />
      </div>

      {/* Accounts */}
      <div>
        <p className="mb-1.5 text-sm font-medium text-gray-600">Account</p>

          <button
            type="button"
            onClick={() =>
              setOpenPicker(openPicker === "account" ? null : "account")
            }
            aria-expanded={openPicker === "account"}
            className="flex w-full items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white p-3 text-left"
          >
            <span
              className={`flex min-w-0 items-center gap-2 ${
                selectedAccount
                  ? "font-medium text-gray-900"
                  : "text-gray-500"
              }`}
            >
              {SelectedAccountIcon && <SelectedAccountIcon size={20} />}
              <span className="truncate">
                {selectedAccount ? selectedAccount.name : "Select account"}
              </span>
            </span>
            <ChevronDown
              size={20}
              className={`shrink-0 text-gray-500 transition ${
                openPicker === "account" ? "rotate-180" : ""
              }`}
            />
          </button>

          {openPicker === "account" && (
            <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-xl border border-gray-200 p-1">
              {accounts === undefined ? (
                <p className="p-3 text-sm text-gray-500">
                  Loading accounts...
                </p>
              ) : sortedAccounts.length === 0 ? (
                <p className="p-3 text-sm text-amber-700">No accounts added.</p>
              ) : (
                sortedAccounts.map((item) => {
                  const AccountIcon = INCOME_ICONS[item.icon];
                  const selected = accountId === item.id;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setAccountId(item.id!);
                        setOpenPicker(null);
                      }}
                      className={`flex w-full min-w-0 items-center gap-3 rounded-lg p-2.5 text-left ${
                        selected
                          ? "bg-blue-50 text-blue-700"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      <AccountIcon size={20} />
                      <span className="truncate font-medium">{item.name}</span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

      {/* Shared categories with icons */}
      {transacType === "Expense" && (
        <div>
          <p className="mb-1.5 text-sm font-medium text-gray-600">Category</p>

        <button
          type="button"
          onClick={() =>
            setOpenPicker(openPicker === "category" ? null : "category")
          }
          aria-expanded={openPicker === "category"}
          className="flex w-full items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white p-3 text-left"
        >
          <span
            className={`flex min-w-0 items-center gap-2 ${
              selectedCategory
                ? "font-medium text-gray-900"
                : "text-gray-500"
            }`}
          >
            {SelectedCategoryIcon && <SelectedCategoryIcon size={20} />}
            <span className="truncate">
              {selectedCategory ? selectedCategory.name : "Select category"}
            </span>
          </span>
          <ChevronDown
            size={20}
            className={`shrink-0 text-gray-500 transition ${
              openPicker === "category" ? "rotate-180" : ""
            }`}
          />
        </button>

        {openPicker === "category" && (
          <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-xl border border-gray-200 p-1">
            {categories === undefined ? (
              <p className="p-3 text-sm text-gray-500">
                Loading categories...
              </p>
            ) : sortedCategories.length === 0 ? (
              <p className="p-3 text-sm text-amber-700">
                No categories added.
              </p>
            ) : (
              sortedCategories.map((item) => {
                const CategoryIcon =
                  AVAILABLE_ICONS[item.icon] ?? AVAILABLE_ICONS.Ellipsis;
                const selected = categoryId === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setCategoryId(item.id!);
                      setOpenPicker(null);
                    }}
                    className={`flex w-full min-w-0 items-center gap-3 rounded-lg p-2.5 text-left ${
                      selected
                        ? "bg-blue-50 text-blue-700"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <CategoryIcon size={20} />
                    <span className="truncate font-medium">{item.name}</span>
                  </button>
                );
              })
            )}
          </div>
        )}
        </div>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={
          !accounts ||
          accounts.length === 0 ||
          (transacType === "Expense" &&
            (!categories || categories.length === 0))
        }
        className="w-full rounded-xl bg-blue-600 p-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isEditing ? "Save changes" : `Save ${transacType}`}
      </button>

      {isEditing && (
        <button
          type="button"
          onClick={handleDelete}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 p-3 font-semibold text-red-600 transition hover:bg-red-50"
        >
          <Trash2 size={18} /> Delete {transacType.toLowerCase()}
        </button>
      )}
    </div>
  );
};

export default Transaction;
