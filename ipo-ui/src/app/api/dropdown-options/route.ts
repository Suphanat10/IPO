import { getDropdownOptions } from "@/app/lib/publicHomeData";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getDropdownOptions();
  return Response.json(data);
}
