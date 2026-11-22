"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Cloud, CloudUpload, LogIn, LogOut, Menu, UserPlus, X } from "lucide-react";
import { fetchAuthState, setAuthState } from "@/lib/auth-client";
import { AUTH_EVENT, SYNC_FORCE_EVENT, SYNC_STATUS_EVENT } from "@/lib/cloud-sync";

const links = [
  { href: "/", label: "Home" },
  { href: "/charts", label: "Charts" },
  { href: "/budgets", label: "Budgets" },
  { href: "/accounts", label: "Accounts" },
  { href: "/categories", label: "Categories" },
];

const NavMenu = () => {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [position, setPosition] = useState({ top: 0, right: 0 });
  const container = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
    void fetchAuthState().then((state) => setEmail(state.email));
    const onStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ status?: string; detail?: string }>).detail;
      if (detail?.status === "saving") setStatus("Saving...");
      else if (detail?.status === "pending") setStatus("Changes waiting to save");
      else if (detail?.status === "saved") setStatus(detail.detail ?? "Saved");
      else if (detail?.status === "error") setStatus(detail.detail ?? "Sync error");
      else setStatus("");
    };
    window.addEventListener(SYNC_STATUS_EVENT, onStatus);
    return () => window.removeEventListener(SYNC_STATUS_EVENT, onStatus);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!container.current?.contains(target) && !menu.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = button.current?.getBoundingClientRect();
    if (rect) {
      setPosition({
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    }
    setOpen(true);
  };

  const signOut = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setAuthState({ email: null, configured: true });
      window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: { email: null } }));
      setEmail(null);
      setOpen(false);
      router.push("/login");
    }
  };

  return (
    <div ref={container} className="ml-auto">
      <button
        ref={button}
        type="button"
        aria-label="Menu"
        aria-expanded={open}
        onClick={toggle}
        className="rounded-full border border-gray-200 p-2 text-gray-700 transition hover:bg-gray-50"
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>

      {open && mounted &&
        createPortal(
          <div
            ref={menu}
            style={{ top: position.top, right: position.right }}
            className="fixed z-[9999] w-64 rounded-2xl border border-gray-200 bg-white p-2 shadow-lg"
          >
            <nav className="space-y-1">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`block rounded-xl px-3 py-2 text-sm transition hover:bg-gray-50 ${
                    pathname === link.href
                      ? "bg-blue-50 font-medium text-blue-700"
                      : "text-gray-700"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="my-2 border-t border-gray-100" />

            {email ? (
              <div className="space-y-2">
                <div className="flex items-start gap-2 rounded-xl bg-gray-50 p-3">
                  <Cloud size={16} className="mt-0.5 text-blue-600" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-gray-900">{email}</p>
                    <p className="text-xs text-gray-500">{status || "Cloud save is on"}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent(SYNC_FORCE_EVENT))}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50"
                >
                  <CloudUpload size={16} />
                  Save now
                </button>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50"
                >
                  <LogOut size={16} />
                  Sign out
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                <Link
                  href="/login"
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
                >
                  <LogIn size={16} />
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-blue-600 transition hover:bg-blue-50"
                >
                  <UserPlus size={16} />
                  Create account
                </Link>
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
};

export default NavMenu;
