export const dynamic = "force-dynamic";

import { currentUser } from "@/lib/auth";
import { GET as getUserTrackerInfoAPI } from "@/app/api/tracker/overview/route";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getUserTrackerInfo(): Promise<any | null> {
  try {
    const response = await getUserTrackerInfoAPI();
    const data = await response.json();
    return data;
  } catch (error) {
    console.log(error);
    return null;
  }
}

export default async function TrackerPage() {
  const user = await currentUser();
  if (!user) {
    throw new Error();
  }
  const data = await getUserTrackerInfo();

  return <div>{JSON.stringify(data)}</div>;
}
