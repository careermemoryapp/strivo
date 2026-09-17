import { redirect } from "next/navigation";

// See the redirect comment in ../page.tsx -- same reasoning, preserving the
// specific quiz someone was linked to rather than sending everyone to the
// generic hub.
export default async function CareerProfileQuizRedirectPage({ params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  redirect(`/quiz/${quizId}`);
}
