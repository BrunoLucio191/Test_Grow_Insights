import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas-pro";
import type { PaidData, DateRange, Campaign } from "./analytics-types";

const fmt = (n: number, opts: Intl.NumberFormatOptions = {}) =>
  new Intl.NumberFormat("pt-BR", opts).format(n);
const brl = (n: number) => fmt(n, { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (n: number) => `${fmt(n, { maximumFractionDigits: 2 })}%`;

export type PdfReportInput = {
  clientName: string;
  range: DateRange;
  attribution: string;
  paid: PaidData;
  aiMarkdown?: string | null;
  chartElement?: HTMLElement | null;
  campaigns?: Campaign[];
};

export async function exportCampaignPdf(input: PdfReportInput): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 36;
  let y = margin;

  // Header
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(`Relatório de Campanhas - ${input.clientName}`, margin, y);
  y += 22;

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(110);
  doc.text(
    `Período: ${input.range.from} - ${input.range.to}  /  Atribuição: ${input.attribution}  /  Gerado em ${new Date().toLocaleString("pt-BR")}`,
    margin,
    y,
  );
  y += 18;
  doc.setTextColor(0);

  // KPI grid
  const k = input.paid.kpis;
  const kpiRows: [string, string][] = [
    ["Investido", brl(k.spend)],
    ["Receita", brl(k.revenue)],
    ["ROAS", `${fmt(k.roas, { maximumFractionDigits: 2 })}x`],
    ["Resultados", fmt(k.conversions)],
    ["CPA", brl(k.cpa)],
    ["CTR", pct(k.ctr)],
    ["CPM", brl(k.cpm)],
    ["Impressões", fmt(k.impressions)],
    ["Cliques", fmt(k.clicks)],
    ["Alcance", fmt(k.reach)],
    ["Frequência", fmt(k.frequency, { maximumFractionDigits: 2 })],
    ["Conv. Rate", pct(k.conversionRate)],
  ];
  autoTable(doc, {
    startY: y,
    head: [["Métrica", "Valor"]],
    body: chunkPairs(kpiRows),
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [30, 41, 59], halign: "center" },
    columnStyles: { 1: { halign: "center" } },
    margin: { left: margin, right: margin },
  });
  y = (doc as any).lastAutoTable.finalY + 14;

  // Chart capture
  if (input.chartElement) {
    try {
      const canvas = await html2canvas(input.chartElement);
      canvas.style.filter = "brightness(0)";
      const img = canvas.toDataURL("image/png");
      const imgW = pageW - margin * 2;
      const imgH = (canvas.height / canvas.width) * imgW;
      if (y + imgH > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        y = margin + 10;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Evolução diária", margin + 3, y);
      y += 12;
      doc.addImage(img, "PNG", margin, y, imgW, imgH);
      y += imgH + 16;
    } catch (e) {
      console.warn("chart capture failed", e);
    }
  }

  // Campaigns table
  const campaigns = input.campaigns ?? input.paid.campaigns;
  if (campaigns.length > 0) {
    if (y > doc.internal.pageSize.getHeight() - 120) {
      doc.addPage();
      y = margin;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`Campanhas (${campaigns.length})`, margin, y);
    y += 8;
    autoTable(doc, {
      startY: y + 4,
      head: [["Status", "Campanha", "Gasto", "Result.", "CPA", "ROAS", "CTR"]],
      body: campaigns.map((c) => [
        c.status,
        c.name,
        brl(c.spent),
        fmt(c.results),
        c.cpa > 0 ? brl(c.cpa) : "—",
        c.roas > 0 ? `${fmt(c.roas, { maximumFractionDigits: 2 })}x` : "—",
        pct(c.ctr),
      ]),
      theme: "striped",
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [30, 41, 59] },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 14;
  }

  const filename = `relatorio-${slugify(input.clientName)}-${input.range.from}-a-${input.range.to}.pdf`;
  doc.save(filename);
}

function chunkPairs(rows: [string, string][]): string[][] {
  const out: string[][] = [];
  console.log(rows.length);
  for (let i = 0; i < rows.length; i += 2) {
    const a = rows[i];
    const b = rows[i + 1] ?? ["", ""];
    out.push([a[0], a[1]]);
    out.push([b[0], b[1]]);
  }
  console.log(out);
  return out;
}

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1");
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
