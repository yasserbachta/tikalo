"use client";

import { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  Upload,
  Settings2,
  ChevronRight,
  ChevronDown,
  LogOut,
  Building2,
  LayoutDashboard,
  Ticket,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { Brand } from "./Brand";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  match?: (pathname: string) => boolean;
  hint?: string;
}

const ticketNav: NavItem[] = [
  {
    href: "/tickets",
    label: "Tickets",
    icon: Ticket,
    hint: "All",
    match: (p) =>
      p === "/tickets" ||
      (p.startsWith("/tickets/") &&
        !p.startsWith("/tickets/upload") &&
        !p.startsWith("/tickets/settings")),
  },
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    hint: "Overview",
    match: (p) => p.startsWith("/dashboard"),
  },
  {
    href: "/tickets/upload",
    label: "Upload",
    icon: Upload,
    hint: "New",
    match: (p) => p.startsWith("/tickets/upload"),
  },
  {
    href: "/tickets/settings",
    label: "Settings",
    icon: Settings2,
    hint: "Branding",
    match: (p) => p.startsWith("/tickets/settings"),
  },
];

const adminNav: NavItem[] = [
  {
    href: "/admin/agencies",
    label: "Agencies",
    icon: Building2,
    hint: "Tenants",
    match: (p) => p.startsWith("/admin/agencies"),
  },
];

export interface AgencyBrandInfo {
  id: string;
  name: string;
  slug: string;
  primaryColor: string;
  secondaryColor: string;
  logoPath: string | null;
}

interface AppShellProps {
  children: ReactNode;
  user: {
    email?: string | null;
    name?: string | null;
    role?: string | null;
  };
  agency?: AgencyBrandInfo | null;
  cdnHost?: string;
  variant?: "app" | "admin";
}

export function AppShell({
  children,
  user,
  agency,
  cdnHost,
  variant = "app",
}: AppShellProps) {
  const pathname = usePathname();
  const isAdmin = variant === "admin";
  const items = isAdmin ? adminNav : ticketNav;
  const isSuperAdmin = user.role === "SUPER_ADMIN";
  const initials = (user.name || user.email || "?")
    .split(/[\s@.]+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const accent = agency?.primaryColor;
  const logoUrl =
    agency?.logoPath && cdnHost
      ? `https://${cdnHost}/${agency.logoPath}`
      : null;
  return (
    <div className="h-screen w-full flex flex-col overflow-hidden">
      {/* Top navigation header */}
      <header className="shrink-0 z-30 border-b border-border bg-card/85 backdrop-blur supports-backdrop-filter:bg-card/70">
        <div className="w-full max-w-350 mx-auto px-4 sm:px-5 lg:px-10 h-16 flex items-center gap-2 sm:gap-4 lg:gap-6">
          <Brand variant="light" />

          <span className="hidden sm:block h-7 w-px bg-border" aria-hidden />

          {/* Primary nav */}
          <nav className="flex items-center gap-1">
            {items.map((item) => {
              const active = item.match
                ? item.match(pathname)
                : pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative inline-flex items-center gap-2 h-10 px-2.5 sm:px-3.5 rounded-lg text-sm font-medium transition-colors cursor-pointer",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}>
                  <Icon
                    className={cn(
                      "size-[18px] shrink-0 transition-colors",
                      active
                        ? "text-brand"
                        : "text-muted-foreground group-hover:text-foreground",
                    )}
                  />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Right cluster */}
          <div className="ml-auto flex items-center gap-2 lg:gap-3">
            {/* User menu */}
            <DropdownMenu>
              <DropdownMenuTrigger
                className="group inline-flex items-center gap-2 h-10 pl-1 pr-1.5 sm:pr-2.5 rounded-full border border-transparent hover:border-border hover:bg-muted transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                aria-label="Account menu">
                {logoUrl ? (
                  <span className="size-8 rounded-full bg-white overflow-hidden shrink-0 ring-1 ring-inset ring-border">
                    <Image
                      src={logoUrl}
                      alt={`${agency?.name ?? ""} logo`}
                      width={32}
                      height={32}
                      className="size-full object-cover"
                      unoptimized
                    />
                  </span>
                ) : (
                  <span
                    className="size-8 rounded-full grid place-items-center text-[11px] font-mono font-bold text-white shrink-0"
                    style={{
                      background: accent
                        ? `linear-gradient(135deg, ${accent}, ${accent}cc)`
                        : "linear-gradient(135deg, var(--brand), oklch(0.55 0.20 30))",
                    }}>
                    {initials}
                  </span>
                )}
                <span className="hidden sm:flex flex-col items-start text-left leading-tight">
                  <span className="max-w-[14ch] truncate text-[13px] font-medium text-foreground">
                    {user.name || user.email?.split("@")[0] || "User"}
                  </span>
                  {isSuperAdmin && (
                    <span className="eyebrow text-muted-foreground/70 text-[9px]">
                      {isAdmin ? "Console" : "Studio"}
                    </span>
                  )}
                </span>
                <ChevronDown className="hidden sm:block size-4 text-muted-foreground transition-transform group-data-[popup-open]:rotate-180" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8} className="w-64">
                <div className="px-2 py-2">
                  <p className="text-[13px] font-medium text-foreground truncate">
                    {user.name || user.email?.split("@")[0] || "User"}
                  </p>
                  <p className="text-[12px] text-muted-foreground truncate">
                    {user.email}
                  </p>
                </div>

                {agency && (
                  <>
                    <DropdownMenuSeparator />
                    <div className="flex items-center gap-2.5 px-2 py-1.5">
                      <span
                        aria-hidden
                        className="size-2 rounded-full shrink-0"
                        style={{ background: agency.primaryColor }}
                      />
                      <span className="min-w-0">
                        <span className="block text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                          Agency
                        </span>
                        <span className="block text-[13px] font-medium text-foreground truncate">
                          {agency.name}
                        </span>
                      </span>
                    </div>
                  </>
                )}

                {isSuperAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      render={
                        <Link href={isAdmin ? "/tickets" : "/admin/agencies"} />
                      }
                      className="cursor-pointer">
                      {isAdmin ? <ArrowLeftRight /> : <Settings2 />}
                      {isAdmin ? "Back to workspace" : "Admin console"}
                    </DropdownMenuItem>
                  </>
                )}

                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="cursor-pointer">
                  <LogOut />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Main — independent scroll */}
      <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
    </div>
  );
}

interface PageHeaderProps {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  breadcrumbs,
}: PageHeaderProps) {
  return (
    <div className="relative reveal">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-muted-foreground mb-4">
          {breadcrumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="size-3 opacity-40" />}
              {c.href ? (
                <Link
                  href={c.href}
                  className="hover:text-foreground transition-colors">
                  {c.label}
                </Link>
              ) : (
                <span className="text-foreground/70">{c.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div className="space-y-2 max-w-2xl">
          {eyebrow && <p className="eyebrow text-brand">{eyebrow}</p>}
          <h1 className="display text-3xl lg:text-[2.4rem] leading-[1.05] font-medium text-foreground">
            {title}
          </h1>
          {description && (
            <p className="text-[15px] text-muted-foreground leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>
      <div className="relative mt-6">
        <div className="horizon-rule text-foreground" />
        <span className="swoosh absolute left-0 -top-px" aria-hidden />
      </div>
    </div>
  );
}

interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div
      className={cn(
        "w-full max-w-[1400px] mx-auto px-5 lg:px-10 py-8 lg:py-10 pb-12",
        className,
      )}>
      {children}
    </div>
  );
}
