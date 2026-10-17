"use client";

import { db } from "@/db";
import { AVAILABLE_ICONS, type ExpenseIconName } from "@/ExpenseIcons";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Plus, X, Search, Pencil, Trash2 } from "lucide-react";

const Categories = () => {
  const categories = useLiveQuery(() => db.categories.toArray(), []);

  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<ExpenseIconName>("Wallet");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  const filteredIcons = Object.entries(AVAILABLE_ICONS).filter(
    ([iconName]) =>
      iconName.toLowerCase().includes(search.toLowerCase())
  );

  const openAddForm = () => {
    setEditingId(null);
    setName("");
    setIcon("Wallet");
    setSearch("");
    setMessage("");
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
    setIsEditing(true);
  };

  const handleSave = async () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setMessage("Please enter a category name.");
      return;
    }

    try {
      if (editingId !== null) {
        await db.categories.update(editingId, {
          name: trimmedName,
          icon,
        });
      } else {
        await db.categories.add({
          name: trimmedName,
          icon,
        });
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

      await db.categories.delete(id);
      setMessage("");
    } catch (error) {
      console.error("Failed to delete category:", error);
      setMessage("Could not delete category. Please try again.");
    }
  };

  if (categories === undefined) {
    return <p className="p-6 text-gray-500">Loading categories...</p>;
  }

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