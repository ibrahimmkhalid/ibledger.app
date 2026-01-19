export const dynamic = "force-dynamic";

import { currentUser } from "@/lib/auth";
import { TrackerClient } from "@/app/tracker/TrackerClient";

export default async function TrackerPage() {
  const user = await currentUser();
  if (!user) {
    throw new Error();
  }

  return (
    <div className="flex flex-col items-center">
      <div className="w-full 2xl:w-1/2">
        <TrackerClient />
      </div>
    </div>
  );
}
