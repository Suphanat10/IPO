import { redirect } from "next/navigation";

export default function SecImportPreviewRedirect() {
  redirect("/ipo/upcoming/scrape");
}
