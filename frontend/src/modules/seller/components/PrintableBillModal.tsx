import React, { useState } from "react";
import jsPDF from "jspdf";
import { BillData } from "../../../services/api/orderService";
import { useToast } from "../../../context/ToastContext";

interface PrintableBillModalProps {
  bill: BillData | null;
  isOpen: boolean;
  onClose: () => void;
  onNewSale?: () => void;
}

export const PrintableBillModal: React.FC<PrintableBillModalProps> = ({
  bill,
  isOpen,
  onClose,
  onNewSale,
}) => {
  const { showToast } = useToast();
  const [printFormat, setPrintFormat] = useState<"thermal" | "a4">("thermal");

  if (!isOpen || !bill) return null;

  const esc = (s: any) =>
    String(s ?? "").replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string)
    );

  /** Variant label to print; history bills use "Standard" for no variant. */
  const variantOf = (it: BillData["items"][number]) =>
    it.variantTitle || (it.unit && it.unit !== "Standard" ? it.unit : "");

  const formatDate = (d?: string | Date) => {
    if (!d) return new Date().toLocaleString("en-IN");
    return new Date(d).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  /**
   * 80mm Thermal Receipt HTML Generation & Print
   */
  const handlePrintThermal = () => {
    const rows = bill.items
      .map(
        (it) => `
        <tr>
          <td style="padding: 3px 0; font-size: 11px; line-height: 1.2;">
            <div style="font-weight: 600;">${esc(it.product || it.productName)}</div>
            ${variantOf(it) ? `<div style="font-size: 10px; color: #555;">${esc(variantOf(it))}</div>` : ""}
          </td>
          <td style="padding: 3px 0; text-align: center; font-size: 11px;">${it.qty || it.quantity}</td>
          <td style="padding: 3px 0; text-align: right; font-size: 11px;">₹${(it.price || it.unitPrice || 0).toFixed(2)}</td>
          <td style="padding: 3px 0; text-align: right; font-size: 11px; font-weight: 600;">₹${(it.total || it.subtotal || 0).toFixed(2)}</td>
        </tr>
      `
      )
      .join("");

    const thermalHTML = `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8"/>
          <title>Receipt - ${esc(bill.billNumber)}</title>
          <style>
            @page { size: 80mm auto; margin: 0; }
            * { box-sizing: border-box; font-family: 'Courier New', Courier, monospace, sans-serif; }
            body { width: 76mm; margin: 2mm auto; padding: 2mm; color: #000; background: #fff; }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .divider { border-top: 1px dashed #000; margin: 6px 0; }
            .double-divider { border-top: 2px dashed #000; margin: 6px 0; }
            table { width: 100%; border-collapse: collapse; }
            th { border-bottom: 1px dashed #000; font-size: 11px; text-align: left; padding-bottom: 4px; }
            .store-name { font-size: 16px; font-weight: bold; margin-bottom: 2px; }
            .meta-line { font-size: 10px; line-height: 1.3; }
            .totals-row td { padding: 2px 0; font-size: 11px; }
            .grand-total { font-size: 14px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="text-center">
            <div class="store-name">${esc(bill.seller?.storeName || "HelloLocal Store")}</div>
            ${bill.seller?.address ? `<div class="meta-line">${esc(bill.seller.address)}</div>` : ""}
            ${bill.seller?.phone ? `<div class="meta-line">Tel: ${esc(bill.seller.phone)}</div>` : ""}
            ${bill.seller?.gstin ? `<div class="meta-line">GSTIN: ${esc(bill.seller.gstin)}</div>` : ""}
            ${bill.seller?.fssaiLicNo ? `<div class="meta-line">FSSAI: ${esc(bill.seller.fssaiLicNo)}</div>` : ""}
          </div>

          <div class="divider"></div>

          <div class="meta-line"><strong>Bill No:</strong> ${esc(bill.billNumber)}</div>
          <div class="meta-line"><strong>Date:</strong> ${esc(formatDate(bill.orderDate || bill.date))}</div>
          <div class="meta-line"><strong>Channel:</strong> ${esc(bill.channel)} (${esc(bill.saleType || "COUNTER_POS")})</div>
          <div class="meta-line"><strong>Customer:</strong> ${esc(bill.customer?.name || "Walk-in Customer")} ${bill.customer?.phone ? `(${esc(bill.customer.phone)})` : ""}</div>

          <div class="divider"></div>

          <table>
            <thead>
              <tr>
                <th style="width: 48%;">Item</th>
                <th style="width: 14%; text-align: center;">Qty</th>
                <th style="width: 18%; text-align: right;">Rate</th>
                <th style="width: 20%; text-align: right;">Amt</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>

          <div class="divider"></div>

          <table>
            <tr class="totals-row">
              <td>Subtotal:</td>
              <td class="text-right">₹${bill.pricing.subtotal.toFixed(2)}</td>
            </tr>
            ${bill.pricing.tax > 0 ? `
              <tr class="totals-row">
                <td>Incl. GST:</td>
                <td class="text-right">₹${bill.pricing.tax.toFixed(2)}</td>
              </tr>
            ` : ""}
            ${(bill.pricing.discount || 0) > 0 ? `
              <tr class="totals-row">
                <td>Discount:</td>
                <td class="text-right">-₹${(bill.pricing.discount || 0).toFixed(2)}</td>
              </tr>
            ` : ""}
            <tr class="totals-row grand-total">
              <td style="padding-top: 4px;">TOTAL:</td>
              <td class="text-right" style="padding-top: 4px;">₹${bill.pricing.total.toFixed(2)}</td>
            </tr>
          </table>

          <div class="divider"></div>

          <div class="meta-line"><strong>Payment Mode:</strong> ${esc(bill.payment.method)} (${esc(bill.payment.status)})</div>
          ${bill.payment.method === "Cash" && (bill.payment.receivedAmount || 0) > 0 ? `
            <div class="meta-line"><strong>Cash Tendered:</strong> ₹${(bill.payment.receivedAmount || 0).toFixed(2)}</div>
            <div class="meta-line"><strong>Change Returned:</strong> ₹${(bill.payment.changeReturned || 0).toFixed(2)}</div>
          ` : ""}
          ${bill.payment.reference ? `<div class="meta-line"><strong>Ref / UTR:</strong> ${esc(bill.payment.reference)}</div>` : ""}

          <div class="double-divider"></div>

          <div class="text-center" style="font-size: 10px; margin-top: 8px;">
            <div>Thank you for shopping with us!</div>
            <div>Powered by HelloLocal</div>
          </div>
        </body>
      </html>`;

    printDocument(thermalHTML);
  };

  /**
   * Standard A4 Tax Invoice / Bill of Supply HTML Generation & Print
   */
  const handlePrintA4 = () => {
    const docTitle = bill.seller?.gstin ? "TAX INVOICE" : "BILL OF SUPPLY / CASH MEMO";
    const sellerFssai = bill.seller?.fssaiLicNo || (bill.seller as any)?.fssai;
    const taxableValue = Math.max(0, bill.pricing.total - (bill.pricing.tax || 0));

    const rows = bill.items
      .map(
        (it, i) => `
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 10px 12px; font-size: 12px; color: #374151;">${i + 1}</td>
          <td style="padding: 10px 12px; font-size: 12px;">
            <div style="font-weight: 600; color: #111827;">${esc(it.product || it.productName)}</div>
            ${variantOf(it) ? `<div style="font-size: 11px; color: #6b7280;">Variant: ${esc(variantOf(it))}</div>` : ""}
          </td>
          <td style="padding: 10px 12px; text-align: center; font-size: 12px; color: #374151;">${it.qty || it.quantity}</td>
          <td style="padding: 10px 12px; text-align: right; font-size: 12px; color: #374151;">₹${(it.price || it.unitPrice || 0).toFixed(2)}</td>
          <td style="padding: 10px 12px; text-align: right; font-size: 12px; color: #374151;">${it.taxRate ? `${it.taxRate}% (₹${(it.taxAmount || 0).toFixed(2)})` : "0%"}</td>
          <td style="padding: 10px 12px; text-align: right; font-size: 12px; font-weight: 600; color: #111827;">₹${(it.total || it.subtotal || 0).toFixed(2)}</td>
        </tr>
      `
      )
      .join("");

    const a4HTML = `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8"/>
          <title>${esc(docTitle)} - ${esc(bill.billNumber)}</title>
          <style>
            @page { size: A4; margin: 15mm; }
            * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
            body { margin: 0; padding: 20px; color: #1f2937; background: #fff; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #4f39f6; padding-bottom: 16px; margin-bottom: 20px; }
            .brand-title { font-size: 24px; font-weight: 800; color: #4f39f6; }
            .invoice-tag { font-size: 18px; font-weight: 700; color: #1f2937; text-align: right; }
            .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
            .card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; }
            .card-title { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #6b7280; margin-bottom: 6px; letter-spacing: 0.05em; }
            .card-body { font-size: 13px; line-height: 1.5; color: #111827; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th { background: #4f39f6; color: #fff; padding: 10px 12px; font-size: 12px; font-weight: 600; text-align: left; }
            .totals-table { width: 320px; margin-left: auto; border-collapse: collapse; }
            .totals-table td { padding: 6px 12px; font-size: 13px; }
            .totals-grand { font-size: 16px; font-weight: 700; color: #4f39f6; border-top: 2px solid #4f39f6; }
            .footer { margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 14px; text-align: center; font-size: 11px; color: #9ca3af; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="brand-title">${esc(bill.seller?.storeName || "HelloLocal Store")}</div>
              <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">Verified Merchant • HelloLocal 10-Minute Network</div>
            </div>
            <div>
              <div class="invoice-tag">${esc(docTitle)}</div>
              <div style="font-size: 12px; color: #4b5563; text-align: right; margin-top: 2px;">#${esc(bill.billNumber)}</div>
              <div style="font-size: 11px; color: #9ca3af; text-align: right;">${esc(formatDate(bill.orderDate || bill.date))}</div>
            </div>
          </div>

          <div class="grid-2">
            <div class="card">
              <div class="card-title">Sold By (Seller Details)</div>
              <div class="card-body">
                <strong>${esc(bill.seller?.storeName)}</strong><br/>
                ${bill.seller?.address ? `${esc(bill.seller.address)}<br/>` : ""}
                ${bill.seller?.phone ? `Phone: ${esc(bill.seller.phone)}<br/>` : ""}
                ${bill.seller?.email ? `Email: ${esc(bill.seller.email)}<br/>` : ""}
                ${bill.seller?.gstin ? `<strong>GSTIN:</strong> ${esc(bill.seller.gstin)}<br/>` : "<em>Not registered under GST</em><br/>"}
                ${sellerFssai ? `<strong>FSSAI Lic:</strong> ${esc(sellerFssai)}` : ""}
              </div>
            </div>

            <div class="card">
              <div class="card-title">Billed To (Customer Details)</div>
              <div class="card-body">
                <strong>${esc(bill.customer?.name || "Walk-in Customer")}</strong><br/>
                ${bill.customer?.phone ? `Phone: ${esc(bill.customer.phone)}<br/>` : "Counter Walk-in<br/>"}
                ${bill.customer?.email ? `Email: ${esc(bill.customer.email)}<br/>` : ""}
                <strong>Channel:</strong> ${esc(bill.channel)} (${esc(bill.saleType || "COUNTER_POS")})<br/>
                <strong>Payment:</strong> ${esc(bill.payment.method)} • ${esc(bill.payment.status)}
                ${bill.payment.reference ? `<br/><strong>Ref / UTR:</strong> ${esc(bill.payment.reference)}` : ""}
              </div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 6%;">#</th>
                <th style="width: 44%;">Item & Description</th>
                <th style="width: 10%; text-align: center;">Qty</th>
                <th style="width: 14%; text-align: right;">Rate</th>
                <th style="width: 12%; text-align: right;">Tax</th>
                <th style="width: 14%; text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>

          <table class="totals-table">
            ${bill.pricing.tax > 0 ? `
              <tr>
                <td>Taxable Value:</td>
                <td style="text-align: right; font-weight: 600;">₹${taxableValue.toFixed(2)}</td>
              </tr>
              <tr>
                <td>Taxes (GST):</td>
                <td style="text-align: right; font-weight: 600;">₹${bill.pricing.tax.toFixed(2)}</td>
              </tr>
            ` : `
              <tr>
                <td>Subtotal:</td>
                <td style="text-align: right; font-weight: 600;">₹${bill.pricing.subtotal.toFixed(2)}</td>
              </tr>
            `}
            ${(bill.pricing.discount || 0) > 0 ? `
              <tr>
                <td>Discount:</td>
                <td style="text-align: right; color: #dc2626; font-weight: 600;">-₹${(bill.pricing.discount || 0).toFixed(2)}</td>
              </tr>
            ` : ""}
            <tr class="totals-grand">
              <td style="padding-top: 8px;">Grand Total:</td>
              <td style="text-align: right; padding-top: 8px;">₹${bill.pricing.total.toFixed(2)}</td>
            </tr>
          </table>

          ${bill.payment.method === "Cash" && (bill.payment.receivedAmount || 0) > 0 ? `
            <div style="font-size: 12px; color: #4b5563; margin-top: 8px; text-align: right;">
              Cash Received: ₹${(bill.payment.receivedAmount || 0).toFixed(2)} | Change Returned: ₹${(bill.payment.changeReturned || 0).toFixed(2)}
            </div>
          ` : ""}

          <div class="footer">
            <div>This is a computer-generated ${esc(docTitle.toLowerCase())} issued by ${esc(bill.seller?.storeName || "HelloLocal Store")}.</div>
            <div style="margin-top: 2px;">Thank you for your business! Powered by HelloLocal.</div>
          </div>
        </body>
      </html>`;

    printDocument(a4HTML);
  };

  /**
   * Safe Cross-Browser Printing Helper
   */
  const printDocument = (htmlContent: string) => {
    const printFrame = document.createElement("iframe");
    printFrame.style.position = "fixed";
    printFrame.style.right = "0";
    printFrame.style.bottom = "0";
    printFrame.style.width = "0";
    printFrame.style.height = "0";
    printFrame.style.border = "0";
    document.body.appendChild(printFrame);

    const frameDoc = printFrame.contentWindow?.document;
    if (frameDoc) {
      frameDoc.open();
      frameDoc.write(htmlContent);
      frameDoc.close();

      setTimeout(() => {
        printFrame.contentWindow?.focus();
        printFrame.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(printFrame);
        }, 1500);
      }, 300);
    }
  };

  /**
   * Helper to format numbers into Indian English words with Paise support
   */
  const numberToIndianWords = (num: number): string => {
    const a = [
      "", "One ", "Two ", "Three ", "Four ", "Five ", "Six ", "Seven ", "Eight ", "Nine ", "Ten ",
      "Eleven ", "Twelve ", "Thirteen ", "Fourteen ", "Fifteen ", "Sixteen ", "Seventeen ", "Eighteen ", "Nineteen "
    ];
    const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

    const absNum = Math.abs(num);
    const rupees = Math.floor(absNum);
    const paise = Math.round((absNum - rupees) * 100);

    const numToWords = (val: number): string => {
      let str = "";
      if (val > 99) {
        str += a[Math.floor(val / 100)] + "Hundred ";
        val %= 100;
      }
      if (val > 19) {
        str += b[Math.floor(val / 10)] + " " + a[val % 10];
      } else if (val > 0) {
        str += a[val];
      }
      return str;
    };

    let rupeesStr = "";
    if (rupees === 0) {
      rupeesStr = "Zero";
    } else {
      const crore = Math.floor(rupees / 10000000);
      const lakh = Math.floor((rupees % 10000000) / 100000);
      const thousand = Math.floor((rupees % 100000) / 1000);
      const remainder = rupees % 1000;

      if (crore > 0) rupeesStr += numToWords(crore) + "Crore ";
      if (lakh > 0) rupeesStr += numToWords(lakh) + "Lakh ";
      if (thousand > 0) rupeesStr += numToWords(thousand) + "Thousand ";
      if (remainder > 0) rupeesStr += numToWords(remainder);
    }

    let result = `Rupees ${rupeesStr.trim()}`;
    if (paise > 0) {
      result += ` and ${numToWords(paise).trim()} Paise`;
    }
    return `${result} Only`;
  };

  /**
   * Generate high-quality professional PDF invoice using jsPDF
   */
  const generateInvoicePDF = (billData: BillData): jsPDF => {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const docTitle = billData.seller?.gstin ? "TAX INVOICE" : "BILL OF SUPPLY / CASH MEMO";
    const sellerFssai = (billData.seller as any)?.fssaiLicNo || (billData.seller as any)?.fssai;

    const pageWidth = 210;
    const margin = 14;
    const contentWidth = pageWidth - margin * 2; // 182mm
    let yPos = 14;

    // 1. Top Header Banner
    doc.setFillColor(30, 27, 75); // Deep Indigo
    doc.roundedRect(margin, yPos, contentWidth, 22, 2, 2, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text((billData.seller?.storeName || "HelloLocal Store").slice(0, 36), margin + 6, yPos + 8);

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(199, 210, 254);
    doc.text((billData.seller?.address || "Hyperlocal Retail Store").slice(0, 48), margin + 6, yPos + 15);

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(docTitle, pageWidth - margin - 6, yPos + 8, { align: "right" });

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(224, 231, 255);
    doc.text("ORIGINAL FOR RECIPIENT", pageWidth - margin - 6, yPos + 15, { align: "right" });

    yPos += 27;

    // 2. Info Grid: Seller (Left) and Customer/Invoice Meta (Right)
    const boxWidth = (contentWidth - 6) / 2; // 88mm
    const boxHeight = 40;

    // Seller Box
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, yPos, boxWidth, boxHeight, 2, 2, "FD");

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(79, 70, 229);
    doc.text("SOLD BY / MERCHANT DETAILS", margin + 4, yPos + 6);

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text((billData.seller?.storeName || "HelloLocal Store").slice(0, 38), margin + 4, yPos + 12);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    const sellerAddr = billData.seller?.address ? billData.seller.address.slice(0, 48) : "Local Partner Store";
    doc.text(sellerAddr, margin + 4, yPos + 17);
    if (billData.seller?.phone) {
      doc.text(`Phone: ${billData.seller.phone}`, margin + 4, yPos + 22);
    }
    if (billData.seller?.gstin) {
      doc.setFont("helvetica", "bold");
      doc.text(`GSTIN: ${billData.seller.gstin}`, margin + 4, yPos + 27);
    } else {
      doc.text("Not registered under GST", margin + 4, yPos + 27);
    }
    doc.setFont("helvetica", "normal");
    if (sellerFssai) {
      doc.text(`FSSAI Lic: ${sellerFssai}`, margin + 4, yPos + 32);
    }

    // Customer / Invoice Meta Box
    const rightBoxX = margin + boxWidth + 6;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(rightBoxX, yPos, boxWidth, boxHeight, 2, 2, "FD");

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(79, 70, 229);
    doc.text("INVOICE & BILLED TO", rightBoxX + 4, yPos + 6);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text("Invoice No:", rightBoxX + 4, yPos + 12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(billData.billNumber, rightBoxX + 24, yPos + 12);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text("Date & Time:", rightBoxX + 4, yPos + 17);
    doc.setTextColor(15, 23, 42);
    doc.text(formatDate(billData.orderDate || billData.date), rightBoxX + 24, yPos + 17);

    doc.setTextColor(71, 85, 105);
    doc.text("Customer:", rightBoxX + 4, yPos + 22);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    const custLabel = `${billData.customer?.name || "Walk-in Customer"} ${billData.customer?.phone ? `(${billData.customer.phone})` : ""}`;
    doc.text(custLabel.slice(0, 32), rightBoxX + 24, yPos + 22);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text("Payment:", rightBoxX + 4, yPos + 27);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(5, 150, 105); // emerald
    doc.text(`${billData.payment.method} (${billData.payment.status})`, rightBoxX + 24, yPos + 27);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text("Channel:", rightBoxX + 4, yPos + 32);
    doc.setTextColor(15, 23, 42);
    doc.text(`${billData.channel} • ${billData.saleType || "COUNTER_POS"}`, rightBoxX + 24, yPos + 32);

    if (billData.payment.reference) {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      doc.text("Ref / UTR:", rightBoxX + 4, yPos + 37);
      doc.setTextColor(15, 23, 42);
      doc.text(String(billData.payment.reference).slice(0, 26), rightBoxX + 24, yPos + 37);
    } else if (billData.payment.method === "Cash" && (billData.payment.receivedAmount || 0) > 0) {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      doc.text(`Cash: Rs.${(billData.payment.receivedAmount || 0).toFixed(2)} | Change: Rs.${(billData.payment.changeReturned || 0).toFixed(2)}`, rightBoxX + 4, yPos + 37);
    }

    yPos += boxHeight + 8;

    // 3. Table Header
    const printTableHeader = (curY: number) => {
      doc.setFillColor(79, 70, 229); // Purple 600
      doc.roundedRect(margin, curY, contentWidth, 8, 1, 1, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");

      doc.text("#", margin + 3, curY + 5.5);
      doc.text("Item & Specification", margin + 14, curY + 5.5);
      doc.text("Qty", margin + 98, curY + 5.5, { align: "center" });
      doc.text("Rate", margin + 124, curY + 5.5, { align: "right" });
      doc.text("GST Rate", margin + 152, curY + 5.5, { align: "right" });
      doc.text("Amount", pageWidth - margin - 4, curY + 5.5, { align: "right" });
    };

    printTableHeader(yPos);
    yPos += 8;

    // 4. Item Rows
    const pageBottomThreshold = 240;
    billData.items.forEach((item, index) => {
      if (yPos > pageBottomThreshold) {
        doc.addPage();
        yPos = 16;
        printTableHeader(yPos);
        yPos += 8;
      }

      if (index % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, yPos, contentWidth, 7.5, "F");
      }

      doc.setDrawColor(241, 245, 249);
      doc.line(margin, yPos + 7.5, pageWidth - margin, yPos + 7.5);

      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text(String(index + 1), margin + 3, yPos + 5);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      const variant = variantOf(item);
      const itemName = `${item.product || item.productName || "Item"}${variant ? ` (${variant})` : ""}`;
      doc.text(itemName.slice(0, 45), margin + 14, yPos + 5);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(51, 65, 85);
      doc.text(String(item.qty || item.quantity || 1), margin + 98, yPos + 5, { align: "center" });

      const price = item.price || item.unitPrice || 0;
      doc.text(`Rs.${price.toFixed(2)}`, margin + 124, yPos + 5, { align: "right" });

      const taxRate = item.taxRate ? `${item.taxRate}%` : "0%";
      doc.text(taxRate, margin + 152, yPos + 5, { align: "right" });

      const total = item.total || item.subtotal || price * (item.qty || item.quantity || 1);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(`Rs.${total.toFixed(2)}`, pageWidth - margin - 4, yPos + 5, { align: "right" });

      yPos += 7.5;
    });

    if (yPos > 210) {
      doc.addPage();
      yPos = 16;
    }

    yPos += 4;

    // 5. Bottom Financial Summary Box & Legal Signatory
    const summaryWidth = 80;
    const summaryX = pageWidth - margin - summaryWidth;

    // Financial Table Box
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(summaryX, yPos, summaryWidth, 42, 2, 2, "FD");

    let sumY = yPos + 6;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);

    if (billData.pricing.tax > 0) {
      const taxableValue = Math.max(0, billData.pricing.total - billData.pricing.tax);
      doc.text("Taxable Value:", summaryX + 4, sumY);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(`Rs.${taxableValue.toFixed(2)}`, pageWidth - margin - 4, sumY, { align: "right" });
      sumY += 5.5;

      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      doc.text("Total GST (Taxes):", summaryX + 4, sumY);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(`Rs.${billData.pricing.tax.toFixed(2)}`, pageWidth - margin - 4, sumY, { align: "right" });
      sumY += 5.5;
    } else {
      doc.text("Subtotal:", summaryX + 4, sumY);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(`Rs.${billData.pricing.subtotal.toFixed(2)}`, pageWidth - margin - 4, sumY, { align: "right" });
      sumY += 5.5;
    }

    if ((billData.pricing.discount || 0) > 0) {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(225, 29, 72); // rose
      doc.text("Discount Applied:", summaryX + 4, sumY);
      doc.setFont("helvetica", "bold");
      doc.text(`-Rs.${(billData.pricing.discount || 0).toFixed(2)}`, pageWidth - margin - 4, sumY, { align: "right" });
      sumY += 5.5;
    }

    // Grand Total Highlight Bar
    doc.setFillColor(30, 27, 75);
    doc.roundedRect(summaryX + 2, sumY - 1, summaryWidth - 4, 11, 1.5, 1.5, "F");

    doc.setFontSize(9.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("GRAND TOTAL:", summaryX + 6, sumY + 6.5);
    doc.setFontSize(11);
    doc.text(`Rs.${billData.pricing.total.toFixed(2)}`, pageWidth - margin - 6, sumY + 6.5, { align: "right" });

    // Left Details: Words & Terms
    const leftWidth = contentWidth - summaryWidth - 6;
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(71, 85, 105);
    doc.text("AMOUNT IN WORDS:", margin, yPos + 6);

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 27, 75);
    doc.text(numberToIndianWords(billData.pricing.total), margin, yPos + 12);

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text("Terms & Conditions:", margin, yPos + 22);
    doc.text("1. Goods once sold are subject to store return & warranty policy.", margin, yPos + 26);
    doc.text("2. Please retain this invoice for any exchange or service inquiry.", margin, yPos + 30);
    doc.text("3. This is an authentic computer-generated digital tax invoice.", margin, yPos + 34);

    // Signatory Box
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(margin, yPos + 40, leftWidth, 22, 1, 1, "D");
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(71, 85, 105);
    doc.text(`For ${(billData.seller?.storeName || "HelloLocal Store").slice(0, 36)}`, margin + 4, yPos + 46);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text("Authorized Signatory (Digital Stamp)", margin + 4, yPos + 58);

    // 6. Page Bottom Footer
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, 285, pageWidth - margin, 285);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text("Generated via HelloLocal Merchant Point of Sale • Hyperlocal 10-Minute Network", pageWidth / 2, 290, { align: "center" });

    return doc;
  };

  /**
   * Download PDF using jsPDF
   */
  const handleDownloadPDF = () => {
    try {
      const doc = generateInvoicePDF(bill);
      const filename = `Invoice_${bill.billNumber}.pdf`;
      doc.save(filename);
      showToast(`Invoice ${filename} downloaded successfully!`, "success");
    } catch (err: any) {
      showToast(err.message || "Failed to generate invoice PDF", "error");
    }
  };

  /**
   * Direct PDF Sharing (Native Mobile Share Sheet / Web Share API with Desktop Fallback)
   */
  const handleSharePDF = async () => {
    try {
      const doc = generateInvoicePDF(bill);
      const fileName = `Invoice_${bill.billNumber}.pdf`;
      const pdfBlob = doc.output("blob");
      const pdfFile = new File([pdfBlob], fileName, { type: "application/pdf" });

      if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
        await navigator.share({
          files: [pdfFile],
          title: `Invoice #${bill.billNumber}`,
          text: `${bill.seller?.gstin ? "Tax Invoice" : "Bill of Supply"} for your purchase at ${bill.seller?.storeName || "HelloLocal Store"}. Grand Total: ₹${bill.pricing.total.toFixed(2)}`,
        });
        showToast("Invoice shared successfully!", "success");
      } else {
        // Desktop / browser fallback: save PDF and trigger WhatsApp invoice
        doc.save(fileName);
        showToast(`Invoice PDF downloaded. Opening WhatsApp receipt for customer...`, "info");
        handleShareWhatsApp();
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        showToast(err.message || "Failed to share invoice PDF", "error");
      }
    }
  };

  /**
   * WhatsApp Sharing
   */
  const handleShareWhatsApp = () => {
    const docTitle = bill.seller?.gstin ? "TAX INVOICE" : "BILL OF SUPPLY";
    const phone = bill.customer?.phone?.replace(/\D/g, "") || "";
    const itemsText = bill.items
      .map((it) => `• ${it.product || it.productName} (${it.qty || it.quantity}x) = ₹${(it.total || it.subtotal || 0).toFixed(2)}`)
      .join("\n");

    const lines = [
      `*${docTitle} FROM ${bill.seller?.storeName || "Store"}*`,
      `Bill No: ${bill.billNumber}`,
      `Date: ${formatDate(bill.orderDate || bill.date)}`,
      `----------------------------`,
      itemsText,
      `----------------------------`,
      ...((bill.pricing.discount || 0) > 0 ? [`Discount: -₹${(bill.pricing.discount || 0).toFixed(2)}`] : []),
      `*Grand Total: ₹${bill.pricing.total.toFixed(2)}*`,
      `Payment: ${bill.payment.method} (${bill.payment.status})`,
      ...(bill.payment.reference ? [`Ref / UTR: ${bill.payment.reference}`] : []),
      ``,
      `Thank you for shopping with us!`,
      `Invoice details for your purchase at ${bill.seller?.storeName || "HelloLocal Store"}.`,
    ];
    const message = encodeURIComponent(lines.join("\n"));

    const url = phone.length >= 10
      ? `https://wa.me/${phone.length === 10 ? "91" + phone : phone}?text=${message}`
      : `https://wa.me/?text=${message}`;

    window.open(url, "_blank");
    showToast(phone.length >= 10 ? "WhatsApp invoice opened for customer" : "WhatsApp sharing link generated", "info");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-purple-100">
        {/* Modal Header */}
        <div className="flex items-center justify-between bg-gradient-to-r from-purple-700 to-indigo-800 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold">Sale Completed Successfully!</h3>
              <p className="text-xs text-purple-200">Bill No: {bill.billNumber}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Modal Body / Bill Preview */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Format Selector Pills */}
          <div className="flex items-center justify-between rounded-xl bg-purple-50 p-1.5 border border-purple-100">
            <button
              onClick={() => setPrintFormat("thermal")}
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold transition-all ${
                printFormat === "thermal"
                  ? "bg-purple-700 text-white shadow-xs"
                  : "text-purple-900 hover:bg-purple-100"
              }`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="6" y="2" width="12" height="20" rx="2"></rect>
                <line x1="9" y1="6" x2="15" y2="6"></line>
                <line x1="9" y1="10" x2="15" y2="10"></line>
              </svg>
              80mm Thermal Receipt
            </button>
            <button
              onClick={() => setPrintFormat("a4")}
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold transition-all ${
                printFormat === "a4"
                  ? "bg-purple-700 text-white shadow-xs"
                  : "text-purple-900 hover:bg-purple-100"
              }`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
              </svg>
              Standard A4 Tax Invoice
            </button>
          </div>

          {/* Quick Summary Card */}
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3 mb-3">
              <div>
                <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Customer</span>
                <p className="font-bold text-neutral-900 text-sm">
                  {bill.customer?.name || "Walk-in Customer"}
                </p>
                {bill.customer?.phone && (
                  <p className="text-xs text-neutral-600">{bill.customer.phone}</p>
                )}
              </div>
              <div className="text-right">
                <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Payment Mode</span>
                <p className="font-bold text-emerald-700 text-sm">
                  {bill.payment.method} ({bill.payment.status})
                </p>
                {bill.payment.method === "Cash" && (bill.payment.receivedAmount || 0) > 0 && (
                  <p className="text-xs text-neutral-600">
                    Change: ₹{(bill.payment.changeReturned || 0).toFixed(2)}
                  </p>
                )}
              </div>
            </div>

            {/* Item List Summary */}
            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {bill.items.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-neutral-100 last:border-0">
                  <div className="flex-1 pr-2">
                    <span className="font-medium text-neutral-900">{item.product || item.productName}</span>
                    {variantOf(item) && (
                      <span className="text-neutral-500 ml-1">({variantOf(item)})</span>
                    )}
                  </div>
                  <div className="text-neutral-600 w-12 text-center">{item.qty || item.quantity}x</div>
                  <div className="font-semibold text-neutral-900 w-20 text-right">
                    ₹{(item.total || item.subtotal || 0).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="border-t border-neutral-200 mt-3 pt-3 flex items-center justify-between">
              <span className="text-sm font-bold text-neutral-700">Total Amount Paid</span>
              <span className="text-xl font-extrabold text-purple-700">
                ₹{bill.pricing.total.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Modal Footer / Actions */}
        <div className="bg-neutral-50 px-6 py-4 border-t border-neutral-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleSharePDF}
              className="flex items-center gap-1.5 rounded-lg bg-purple-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-purple-800 transition-colors shadow-xs"
              title="Share PDF invoice directly to WhatsApp, Email or Apps"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"></circle>
                <circle cx="6" cy="12" r="3"></circle>
                <circle cx="18" cy="19" r="3"></circle>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
              </svg>
              Share PDF
            </button>
            <button
              onClick={handleShareWhatsApp}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition-colors shadow-xs"
              title="Share digital bill via WhatsApp"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z"/>
              </svg>
              WhatsApp Bill
            </button>
            <button
              onClick={handleDownloadPDF}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Download PDF
            </button>
          </div>

          <div className="flex items-center gap-2">
            {onNewSale && (
              <button
                onClick={() => {
                  onClose();
                  onNewSale();
                }}
                className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-2 text-xs font-bold text-purple-700 hover:bg-purple-100 transition-colors"
              >
                + New Sale
              </button>
            )}
            <button
              onClick={printFormat === "thermal" ? handlePrintThermal : handlePrintA4}
              className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-700 to-indigo-800 px-5 py-2 text-xs font-bold text-white hover:opacity-95 transition-opacity shadow-md"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9"></polyline>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                <rect x="6" y="14" width="12" height="8"></rect>
              </svg>
              {printFormat === "thermal" ? "Print Thermal Receipt" : "Print A4 Invoice"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
