import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface BrandProps {
  className?: string;
  variant?: "light" | "dark";
  href?: string;
}

export function Brand({ className, variant = "dark", href = "/tickets" }: BrandProps) {
  const dark = variant === "dark";
  return (
    <Link
      href={href}
      className={cn(
        "group/brand inline-flex items-center gap-2.5",
        className
      )}
    >
      <span
        className={cn(
          "relative grid place-items-center size-9 rounded-xl bg-white overflow-hidden shrink-0 ring-1 ring-inset transition-transform duration-300 group-hover/brand:-rotate-3",
          dark ? "ring-white/15" : "ring-foreground/10"
        )}
        aria-hidden
      >
        <Image
          src="/logo.png"
          alt="Tikalo"
          width={36}
          height={36}
          className="size-7 object-contain"
          priority
          unoptimized
        />
      </span>
      <span className="leading-none">
        <span
          className={cn(
            "font-display font-bold block text-[1.05rem] tracking-tight",
            dark ? "text-sidebar-foreground" : "text-foreground"
          )}
        >
          Tikalo
        </span>
        <span
          className={cn(
            "block text-[9px] font-mono uppercase tracking-[0.24em] mt-0.5",
            dark ? "text-white/40" : "text-muted-foreground"
          )}
        >
          Ticket workspace
        </span>
      </span>
    </Link>
  );
}
