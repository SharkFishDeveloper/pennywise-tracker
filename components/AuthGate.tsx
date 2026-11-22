"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { fetchAuthState } from "@/lib/auth-client";

const AuthGate = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname();
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (pathname === "/login" || pathname === "/signup") {
      setAllowed(true);
      return;
    }
    let active = true;
    void fetchAuthState().then((state) => {
      if (!active) return;
      if (!state.configured || state.email) {
        setAllowed(true);
      } else {
        setAllowed(false);
        router.replace("/login");
      }
    });
    return () => {
      active = false;
    };
  }, [pathname, router]);

  if (!allowed) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center text-gray-500">
        <Loader2 size={24} className="animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
};

export default AuthGate;
