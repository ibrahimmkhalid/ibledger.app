import { NextResponse } from "next/server";

export async function GET() {
  try {
    const data = {
      message: "Hello from the tracker API!",
      timestamp: new Date().toISOString(),
    };
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error("--> API Route /tracker/api ERROR:", error); // Log any errors
    return new NextResponse("Internal Server Error", { status: 500 }); // Explicitly return text error
  }
}
