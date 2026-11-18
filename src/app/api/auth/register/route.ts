/**
 * POST /api/auth/register
 *
 * LOCKED — School + Principal creation is now SUPERADMIN-only.
 *
 * This endpoint is intentionally disabled for public access.
 * School provisioning is handled exclusively through the Admin Portal:
 *   POST /api/admin/schools  (requires role=SUPERADMIN, enforced by middleware)
 *
 * Returning 403 here gives a clear error if someone tries to call this directly.
 */

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "FORBIDDEN",
        message:
          "Pendaftaran sekolah publik telah dinonaktifkan. Hubungi Tim RemediAide untuk bergabung.",
      },
    },
    { status: 403 }
  );
}
