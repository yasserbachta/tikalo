"use client";

import { useEffect, useState } from "react";
import {
  useForm,
  useFieldArray,
  type Control,
  type FieldPath,
  type UseFormReturn,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  MoveRight,
  Ship,
  Lock,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ticketDataSchemaBase,
  type TicketData,
  type TicketType,
  type DirectionKind,
  type FlightLeg,
  type FlightDirection,
  type MaritimeLeg,
  type MaritimeDirection,
  type Passenger,
  type Fee,
} from "@/lib/tickets/schema";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { FeeBreakdownEditor } from "./FeeBreakdownEditor";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface TicketFieldsFormProps {
  defaultValues: Partial<TicketData>;
  onChange: (values: Partial<TicketData>, isDirty: boolean) => void;
  formRef: React.MutableRefObject<{
    getValues: () => Partial<TicketData>;
  } | null>;
}

// The Zod ticket schema makes every array/field nullish, which defeats
// react-hook-form's static path resolution for the deep, indexed field names
// used below (e.g. `directions.0.legs.1.airline`). We cast those dynamic paths
// to the real RHF path type rather than `any`, keeping the form typed elsewhere.
type FieldName = FieldPath<Partial<TicketData>>;

// A control cast whose field-array paths (`directions`, `directions.N.legs`,
// `maritimeDirections`, `maritimeDirections.N.legs`, `passengers`) resolve for
// useFieldArray at every nesting level.
type ArrayControl = Control<{
  passengers: Passenger[];
  directions: FlightDirection[];
  maritimeDirections: MaritimeDirection[];
}>;

type FormApi = UseFormReturn<Partial<TicketData>>;

const TICKET_TYPE_LABELS: Record<TicketType, string> = {
  ONE_WAY: "Aller simple",
  ROUND_TRIP: "Aller-retour",
  MULTI_LEG: "Multi-destinations",
  MARITIME: "Maritime",
};

const DIRECTION_KIND_LABELS: Record<DirectionKind, string> = {
  OUTBOUND: "Aller",
  RETURN: "Retour",
  ONWARD: "Autre trajet",
};

function formatShortDate(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return format(parseISO(value), "d MMM", { locale: fr });
  } catch {
    return null;
  }
}

function RouteSummary({
  from,
  to,
  date,
}: {
  from: string | null | undefined;
  to: string | null | undefined;
  date: string | null | undefined;
}) {
  const formattedDate = formatShortDate(date);
  return (
    <span className="flex items-center gap-1.5 min-w-0 font-mono text-[13px] tracking-wide font-normal">
      <span className="truncate">{from || "—"}</span>
      <MoveRight className="size-3.5 text-muted-foreground shrink-0" />
      <span className="truncate">{to || "—"}</span>
      {formattedDate && (
        <span className="text-[11px] text-muted-foreground shrink-0">
          · {formattedDate}
        </span>
      )}
    </span>
  );
}

function ItineraryStop({
  label,
  variant,
  last,
  children,
}: {
  label: string;
  variant: "from" | "to";
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={[
        "rounded-lg border p-3.5",
        variant === "from"
          ? "border-brand/15 border-l-2 border-l-brand/70 bg-brand-soft/25"
          : "border-tide/15 border-l-2 border-l-tide/70 bg-tide-soft/25",
        last ? "" : "mb-3",
      ].join(" ")}
    >
      <p className="eyebrow text-foreground/75 mb-3 flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className={
            variant === "from"
              ? "size-1.5 rounded-full bg-brand"
              : "size-1.5 rounded-full bg-tide"
          }
        />
        {label}
      </p>
      {children}
    </div>
  );
}

function FieldGroupLabel({ children }: { children: React.ReactNode }) {
  return <p className="eyebrow text-foreground/75 mb-3">{children}</p>;
}

