import { redirect } from "next/navigation";

/**
 * /dashboard redirects to /dashboard/classes
 */
export default function DashboardPage() {
  redirect("/dashboard/classes");
}
