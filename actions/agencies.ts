"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { revokeAgencySessions } from "@/lib/session";

// Server Actions for the super-admin Agencies back-office (writes only — reads
// live in lib/data/agency.ts). Operator-only; every action re-checks the role
// from the session and never trusts the client.
type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const ADMIN_PATH = "/admin/agencies";

// Turn a Zod failure into a message that names the offending field, so the
// client toast can say *what* is wrong instead of a generic "Invalid data".
function fieldError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid data";
  const field = issue.path.join(".");
  const labels: Record<string, string> = {
    name: "Agency name",
    email: "Agency email",
    slug: "Slug",
    contactEmail: "Contact email",
    contactWebsite: "Website",
    adminName: "Admin name",
    adminEmail: "Admin email",
    adminPassword: "Admin password",
    expiryDate: "Expiry date",
    amountPaid: "Amount paid",
    plan: "Plan",
  };
  const label = labels[field] ?? field ?? "Form";
  return `${label}: ${issue.message}`;
}

async function requireSuperAdmin(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Unauthorized" };
  if (session.user.role !== "SUPER_ADMIN") {
    return { ok: false, error: "Forbidden" };
  }
  return { ok: true };
}

// Treat empty/whitespace-only optional fields as "not provided" so a blank
// optional input never trips a format check (e.g. empty contact email).
const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v) => (v === "" ? undefined : v))
  .pipe(z.string().email().optional())
  .optional();

// Date inputs arrive as "YYYY-MM-DD" strings (or "" when blank). Coerce to a
// Date, treating empty/missing as an explicit null (no expiry).
const optionalDate = z
  .preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.coerce.date().nullable(),
  )
  .optional();

// Amount paid: a whole, non-negative number; blank clears it.
const optionalAmount = z
  .preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.number().int().nonnegative().nullable(),
  )
  .optional();

const createAgencySchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    // Slugify free text: spaces/punctuation → hyphens, trim stray hyphens.
    .transform((s) => s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""))
    .pipe(
      z
        .string()
        .min(1, "Enter an agency slug")
        .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers, and hyphens only"),
    ),
  logoPath: z.string().nullable().optional(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  contactPhone: optionalText,
  contactEmail: optionalEmail,
  contactWebsite: optionalText,
  addressLine1: optionalText,
  addressLine2: optionalText,
  expiryDate: optionalDate,
  amountPaid: optionalAmount,
  // Billing plan — TRIAL caps uploads, PREMIUM is unlimited. Defaults to TRIAL.
  plan: z.enum(["TRIAL", "PREMIUM"]).default("TRIAL"),
  // Admin user to create alongside the agency.
  adminName: z.string().trim().min(1),
  adminEmail: z.string().trim().toLowerCase().email(),
  adminPassword: z.string().min(6),
});

// PDF template selection — mirrors the Prisma PdfTemplate enum.
const pdfTemplateEnum = z.enum([
  "CLASSIC",
  "EDITORIAL",
  "PREMIUM",
  "BOLD",
  "WALLET",
  "TIMELINE",
]);

