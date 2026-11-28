import { IconLoader2 as Loader2 } from "@tabler/icons-react";

export default function RolesLoading() {
  return (
    <div className="flex justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
    </div>
  );
}
