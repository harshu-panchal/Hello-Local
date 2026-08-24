import { useState, useEffect } from "react";
import {
  getDeliveryBoys,
  type DeliveryBoy,
} from "../../../services/api/admin/adminDeliveryService";
import { assignDeliveryBoy } from "../../../services/api/admin/adminOrderService";

interface AssignDeliveryBoyModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
  currentDeliveryBoy?: { name: string; _id: string } | string;
  onAssignSuccess: () => void;
}

export default function AssignDeliveryBoyModal({
  isOpen,
  onClose,
  orderId,
  orderNumber,
  currentDeliveryBoy,
  onAssignSuccess,
}: AssignDeliveryBoyModalProps) {
  const [deliveryBoys, setDeliveryBoys] = useState<DeliveryBoy[]>([]);
  const [selectedDeliveryBoyId, setSelectedDeliveryBoyId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get current delivery boy ID
  const currentDeliveryBoyId =
    typeof currentDeliveryBoy === "object" && currentDeliveryBoy?._id
      ? currentDeliveryBoy._id
      : typeof currentDeliveryBoy === "string"
      ? currentDeliveryBoy
      : "";

  useEffect(() => {
    if (isOpen) {
      fetchDeliveryBoys();
      if (currentDeliveryBoyId) {
        setSelectedDeliveryBoyId(currentDeliveryBoyId);
      }
    }
  }, [isOpen, currentDeliveryBoyId]);

  const fetchDeliveryBoys = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getDeliveryBoys({
        status: "Active",
        limit: 100,
      });
      if (response.success && Array.isArray(response.data)) {
        setDeliveryBoys(response.data);
      }
    } catch (err: any) {
      console.error("Error fetching delivery boys:", err);
      setError(err?.response?.data?.message || "Failed to load active delivery partners");
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedDeliveryBoyId) {
      setError("Please select a delivery partner");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const response = await assignDeliveryBoy(orderId, {
        deliveryBoyId: selectedDeliveryBoyId,
      });

      if (response.success) {
        onAssignSuccess();
        onClose();
      } else {
        setError(response.message || "Failed to assign delivery partner");
      }
    } catch (err: any) {
      console.error("Error assigning delivery boy:", err);
      setError(
        err?.response?.data?.message ||
          "Failed to assign delivery partner. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-sm animate-fade-in"
    >
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-neutral-100 space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
          <div>
            <h2 className="text-base font-bold text-neutral-900">
              Assign Delivery Partner
            </h2>
            <p className="text-xs text-neutral-500">
              Order #{orderNumber}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 inline-flex items-center justify-center transition-colors"
            disabled={submitting}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
            {error}
          </div>
        )}

        {/* Delivery Partner Selection */}
        <div className="space-y-2">
          <label htmlFor="assignDeliveryPartnerSelect" className="block text-[11px] font-bold text-neutral-700 uppercase tracking-wider">
            Select Active Courier <span className="text-red-500">*</span>
          </label>
          {loading ? (
            <div className="flex items-center justify-center py-6 text-xs text-neutral-500 gap-2">
              <div className="w-3.5 h-3.5 border-2 border-rose-700 border-t-transparent rounded-full animate-spin" />
              <span>Loading delivery partners...</span>
            </div>
          ) : deliveryBoys.length === 0 ? (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
              No active delivery partners found. Please onboard delivery couriers first.
            </div>
          ) : (
            <select
              id="assignDeliveryPartnerSelect"
              value={selectedDeliveryBoyId}
              onChange={(e) => setSelectedDeliveryBoyId(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-semibold bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
              disabled={submitting}
            >
              <option value="">-- Choose Delivery Courier --</option>
              {deliveryBoys.map((db) => (
                <option key={db._id} value={db._id}>
                  {db.name} ({db.mobile}) — {db.available === "Available" ? "🟢 On-Duty" : "⚪ Off-Duty"}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Selected Partner Preview */}
        {selectedDeliveryBoyId && (
          <div className="p-3 bg-rose-50/50 border border-rose-100 rounded-xl text-xs space-y-1">
            {(() => {
              const selected = deliveryBoys.find((db) => db._id === selectedDeliveryBoyId);
              if (!selected) return null;
              return (
                <>
                  <div className="font-bold text-neutral-900">{selected.name}</div>
                  <div className="text-neutral-600 font-mono text-[11px]">📞 {selected.mobile}</div>
                  {selected.city && (
                    <div className="text-neutral-500 text-[11px]">📍 Base: {selected.city}</div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-100 rounded-xl transition-colors min-h-[44px]"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAssign}
            disabled={!selectedDeliveryBoyId || submitting || deliveryBoys.length === 0}
            className="px-5 py-2 text-xs font-bold text-white bg-rose-700 hover:bg-rose-800 disabled:opacity-50 rounded-xl transition-colors min-h-[44px] flex items-center gap-2 shadow-sm"
          >
            {submitting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Assigning Dispatch...</span>
              </>
            ) : (
              <span>Confirm Assignment</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
