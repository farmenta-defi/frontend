import { Badge } from "@/components/ui/badge";

export function PageHeader({
  title,
  description,
  wip = true,
}: {
  title: string;
  description: string;
  wip?: boolean;
}) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {wip && (
          <Badge variant="outline" className="text-amber-500 border-amber-500/40">
            Contracts not deployed yet
          </Badge>
        )}
      </div>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
