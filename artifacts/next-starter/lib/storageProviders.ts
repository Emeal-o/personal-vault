// lib/storageProviders.ts
// Registry of storage providers backing the vault. Each provider knows how
// to list its own objects and what its free-tier limit is. Adding a new
// provider later means adding one entry here — nothing else needs to change.

import { listObjects as listR2Objects } from "@/lib/r2";

export interface ProviderObject {
  key: string;
  size: number;
}

export interface StorageProvider {
  id: string; // stable identifier, e.g. "cloudflare-r2"
  label: string; // human-readable name, e.g. "Cloudflare R2"
  limitBytes: number; // free-tier storage limit for this provider
  listAll: () => Promise<ProviderObject[]>;
}

const GB = 1024 * 1024 * 1024;

export const storageProviders: StorageProvider[] = [
  {
    id: "cloudflare-r2",
    label: "Cloudflare R2",
    limitBytes: 10 * GB,
    listAll: async () => {
      const objects = await listR2Objects("");
      return objects.map((obj) => ({
        key: obj.Key || "",
        size: obj.Size || 0,
      }));
    },
  },
  // Future providers get added here, e.g.:
  // {
  //   id: "backblaze-b2",
  //   label: "Backblaze B2",
  //   limitBytes: 10 * GB,
  //   listAll: async () => { ... },
  // },
];