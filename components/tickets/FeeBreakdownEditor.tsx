"use client";

import { Plus, Trash2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Fee, FeeCategory } from "@/lib/tickets/schema";

interface FeeBreakdownEditorProps {
  fees: Fee[];
  onChange: (fees: Fee[]) => void;
  currency?: string;
}

const CATEGORY_LABELS: Record<FeeCategory, string> = {
  port: "Port",
  security: "Sécurité",
  fuel: "Carburant",
  cabin: "Cabine",
  vehicle: "Véhicule",
  passenger: "Passager",
  tax: "Taxe",
  other: "Autre",
};

const CATEGORY_OPTIONS: FeeCategory[] = [
  "port",
  "security",
  "fuel",
  "cabin",
  "vehicle",
  "passenger",
  "tax",
  "other",
];

function autoCategorize(label: string): FeeCategory {
  const l = label.toLowerCase();
  if (l.includes("port") || l.includes("congestion")) return "port";
  if (l.includes("security") || l.includes("sécurité") || l.includes("securit")) return "security";
  if (l.includes("fuel") || l.includes("carburant") || l.includes("surcharge")) return "fuel";
  if (l.includes("cabin") || l.includes("cabine")) return "cabin";
  if (l.includes("vehicle") || l.includes("véhicule") || l.includes("voiture") || l.includes("vehicule")) return "vehicle";
  if (l.includes("passenger") || l.includes("passager") || l.includes("adult") || l.includes("pax")) return "passenger";
  if (l.includes("tax") || l.includes("tva") || l.includes("taxe")) return "tax";
  return "other";
}

export function FeeBreakdownEditor({
  fees,
  onChange,
  currency,
}: FeeBreakdownEditorProps) {
  const subtotal = fees.reduce(
    (sum, f) => sum + f.amount * (f.quantity ?? 1),
    0,
  );

  const updateFee = (index: number, updates: Partial<Fee>) => {
    const updated = fees.map((f, i) => (i === index ? { ...f, ...updates } : f));
    onChange(updated);
  };

  const addFee = () => {
    onChange([
      ...fees,
      { label: "", amount: 0, quantity: 1, category: "other" },
    ]);
  };

  const removeFee = (index: number) => {
    onChange(fees.filter((_, i) => i !== index));
  };

  const autoCategorizeFees = () => {
    const updated = fees.map((f) => ({
      ...f,
      category: autoCategorize(f.label) as FeeCategory,
    }));
    onChange(updated);
  };

  return (
    <div className="space-y-2">
      {fees.length > 0 && (
        <div className="space-y-2">
          {fees.map((fee, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                placeholder="Libellé"
                value={fee.label}
                onChange={(e) => updateFee(index, { label: e.target.value })}
                className="flex-1"
              />
              <Input
                type="number"
                placeholder="Qté"
                value={fee.quantity ?? 1}
                onChange={(e) =>
                  updateFee(index, {
                    quantity: parseInt(e.target.value) || 1,
                  })
                }
                className="w-16"
              />
              <Input
                type="number"
                placeholder="Montant"
                value={fee.amount || ""}
                onChange={(e) =>
                  updateFee(index, {
                    amount: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-28"
              />
              <Select
                value={fee.category ?? "other"}
                onValueChange={(val) =>
                  updateFee(index, { category: val as FeeCategory })
                }
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {CATEGORY_LABELS[cat]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-red-500 hover:text-red-600 px-2"
                onClick={() => removeFee(index)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addFee}
          >
            <Plus className="h-3 w-3 mr-1" />
            Ajouter un frais
          </Button>
          {fees.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={autoCategorizeFees}
            >
              <Sparkles className="h-3 w-3 mr-1" />
              Auto-catégoriser
            </Button>
          )}
        </div>
        {fees.length > 0 && (
          <span className="text-sm font-semibold text-foreground">
            Sous-total : {subtotal.toLocaleString("fr-FR")}{" "}
            {currency ?? ""}
          </span>
        )}
      </div>
    </div>
  );
}
