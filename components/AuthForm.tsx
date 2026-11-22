"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { fetchAuthState, setAuthState } from "@/lib/auth-client";
import { AUTH_EVENT } from "@/lib/cloud-sync";

const AuthForm = ({ mode }: { mode: "login" | "signup" }) => {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetchAuthState().then((state) => {
      if (state.email) router.replace("/");
    });
  }, [router]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json()) as { email?: string; error?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not continue.");
        return;
      }
      const signedIn = data.email ?? email.trim().toLowerCase();
      setAuthState({ email: signedIn, configured: true });
      window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: { email: signedIn } }));
      router.replace("/");
    } catch {
      setError("Could not reach the cloud service.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="text-sm text-gray-500">
            {mode === "login"
              ? "Sign in to sync your data across devices."
              : "Sign up to back up your data automatically."}
          </p>
        </div>

        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <label className="block text-sm font-medium text-gray-700">
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-300 p-3 text-sm outline-none focus:border-blue-500"
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Password
            <input
              type="password"
              required
              minLength={8}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-300 p-3 text-sm outline-none focus:border-blue-500"
            />
          </label>
          {error && (
            <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 p-3 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {busy && <Loader2 size={18} className="animate-spin" />}
            {mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500">
          {mode === "login" ? "New to PennyWise? " : "Already have an account? "}
          <Link
            href={mode === "login" ? "/signup" : "/login"}
            className="font-medium text-blue-600 hover:underline"
          >
            {mode === "login" ? "Create an account" : "Sign in"}
          </Link>
        </p>
      </div>
    </div>
  );
};

export default AuthForm;
