import { getApiBaseUrl } from "./config";

export type ReadyExportCountResponse = {
  ready_count: number;
};

export type CreateExportBatchResponse = {
  id: string;
  status: string;
  record_count: number;
  artifact_sha256: string | null;
  manifest_sha256: string | null;
};

function adminHeaders(apiKey: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-Admin-Api-Key": apiKey,
  };
}

export async function getReadyExportCount(apiKey: string): Promise<ReadyExportCountResponse> {
  const response = await fetch(`${getApiBaseUrl()}/api/admin/dataset-export-batches/ready-count`, {
    headers: adminHeaders(apiKey),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as ReadyExportCountResponse;
}

export async function createExportBatch(
  apiKey: string,
  maxRecords = 1000,
): Promise<CreateExportBatchResponse> {
  const response = await fetch(`${getApiBaseUrl()}/api/admin/dataset-export-batches`, {
    method: "POST",
    headers: adminHeaders(apiKey),
    body: JSON.stringify({ max_records: maxRecords }),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as CreateExportBatchResponse;
}

export async function downloadExportArtifact(
  apiKey: string,
  batchId: string,
  kind: "jsonl" | "manifest",
): Promise<{ blob: Blob; filename: string }> {
  const suffix = kind === "jsonl" ? "download" : "manifest";
  const response = await fetch(
    `${getApiBaseUrl()}/api/admin/dataset-export-batches/${batchId}/${suffix}`,
    { headers: { "X-Admin-Api-Key": apiKey } },
  );
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const filename =
    match?.[1] ??
    (kind === "jsonl"
      ? `intent-corrections-${batchId}.jsonl`
      : `intent-corrections-${batchId}.manifest.json`);
  return { blob: await response.blob(), filename };
}

export function buildCreateExportPayload(maxRecords = 1000): { max_records: number } {
  return { max_records: maxRecords };
}
