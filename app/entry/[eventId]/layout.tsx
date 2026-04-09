import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase-admin";

type Props = {
  params: Promise<{ eventId: string }>;
  children: React.ReactNode;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

function storageUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/form-notice-images/${path}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { eventId } = await params;
  const { data: event } = await supabaseAdmin
    .from("events")
    .select("name, event_date, ogp_image_path, banner_image_path")
    .eq("id", eventId)
    .single();

  if (!event) return { title: "参加申込フォーム" };

  const imagePath = event.ogp_image_path || event.banner_image_path;
  const imageUrl = imagePath ? storageUrl(imagePath) : undefined;
  const title = `${event.name} - 参加申込`;
  const description = `${event.name}の参加申込フォーム${event.event_date ? `（${event.event_date}）` : ""}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      ...(imageUrl && { images: [{ url: imageUrl, width: 1200, height: 630 }] }),
    },
    twitter: {
      card: imageUrl ? "summary_large_image" : "summary",
      title,
      ...(imageUrl && { images: [imageUrl] }),
    },
  };
}

export default function EntryLayout({ children }: Props) {
  return children;
}
