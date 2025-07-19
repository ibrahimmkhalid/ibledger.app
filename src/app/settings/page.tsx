import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { currentUser } from "@/lib/auth";

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) {
    throw new Error();
  }
  return (
    <div>
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent>placeholder</CardContent>
      </Card>
    </div>
  );
}
