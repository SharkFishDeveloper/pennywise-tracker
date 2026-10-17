"use client";

import Link from "next/link";
import {
  ClipboardList,
  ChartNoAxesCombined,
  Wallet,
  CreditCard,
  Tags,
} from "lucide-react";

const navItems = [
  { name: "Records", href: "/", icon: ClipboardList },
  { name: "Charts", href: "/charts", icon: ChartNoAxesCombined },
  { name: "Budgets", href: "/budgets", icon: Wallet },
  { name: "Accounts", href: "/accounts", icon: CreditCard },
  { name: "Categories", href: "/categories", icon: Tags },
];

const Footer = () => {
  return (
    <footer className="fixed bottom-0 left-0 z-50 w-full border-t bg-white pb-[env(safe-area-inset-bottom)]">
      <nav className="mx-auto flex max-w-xl items-center justify-around gap-1 px-2 py-2">
        {navItems.map(({ name, href, icon: Icon }) => (
          <Link
            key={name}
            href={href}
            className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-1 py-1 text-gray-500 transition hover:text-blue-600"
          >
            <Icon size={22} />
            <span className="w-full truncate text-center text-[11px] sm:text-xs">
              {name}
            </span>
          </Link>
        ))}
      </nav>
    </footer>
  );
};

export default Footer;