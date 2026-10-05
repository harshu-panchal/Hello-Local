import React, { useState, useRef } from "react";
import {
  downloadBulkProductTemplate,
  bulkUploadProducts,
  BulkUploadResult,
} from "../../../services/api/productService";
import { exportToCsv } from "../../../utils/exportCsv";
import { useToast } from "../../../context/ToastContext";

interface SellerBulkProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface PreviewRow {
  rowNum: number;
  name: string;
  category: string;
  mrp: string;
  price: string;
  stock: string;
  unit: string;
  sku: string;
  status: "valid" | "warning";
  statusText?: string;
}

export default function SellerBulkProductModal({
  isOpen,
  onClose,
  onSuccess,
}: SellerBulkProductModalProps) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Client-side preview state
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [totalParsedRows, setTotalParsedRows] = useState(0);

  // Upload results state
  const [result, setResult] = useState<BulkUploadResult | null>(null);

  if (!isOpen) return null;

  // 1. Download Sample Template
  const handleDownloadTemplate = async () => {
    try {
      setDownloadingTemplate(true);
      const blob = await downloadBulkProductTemplate();
      const url = window.URL.createObjectURL(new Blob([blob], { type: "text/csv;charset=utf-8;" }));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "hello_local_sample_product_import.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      showToast("Sample template downloaded successfully!", "success");
    } catch (err: any) {
      showToast(err.response?.data?.message || "Failed to download sample template", "error");
    } finally {
      setDownloadingTemplate(false);
    }
  };

  // Parse CSV client-side for instant preview
  const parseClientPreview = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      if (lines.length <= 1) {
        showToast("The selected CSV file appears to have no data rows", "info");
        return;
      }

      setTotalParsedRows(lines.length - 1);

      const splitCsvLine = (line: string): string[] => {
        const cols: string[] = [];
        let insideQuote = false;
        let entry = "";
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            insideQuote = !insideQuote;
          } else if (char === "," && !insideQuote) {
            cols.push(entry.replace(/^"|"$/g, "").trim());
            entry = "";
          } else {
            entry += char;
          }
        }
        cols.push(entry.replace(/^"|"$/g, "").trim());
        return cols;
      };

      const headerCols = splitCsvLine(lines[0]).map((h) =>
        h.toLowerCase().replace(/[^a-z0-9]/g, "")
      );
      const findIdx = (aliases: string[], fallbackIdx: number) => {
        for (const alias of aliases) {
          const norm = alias.toLowerCase().replace(/[^a-z0-9]/g, "");
          const idx = headerCols.indexOf(norm);
          if (idx !== -1) return idx;
        }
        return fallbackIdx;
      };

      const nameIdx = findIdx(["productname", "product", "name", "title"], 0);
      const catIdx = findIdx(["category", "categoryname"], 1);
      const mrpIdx = findIdx(["mrp", "compareatprice", "originalprice"], 4);
      const priceIdx = findIdx(["sellingprice", "price", "discountprice"], 5);
      const stockIdx = findIdx(["stock", "quantity", "qty"], 6);
      const unitIdx = findIdx(["unitvariation", "unit", "variation", "pack"], 7);
      const skuIdx = findIdx(["skuoptional", "sku", "itemcode", "barcode"], 8);

      // Parse first 5 data rows
      const parsed: PreviewRow[] = [];
      const sampleLines = lines.slice(1, 6);

      sampleLines.forEach((line, idx) => {
        const cols = splitCsvLine(line);

        const name = cols[nameIdx] || "";
        const category = cols[catIdx] || "";
        const mrp = cols[mrpIdx] || "";
        const price = cols[priceIdx] || "";
        const stock = cols[stockIdx] || "";
        const unit = cols[unitIdx] || "Default";
        const sku = cols[skuIdx] || "";

        let status: "valid" | "warning" = "valid";
        let statusText = "Ready";

        const numMrp = parseFloat(mrp);
        const numPrice = parseFloat(price);

        if (!name) {
          status = "warning";
          statusText = "Missing Name";
        } else if (!category) {
          status = "warning";
          statusText = "Missing Category";
        } else if (numPrice > numMrp && numMrp > 0) {
          status = "warning";
          statusText = "Price > MRP";
        }

        parsed.push({
          rowNum: idx + 2,
          name,
          category,
          mrp,
          price,
          stock,
          unit,
          sku,
          status,
          statusText,
        });
      });

      setPreviewRows(parsed);
    };

    reader.readAsText(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        showToast("Please select a valid CSV file (.csv)", "error");
        return;
      }
      setSelectedFile(file);
      setResult(null);
      parseClientPreview(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        showToast("Please drop a valid CSV file (.csv)", "error");
        return;
      }
      setSelectedFile(file);
      setResult(null);
      parseClientPreview(file);
    }
  };

  const handleUploadSubmit = async () => {
    if (!selectedFile) {
      showToast("Please choose a CSV file to upload", "info");
      return;
    }

    try {
      setUploading(true);
      const res = await bulkUploadProducts(selectedFile, updateExisting);
      if (res.success && res.data) {
        setResult(res.data);
        if (res.data.successCount > 0) {
          showToast(`Successfully imported ${res.data.successCount} products!`, "success");
          onSuccess();
        } else {
          showToast("No products could be imported. Please review the errors.", "error");
        }
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || "Failed to process bulk upload", "error");
    } finally {
      setUploading(false);
    }
  };

  // Download error log CSV
  const handleDownloadErrors = () => {
    if (!result || result.errors.length === 0) return;

    exportToCsv(
      ["Row Number", "Product Name", "Error Reason"],
      result.errors.map((e) => [e.rowNumber, e.productName, e.error]),
      "bulk_import_errors"
    );
    showToast("Error log CSV downloaded", "info");
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPreviewRows([]);
    setTotalParsedRows(0);
    setResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-purple-50/70 via-white to-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center text-lg font-bold shadow-2xs">
              📥
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                Bulk Product Upload
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Add or update multiple catalog products at once using a CSV spreadsheet
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {/* Step 1: Download Sample Template Card */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
            <div className="space-y-0.5">
              <span className="text-[11px] font-black uppercase tracking-wider text-purple-600 block">
                Step 1: Get the Format
              </span>
              <h4 className="text-xs sm:text-sm font-bold text-slate-800">
                Download Official Sample Template
              </h4>
              <p className="text-[11px] text-slate-500">
                Pre-configured with sample products and your store's approved categories.
              </p>
              <div className="pt-1">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-purple-700 bg-purple-100/70 px-2.5 py-1 rounded-lg">
                  <span>✨</span>
                  <span>SKU is 100% optional — leave blank and Hello Local auto-generates unique SKUs!</span>
                </span>
              </div>
            </div>
            <button
              onClick={handleDownloadTemplate}
              disabled={downloadingTemplate}
              className="bg-white hover:bg-purple-50 text-purple-700 border border-purple-200 text-xs font-black px-4 py-2.5 rounded-xl shadow-2xs flex items-center justify-center gap-1.5 transition-all active:scale-95 flex-shrink-0 cursor-pointer min-h-[40px]"
            >
              <span>{downloadingTemplate ? "⏳" : "📄"}</span>
              <span>{downloadingTemplate ? "Downloading..." : "Download Sample CSV"}</span>
            </button>
          </div>

          {/* Step 2: Upload Area */}
          {!result && (
            <div className="space-y-3">
              <span className="text-[11px] font-black uppercase tracking-wider text-purple-600 block">
                Step 2: Upload Completed CSV
              </span>

              {/* Drag and Drop Zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-3xl p-6 sm:p-8 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-2 ${
                  dragOver
                    ? "border-purple-600 bg-purple-50/50 scale-[1.01]"
                    : selectedFile
                    ? "border-emerald-300 bg-emerald-50/20"
                    : "border-slate-300 hover:border-purple-400 bg-slate-50/50 hover:bg-purple-50/20"
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".csv,text/csv"
                  className="hidden"
                />

                <div className="w-12 h-12 rounded-2xl bg-white shadow-2xs border border-slate-200 flex items-center justify-center text-2xl">
                  {selectedFile ? "📊" : "📁"}
                </div>

                {selectedFile ? (
                  <div className="space-y-1">
                    <p className="text-xs sm:text-sm font-black text-slate-800">
                      {selectedFile.name}
                    </p>
                    <p className="text-[11px] text-slate-500 font-medium">
                      {(selectedFile.size / 1024).toFixed(1)} KB • {totalParsedRows} products detected
                    </p>
                    <p className="text-[11px] text-purple-600 font-bold hover:underline pt-1">
                      Click to choose a different file
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-xs sm:text-sm font-bold text-slate-700">
                      Drag & drop your CSV file here, or{" "}
                      <span className="text-purple-600 underline">browse</span>
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Supports .csv format (Max 10MB, up to 1,000 products per upload)
                    </p>
                  </div>
                )}
              </div>

              {/* Update Existing Checkbox */}
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={updateExisting}
                  onChange={(e) => setUpdateExisting(e.target.checked)}
                  className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-slate-300 cursor-pointer"
                />
                <span>Update existing products if SKU matches in your catalog</span>
              </label>

              {/* Preview Table of First 5 Rows */}
              {previewRows.length > 0 && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800">
                      Data Preview (First {previewRows.length} of {totalParsedRows} rows)
                    </span>
                    <button
                      onClick={handleReset}
                      className="text-rose-600 hover:text-rose-800 text-[11px] font-bold cursor-pointer"
                    >
                      Clear File
                    </button>
                  </div>

                  <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-48 overflow-y-auto shadow-2xs">
                    <table className="w-full text-[11px] text-left border-collapse">
                      <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0">
                        <tr>
                          <th className="p-2 border-b">Row</th>
                          <th className="p-2 border-b">Product Name</th>
                          <th className="p-2 border-b">Category</th>
                          <th className="p-2 border-b">MRP</th>
                          <th className="p-2 border-b">Price</th>
                          <th className="p-2 border-b">Stock</th>
                          <th className="p-2 border-b">SKU</th>
                          <th className="p-2 border-b">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {previewRows.map((row) => (
                          <tr key={row.rowNum} className="hover:bg-slate-50/60">
                            <td className="p-2 text-slate-400 font-bold">{row.rowNum}</td>
                            <td className="p-2 font-bold text-slate-800 max-w-[140px] truncate">
                              {row.name || "-"}
                            </td>
                            <td className="p-2 text-slate-600 max-w-[100px] truncate">
                              {row.category || "-"}
                            </td>
                            <td className="p-2 text-slate-500">₹{row.mrp || "0"}</td>
                            <td className="p-2 font-black text-slate-900">₹{row.price || "0"}</td>
                            <td className="p-2 text-slate-700">{row.stock || "0"}</td>
                            <td className="p-2">
                              {row.sku ? (
                                <span className="font-mono text-[10px] text-slate-700">{row.sku}</span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                                  ✨ Auto
                                </span>
                              )}
                            </td>
                            <td className="p-2">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
                                  row.status === "valid"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-amber-100 text-amber-800"
                                }`}
                              >
                                {row.statusText}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Results Summary Card */}
          {result && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div
                className={`p-4 rounded-2xl border ${
                  result.successCount > 0
                    ? "bg-emerald-50/80 border-emerald-200 text-emerald-900"
                    : "bg-rose-50/80 border-rose-200 text-rose-900"
                }`}
              >
                <div className="flex items-center gap-2.5 font-black text-sm sm:text-base">
                  <span>{result.successCount > 0 ? "🎉" : "⚠️"}</span>
                  <span>
                    Import Complete: {result.successCount} of {result.totalRows} Products Succeeded
                  </span>
                </div>
                <p className="text-xs font-medium mt-1 opacity-90">
                  {result.successCount > 0
                    ? "The valid items have been saved to your catalog and inventory."
                    : "None of the products could be imported due to validation errors."}
                </p>
              </div>

              {/* Errors Breakdown */}
              {result.failedCount > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-rose-700">
                      {result.failedCount} Row(s) Failed Validation:
                    </span>
                    <button
                      onClick={handleDownloadErrors}
                      className="text-xs font-bold text-purple-700 hover:text-purple-900 flex items-center gap-1 cursor-pointer underline"
                    >
                      <span>📥</span>
                      <span>Download Failed Rows CSV</span>
                    </button>
                  </div>

                  <div className="border border-rose-200 rounded-2xl bg-rose-50/30 p-3 max-h-40 overflow-y-auto space-y-1.5 text-xs text-rose-800">
                    {result.errors.map((err, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <span className="font-bold">• Row {err.rowNumber}:</span>
                        <span>
                          [{err.productName}] — {err.error}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-100 flex items-center justify-end gap-2.5 bg-slate-50/50">
          {result ? (
            <button
              onClick={() => {
                handleReset();
                onClose();
              }}
              className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer min-h-[40px]"
            >
              Done & View Catalog
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs transition-colors cursor-pointer min-h-[40px]"
              >
                Cancel
              </button>
              <button
                onClick={handleUploadSubmit}
                disabled={!selectedFile || uploading}
                className={`px-5 py-2.5 rounded-xl text-white font-black text-xs shadow-xs flex items-center gap-1.5 transition-all min-h-[40px] cursor-pointer ${
                  !selectedFile || uploading
                    ? "bg-slate-300 cursor-not-allowed"
                    : "bg-purple-600 hover:bg-purple-700 active:scale-95"
                }`}
              >
                <span>{uploading ? "⏳" : "🚀"}</span>
                <span>
                  {uploading
                    ? "Importing Products..."
                    : `Import ${totalParsedRows > 0 ? totalParsedRows : ""} Products`}
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
