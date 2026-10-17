"use client";

import { CURRENCY, type CurrencyCode } from "@/currency";
import { db, type RecurrenceDuration } from "@/db";
import { AVAILABLE_ICONS, type ExpenseIconName } from "@/ExpenseIcons";
import {
  RECURRENCE_DURATIONS,
  WEEKDAYS,
  durationEndDate,
} from "@/recurrence";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Plus, X, Search, Pencil, Trash2, Repeat } from "lucide-react";

const getToday = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};

const dayLabels = new Map(WEEKDAYS.map((day) => [day.value, day.label]));

const Categories = () => {
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const recurrences = useLiveQuery(() => db.recurrences.toArray(), []);

  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<ExpenseIconName>("Wallet");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  const [isRecurring, setIsRecurring] = useState(false);
  const [recAmount, setRecAmount] = useState("");
  const [recCurrency, setRecCurrency] = useState<CurrencyCode>("INR");
  const [recAccountId, setRecAccountId] = useState<number | "">("");
  const [recDays, setRecDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [recDuration, setRecDuration] = useState<RecurrenceDuration>("1 month");
  const [recStart, setRecStart] = useState("");

  const filteredIcons = Object.entries(AVAILABLE_ICONS).filter(
    ([iconName]) =>
      iconName.toLowerCase().includes(search.toLowerCase())
  );

  const recurrenceByCategory = new Map(
    (recurrences ?? []).map((item) => [item.categoryId, item])
  );

  const resetRecurrence = () => {
    setIsRecurring(false);
    setRecAmount("");
    setRecCurrency("INR");
    setRecAccountId(accounts?.[0]?.id ?? "");
    setRecDays([1, 2, 3, 4, 5]);
    setRecDuration("1 month");
    setRecStart(getToday());
  };

  const openAddForm = () => {
    setEditingId(null);
    setName("");
    setIcon("Wallet");
    setSearch("");
    setMessage("");
    resetRecurrence();
    setIsEditing(true);
  };

  const openEditForm = (category: {
    id?: number;
    name: string;
    icon: ExpenseIconName;
  }) => {
    setEditingId(category.id ?? null);
    setName(category.name);
    setIcon(category.icon);
    setSearch("");
    setMessage("");

    const existing =
      category.id !== undefined
        ? recurrenceByCategory.get(category.id)
        : undefined;

    if (existing) {
      setIsRecurring(true);
      setRecAmount(String(existing.amount));
      setRecCurrency(existing.currency);
      setRecAccountId(existing.account ? Number(existing.account) : "");
      setRecDays(existing.daysOfWeek);
      setRecDuration(existing.duration);
      setRecStart(existing.startDate);
    } else {
      resetRecurrence();
    }

    setIsEditing(true);
  };

  const toggleDay = (value: number) => {
    setRecDays((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
    );
  };

  const handleSave = async () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setMessage("Please enter a category name.");
      return;
    }

    if (isRecurring) {
      const parsedAmount = Number(recAmount);

      if (!parsedAmount || parsedAmount <= 0) {
        setMessage("Please enter a valid recurring amount.");
        return;
      }

      if (recAccountId === "") {
        setMessage("Please select an account for the recurring expense.");
        return;
      }

      if (recDays.length === 0) {
        setMessage("Please pick at least one day of the week.");
        return;
      }

      if (!recStart) {
        setMessage("Please choose a start date.");
        return;
      }
    }

    try {
      let categoryId: number | null = editingId;

      if (editingId !== null) {
        await db.categories.update(editingId, {
          name: trimmedName,
          icon,
        });
      } else {
        categoryId = (await db.categories.add({
          name: trimmedName,
          icon,
        })) ?? null;
      }

      if (categoryId !== null) {
        const existing = recurrenceByCategory.get(categoryId);

        if (isRecurring) {
          const payload = {
            categoryId,
            amount: Number(recAmount),
            currency: recCurrency,
            account: String(recAccountId),
            daysOfWeek: [...recDays].sort(),
            startDate: recStart,
            endDate: durationEndDate(recStart, recDuration),
            duration: recDuration,
            active: true,
            lastRun: existing?.lastRun ?? null,
          };

          if (existing?.id !== undefined) {
            await db.recurrences.update(existing.id, payload);
          } else {
            await db.recurrences.add(payload);
          }
        } else if (existing?.id !== undefined) {
          await db.recurrences.delete(existing.id);
        }
      }

      setIsEditing(false);
      setEditingId(null);
      setName("");
      setMessage("");
    } catch (error) {
      console.error("Failed to save category:", error);
      setMessage("Could not save category. Please try again.");
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Delete this category?")) return;

    try {
      const [expenseCount, incomeCount, budgetCount] = await Promise.all([
        db.expenses.where("categoryId").equals(id).count(),
        db.incomes.where("categoryId").equals(id).count(),
        db.budgets.where("categoryId").equals(id).count(),
      ]);

      if (expenseCount + incomeCount + budgetCount > 0) {
        setMessage(
          "This category is in use by transactions or budgets. Reassign them before deleting it."
        );
        return;
      }

      const existing = recurrenceByCategory.get(id);
      if (existing?.id !== undefined) {
        await db.recurrences.delete(existing.id);
      }

      await db.categories.delete(id);
      setMessage("");
    } catch (error) {
      console.error("Failed to delete category:", error);
      setMessage("Could not delete category. Please try again.");
    }
  };

  if (
    categories === undefined ||
    accounts === undefined ||
    recurrences === undefined
  ) {
    return <p className="p-6 text-gray-500">Loading categories...</p>;
  }

  const previewEnd =
    isRecurring && recStart ? durationEndDate(recStart, recDuration) : "";

  return (
    <div className="relative mx-auto min-h-[70vh] w-full max-w-3xl px-4 pb-32 pt-6 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Categories</h1>
          <p className="mt-1 text-sm text-gray-500">
            Organize your transactions with custom categories.
          </p>
        </div>

        <button
          type="button"
          onClick={openAddForm}
          aria-label="Add category"
          className="shrink-0 rounded-full bg-blue-600 p-3 text-white shadow-sm transition hover:bg-blue-700"
        >
          <Plus size={22} />
        </button>
      </div>

      {message && !isEditing && (
        <p role="status" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          {message}
        </p>
      )}

      {categories.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center text-center">
          <div className="mb-4 rounded-2xl bg-gray-100 p-4">
            <AVAILABLE_ICONS.Wallet size={32} className="text-gray-500" />
          </div>
          <h2 className="text-lg font-semibold">No categories added</h2>
          <p className="mt-1 text-sm text-gray-500">
            Tap + to add your first category.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {categories.map((category) => {
            const CategoryIcon =
              AVAILABLE_ICONS[category.icon] ?? AVAILABLE_ICONS.Ellipsis;
            const recurrence =
              category.id !== undefined
                ? recurrenceByCategory.get(category.id)
                : undefined;

            return (
              <div
                key={category.id}
                className="flex items-center gap-3 rounded-2xl border p-3"
              >
                <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
                  <CategoryIcon size={24} />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{category.name}</p>
                  <p className="text-xs text-gray-500">
                    {category.icon}
                  </p>
                  {recurrence && (
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs font-medium text-blue-600">
                      <Repeat size={12} className="shrink-0" />
                      {recurrence.daysOfWeek
                        .map((day) => dayLabels.get(day))
                        .join(", ")}{" "}
                      · {recurrence.duration}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => openEditForm(category)}
                  aria-label={`Edit ${category.name}`}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-blue-600"
                >
                  <Pencil size={18} />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (category.id !== undefined) {
                      void handleDelete(category.id);
                    }
                  }}
                  aria-label={`Delete ${category.name}`}
                  className="rounded-lg p-2 text-gray-500 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit form */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 text-gray-900 shadow-xl sm:rounded-3xl">
            <div className="mb-5 flex items-center justify-between gap-2">
              <h2 className="text-xl font-bold">
                {editingId !== null ? "Edit category" : "Add category"}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  {editingId !== null ? "Save" : "Add"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    setMessage("");
                  }}
                  aria-label="Close"
                  className="rounded-full p-2 hover:bg-gray-100"
                >
                  <X size={22} />
                </button>
              </div>
            </div>

            <label htmlFor="category-name" className="mb-2 block text-sm font-medium">
              Category name
            </label>
            <input
              id="category-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Food, Electricity, Transport"
              className="mb-5 w-full rounded-xl border p-3 outline-none focus:border-blue-500"
              autoFocus
            />

            <p className="mb-3 text-sm font-medium">Choose an icon</p>

            <div className="mb-3 flex items-center gap-2 rounded-xl border px-3">
              <Search size={18} className="shrink-0 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search icons..."
                className="w-full py-3 outline-none"
              />
            </div>

            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {filteredIcons.map(([iconName, IconComponent]) => (
                <button
                  key={iconName}
                  type="button"
                  onClick={() => setIcon(iconName as ExpenseIconName)}
                  aria-pressed={icon === iconName}
                  className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border p-2 ${
                    icon === iconName
                      ? "border-blue-600 bg-blue-50 text-blue-700 ring-1 ring-blue-600"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <IconComponent size={25} />
                  <span className="text-center text-xs">
                    {iconName.replace(/([a-z])([A-Z])/g, "$1 $2")}
                  </span>
                </button>
              ))}
            </div>

            {filteredIcons.length === 0 && (
              <p className="py-6 text-center text-sm text-gray-500">
                No matching icons.
              </p>
            )}

            {/* Recurring expense */}
            <div className="mt-5 rounded-2xl border border-gray-200 p-4">
              <button
                type="button"
                onClick={() => setIsRecurring((value) => !value)}
                aria-pressed={isRecurring}
                className="flex w-full items-center justify-between gap-2"
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Repeat size={16} /> Recurring expense
                </span>
                <span
                  className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                    isRecurring ? "bg-blue-600" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      isRecurring ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </span>
              </button>

              {isRecurring && (
                <div className="mt-4 space-y-4">
                  <p className="text-xs text-gray-500">
                    Automatically add this expense on the days you pick.
                  </p>

                  <div className="flex gap-2">
                    <select
                      value={recCurrency}
                      onChange={(e) =>
                        setRecCurrency(e.target.value as CurrencyCode)
                      }
                      aria-label="Currency"
                      className="w-2/5 rounded-lg border border-gray-200 bg-white p-2 text-sm outline-none focus:border-blue-500"
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
                      value={recAmount}
                      onChange={(e) => setRecAmount(e.target.value)}
                      placeholder="Amount"
                      className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white p-2 text-sm outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="recurring-account"
                      className="mb-1 block text-sm font-medium text-gray-600"
                    >
                      Account
                    </label>
                    <select
                      id="recurring-account"
                      value={recAccountId}
                      onChange={(e) =>
                        setRecAccountId(
                          e.target.value === "" ? "" : Number(e.target.value)
                        )
                      }
                      className="w-full rounded-xl border border-gray-200 bg-white p-2.5 text-sm outline-none focus:border-blue-500"
                    >
                      <option value="" disabled>
                        Select account
                      </option>
                      {accounts.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <p className="mb-1.5 text-sm font-medium text-gray-600">
                      Repeat on
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {WEEKDAYS.map((day) => {
                        const active = recDays.includes(day.value);

                        return (
                          <button
                            key={day.value}
                            type="button"
                            onClick={() => toggleDay(day.value)}
                            aria-pressed={active}
                            className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                              active
                                ? "border-blue-600 bg-blue-50 text-blue-700"
                                : "border-gray-200 text-gray-600 hover:bg-gray-50"
                            }`}
                          >
                            {day.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label
                        htmlFor="recurring-start"
                        className="mb-1 block text-sm font-medium text-gray-600"
                      >
                        Start date
                      </label>
                      <input
                        id="recurring-start"
                        type="date"
                        value={recStart}
                        onChange={(e) => setRecStart(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 bg-white p-2.5 text-sm outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="flex-1">
                      <label
                        htmlFor="recurring-duration"
                        className="mb-1 block text-sm font-medium text-gray-600"
                      >
                        For
                      </label>
                      <select
                        id="recurring-duration"
                        value={recDuration}
                        onChange={(e) =>
                          setRecDuration(e.target.value as RecurrenceDuration)
                        }
                        className="w-full rounded-xl border border-gray-200 bg-white p-2.5 text-sm outline-none focus:border-blue-500"
                      >
                        {RECURRENCE_DURATIONS.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {previewEnd && (
                    <p className="text-xs text-gray-500">
                      Runs until {previewEnd}. Past days are added automatically
                      when you open the app.
                    </p>
                  )}
                </div>
              )}
            </div>

            {message && (
              <p role="alert" className="mt-4 text-sm text-red-600">
                {message}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Categories;
