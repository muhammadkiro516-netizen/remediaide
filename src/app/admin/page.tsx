/**
 * /admin — redirects to /admin/dashboard
 * Middleware already guards this path for SUPERADMIN.
 * force-dynamic prevents prerendering at build time so Next.js
 * does not attempt to statically render this redirect page.
 */
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

export default function AdminRootPage() {
  redirect("/admin/dashboard");
}
