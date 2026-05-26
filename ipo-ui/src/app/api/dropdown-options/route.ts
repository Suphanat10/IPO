import { query } from "@/lib/db";
import { encryptedJson } from "@/lib/cipher";

export async function GET() {
  const [faPersonsRes, faCompaniesRes, underwritersRes] = await Promise.all([
    query<{ name: string }>(
      "SELECT DISTINCT UNNEST(fa_persons) AS name FROM ipos WHERE fa_persons IS NOT NULL ORDER BY name",
    ),
    query<{ name: string }>(
      "SELECT DISTINCT UNNEST(fa_companies) AS name FROM ipos WHERE fa_companies IS NOT NULL ORDER BY name",
    ),
    query<{ name: string }>(
      `SELECT DISTINCT name FROM (
         SELECT UNNEST(lead_uw) AS name FROM ipos WHERE lead_uw IS NOT NULL
         UNION
         SELECT UNNEST(co_uws) AS name FROM ipos WHERE co_uws IS NOT NULL
       ) s WHERE TRIM(COALESCE(name, '')) <> '' ORDER BY name`,
    ),
  ]);

  const faPersons = faPersonsRes
    .map((r) => r.name.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "th"));

  const faCompanies = faCompaniesRes
    .map((r) => r.name.trim())
    .filter(Boolean);

  const underwriters = underwritersRes.map((r) => r.name.trim()).filter(Boolean);

  return encryptedJson({ faPersons, faCompanies, underwriters });
}
