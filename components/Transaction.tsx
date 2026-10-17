"use client";

import { CURRENCY, type CurrencyCode } from "@/currency";
import { db } from "@/db";
import { INCOME_ICONS } from "@/IncomeIcons";
import { AVAILABLE_ICONS } from "@/ExpenseIcons";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { ChevronDown, Trash2 } from "lucide-react";

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
      </div>

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
