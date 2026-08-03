import { describe, expect, it } from "vitest";

import { buildCreateExportPayload } from "../../api/adminDatasetExport";

describe("admin dataset export client", () => {
  it("builds create export payload", () => {
    expect(buildCreateExportPayload(250)).toEqual({ max_records: 250 });
  });
});
