import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isInternal } from "@/lib/rbac";

export default async function Home() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  redirect(isInternal(session.user.role) ? "/dashboard" : "/agreements");
}
