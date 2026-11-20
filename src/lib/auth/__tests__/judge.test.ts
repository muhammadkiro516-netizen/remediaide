import { describe, expect, it } from "vitest";
import { isJudge, judgeBlock } from "../judge";

const ENV = "juri@remediaide.id, Juri2@Contoh.ID";

describe("akun juri hanya-baca", () => {
  it("mengenali email juri tanpa peduli huruf besar dan spasi", () => {
    expect(isJudge("JURI@remediaide.id", ENV)).toBe(true);
    expect(isJudge(" juri2@contoh.id ", ENV)).toBe(true);
    expect(isJudge("guru@sekolah.id", ENV)).toBe(false);
    expect(isJudge(undefined, ENV)).toBe(false);
    expect(isJudge("juri@remediaide.id", "")).toBe(false);
  });

  it("juri boleh membaca halaman dan GET API", () => {
    expect(judgeBlock("juri@remediaide.id", "GET", "/dashboard", ENV)).toBeNull();
    expect(judgeBlock("juri@remediaide.id", "GET", "/api/sessions/abc", ENV)).toBeNull();
    expect(judgeBlock("juri@remediaide.id", "HEAD", "/metodologi", ENV)).toBeNull();
  });

  it("juri tidak boleh mengubah data", () => {
    for (const m of ["POST", "PUT", "PATCH", "DELETE", "post"]) {
      expect(judgeBlock("juri@remediaide.id", m, "/api/sessions/abc", ENV)).toBe("WRITE");
    }
  });

  it("juri tidak boleh mengekspor data", () => {
    expect(judgeBlock("juri@remediaide.id", "GET", "/api/sessions/abc/export/csv", ENV)).toBe("EXPORT");
    expect(judgeBlock("juri@remediaide.id", "GET", "/api/sessions/abc/export/research", ENV)).toBe("EXPORT");
    expect(judgeBlock("juri@remediaide.id", "GET", "/api/tests/t1/questions/csv", ENV)).toBe("EXPORT");
  });

  it("logout tetap boleh, dan guru biasa tidak terpengaruh", () => {
    expect(judgeBlock("juri@remediaide.id", "POST", "/api/auth/signout", ENV)).toBeNull();
    expect(judgeBlock("guru@sekolah.id", "POST", "/api/sessions/abc", ENV)).toBeNull();
    expect(judgeBlock("guru@sekolah.id", "GET", "/api/sessions/abc/export/csv", ENV)).toBeNull();
  });
});
