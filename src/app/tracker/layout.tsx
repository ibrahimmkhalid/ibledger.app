export const dynamic = "force-dynamic";

import { currentUser } from "@/lib/auth";
import { TrackerShell } from "@/app/tracker/tracker-shell";

export default async function TrackerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user) {
    throw new Error();
  }

  return <TrackerShell>{children}</TrackerShell>;
}
