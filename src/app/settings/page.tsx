export const dynamic = "force-dynamic";

import { currentUser } from "@/lib/auth";

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) {
    throw new Error();
  }
  return <div></div>;
}
