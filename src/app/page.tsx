import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isInternal } from "@/lib/rbac";

export default async function Home() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (isInternal(session.user.role)) redirect("/dashboard");
  // Vendors land on Home (their purchase orders). One without a vendor link
  // cannot use that page, so goes to agreements as before.
  redirect(session.user.vendorId ? "/home" : "/agreements");
}
