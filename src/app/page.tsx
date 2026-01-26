import { SignedIn, SignedOut, SignInButton, SignUpButton } from "@clerk/nextjs";
import Link from "next/link";

export default function Home() {
  const isDevTesting = process.env.DEV_TESTING === "true";

  return (
    <>
      {isDevTesting ? (
        <Link href={"/tracker"}>tracker</Link>
      ) : (
        <>
          <SignedIn>
            <Link href={"/tracker"}>tracker</Link>
          </SignedIn>
          <SignedOut>
            <div className="flex items-center gap-3">
              <SignInButton />
              <SignUpButton />
            </div>
          </SignedOut>
        </>
      )}
    </>
  );
}
