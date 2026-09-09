import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { listUsersForAdmin } from "@/lib/repo/admin";

export async function GET(req: Request) {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const search = url.searchParams.get("search") ?? undefined;
  // 1-based, same convention as the admin UI's page state -- defaults to 1
  // and falls back to 1 for anything non-numeric/invalid rather than
  // erroring, since this only ever comes from our own pager controls.
  const pageParam = Number(url.searchParams.get("page"));
  const page = Number.isFinite(pageParam) && pageParam >= 1 ? pageParam : 1;
  const { users, total } = listUsersForAdmin(search, page, 20);
  return NextResponse.json({ users, total, page, pageSize: 20 });
}
