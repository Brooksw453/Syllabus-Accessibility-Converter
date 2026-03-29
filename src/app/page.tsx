import { redirect } from "next/navigation";

export default async function HomePage() {
  // The tool is publicly accessible — send users directly to the upload page
  redirect("/upload");
}