function SectionHeading({
  step,
  title,
  action,
  locked,
}: {
  step: string;
  title: string;
  action?: React.ReactNode;
  locked?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span
        className={cn(
          "size-7 shrink-0 grid place-items-center rounded-lg text-[10px] font-mono font-semibold",
          locked
            ? "bg-muted text-muted-foreground"
            : "bg-brand-soft/60 text-brand",
        )}
      >
        {step}
      </span>
      <h3
        className={cn(
          "display text-[15px] font-medium whitespace-nowrap",
          locked ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {title}
      </h3>
      {locked && (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          <Lock className="size-2.5" aria-hidden="true" />
          Verrouillé
        </span>
      )}
      <div className="h-px flex-1 bg-border" aria-hidden="true" />
      {action}
    </div>
  );
}

const DEFAULT_LEG: FlightLeg = {
  flightNumber: "",
  airline: "",
  departureAirport: "",
  departureCity: "",
  arrivalAirport: "",
  arrivalCity: "",
  departureDate: "",
  departureTime: "",
  arrivalDate: null,
  arrivalTime: null,
  seatNumber: null,
  cabin: null,
  baggageAllowance: null,
  aircraft: null,
};

const DEFAULT_MARITIME_LEG: MaritimeLeg = {
  shipName: "",
  company: "",
  departurePort: "",
  departureCity: "",
  arrivalPort: "",
  arrivalCity: "",
  departureDate: "",
  departureTime: "",
  arrivalDate: null,
  arrivalTime: null,
  duration: null,
  cabinType: null,
  cabinNumber: null,
  hasVehicle: false,
  vehicleType: null,
  vehiclePlate: null,
  deckNumber: null,
};

// ---------------------------------------------------------------------------
// Flight leg fields — one connecting flight within a direction. `prefix` is the
// RHF field path to this leg, e.g. `directions.0.legs.1`.
// ---------------------------------------------------------------------------

function FlightLegFields({
  form,
  prefix,
}: {
  form: FormApi;
  prefix: string;
}) {
  const stringControl = form.control as unknown as Control<
    Record<string, string>
  >;
  const [feesOpen, setFeesOpen] = useState(false);
  const fees =
    (form.watch(`${prefix}.feeBreakdown` as FieldName) as Fee[] | undefined) ??
    [];

  return (
    <CardContent className="px-4 py-4 space-y-5">
      {/* Flight info */}
      <div>
        <FieldGroupLabel>Vol</FieldGroupLabel>
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={stringControl}
            name={`${prefix}.airline` as FieldName}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Compagnie</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={stringControl}
            name={`${prefix}.flightNumber` as FieldName}
            render={({ field }) => (
              <FormItem>
                <FormLabel>N° de vol</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    className="font-mono uppercase tracking-wide"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      {/* Departure → Arrival itinerary */}
      <div>
        <ItineraryStop label="Départ" variant="from">
          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={stringControl}
              name={`${prefix}.departureAirport` as FieldName}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Aéroport</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      className="font-mono uppercase tracking-wide"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={stringControl}
              name={`${prefix}.departureCity` as FieldName}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ville</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={stringControl}
              name={`${prefix}.departureDate` as FieldName}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={stringControl}
              name={`${prefix}.departureTime` as FieldName}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Heure</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </ItineraryStop>

        <ItineraryStop label="Arrivée" variant="to" last>
          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={stringControl}
              name={`${prefix}.arrivalAirport` as FieldName}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Aéroport</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      className="font-mono uppercase tracking-wide"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={stringControl}
              name={`${prefix}.arrivalCity` as FieldName}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ville</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={stringControl}
              name={`${prefix}.arrivalDate` as FieldName}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={stringControl}
              name={`${prefix}.arrivalTime` as FieldName}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Heure</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </ItineraryStop>
      </div>

      {/* Details */}
      <div>
        <FieldGroupLabel>Détails</FieldGroupLabel>
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={stringControl}
            name={`${prefix}.seatNumber` as FieldName}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Siège</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={stringControl}
            name={`${prefix}.cabin` as FieldName}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cabine</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value ?? ""}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="Economy">Economy</SelectItem>
                    <SelectItem value="Business">Business</SelectItem>
                    <SelectItem value="First">First</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={stringControl}
            name={`${prefix}.baggageAllowance` as FieldName}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Bagages</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={stringControl}
            name={`${prefix}.aircraft` as FieldName}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Appareil</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      {/* Fee Breakdown */}
      <Collapsible open={feesOpen} onOpenChange={setFeesOpen}>
        <CollapsibleTrigger className="inline-flex items-center w-full justify-start gap-1.5 h-8 px-3 rounded-md border border-dashed border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 hover:border-solid transition-colors cursor-pointer">
          {feesOpen ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          Détail des frais
          {fees.length > 0 ? ` (${fees.length})` : ""}
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <FeeBreakdownEditor
            fees={fees}
            onChange={(next) =>
              form.setValue(`${prefix}.feeBreakdown` as FieldName, next, {
                shouldDirty: true,
              })
            }
            currency={form.watch("currency") ?? undefined}
          />
        </CollapsibleContent>
      </Collapsible>
    </CardContent>
  );
}

// ---------------------------------------------------------------------------
// Flight direction card — one bound of travel (Aller / Retour / Autre) holding
// one or more connecting legs.
// ---------------------------------------------------------------------------

function FlightDirectionCard({
  form,
  directionIndex,
  editable,
  canRemove,
  onRemove,
}: {
  form: FormApi;
  directionIndex: number;
  editable: boolean;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const arrayControl = form.control as unknown as ArrayControl;
  const {
    fields: legFields,
    append: appendLeg,
    remove: removeLeg,
  } = useFieldArray({
    control: arrayControl,
    name: `directions.${directionIndex}.legs` as `directions.${number}.legs`,
  });

  const kind = form.watch(
    `directions.${directionIndex}.kind` as FieldName,
  ) as DirectionKind | undefined;

  return (
    <div className="rounded-xl border border-border/70 bg-muted/10 p-3.5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {editable ? (
            <FormField
              control={form.control as unknown as Control<Record<string, string>>}
              name={`directions.${directionIndex}.kind` as FieldName}
              render={({ field }) => (
                <Select
                  onValueChange={field.onChange}
                  value={field.value ?? "OUTBOUND"}
                >
                  <SelectTrigger className="h-7 w-[150px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      Object.entries(DIRECTION_KIND_LABELS) as [
                        DirectionKind,
                        string,
                      ][]
                    ).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          ) : (
            <Badge variant="secondary" className="text-xs shrink-0">
              {kind ? DIRECTION_KIND_LABELS[kind] : "Trajet"}
            </Badge>
          )}
          <span className="text-[11px] text-muted-foreground">
            {legFields.length > 1
              ? `${legFields.length} vols (correspondance)`
              : "Vol direct"}
          </span>
        </div>
        {editable && canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-red-500 hover:text-red-600"
            onClick={onRemove}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {legFields.map((legField, li) => {
          const prefix = `directions.${directionIndex}.legs.${li}`;
          const depAirport = form.watch(`${prefix}.departureAirport` as FieldName) as string | undefined;
          const depCity = form.watch(`${prefix}.departureCity` as FieldName) as string | undefined;
          const arrAirport = form.watch(`${prefix}.arrivalAirport` as FieldName) as string | undefined;
          const arrCity = form.watch(`${prefix}.arrivalCity` as FieldName) as string | undefined;
          const depDate = form.watch(`${prefix}.departureDate` as FieldName) as string | undefined;
          return (
            <Card key={legField.id} className="overflow-hidden">
              <CardHeader className="py-2.5 px-4 border-b border-border/60 bg-muted/30">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      Vol {li + 1}
                    </Badge>
                    <RouteSummary
                      from={depAirport || depCity}
                      to={arrAirport || arrCity}
                      date={depDate}
                    />
                  </CardTitle>
                  {legFields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-600"
                      onClick={() => removeLeg(li)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <FlightLegFields form={form} prefix={prefix} />
            </Card>
          );
        })}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full border-dashed"
        onClick={() => appendLeg({ ...DEFAULT_LEG })}
      >
        <Plus className="h-3 w-3 mr-1" />
        Ajouter une correspondance
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Maritime leg fields — one crossing within a maritime direction. `prefix` is
// the RHF field path, e.g. `maritimeDirections.0.legs.0`.
// ---------------------------------------------------------------------------

function MaritimeLegFields({
  form,
  prefix,
  locked,
}: {
  form: FormApi;
  prefix: string;
  locked: boolean;
}) {
  const stringControl = form.control as unknown as Control<
    Record<string, string>
  >;
  const [feesOpen, setFeesOpen] = useState(false);
  const hasVehicle = form.watch(`${prefix}.hasVehicle` as FieldName) as
    | boolean
    | undefined;
  const fees =
    (form.watch(`${prefix}.feeBreakdown` as FieldName) as Fee[] | undefined) ??
    [];

  return (
    <fieldset
      disabled={locked}
      className={cn(
        "min-w-0 border-0 m-0 p-0 space-y-5",
        locked && "opacity-70",
      )}
    >
      {/* Ship info */}
      <div>
        <FieldGroupLabel>Navire</FieldGroupLabel>
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={stringControl}
            name={`${prefix}.shipName` as FieldName}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nom du navire</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={stringControl}
            name={`${prefix}.company` as FieldName}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Compagnie</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      {/* Departure → Arrival itinerary */}
      <div>
        <ItineraryStop label="Embarquement" variant="from">
          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={stringControl}
              name={`${prefix}.departurePort` as FieldName}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Port</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={stringControl}
              name={`${prefix}.departureCity` as FieldName}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ville</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={stringControl}
              name={`${prefix}.departureDate` as FieldName}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={stringControl}
              name={`${prefix}.departureTime` as FieldName}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Heure</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </ItineraryStop>

        <ItineraryStop label="Débarquement" variant="to" last>
          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={stringControl}
              name={`${prefix}.arrivalPort` as FieldName}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Port</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={stringControl}
              name={`${prefix}.arrivalCity` as FieldName}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ville</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={stringControl}
              name={`${prefix}.arrivalDate` as FieldName}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={stringControl}
              name={`${prefix}.arrivalTime` as FieldName}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Heure</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </ItineraryStop>
      </div>

      {/* Cabin */}
      <div>
        <p className="eyebrow text-foreground/70 mb-2">Cabine</p>
        <div className="grid grid-cols-3 gap-3">
          <FormField
            control={stringControl}
            name={`${prefix}.cabinType` as FieldName}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Type</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={stringControl}
            name={`${prefix}.cabinNumber` as FieldName}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Numéro</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={stringControl}
            name={`${prefix}.deckNumber` as FieldName}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Pont</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      {/* Vehicle */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <Switch
            checked={!!hasVehicle}
            onCheckedChange={(checked) =>
              form.setValue(`${prefix}.hasVehicle` as FieldName, checked, {
                shouldDirty: true,
              })
            }
          />
          <Label className="eyebrow text-foreground/75">Véhicule</Label>
        </div>
        {hasVehicle && (
          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={stringControl}
              name={`${prefix}.vehicleType` as FieldName}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={stringControl}
              name={`${prefix}.vehiclePlate` as FieldName}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Immatriculation</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      className="font-mono uppercase tracking-wide"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}
      </div>

      {/* Fee Breakdown — hidden for maritime (the carrier PDF is preserved, so
          fees can't be rendered onto it). */}
      {!locked && (
        <Collapsible open={feesOpen} onOpenChange={setFeesOpen}>
          <CollapsibleTrigger className="inline-flex items-center w-full justify-start gap-1.5 h-8 px-3 rounded-md border border-dashed border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 hover:border-solid transition-colors cursor-pointer">
            {feesOpen ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            Détail des frais
            {fees.length > 0 ? ` (${fees.length})` : ""}
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <FeeBreakdownEditor
              fees={fees}
              onChange={(next) =>
                form.setValue(`${prefix}.feeBreakdown` as FieldName, next, {
                  shouldDirty: true,
                })
              }
              currency={form.watch("currency") ?? undefined}
            />
          </CollapsibleContent>
        </Collapsible>
      )}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Maritime direction card — one bound of a ferry trip, holding its crossings.
// ---------------------------------------------------------------------------

function MaritimeDirectionCard({
  form,
  directionIndex,
  locked,
  canRemove,
  onRemove,
  defaultOpen,
}: {
  form: FormApi;
  directionIndex: number;
  locked: boolean;
  canRemove: boolean;
  onRemove: () => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const kind = form.watch(
    `maritimeDirections.${directionIndex}.kind` as FieldName,
  ) as DirectionKind | undefined;
  // Ferries are effectively always single-crossing per bound; render the first
  // (and only) leg. The nested legs array still exists for schema symmetry.
  const prefix = `maritimeDirections.${directionIndex}.legs.0`;
  const depCity = form.watch(`${prefix}.departureCity` as FieldName) as string | undefined;
  const arrCity = form.watch(`${prefix}.arrivalCity` as FieldName) as string | undefined;
  const depDate = form.watch(`${prefix}.departureDate` as FieldName) as string | undefined;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="py-2.5 px-4 border-b border-border/60 bg-muted/30">
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="flex items-center gap-2 text-left"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            <CardTitle className="text-sm flex items-center gap-2 min-w-0">
              <span className="shrink-0">
                {kind ? DIRECTION_KIND_LABELS[kind] : `Traversée ${directionIndex + 1}`}
              </span>
              <RouteSummary from={depCity} to={arrCity} date={depDate} />
            </CardTitle>
          </button>
          {!locked && canRemove && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-red-500 hover:text-red-600"
              onClick={onRemove}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </CardHeader>
      {open && (
        <CardContent className="px-4 py-4">
          <MaritimeLegFields form={form} prefix={prefix} locked={locked} />
        </CardContent>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main form
// ---------------------------------------------------------------------------

export function TicketFieldsForm({
  defaultValues,
  onChange,
  formRef,
}: TicketFieldsFormProps) {
  const form = useForm<Partial<TicketData>>({
    resolver: zodResolver(ticketDataSchemaBase.partial()),
    defaultValues,
  });

  const arrayControl = form.control as unknown as ArrayControl;

  const {
    fields: passengerFields,
    append: appendPassenger,
    remove: removePassenger,
  } = useFieldArray({ control: arrayControl, name: "passengers" });

  const {
    fields: directionFields,
    append: appendDirection,
    remove: removeDirection,
    replace: replaceDirections,
  } = useFieldArray({ control: arrayControl, name: "directions" });

  const {
    fields: maritimeDirectionFields,
    append: appendMaritimeDirection,
    remove: removeMaritimeDirection,
    replace: replaceMaritimeDirections,
  } = useFieldArray({ control: arrayControl, name: "maritimeDirections" });

  // Every <FormField> below drives a string <Input>/<Select>. The schema's
  // nullish fields defeat RHF's path inference, so we present the control as a
  // string-keyed record for those inputs.
  const stringControl = form.control as unknown as Control<
    Record<string, string>
  >;

  const ticketType = form.watch("type");
  const isMaritime = ticketType === "MARITIME";
  const isMultiLeg = ticketType === "MULTI_LEG";
  // Maritime tickets keep the carrier's original PDF; only the resale price is
  // applied. So every field except the price is read-only.
  const locked = isMaritime;

  const oneLeg = (): FlightDirection["legs"] => [{ ...DEFAULT_LEG }];

  // Auto-adjust the direction list when the ticket type changes. Direction
  // COUNT maps to the type; the leg count within each direction is free (an
  // agent adds connections independently).
  useEffect(() => {
    if (!ticketType) return;

    if (ticketType === "MARITIME") {
      const dirs = form.getValues("maritimeDirections") ?? [];
      if (dirs.length === 0) {
        replaceMaritimeDirections([
          { kind: "OUTBOUND", legs: [{ ...DEFAULT_MARITIME_LEG }] },
        ]);
      }
      return;
    }

    const dirs = form.getValues("directions") ?? [];
    if (ticketType === "ONE_WAY") {
      if (dirs.length === 0) {
        replaceDirections([{ kind: "OUTBOUND", legs: oneLeg() }]);
      } else if (dirs.length > 1) {
        replaceDirections([{ ...dirs[0], kind: "OUTBOUND" }]);
      } else {
        form.setValue("directions.0.kind" as FieldName, "OUTBOUND");
      }
    } else if (ticketType === "ROUND_TRIP") {
      if (dirs.length === 0) {
        replaceDirections([
          { kind: "OUTBOUND", legs: oneLeg() },
          { kind: "RETURN", legs: oneLeg() },
        ]);
      } else if (dirs.length === 1) {
        appendDirection({ kind: "RETURN", legs: oneLeg() });
        form.setValue("directions.0.kind" as FieldName, "OUTBOUND");
      } else if (dirs.length > 2) {
        replaceDirections([
          { ...dirs[0], kind: "OUTBOUND" },
          { ...dirs[1], kind: "RETURN" },
        ]);
      } else {
        form.setValue("directions.0.kind" as FieldName, "OUTBOUND");
        form.setValue("directions.1.kind" as FieldName, "RETURN");
      }
    } else if (ticketType === "MULTI_LEG") {
      if (dirs.length === 0) {
        replaceDirections([{ kind: "OUTBOUND", legs: oneLeg() }]);
      }
    }
  }, [ticketType]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (formRef) {
      formRef.current = { getValues: () => form.getValues() };
    }
  }, [form, formRef]);

  useEffect(() => {
    const subscription = form.watch((values, { name }) => {
      if (name) {
        onChange(values as Partial<TicketData>, true);
      }
    });
    return () => subscription.unsubscribe();
  }, [form, onChange]);

  const addReturnMaritimeDirection = () => {
    const dirs = form.getValues("maritimeDirections") ?? [];
    if (dirs.length === 1) {
      const firstLeg = dirs[0].legs?.[0];
      appendMaritimeDirection({
        kind: "RETURN",
        legs: [
          {
            ...DEFAULT_MARITIME_LEG,
            shipName: firstLeg?.shipName ?? "",
            company: firstLeg?.company ?? "",
            departurePort: firstLeg?.arrivalPort ?? "",
            departureCity: firstLeg?.arrivalCity ?? "",
            arrivalPort: firstLeg?.departurePort ?? "",
            arrivalCity: firstLeg?.departureCity ?? "",
            hasVehicle: firstLeg?.hasVehicle ?? false,
            vehicleType: firstLeg?.vehicleType ?? null,
            vehiclePlate: firstLeg?.vehiclePlate ?? null,
            cabinType: firstLeg?.cabinType ?? null,
          },
        ],
      });
    }
  };

  return (
    <Form {...form}>
      <form className="ticket-form space-y-8 p-5 lg:p-6">
        {/* Maritime lock notice */}
        {locked && (
          <div className="relative overflow-hidden rounded-xl border border-brand/20 bg-gradient-to-br from-brand-soft/40 to-tide-soft/20 px-4 py-3.5">
            <div className="flex items-start gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
                <Lock className="size-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <Ship className="size-3.5 text-brand" aria-hidden="true" />
                  Billet maritime — champs verrouillés
                </p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
                  Le PDF original du transporteur est conservé tel quel. Seul le{" "}
                  <span className="font-medium text-foreground">prix</span> peut
                  être modifié : il remplacera le prix imprimé sur le billet. Tous
                  les autres champs sont en lecture seule.
                </p>
              </div>
            </div>
          </div>
        )}
        {/* Type */}
        <div className={cn(locked && "opacity-70")}>
          <SectionHeading step="01" title="Type de billet" locked={locked} />
          <FormField
            control={stringControl}
            name="type"
            render={({ field }) => (
              <FormItem>
                <Select
                  onValueChange={field.onChange}
                  value={field.value ?? ""}
                  disabled={locked}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner le type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {(
                      Object.entries(TICKET_TYPE_LABELS) as [
                        TicketType,
                        string,
                      ][]
                    ).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        {/* Passengers */}
        <div className={cn(locked && "opacity-70")}>
          <SectionHeading
            step="02"
            title="Passagers"
            locked={locked}
            action={
              !locked && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    appendPassenger({ name: "", ticketNumber: null })
                  }
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Ajouter
                </Button>
              )
            }
          />
          <fieldset disabled={locked} className="min-w-0 border-0 m-0 p-0">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="grid grid-cols-2 gap-2 flex-1">
                <span className="eyebrow">Nom</span>
                <span className="eyebrow">N° billet</span>
              </div>
              {passengerFields.length > 1 && (
                <span className="w-9 shrink-0" aria-hidden="true" />
              )}
            </div>
            <div className="space-y-2">
              {passengerFields.map((pField, index) => (
                <div key={pField.id} className="flex items-center gap-2">
                  <div className="grid grid-cols-2 gap-2 flex-1">
                    <FormField
                      control={stringControl}
                      name={`passengers.${index}.name` as FieldName}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="sr-only">Nom</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value ?? ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={stringControl}
                      name={`passengers.${index}.ticketNumber` as FieldName}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="sr-only">N° billet</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value ?? ""}
                              className="font-mono tracking-wide"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  {!locked && passengerFields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-9 shrink-0 text-red-500 hover:text-red-600"
                      onClick={() => removePassenger(index)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </fieldset>
        </div>
        {/* Show fee breakdown toggle — not applicable to maritime. */}
        {!locked && (
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-muted/20 px-3.5 py-3">
            <div className="grid gap-1 leading-none">
              <Label
                htmlFor="showFeeBreakdownInPdf"
                className="text-sm font-medium"
              >
                Afficher le détail des frais sur le PDF exporté
              </Label>
              <p className="text-xs text-muted-foreground">
                Quand activé, le PDF généré inclura un détail des frais sous
                chaque vol.
              </p>
            </div>
            <Switch
              id="showFeeBreakdownInPdf"
              checked={form.watch("showFeeBreakdownInPdf") ?? false}
              onCheckedChange={(checked) =>
                form.setValue("showFeeBreakdownInPdf", checked, {
                  shouldDirty: true,
                })
              }
            />
          </div>
        )}
        {/* Flight directions */}
        {!isMaritime && (
          <div>
            <SectionHeading
              step="03"
              title="Trajets & vols"
              action={
                isMultiLeg && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      appendDirection({ kind: "ONWARD", legs: oneLeg() })
                    }
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Ajouter un trajet
                  </Button>
                )
              }
            />
            <div className="space-y-4">
              {directionFields.map((dField, di) => (
                <FlightDirectionCard
                  key={dField.id}
                  form={form}
                  directionIndex={di}
                  editable={isMultiLeg}
                  canRemove={directionFields.length > 1}
                  onRemove={() => removeDirection(di)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Maritime directions */}
        {isMaritime && (
          <div>
            <SectionHeading
              step="03"
              title="Traversées maritimes"
              locked={locked}
              action={
                !locked && (
                  <div className="flex gap-2">
                    {maritimeDirectionFields.length === 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addReturnMaritimeDirection}
                      >
                        <Ship className="h-3 w-3 mr-1" />
                        Ajouter retour
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        appendMaritimeDirection({
                          kind: "ONWARD",
                          legs: [{ ...DEFAULT_MARITIME_LEG }],
                        })
                      }
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Ajouter
                    </Button>
                  </div>
                )
              }
            />
            <div className="space-y-4">
              {maritimeDirectionFields.map((dField, di) => (
                <MaritimeDirectionCard
                  key={dField.id}
                  form={form}
                  directionIndex={di}
                  locked={locked}
                  canRemove={maritimeDirectionFields.length > 1}
                  onRemove={() => removeMaritimeDirection(di)}
                  defaultOpen={di === 0}
                />
              ))}
            </div>
          </div>
        )}

        {/* Booking / Tarif */}
        <div>
          <SectionHeading step="04" title="Réservation & Tarif" />
          {locked && (
            <p className="-mt-2 mb-4 text-[13px] text-muted-foreground">
              Seul le prix est modifiable. La référence, la date et la devise
              proviennent du billet du transporteur.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={stringControl}
              name="bookingReference"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>PNR / Référence</FormLabel>
                  <FormControl>
                    <Input
                      disabled={locked}
                      {...field}
                      value={field.value ?? ""}
                      className="font-mono uppercase tracking-wide"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={stringControl}
              name="issuedDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date d&apos;émission</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      disabled={locked}
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={stringControl}
              name="price"
              render={({ field }) => (
                <FormItem
                  className={cn(
                    locked &&
                      "col-span-2 relative rounded-xl border border-brand/40 bg-brand-soft/25 p-3.5 ring-1 ring-brand/15",
                  )}
                >
                  <FormLabel
                    className={cn(
                      "flex items-center gap-2",
                      locked && "text-brand",
                    )}
                  >
                    Prix
                    {locked && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
                        <Pencil className="size-2.5" aria-hidden="true" />
                        Modifiable
                      </span>
                    )}
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      className={cn(
                        "font-mono tabular-nums",
                        locked &&
                          "border-brand/40 bg-background focus-visible:ring-brand/30",
                      )}
                    />
                  </FormControl>
                  {locked && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      Ce prix remplacera le prix imprimé sur le billet du
                      transporteur.
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={stringControl}
              name="currency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Devise</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value ?? ""}
                    disabled={locked}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="DZD">DZD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
      </form>
    </Form>
  );
}
