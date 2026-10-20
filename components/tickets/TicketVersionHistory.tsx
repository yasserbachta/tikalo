"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TicketVersion } from "@/types/tickets";
import { format } from "date-fns";

interface TicketVersionHistoryProps {
  versions: TicketVersion[];
  selectedIndex: number;
  onVersionChange: (index: number) => void;
}

export function TicketVersionHistory({
  versions,
  selectedIndex,
  onVersionChange,
}: TicketVersionHistoryProps) {
  return (
    <Select
      value={String(selectedIndex)}
      onValueChange={(val) => onVersionChange(Number(val))}
    >
      <SelectTrigger className="w-[240px] h-9 font-mono text-[12px] tracking-wider uppercase">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {versions.map((v, i) => (
          <SelectItem key={v.id} value={String(i)} className="font-mono text-[12px]">
            v{v.versionNumber.toString().padStart(2, "0")} ·{" "}
            {format(new Date(v.createdAt), "dd MMM yyyy")}
            {v.isLatest && " · latest"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
