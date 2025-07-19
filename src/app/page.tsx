import { SignedIn } from "@clerk/nextjs";
import Link from "next/link";

export default function Home() {
  const isDevTesting = process.env.DEV_TESTING === "true";

  return (
    <div className="grid items-center justify-items-center gap-16 p-8 pb-20 sm:p-20">
      <main className="row-start-2 flex flex-col items-center sm:items-start">
        Home page placeholder
        {isDevTesting ? (
          <Link href={"/tracker"}>tracker</Link>
        ) : (
          <SignedIn>
            <Link href={"/tracker"}>tracker</Link>
          </SignedIn>
        )}
      </main>
    </div>
  );
}
