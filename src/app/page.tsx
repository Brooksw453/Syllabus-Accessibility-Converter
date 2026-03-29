import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";

const DASHBOARD_URL = process.env.DASHBOARD_URL || "https://courses.esdesigns.org";
const COURSE_SLUG = process.env.COURSE_SLUG || "syllabus-accessibility-converter";

export default async function HomePage() {
  const authed = await isAuthenticated();

  if (authed) {
    redirect("/upload");
  }

  // All auth is handled by the course dashboard
  redirect(`${DASHBOARD_URL}/courses/${COURSE_SLUG}`);
}
