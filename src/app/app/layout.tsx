import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { THEME_BOOT } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Moonlets · moonlet",
};

export default function AppLayout({ children }: LayoutProps<"/app">) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      <AppShell>{children}</AppShell>
    </>
  );
}
