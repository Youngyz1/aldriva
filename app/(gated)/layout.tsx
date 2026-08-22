import { connection } from "next/server";

export default async function GatedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await connection();

  return <>{children}</>;
}
