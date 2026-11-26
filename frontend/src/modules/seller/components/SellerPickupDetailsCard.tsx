import { useEffect, useState } from "react";
import { getSellerProfile, updateSellerPickupProfile } from "../../../services/api/auth/sellerAuthService";
import { useToast } from "../../../context/ToastContext";
import { SellerCard } from "./common/SellerCard";
import { SellerFormField } from "./common/SellerFormField";
import { SellerButton } from "./common/SellerButton";

const CATEGORIES = ["Grocery", "Food and Beverage"] as const;
const inputClass = "w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm text-slate-900 outline-none focus:border-purple-600 min-h-[42px]";

/**
 * Pickup details our external delivery partner needs to collect orders from
 * the store. Saved separately from the main settings form (no nested form).
 */
export default function SellerPickupDetailsCard() {
  const { showToast } = useToast();
  const [pickupPincode, setPincode] = useState("");
  const [pickupState, setState] = useState("");
  const [adloggsOrderCategory, setCategory] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getSellerProfile()
      .then(response => {
        const seller = response?.data ?? {};
        if (!active) return;
        setPincode(seller.pickupPincode ?? "");
        setState(seller.pickupState ?? "");
        setCategory(seller.adloggsOrderCategory ?? "");
      })
      .catch(() => undefined)
      .finally(() => active && setLoaded(true));
    return () => { active = false; };
  }, []);

  const pincodeValid = /^[1-9][0-9]{5}$/.test(pickupPincode);
  const canSave = pincodeValid && pickupState.trim().length > 0 && !!adloggsOrderCategory;

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await updateSellerPickupProfile({ pickupPincode, pickupState: pickupState.trim(), adloggsOrderCategory });
      showToast(response.message || "Pickup details saved.", "success");
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Could not save pickup details.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SellerCard title="Pickup details for delivery partner" subtitle="Used when your orders are collected by our delivery partner.">
      {!loaded ? (
        <p className="text-xs text-slate-500">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SellerFormField label="Pickup pincode">
            <input className={inputClass} inputMode="numeric" maxLength={6} value={pickupPincode}
              onChange={e => setPincode(e.target.value.replace(/\D/g, ""))} aria-invalid={!!pickupPincode && !pincodeValid} />
            {!!pickupPincode && !pincodeValid && <p className="mt-1 text-[11px] text-red-600">Enter a 6-digit pincode.</p>}
          </SellerFormField>
          <SellerFormField label="Pickup state">
            <input className={inputClass} maxLength={100} value={pickupState} onChange={e => setState(e.target.value)} placeholder="e.g. Tamil Nadu" />
          </SellerFormField>
          <SellerFormField label="What you sell">
            <select className={inputClass} value={adloggsOrderCategory} onChange={e => setCategory(e.target.value)}>
              <option value="">Select…</option>
              {CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}
            </select>
          </SellerFormField>
          {error && <p role="alert" className="md:col-span-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
          <div className="md:col-span-3 flex justify-end">
            <SellerButton type="button" variant="primary" disabled={!canSave || saving} isLoading={saving} onClick={() => void save()}>
              Save pickup details
            </SellerButton>
          </div>
        </div>
      )}
    </SellerCard>
  );
}
