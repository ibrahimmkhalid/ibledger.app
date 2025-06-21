import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { currentUser } from "@clerk/nextjs/server";
import { GET as getUserTrackerInfoAPI } from "./api/route";

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

  return (
    <div>
      <Card>
        <CardHeader>
          <CardTitle>{user.username}&apos;s financial tracker</CardTitle>
        </CardHeader>
        <CardContent>
          <pre>{JSON.stringify(data, null, 2)}</pre>
        </CardContent>
      </Card>
    </div>
  );
}
