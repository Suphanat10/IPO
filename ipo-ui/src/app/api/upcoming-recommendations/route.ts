import { getUpcomingRecommendations } from "@/app/lib/publicHomeData";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getUpcomingRecommendations();
  return Response.json(data);
}
