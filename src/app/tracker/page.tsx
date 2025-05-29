import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TrackerUpdateForm from "./update";
import { currentUser } from "@clerk/nextjs/server";

export default async function TrackerPage() {
  const user = await currentUser();
  if (!user) {
    throw new Error();
  }
  return (
    <div>
      <Card>
        <CardHeader>
          <CardTitle>{user.username}&apos;s financial tracker</CardTitle>
        </CardHeader>
        <CardContent>
          <TrackerUpdateForm />
        </CardContent>
      </Card>
    </div>
  );
}