// Self-service: the editable subset an agency user may change about their own
// agency — logo, theme colors + contact details that surface on exported PDFs.
// No name/slug/email/status (those stay super-admin only).
const updateMyAgencySchema = z.object({
  slogan: z.string().nullable().optional(),
  logoPath: z.string().nullable().optional(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  pdfTemplate: pdfTemplateEnum.optional(),
  pdfPaletteKey: z.string().optional(),
  contactPhone: z.string().nullable().optional(),
  contactEmail: z.string().email().nullable().optional(),
  contactWebsite: z.string().nullable().optional(),
  addressLine1: z.string().nullable().optional(),
  addressLine2: z.string().nullable().optional(),
});

const updateAgencySchema = z.object({
  name: z.string().trim().min(1).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .transform((s) => s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""))
    .pipe(z.string().min(1).regex(/^[a-z0-9-]+$/))
    .optional(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  pdfTemplate: pdfTemplateEnum.optional(),
  pdfPaletteKey: z.string().optional(),
  contactPhone: z.string().nullable().optional(),
  contactEmail: z.string().email().nullable().optional(),
  contactWebsite: z.string().nullable().optional(),
  addressLine1: z.string().nullable().optional(),
  addressLine2: z.string().nullable().optional(),
  logoPath: z.string().nullable().optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  plan: z.enum(["TRIAL", "PREMIUM"]).optional(),
  maritimeEditorEnabled: z.boolean().optional(),
  expiryDate: optionalDate,
  amountPaid: optionalAmount,
});

export async function createAgency(input: unknown): Promise<ActionResult> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard;

  const parsed = createAgencySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: fieldError(parsed.error) };

  const { adminName, adminEmail, adminPassword, ...agencyData } = parsed.data;

  const existingAgency = await db.agency.findFirst({
    where: { OR: [{ email: agencyData.email }, { slug: agencyData.slug }] },
  });
  if (existingAgency) {
    return { ok: false, error: "Agency with this email or slug already exists" };
  }

  const existingUser = await db.user.findUnique({ where: { email: adminEmail } });
  if (existingUser) {
    return { ok: false, error: "A user with this admin email already exists" };
  }

  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  const agency = await db.$transaction(async (tx) => {
    const created = await tx.agency.create({ data: agencyData });
    await tx.user.create({
      data: {
        name: adminName,
        email: adminEmail,
        password: hashedPassword,
        role: "AGENCY_ADMIN",
        agencyId: created.id,
      },
    });
    return created;
  });

  revalidatePath(ADMIN_PATH);
  return { ok: true, id: agency.id };
}

export async function updateAgency(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard;

  const parsed = updateAgencySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: fieldError(parsed.error) };

  const existing = await db.agency.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Agency not found" };

  await db.agency.update({ where: { id }, data: parsed.data });

  // A token carries the agency's expiry/role; suspending an agency or moving its
  // expiry must take effect now, not after the JWT revalidation window. Bump the
  // tokenVersion of every user in the agency so their next request re-checks.
  const nowSuspended =
    parsed.data.status === "SUSPENDED" && existing.status !== "SUSPENDED";
  const expiryChanged =
    parsed.data.expiryDate !== undefined &&
    (parsed.data.expiryDate?.getTime() ?? null) !==
      (existing.expiryDate?.getTime() ?? null);
  // The plan rides the JWT (session.user.agencyPlan) — a TRIAL→PREMIUM upgrade
  // must lift the upload cap immediately, not after the revalidation window.
  const planChanged =
    parsed.data.plan !== undefined && parsed.data.plan !== existing.plan;
  if (nowSuspended || expiryChanged || planChanged) {
    await revokeAgencySessions(id);
  }

  revalidatePath(ADMIN_PATH);
  revalidatePath(`${ADMIN_PATH}/${id}`);
  return { ok: true };
}

// Self-service update: an agency user editing their *own* agency. The target is
// always the session's agencyId — a client-supplied id is never trusted, so an
// agency user can only ever modify their own tenant.
export async function updateMyAgency(input: unknown): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Unauthorized" };
  const agencyId = session.user.agencyId;
  if (!agencyId) return { ok: false, error: "No agency assigned" };

  const parsed = updateMyAgencySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: fieldError(parsed.error) };

  await db.agency.update({ where: { id: agencyId }, data: parsed.data });

  revalidatePath("/tickets/settings");
  revalidatePath("/tickets");
  return { ok: true };
}

export async function deleteAgency(id: string): Promise<ActionResult> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard;

  const agency = await db.agency.findUnique({
    where: { id },
    include: { _count: { select: { tickets: true } } },
  });
  if (!agency) return { ok: false, error: "Agency not found" };

  if (agency._count.tickets > 0) {
    return {
      ok: false,
      error: "Cannot delete agency with existing tickets. Suspend it instead.",
    };
  }

  await db.$transaction(async (tx) => {
    await tx.user.deleteMany({ where: { agencyId: id } });
    await tx.agency.delete({ where: { id } });
  });

  revalidatePath(ADMIN_PATH);
  return { ok: true };
}
