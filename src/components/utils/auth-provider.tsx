"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { ReactNode } from "react";

interface AuthProviderProps {
  children: ReactNode;
  devTesting?: boolean;
}

export function AuthProvider({ children, devTesting }: AuthProviderProps) {
  if (devTesting) {
    return <>{children}</>;
  }

  return <ClerkProvider>{children}</ClerkProvider>;
}
