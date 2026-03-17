import { auth } from "@/auth";
import { GardenMap } from "./components/GardenMap";

export default async function Home() {
  const session = await auth();
  const userId = session?.user?.id ?? "";

  return (
    <main className="min-h-screen w-full bg-background text-foreground">
      <GardenMap userId={userId} />
    </main>
  );
}
