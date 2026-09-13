import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { getFolderMetadata } from "@/lib/folders";
import { storageProviders } from "@/lib/storageProviders";

export async function GET(req: NextRequest) {
  const authed = await isAuthenticated(req);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const providerSummaries = await Promise.all(
    storageProviders.map(async (provider) => {
      const objects = await provider.listAll();

      let generalBytes = 0;
      let generalCount = 0;
      const folderTotals: Record<string, { bytes: number; count: number }> = {};

      for (const obj of objects) {
        const key = obj.key;
        const size = obj.size;

        if (key.startsWith("folders/")) {
          const parts = key.split("/");
          const folderId = parts[1];
          if (!folderId || key.endsWith("metadata.json")) continue;

          if (!folderTotals[folderId]) {
            folderTotals[folderId] = { bytes: 0, count: 0 };
          }
          folderTotals[folderId].bytes += size;
          folderTotals[folderId].count += 1;
        } else {
          generalBytes += size;
          generalCount += 1;
        }
      }

      const folderIds = Object.keys(folderTotals);
      const folders = await Promise.all(
        folderIds.map(async (id) => {
          const meta = await getFolderMetadata(id);
          return {
            id,
            name: meta?.name || "Unknown folder",
            protected: meta?.protected ?? false,
            bytes: folderTotals[id].bytes,
            count: folderTotals[id].count,
          };
        })
      );

      const usedBytes =
        generalBytes + folders.reduce((sum, f) => sum + f.bytes, 0);
      const usedCount =
        generalCount + folders.reduce((sum, f) => sum + f.count, 0);

      return {
        id: provider.id,
        label: provider.label,
        limitBytes: provider.limitBytes,
        usedBytes,
        usedCount,
        general: { bytes: generalBytes, count: generalCount },
        folders,
      };
    })
  );

  const totalUsedBytes = providerSummaries.reduce((sum, p) => sum + p.usedBytes, 0);
  const totalLimitBytes = providerSummaries.reduce((sum, p) => sum + p.limitBytes, 0);

  return NextResponse.json({
    providers: providerSummaries,
    total: { usedBytes: totalUsedBytes, limitBytes: totalLimitBytes },
  });
}