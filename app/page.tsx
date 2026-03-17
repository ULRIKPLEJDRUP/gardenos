import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/app/lib/db";
import { GardenMap } from "./components/GardenMap";

export default async function Home() {
  const session = await auth();
  const userId = session?.user?.id;

  // If no session at all, redirect to login (backup for proxy)
  if (!userId) {
    redirect("/login");
  }

  // Verify user actually exists in DB (catches stale JWT after DB reset)
  const userExists = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!userExists) {
    // Clear the stale session by redirecting to NextAuth sign-out endpoint
    redirect("/api/auth/signout?callbackUrl=/login");
  }

  return (
    <main className="min-h-screen w-full bg-background text-foreground">
      <GardenMap userId={userId} />
    </main>
  );
}
