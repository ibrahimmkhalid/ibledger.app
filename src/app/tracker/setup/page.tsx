"use client";

import { useCallback, useEffect, useState } from "react";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { apiJson } from "@/app/tracker/lib/api";
import { checkBootstrapOrRedirect } from "@/app/tracker/lib/bootstrap";
import { SetupSkeleton } from "@/app/tracker/components/loading-skeletons";
import { FundsCard } from "@/app/tracker/setup/funds-card";
import { WalletsCard } from "@/app/tracker/setup/wallets-card";
import type { Fund, Wallet } from "@/app/tracker/types";

export default function SetupPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  // Bumping this remounts FundsCard, which is how its draft is reseeded.
  const [fundsVersion, setFundsVersion] = useState(0);

  // Both reloads report whether they landed. Remounting on a failed reload
  // would reseed the card from data the save already superseded.
  const loadFunds = useCallback(async () => {
    try {
      const res = await apiJson<{ funds: Fund[] }>("/api/funds");
      setFunds(res.funds);
      setFundsVersion((n) => n + 1);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load funds");
      return false;
    }
  }, []);

  const loadWallets = useCallback(async () => {
    try {
      const res = await apiJson<{ wallets: Wallet[] }>("/api/wallets");
      setWallets(res.wallets);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load wallets");
      return false;
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    // When bootstrap redirects, keep the skeleton up until navigation lands;
    // clearing it would flash an empty setup page mid-redirect.
    let redirected = false;
    try {
      const ready = await checkBootstrapOrRedirect(router);
      if (!ready) {
        redirected = true;
        return;
      }
      await Promise.all([loadFunds(), loadWallets()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load setup");
    } finally {
      if (!redirected) setLoading(false);
    }
  }, [router, loadFunds, loadWallets]);

  useEffect(() => {
    // The page fetches itself on the client, so the load flag is set here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (loading) {
    return <SetupSkeleton />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Setup</h1>

      <FundsCard key={fundsVersion} serverFunds={funds} onReload={loadFunds} />
      <WalletsCard wallets={wallets} onReload={loadWallets} />
    </div>
  );
}
