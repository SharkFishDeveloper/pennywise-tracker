"use client";

import { db } from "@/db";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { Plus, X, Search, Pencil, Trash2 } from "lucide-react";
import { INCOME_ICONS, type IncomeIconName } from "@/IncomeIcons";

const Accounts = () => {
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);

  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<IncomeIconName>("Wallet");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const icons = useMemo(
    () =>
      Object.entries(INCOME_ICONS).filter(([iconName]) =>
        iconName.toLowerCase().includes(search.toLowerCase())
      ),
    [search]
  );

  const openAddForm = () => {
    setEditingId(null);
    setName("");
    setIcon("Wallet");
    setSearch("");
    setError("");
    setIsEditing(true);
  };

  const openEditForm = (account: {
    id?: number;
    name: string;
    icon: IncomeIconName;
  }) => {
    setEditingId(account.id ?? null);
    setName(account.name);
    setIcon(account.icon);
    setSearch("");
    setError("");
    setIsEditing(true);
  };

  const handleSave = async () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError("Please enter an account name.");
      return;
    }

    try {
      if (editingId !== null) {
        await db.accounts.update(editingId, { name: trimmedName, icon });
        setMessage("");
      } else {
        await db.accounts.add({ name: trimmedName, icon });
      }

      setName("");
      setIcon("Wallet");
      setSearch("");
      setError("");
      setIsEditing(false);
      setEditingId(null);
    } catch (err) {
      console.error("Failed to save account:", err);
      setError("Could not save account. Please try again.");
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Delete this account?")) return;

    try {
      const usage = await db.expenses.where("account").equals(String(id)).count();

      if (usage > 0) {
        setMessage(
          "This account is used by transactions. Reassign them before deleting it."
        );
        return;
      }

      await db.accounts.delete(id);
      setMessage("");
    } catch (err) {
      console.error("Failed to delete account:", err);
      setMessage("Could not delete account. Please try again.");
    }
  };

  if (accounts === undefined) {
    return <p className="p-6 text-gray-500">Loading accounts...</p>;
  }

  return (
    <div className="relative mx-auto min-h-[70vh] w-full max-w-3xl px-4 pb-32 pt-6 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Accounts</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your wallets, bank accounts and payment methods.
          </p>
        </div>

        <button
          type="button"
          onClick={openAddForm}
          aria-label="Add account"
          className="shrink-0 rounded-full bg-blue-600 p-3 text-white shadow-sm transition hover:bg-blue-700"
        >
          <Plus size={22} />
        </button>
      </div>

      {message && (
        <p
          role="status"
          className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800"
        >
          {message}
        </p>
      )}

      {accounts.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center text-center">
          <div className="mb-4 rounded-2xl bg-gray-100 p-4">
            <INCOME_ICONS.Wallet size={32} className="text-gray-500" />
          </div>
          <h2 className="text-lg font-semibold">No accounts added</h2>
          <p className="mt-1 text-sm text-gray-500">
            Tap + to add your first account.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:grid-cols-3">
          {accounts.map((account) => {
            const AccountIcon = INCOME_ICONS[account.icon];

            return (
              <div
                key={account.id}
                className="flex min-w-0 items-center gap-3 rounded-2xl border border-gray-200 p-3"
              >
                <div className="shrink-0 rounded-xl bg-blue-50 p-3 text-blue-600">
                  <AccountIcon size={24} />
                </div>

                <span className="min-w-0 flex-1 truncate font-medium">
                  {account.name}
                </span>

                <button
                  type="button"
                  onClick={() => openEditForm(account)}
                  aria-label={`Rename ${account.name}`}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-blue-600"
                >
                  <Pencil size={18} />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (account.id !== undefined) {
                      void handleDelete(account.id);
                    }
                  }}
                  aria-label={`Delete ${account.name}`}
                  className="rounded-lg p-2 text-gray-500 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit account dialog */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 text-gray-900 shadow-xl sm:rounded-3xl">
            <div className="mb-5 flex items-center justify-between gap-2">
              <h2 className="text-xl font-bold">
                {editingId !== null ? "Rename account" : "Add account"}
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
                    setEditingId(null);
                    setError("");
                  }}
                  aria-label="Close"
                  className="rounded-full p-2 hover:bg-gray-100"
                >
                  <X size={22} />
                </button>
              </div>
            </div>

            <label
              htmlFor="account-name"
              className="mb-2 block text-sm font-medium"
            >
              Account name
            </label>
            <input
              id="account-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cash, UPI, SBI"
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
              {icons.map(([iconName, IconComponent]) => {
                const selected = icon === iconName;

                return (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => setIcon(iconName as IncomeIconName)}
                    aria-pressed={selected}
                    className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border p-2 transition ${
                      selected
                        ? "border-blue-600 bg-blue-50 text-blue-700 ring-1 ring-blue-600"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <IconComponent size={25} />
                    <span className="text-center text-xs">
                      {iconName.replace(/([a-z])([A-Z])/g, "$1 $2")}
                    </span>
                  </button>
                );
              })}
            </div>

            {icons.length === 0 && (
              <p className="py-6 text-center text-sm text-gray-500">
                No matching icons.
              </p>
            )}

            {error && (
              <p role="alert" className="mt-4 text-sm text-red-600">
                {error}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Accounts;