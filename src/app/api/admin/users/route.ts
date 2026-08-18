import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { listUsersForAdmin } from "@/lib/repo/admin";

export async function GET(req: Request) {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const search = new URL(req.url).searchParams.get("search") ?? undefined;
  return NextResponse.json({ users: listUsersForAdmin(search) });
}
