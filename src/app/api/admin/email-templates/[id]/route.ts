import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { deleteTemplate } from "@/lib/repo/emailTemplates";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  deleteTemplate(id);
  return NextResponse.json({ deleted: true });
}
