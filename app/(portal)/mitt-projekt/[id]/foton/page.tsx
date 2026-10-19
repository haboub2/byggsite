import { redirect } from "next/navigation";

/** "Foton" became "Dokumentation"; old links and mails land on the diary there. */
export default async function OldPhotosTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/mitt-projekt/${id}/dokumentation`);
}
