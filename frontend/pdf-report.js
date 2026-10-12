// Charge la bibliothèque jsPDF si elle n'est pas déjà disponible.

async function ensureJsPdf() {
  if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
  const loadScript = (src) =>
    new Promise((resolve, reject) => {
      const existing = Array.from(document.scripts).find((s) => s.src === src);
      if (existing) {
        if (window.jspdf && window.jspdf.jsPDF) return resolve();
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener(
          "error",
          () => reject(new Error(`Erreur chargement ${src}`)),
          { once: true },
        );
        return;
      }
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Erreur chargement ${src}`));
      document.head.appendChild(s);
    });
  const sources = [
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
    "https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js",
  ];
  for (const src of sources) {
    try {
      await loadScript(src);
      if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
    } catch (_) {}
  }
  showToast("Impossible de charger la bibliothèque PDF.", true);
  return null;
}

// Retourne les dimensions utiles de la page PDF.

function pdfPageSize(doc) {
  return {
    width: doc.internal.pageSize.getWidth(),
    height: doc.internal.pageSize.getHeight(),
  };
}

// Dessine l'en-tête standard des documents PDF.

// Cache du logo Naftal chargé depuis le fichier PNG
let _naftalLogoCache = null;
function getNaftalLogoData() {
  if (_naftalLogoCache !== undefined && _naftalLogoCache !== null)
    return Promise.resolve(_naftalLogoCache);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth || img.width;
        c.height = img.naturalHeight || img.height;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        _naftalLogoCache = c.toDataURL("image/png");
      } catch (e) {
        _naftalLogoCache = null;
      }
      resolve(_naftalLogoCache);
    };
    img.onerror = () => {
      _naftalLogoCache = null;
      resolve(null);
    };
    img.src = "naftal-logo.png";
  });
}

function pdfHeader(doc, opts = {}) {
  const { width } = pdfPageSize(doc);
  const ref = opts.reference || "";
  const top = opts.top || "";
  const branch = opts.branch || "Branche Commercialisation";
  const dept = opts.dept || "Direction Paiement Electronique";
  const service = opts.service || "";
  const badge = opts.badge || "";
  const qrText = opts.qrText || "SCAN POUR VERIFIER";

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(formatDateTime(nowIso()), 8, 8);
  if (top) doc.text(top, width / 2, 8, { align: "center" });

  // Logo Naftal (chargé depuis naftal-logo.png via cache)
  if (_naftalLogoCache) {
    doc.addImage(_naftalLogoCache, "PNG", 14, 13, 22, 22);
  } else {
    doc.roundedRect(14, 14, 18, 18, 2, 2);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("JD", 23, 24, { align: "center" });
    doc.setFontSize(6.5);
    doc.text("NAFTAL", 23, 29, { align: "center" });
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("NAFTAL SPA", 40, 22);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  if (branch) doc.text(branch, 40, 30);
  if (dept) doc.text(dept, 40, 37);
  if (service) {
    doc.setFont("helvetica", "italic");
    doc.text(service, 40, 44);
    doc.setFont("helvetica", "normal");
  }

  if (badge) {
    const y = service ? 48 : 42;
    doc.setFillColor(236, 236, 236);
    doc.roundedRect(40, y, 46, 8, 4, 4, "F");
    doc.setTextColor(100, 100, 100);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(badge, 63, y + 5.5, { align: "center" });
    doc.setTextColor(0, 0, 0);
  }

  doc.roundedRect(width - 34, 14, 20, 20, 1.5, 1.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.text("QR", width - 24, 24, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.text(qrText, width - 14, 30, { align: "right" });
  if (ref) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(ref, width - 14, service ? 52 : 46, { align: "right" });
  }

  doc.setLineWidth(0.8);
  doc.line(14, 58, width - 14, 58);
}

// Dessine le pied de page standard des documents PDF.

function pdfFooter(doc, line1 = "", line2 = "", pageNo = "") {
  const { width, height } = pdfPageSize(doc);
  doc.setFillColor(10, 10, 10);
  doc.roundedRect(16, height - 24, width - 32, 12, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  if (line1) doc.text(line1, width / 2, height - 18, { align: "center" });
  if (line2) doc.text(line2, width / 2, height - 13.5, { align: "center" });
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(8);
  if (pageNo) doc.text(pageNo, width - 10, height - 5, { align: "right" });
}

// Ajoute un titre de section dans le PDF.

function pdfSectionLabel(doc, text, x, y, countText = "") {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(text, x, y);
  if (countText) doc.text(countText, 190, y, { align: "right" });
}

// Dessine un bloc d'informations sous forme de grille dans le PDF.

function pdfInfoGrid(doc, items, opts = {}) {
  const x = opts.x || 22;
  const y = opts.y || 96;
  const cols = opts.cols || 2;
  const colW = opts.colW || 76;
  const rowH = opts.rowH || 22;
  const gapX = opts.gapX || 12;
  items.forEach((item, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const px = x + col * (colW + gapX);
    const py = y + row * rowH;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(String(item.label || "").toUpperCase(), px, py);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    const lines = doc.splitTextToSize(String(item.value || "-"), colW - 2);
    doc.text(lines, px, py + 8);
  });
}

// Dessine un encadré avec un titre et du texte dans le PDF.

function pdfOutlinedBox(doc, x, y, w, h) {
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, w, h, 2, 2);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
}

// Dessine un tableau simple dans le PDF.

function pdfSimpleTable(doc, cfg) {
  const x = cfg.x || 14;
  const y = cfg.y || 20;
  const widths = cfg.widths || [];
  const headers = cfg.headers || [];
  const rows = cfg.rows || [];
  const headerH = cfg.headerH || 10;
  const rowH = cfg.rowH || 12;
  const fontSize = cfg.fontSize || 8.8;
  const darkHeader = !!cfg.darkHeader;
  const verticals = !!cfg.verticals;
  const grid = !!cfg.grid;
  const aligns = cfg.aligns || [];
  const title = cfg.title || "";
  const headerFill = cfg.headerFill || [240, 248, 255];
  const borderColor = cfg.borderColor || [150, 150, 150];
  const borderWidth = cfg.borderWidth || 0.18;

  const totalW = widths.reduce((a, b) => a + b, 0);
  let cy = y;

  if (title) {
    doc.setFillColor(8, 8, 8);
    doc.rect(x, cy, totalW, 12, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.text(title, x + 4, cy + 8);
    doc.setTextColor(0, 0, 0);
    cy += 15;
  }

  if (grid) {
    doc.setDrawColor(...borderColor);
    doc.setLineWidth(borderWidth);
    doc.setFillColor(...headerFill);
    let hx = x;
    widths.forEach((w) => {
      doc.rect(hx, cy, w, headerH, "FD");
      hx += w;
    });
  } else if (darkHeader) {
    doc.setFillColor(55, 55, 55);
    doc.roundedRect(x, cy, totalW, headerH, 1.5, 1.5, "F");
    doc.setTextColor(255, 255, 255);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(fontSize);
  let cx = x;
  headers.forEach((h, i) => {
    const align = aligns[i] || "left";
    const tx =
      align === "center"
        ? cx + widths[i] / 2
        : align === "right"
          ? cx + widths[i] - 1.5
          : cx + 1.5;
    doc.text(String(h), tx, cy + headerH - 3, { align });
    cx += widths[i];
  });
  if (darkHeader) doc.setTextColor(0, 0, 0);
  cy += headerH + (grid ? 0 : 2);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(fontSize);
  rows.forEach((row) => {
    let cellX = x;
    let maxLines = 1;
    const cellLines = row.map((cell, i) => {
      const lines = doc.splitTextToSize(
        String(cell ?? ""),
        Math.max(6, widths[i] - 3),
      );
      if (lines.length > maxLines) maxLines = lines.length;
      return lines;
    });
    const currentH = Math.max(rowH, 4 + maxLines * 4.2);

    // Fill row background with light blue
    doc.setFillColor(240, 248, 255);
    doc.rect(x, cy, totalW, currentH, "F");

    if (grid) {
      doc.setDrawColor(...borderColor);
      doc.setLineWidth(borderWidth);
    } else if (verticals) {
      doc.line(x, cy - 1, x + totalW, cy - 1);
    }

    cellLines.forEach((lines, i) => {
      const align = aligns[i] || "left";
      if (grid) {
        doc.rect(cellX, cy, widths[i], currentH, "S");
      }
      const tx =
        align === "center"
          ? cellX + widths[i] / 2
          : align === "right"
            ? cellX + widths[i] - 1.5
            : cellX + 1.5;
      doc.text(lines, tx, cy + 4, { align });
      if (!grid && verticals)
        doc.line(
          cellX + widths[i],
          cy - 1,
          cellX + widths[i],
          cy + currentH - 2,
        );
      cellX += widths[i];
    });
    cy += currentH;
  });
  return cy;
}

// Ajoute une zone de signature dans le PDF.

function pdfSignatureLine(
  doc,
  x,
  y,
  w,
  title,
  line1 = "",
  line2 = "",
  line3 = "",
) {
  doc.line(x, y, x + w, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text(title, x + w / 2, y + 12, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  if (line1) doc.text(line1, x + w / 2, y + 36, { align: "center" });
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  if (line2) doc.text(line2, x + w / 2, y + 44, { align: "center" });
  doc.setFont("helvetica", "normal");
  if (line3) doc.text(line3, x + w / 2, y + 52, { align: "center" });
}

// Génère un PDF simple de décharge.

async function generateSimpleDechargePdf(data) {
  const jsPDF = await ensureJsPdf();
  if (!jsPDF) return null;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  pdfHeader(doc, {
    reference: data.reference || "",
    top: data.object || "Décharge officielle",
    branch: "Branche Commercialisation",
    dept: "Direction Paiement Electronique",
    badge: "DECHARGE OFFICIELLE",
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text(String(data.object || "DECHARGE OFFICIELLE").toUpperCase(), 14, 74);
  doc.line(14, 77, 60, 77);
  pdfSectionLabel(doc, "INFORMATIONS", 18, 94);
  pdfInfoGrid(
    doc,
    [
      { label: "De", value: data.from || "-" },
      { label: "Vers", value: data.to || "-" },
      { label: "Date", value: formatDate(data.date) },
      { label: "Statut", value: data.status || "-" },
      { label: "Référence", value: data.reference || "-" },
      { label: "Objet", value: data.object || "-" },
    ],
    { x: 20, y: 110, cols: 2, colW: 74, gapX: 18, rowH: 24 },
  );
  pdfFooter(
    doc,
    "NAFTAL SPA - Branche Commercialisation - Direction Paiement Electronique",
    "Document officiel",
    "1/1",
  );
  return doc.output("datauristring");
}

// Génère le PDF de décharge type 1 pour la mise en circulation initiale.

async function generateDechargeType1(cards, meta) {
  const jsPDF = await ensureJsPdf();
  if (!jsPDF) return null;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const ref =
    meta.reference ||
    (state.sequence.type1
      ? String(state.sequence.type1 - 1).padStart(3, "0") +
        "/" +
        new Date().getFullYear()
      : nextReference("type1"));

  pdfHeader(doc, {
    reference: ref,
    top: `Décharge ${ref} - Cartes NaftalCard`,
    branch: "Branche Commercialisation",
    dept: "Direction Paiement Electronique",
    badge: "DECHARGE OFFICIELLE",
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16.5);
  doc.text("DÉCHARGE DE CARTES NaftalCard", 14, 74);
  doc.setFontSize(13);
  doc.text(ref, 195, 74, { align: "right" });
  doc.setLineWidth(0.3);
  doc.line(14, 78, 64, 78);
  doc.line(14, 82, 196, 82);

  pdfSectionLabel(doc, "INFORMATIONS DE LA DÉCHARGE", 20, 95);
  pdfOutlinedBox(doc, 16, 101, 180, 54);
  pdfInfoGrid(
    doc,
    [
      { label: "Destinataire", value: meta.beneficiary },
      { label: "Fonction", value: meta.functionLabel },
      { label: "Date de sortie", value: formatDate(meta.date) },
      { label: "Numéro BTS", value: meta.bts || "Non spécifié" },
      { label: "Structure", value: meta.structure },
      { label: "Structure rattachement", value: meta.district },
    ],
    { x: 22, y: 113, cols: 2, colW: 74, gapX: 18, rowH: 14 },
  );

  doc.setFillColor(255, 240, 240);
  doc.roundedRect(16, 165, 180, 56, 2, 2, "F");
  pdfOutlinedBox(doc, 16, 165, 180, 56);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("DÉCLARATION OFFICIELLE", 22, 175);
  doc.setLineWidth(0.25);
  doc.line(22, 178, 82, 178);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const decl = [
    `Le soussigné ${meta.beneficiary || "........................................"}, ${meta.functionLabel || "........................................"},`,
    `reconnaît avoir reçu ce jour ${formatDate(meta.date)} de la Direction Paiement Electronique`,
    `Branche Commercialisation (NAFTAL-SPA), les cartes de paiement NAFTALCARD suivantes.`,
  ].join(" ");
  const declLines = doc.splitTextToSize(decl, 166);
  doc.text(declLines, 22, 188, { baseline: "top" });

  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.text("Le détail des cartes remises figure à la page suivante.", 22, 214);

  pdfFooter(
    doc,
    "NAFTAL SPA - Branche Commercialisation - Direction Paiement Electronique",
    "Décharge de remise initiale des cartes NaftalCard",
    "1/2",
  );

  doc.addPage();
  pdfHeader(doc, {
    reference: ref,
    top: `Décharge ${ref} - Détail des cartes`,
    branch: "Branche Commercialisation",
    dept: "Direction Paiement Electronique",
    badge: "DÉTAIL DES CARTES",
  });

  pdfSectionLabel(
    doc,
    "INVENTAIRE DES CARTES REMISES",
    18,
    76,
    `${cards.length} ${cards.length > 1 ? "Cartes" : "Carte"}`,
  );
  const tableEndY = pdfSimpleTable(doc, {
    x: 16,
    y: 86,
    widths: [12, 40, 28, 48, 30, 26],
    headers: [
      "N°",
      "NUMÉRO DE CARTE",
      "CODE CLIENT",
      "RAISON SOCIALE CLIENT",
      "STRUCTURE",
      "DISTRICT",
    ],
    rows: cards.map((card, i) => [
      i + 1,
      card.number,
      card.codeClient,
      card.company || card.owner,
      meta.structure || card.station,
      meta.district || card.district,
    ]),
    headerH: 12,
    rowH: 17,
    fontSize: 8.2,
    grid: true,
    borderWidth: 0.15,
    borderColor: [165, 165, 165],
    headerFill: [240, 248, 255],
    aligns: ["center", "left", "left", "left", "left", "left"],
  });

  let sigY = Math.max(180, tableEndY + 16);
  if (sigY > 225) sigY = 225;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.text("APPROBATIONS ET SIGNATURES", 105, sigY, { align: "center" });
  pdfSignatureLine(
    doc,
    16,
    sigY + 10,
    74,
    "POUR L'ÉMETTEUR",
    "Direction Paiement Electronique",
    currentUser?.name || "Système",
    `Date: ${formatDate(meta.date)}`,
  );
  pdfSignatureLine(
    doc,
    108,
    sigY + 10,
    74,
    "POUR LE BÉNÉFICIAIRE",
    meta.beneficiary,
    meta.functionLabel,
    meta.structure || "",
  );
  pdfFooter(
    doc,
    "NAFTAL SPA - Branche Commercialisation - Direction Paiement Electronique",
    "Document officiel - Toute falsification est passible de poursuites",
    "2/2",
  );
  return doc.output("datauristring");
}

// Génère le PDF de décharge type 1 pour la mise en service des TPE.

async function generateTpeDechargeType1(tpe, meta) {
  const jsPDF = await ensureJsPdf();
  if (!jsPDF) return null;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const ref =
    meta.reference ||
    (state.sequence.tpe
      ? String(state.sequence.tpe - 1).padStart(3, "0") +
        "/" +
        new Date().getFullYear()
      : nextReference("tpe"));

  pdfHeader(doc, {
    reference: ref,
    top: `Décharge ${ref} - TPE CIB`,
    branch: "Branche Commercialisation",
    dept: "Direction Paiement Electronique",
    badge: "DECHARGE OFFICIELLE",
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16.5);
  doc.text("DÉCHARGE DE TPE CIB", 14, 74);
  doc.setFontSize(13);
  doc.text(ref, 195, 74, { align: "right" });
  doc.setLineWidth(0.3);
  doc.line(14, 78, 64, 78);
  doc.line(14, 82, 196, 82);

  pdfSectionLabel(doc, "INFORMATIONS DE LA DÉCHARGE", 20, 95);
  pdfOutlinedBox(doc, 16, 101, 180, 54);
  pdfInfoGrid(
    doc,
    [
      { label: "Destinataire", value: meta.beneficiary },
      { label: "Fonction", value: meta.functionLabel },
      { label: "Date de sortie", value: formatDate(meta.date) },
      { label: "Numéro inventaire", value: meta.inventory || "Non spécifié" },
      { label: "Structure", value: meta.structure },
      { label: "Structure rattachement", value: meta.district },
    ],
    { x: 22, y: 113, cols: 2, colW: 74, gapX: 18, rowH: 14 },
  );

  doc.setFillColor(255, 240, 240);
  doc.roundedRect(16, 165, 180, 56, 2, 2, "F");
  pdfOutlinedBox(doc, 16, 165, 180, 56);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("DÉCLARATION OFFICIELLE", 22, 175);
  doc.setLineWidth(0.25);
  doc.line(22, 178, 82, 178);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const decl = [
    `Le soussigné ${meta.beneficiary || "........................................"}, ${meta.functionLabel || "........................................"},`,
    `reconnaît avoir reçu ce jour ${formatDate(meta.date)} de la Direction Paiement Electronique`,
    `Branche Commercialisation (NAFTAL-SPA), les terminaux de paiement TPE suivants.`,
  ].join(" ");
  const declLines = doc.splitTextToSize(decl, 166);
  doc.text(declLines, 22, 188, { baseline: "top" });

  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.text("Le détail des TPE remis figure à la page suivante.", 22, 214);

  pdfFooter(
    doc,
    "NAFTAL SPA - Branche Commercialisation - Direction Paiement Electronique",
    "Décharge de remise initiale des TPE CIB",
    "1/2",
  );

  doc.addPage();
  pdfHeader(doc, {
    reference: ref,
    top: `Décharge ${ref} - Détail des TPE`,
    branch: "Branche Commercialisation",
    dept: "Direction Paiement Electronique",
    badge: "DÉTAIL DES TPE",
  });

  pdfSectionLabel(
    doc,
    "INVENTAIRE DES TPE REMIS",
    18,
    76,
    `${tpe.length} ${tpe.length > 1 ? "TPE" : "TPE"}`,
  );
  const tableEndY = pdfSimpleTable(doc, {
    x: 16,
    y: 86,
    widths: [12, 40, 30, 40, 30, 32],
    headers: [
      "N°",
      "N° SÉRIE",
      "ID TERMINAL",
      "NOM COMMERCIAL",
      "STRUCTURE",
      "DISTRICT",
    ],
    rows: tpe.map((t, i) => [
      i + 1,
      t.serial,
      t.idTerminal || "-",
      t.nomCommercial || "-",
      meta.structure || t.station || "-",
      meta.district || t.district || "-",
    ]),
    headerH: 12,
    rowH: 17,
    fontSize: 8.2,
    grid: true,
    borderWidth: 0.15,
    borderColor: [165, 165, 165],
    headerFill: [240, 248, 255],
    aligns: ["center", "left", "left", "left", "left", "left"],
  });

  let sigY = Math.max(180, tableEndY + 16);
  if (sigY > 225) sigY = 225;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.text("APPROBATIONS ET SIGNATURES", 105, sigY, { align: "center" });
  pdfSignatureLine(
    doc,
    16,
    sigY + 10,
    74,
    "POUR L'ÉMETTEUR",
    "Direction Paiement Electronique",
    currentUser?.name || "Système",
    `Date: ${formatDate(meta.date)}`,
  );
  pdfSignatureLine(
    doc,
    108,
    sigY + 10,
    74,
    "POUR LE BÉNÉFICIAIRE",
    meta.beneficiary,
    meta.functionLabel,
    meta.structure || "",
  );
  pdfFooter(
    doc,
    "NAFTAL SPA - Branche Commercialisation - Direction Paiement Electronique",
    "Document officiel - Toute falsification est passible de poursuites",
    "2/2",
  );
  return doc.output("datauristring");
}

// Génère le PDF de décharge type 2 pour un transfert des TPE vers BEA.

async function generateTpeDechargeType2(tpe, meta) {
  const jsPDF = await ensureJsPdf();
  if (!jsPDF) return null;
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  pdfHeader(doc, {
    reference: meta.reference,
    top: `Décharge ${meta.reference} - Transmission BEA`,
    branch: "Branche Commercialisation",
    dept: "Direction Paiement Electronique",
    badge: "TRANSMISSION BEA",
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16.5);
  doc.text("TRANSMISSION TERMINAUX TPE CIB", 14, 74);
  doc.setFontSize(13);
  doc.text(meta.reference, 195, 74, { align: "right" });
  doc.setLineWidth(0.3);
  doc.line(14, 78, 64, 78);
  doc.line(14, 82, 196, 82);

  pdfSectionLabel(doc, "INFORMATIONS DE TRANSMISSION", 20, 95);
  pdfOutlinedBox(doc, 16, 101, 180, 54);
  pdfInfoGrid(
    doc,
    [
      { label: "Agent émetteur", value: currentUser?.name || "Système" },
      { label: "Date d'envoi", value: formatDate(meta.date) },
      { label: "Structure émettrice", value: "Département Monétique" },
      { label: "Destination", value: "BEA - Bureau d'Etudes et Applications" },
      { label: "Nombre de TPE", value: String(tpe.length) },
      {
        label: "Motif de transmission",
        value: meta.reason || "Maintenance/anomalie",
      },
    ],
    { x: 22, y: 113, cols: 2, colW: 74, gapX: 18, rowH: 14 },
  );

  pdfOutlinedBox(doc, 16, 165, 180, 56);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("DÉCLARATION DE TRANSMISSION", 22, 175);
  doc.setLineWidth(0.25);
  doc.line(22, 178, 82, 178);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const decl = [
    `Le soussigné ${currentUser?.name || "........................................"}, agent de la Direction Paiement Electronique,`,
    `Branche Commercialisation (NAFTAL-SPA), certifie avoir transmis ce jour ${formatDate(meta.date)}`,
    `les terminaux de paiement TPE suivants au BEA pour traitement/maintenance.`,
  ].join(" ");
  const declLines = doc.splitTextToSize(decl, 166);
  doc.text(declLines, 22, 188, { baseline: "top" });

  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.text("Le détail des TPE transmis figure à la page suivante.", 22, 214);

  pdfFooter(
    doc,
    "NAFTAL SPA - Branche Commercialisation - Direction Paiement Electronique",
    "Transmission de terminaux TPE au BEA",
    "1/2",
  );

  doc.addPage();
  pdfHeader(doc, {
    reference: meta.reference,
    top: `Transmission BEA - Détail ${meta.reference}`,
    branch: "Branche Commercialisation",
    dept: "Direction Paiement Electronique",
    badge: "DÉTAIL DES TPE",
  });

  pdfSectionLabel(
    doc,
    "INVENTAIRE DES TPE TRANSMIS",
    18,
    76,
    `${tpe.length} ${tpe.length > 1 ? "TPE" : "TPE"}`,
  );
  const tableEndY = pdfSimpleTable(doc, {
    x: 16,
    y: 86,
    widths: [12, 40, 30, 40, 30, 32],
    headers: [
      "N°",
      "N° SÉRIE TPE",
      "ID TERMINAL",
      "NOM COMMERCIAL",
      "STRUCTURE",
      "ANOMALIE",
    ],
    rows: tpe.map((t, i) => [
      i + 1,
      t.serial,
      t.idTerminal || "-",
      t.nomCommercial || "-",
      t.station || "-",
      meta.reason || t.anomaly || "Non spécifiée",
    ]),
    headerH: 12,
    rowH: 17,
    fontSize: 8.2,
    grid: true,
    borderWidth: 0.15,
    borderColor: [165, 165, 165],
    headerFill: [240, 248, 255],
    aligns: ["center", "left", "left", "left", "left", "left"],
  });

  let sigY = Math.max(180, tableEndY + 16);
  if (sigY > 225) sigY = 225;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.text("VALIDATION ET SIGNATURES", 105, sigY, { align: "center" });
  pdfSignatureLine(
    doc,
    16,
    sigY + 10,
    74,
    "POUR L'ÉMETTEUR",
    "Direction Paiement Electronique",
    currentUser?.name || "Système",
    `Date: ${formatDate(meta.date)}`,
  );
  pdfSignatureLine(
    doc,
    108,
    sigY + 10,
    74,
    "POUR LE RÉCEPTEUR",
    "BEA - Bureau d'Etudes et Applications",
    "Signature et cachet",
    "Date de réception",
  );
  pdfFooter(
    doc,
    "NAFTAL SPA - Branche Commercialisation - Direction Paiement Electronique",
    "Document officiel - Toute falsification est passible de poursuites",
    "2/2",
  );
  return doc.output("datauristring");
}

// Génère le PDF de décharge type 3 pour un retour en circulation des TPE.

async function generateTpeDechargeType3(tpe, meta) {
  const jsPDF = await ensureJsPdf();
  if (!jsPDF) return null;
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  pdfHeader(doc, {
    reference: meta.reference,
    top: `Décharge BEA - ${meta.reference}`,
    branch: "",
    dept: "Direction Paiement Electronique",
    service: "Bureau d'Etudes et Applications (BEA)",
    badge: "DECHARGE TYPE 3 - BEA",
    qrText: "Vérification BEA",
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("RETOUR EN CIRCULATION", 105, 76, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Document de restitution des TPE traitées par le BEA", 105, 84, {
    align: "center",
  });

  pdfOutlinedBox(doc, 14, 92, 182, 92);
  pdfInfoGrid(
    doc,
    [
      { label: "Référence BEA", value: meta.reference },
      {
        label: "Destinataire",
        value: meta.destination || tpe[0]?.station || "-",
      },
      { label: "Date création", value: formatDate(nowIso()) },
      { label: "Fonction", value: meta.functionLabel || "Non spécifiée" },
      { label: "Date sortie", value: formatDate(meta.date) },
      { label: "Numéro inventaire", value: meta.inventory || "Non spécifié" },
      {
        label: "Structure",
        value: tpe[0]?.district || meta.destination || "-",
      },
      { label: "District", value: tpe[0]?.district || "-" },
      {
        label: "Motif / diagnostic",
        value: meta.reason || tpe[0]?.anomaly || "Traité",
      },
      { label: "TPE substitution", value: meta.substitution || "-" },
    ],
    { x: 20, y: 104, cols: 2, colW: 76, gapX: 16, rowH: 14 },
  );

  doc.setFillColor(65, 65, 65);
  doc.roundedRect(14, 190, 182, 10, 1.5, 1.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`District: ${tpe[0]?.district || "-"}`, 18, 197);
  doc.setFont("helvetica", "bold");
  doc.text(`${tpe.length} ${tpe.length > 1 ? "TPE" : "TPE"}`, 192, 197, {
    align: "right",
  });
  doc.setTextColor(0, 0, 0);

  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.text(
    "Le détail du retour en circulation figure à la page suivante.",
    18,
    210,
  );
  pdfFooter(
    doc,
    "NAFTAL SPA - Direction Paiement Electronique - Bureau d'Etudes et Applications",
    "Retour en circulation des TPE traitées",
    "1/2",
  );

  doc.addPage();
  pdfHeader(doc, {
    reference: meta.reference,
    top: `Retour en circulation - détail ${meta.reference}`,
    branch: "",
    dept: "Direction Paiement Electronique",
    service: "Bureau d'Etudes et Applications (BEA)",
    badge: "DÉTAIL DU RETOUR",
    qrText: "BEA",
  });

  const finalState = (t) => {
    if (meta.substitution && meta.substitution !== "-") return "TPE substituée";
    if (t.status === "En panne") return "Réparée";
    return t.status;
  };

  const tableEndY = pdfSimpleTable(doc, {
    x: 14,
    y: 76,
    widths: [10, 34, 24, 36, 34, 26, 22],
    headers: [
      "N°",
      "N° SÉRIE TPE",
      "ID TERMINAL",
      "NOM COMMERCIAL",
      "DIAGNOSTIC",
      "SUBSTITUTION",
      "ÉTAT FINAL",
    ],
    rows: tpe.map((t, i) => [
      i + 1,
      t.serial,
      t.idTerminal || "-",
      t.nomCommercial || "-",
      meta.reason || t.anomaly || "Traité",
      meta.substitution || "-",
      finalState(t),
    ]),
    headerH: 12,
    rowH: 17,
    fontSize: 7.2,
    grid: true,
    borderWidth: 0.15,
    borderColor: [165, 165, 165],
    headerFill: [240, 248, 255],
    aligns: ["center", "left", "left", "left", "left", "left", "left"],
  });

  let sigY = tableEndY + 18;
  if (sigY > 208) sigY = 208;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.text("VALIDATION DU RETOUR EN CIRCULATION", 105, sigY, {
    align: "center",
  });
  pdfSignatureLine(
    doc,
    16,
    sigY + 10,
    72,
    "ÉMISSION - BEA",
    currentUser?.name || "System",
    "Responsable BEA",
    formatDate(meta.date),
  );
  pdfSignatureLine(
    doc,
    110,
    sigY + 10,
    72,
    "RÉCEPTION - UTILISATEUR FINAL",
    meta.destination || tpe[0]?.station || "-",
    meta.functionLabel || "",
    tpe[0]?.district || "",
  );
  pdfFooter(
    doc,
    "NAFTAL SPA - Direction Paiement Electronique - Bureau d'Etudes et Applications",
    `Retour en circulation n°${meta.reference}`,
    "2/2",
  );
  return doc.output("datauristring");
}

// Génère le PDF de décharge type 2 pour un transfert vers DCSI.
async function generateDechargeType2(cards, meta) {
  const jsPDF = await ensureJsPdf();
  if (!jsPDF) return null;
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  pdfHeader(doc, {
    reference: meta.reference,
    top: `Décharge ${meta.reference} - Transmission DCSI`,
    branch: "Branche Commercialisation",
    dept: "Direction Paiement Electronique",
    badge: "TRANSMISSION DCSI",
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16.5);
  doc.text("TRANSMISSION CARTE NAFTALCARD", 14, 74);
  doc.setFontSize(13);
  doc.text(meta.reference, 195, 74, { align: "right" });
  doc.setLineWidth(0.3);
  doc.line(14, 78, 64, 78);
  doc.line(14, 82, 196, 82);

  pdfSectionLabel(doc, "INFORMATIONS DE TRANSMISSION", 20, 95);
  pdfOutlinedBox(doc, 16, 101, 180, 54);
  pdfInfoGrid(
    doc,
    [
      { label: "Agent émetteur", value: currentUser?.name || "Système" },
      { label: "Date d'envoi", value: formatDate(meta.date) },
      { label: "Structure émettrice", value: "Département Monétique" },
      { label: "Destination", value: "DCSI - Maintenance Monétique" },
      { label: "Nombre de cartes", value: String(cards.length) },
      {
        label: "Motif de transmission",
        value: meta.reason || "Maintenance/anomalie",
      },
    ],
    { x: 22, y: 113, cols: 2, colW: 74, gapX: 18, rowH: 14 },
  );

  pdfOutlinedBox(doc, 16, 165, 180, 56);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("DÉCLARATION DE TRANSMISSION", 22, 175);
  doc.setLineWidth(0.25);
  doc.line(22, 178, 82, 178);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const decl = [
    `Le soussigné ${currentUser?.name || "........................................"}, agent de la Direction Paiement Electronique,`,
    `Branche Commercialisation (NAFTAL-SPA), certifie avoir transmis ce jour ${formatDate(meta.date)}`,
    `les cartes de paiement NAFTALCARD suivantes au DCSI pour traitement/maintenance.`,
  ].join(" ");
  const declLines = doc.splitTextToSize(decl, 166);
  doc.text(declLines, 22, 188, { baseline: "top" });

  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.text(
    "Le détail des cartes transmises figure à la page suivante.",
    22,
    214,
  );

  pdfFooter(
    doc,
    "NAFTAL SPA - Branche Commercialisation - Direction Paiement Electronique",
    "Transmission de cartes NaftalCard au DCSI",
    "1/2",
  );

  doc.addPage();
  pdfHeader(doc, {
    reference: meta.reference,
    top: `Transmission DCSI - Détail ${meta.reference}`,
    branch: "Branche Commercialisation",
    dept: "Direction Paiement Electronique",
    badge: "DÉTAIL DES CARTES",
  });

  pdfSectionLabel(
    doc,
    "INVENTAIRE DES CARTES TRANSMIES",
    18,
    76,
    `${cards.length} ${cards.length > 1 ? "Cartes" : "Carte"}`,
  );
  const tableEndY = pdfSimpleTable(doc, {
    x: 16,
    y: 86,
    widths: [12, 40, 28, 48, 30, 26],
    headers: [
      "N°",
      "NUMÉRO DE CARTE",
      "CODE CLIENT",
      "RAISON SOCIALE CLIENT",
      "STRUCTURE",
      "ANOMALIE",
    ],
    rows: cards.map((card, i) => [
      i + 1,
      card.number,
      card.codeClient,
      card.company || card.owner,
      card.station || "-",
      meta.reason || card.anomaly || "Non spécifiée",
    ]),
    headerH: 12,
    rowH: 17,
    fontSize: 8.2,
    grid: true,
    borderWidth: 0.15,
    borderColor: [165, 165, 165],
    headerFill: [240, 248, 255],
    aligns: ["center", "left", "left", "left", "left", "left"],
  });

  let sigY = Math.max(180, tableEndY + 16);
  if (sigY > 225) sigY = 225;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.text("VALIDATION ET SIGNATURES", 105, sigY, { align: "center" });
  pdfSignatureLine(
    doc,
    16,
    sigY + 10,
    74,
    "POUR L'ÉMETTEUR",
    "Direction Paiement Electronique",
    currentUser?.name || "Système",
    `Date: ${formatDate(meta.date)}`,
  );
  pdfSignatureLine(
    doc,
    108,
    sigY + 10,
    74,
    "POUR LE RÉCEPTEUR",
    "DCSI - Maintenance Monétique",
    "Signature et cachet",
    "Date de réception",
  );
  pdfFooter(
    doc,
    "NAFTAL SPA - Branche Commercialisation - Direction Paiement Electronique",
    "Document officiel - Toute falsification est passible de poursuites",
    "2/2",
  );
  return doc.output("datauristring");
}

// Génère le PDF de décharge type 3 pour un retour en circulation.

async function generateDechargeType3(cards, meta) {
  const jsPDF = await ensureJsPdf();
  if (!jsPDF) return null;
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  pdfHeader(doc, {
    reference: meta.reference,
    top: `Décharge STR - ${meta.reference}`,
    branch: "",
    dept: "Direction Paiement Electronique",
    service: "Service Technique Retour (STR)",
    badge: "DECHARGE TYPE 3 - STR",
    qrText: "Vérification STR",
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("RETOUR EN CIRCULATION", 105, 76, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(
    "Document de restitution des cartes traitées par le service technique",
    105,
    84,
    { align: "center" },
  );

  pdfOutlinedBox(doc, 14, 92, 182, 92);
  pdfInfoGrid(
    doc,
    [
      { label: "Référence STR", value: meta.reference },
      {
        label: "Destinataire",
        value: meta.destination || cards[0]?.station || "-",
      },
      { label: "Date création", value: formatDate(nowIso()) },
      { label: "Fonction", value: meta.functionLabel || "Non spécifiée" },
      { label: "Date sortie", value: formatDate(meta.date) },
      { label: "Numéro BTS", value: meta.bts || "Non spécifié" },
      {
        label: "Structure",
        value: cards[0]?.district || meta.destination || "-",
      },
      { label: "District", value: cards[0]?.district || "-" },
      {
        label: "Motif / diagnostic",
        value: meta.reason || cards[0]?.anomaly || "Traité",
      },
      { label: "Carte substitution", value: meta.substitution || "-" },
    ],
    { x: 20, y: 104, cols: 2, colW: 76, gapX: 16, rowH: 14 },
  );

  doc.setFillColor(65, 65, 65);
  doc.roundedRect(14, 190, 182, 10, 1.5, 1.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`District: ${cards[0]?.district || "-"}`, 18, 197);
  doc.setFont("helvetica", "bold");
  doc.text(
    `${cards.length} ${cards.length > 1 ? "cartes" : "carte"}`,
    192,
    197,
    { align: "right" },
  );
  doc.setTextColor(0, 0, 0);

  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.text(
    "Le détail du retour en circulation figure à la page suivante.",
    18,
    210,
  );
  pdfFooter(
    doc,
    "NAFTAL SPA - Direction Paiement Electronique - Service Technique Retour",
    "Retour en circulation des cartes traitées",
    "1/2",
  );

  doc.addPage();
  pdfHeader(doc, {
    reference: meta.reference,
    top: `Retour en circulation - détail ${meta.reference}`,
    branch: "",
    dept: "Direction Paiement Electronique",
    service: "Service Technique Retour (STR)",
    badge: "DÉTAIL DU RETOUR",
    qrText: "STR",
  });

  const finalState = (card) => {
    if (meta.substitution && meta.substitution !== "-")
      return "Carte substituée";
    if (card.status === "Bloquée") return "Débloquée";
    return card.status;
  };

  const tableEndY = pdfSimpleTable(doc, {
    x: 14,
    y: 76,
    widths: [10, 34, 24, 36, 34, 26, 22],
    headers: [
      "N°",
      "NUMÉRO CARTE",
      "CODE CLIENT",
      "RAISON SOCIALE",
      "DIAGNOSTIC",
      "SUBSTITUTION",
      "ÉTAT FINAL",
    ],
    rows: cards.map((card, i) => [
      i + 1,
      card.number,
      card.codeClient,
      card.company || card.owner,
      meta.reason || card.anomaly || "Traité",
      meta.substitution || "-",
      finalState(card),
    ]),
    headerH: 12,
    rowH: 17,
    fontSize: 7.2,
    grid: true,
    borderWidth: 0.15,
    borderColor: [165, 165, 165],
    headerFill: [240, 248, 255],
    aligns: ["center", "left", "left", "left", "left", "left", "left"],
  });

  let sigY = tableEndY + 18;
  if (sigY > 208) sigY = 208;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.text("VALIDATION DU RETOUR EN CIRCULATION", 105, sigY, {
    align: "center",
  });
  pdfSignatureLine(
    doc,
    16,
    sigY + 10,
    72,
    "ÉMISSION - SERVICE TECHNIQUE STR",
    currentUser?.name || "System",
    "Responsable technique STR",
    formatDate(meta.date),
  );
  pdfSignatureLine(
    doc,
    110,
    sigY + 10,
    72,
    "RÉCEPTION - UTILISATEUR FINAL",
    meta.destination || cards[0]?.station || "-",
    meta.functionLabel || "",
    cards[0]?.district || "",
  );
  pdfFooter(
    doc,
    "NAFTAL SPA - Direction Paiement Electronique - Service Technique Retour",
    `Retour en circulation n°${meta.reference}`,
    "2/2",
  );
  return doc.output("datauristring");
}

// Convertit une Data URI en objet Blob téléchargeable.

function dataUriToBlob(dataUri) {
  const arr = dataUri.split(",");
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new Blob([u8arr], { type: mime });
}

// Télécharge un PDF déjà enregistré dans une décharge,
// ou le régénère localement à partir des données disponibles.

async function downloadStoredPdf(id) {
  const decharge = state.decharges.find((d) => d.id === id);
  if (!decharge) return;

  // Cas 1 : pdfDataUri déjà présent → téléchargement direct
  if (decharge.pdfDataUri) {
    downloadBlob(
      dataUriToBlob(decharge.pdfDataUri),
      `${decharge.reference || "decharge"}.pdf`,
    );
    return;
  }

  // Cas 2 : Régénération locale du PDF à partir des données disponibles.
  // Les décharges chargées depuis le backend ont pdfDataUri=null ; on les
  // recrée ici en utilisant les fonctions generateDechargeType* existantes
  // et les données déjà présentes dans state.cards / state.tpe.
  showToast("Génération du PDF en cours…");
  try {
    let pdfDataUri = null;

    // Les décharges locales stockent des IDs de carte (uid),
    // les décharges backend stockent des numéros de carte — on gère les deux.
    const resolveCards = (refs) =>
      (refs || [])
        .map((ref) => state.cards.find((c) => c.id === ref || c.number === ref))
        .filter(Boolean);

    const resolveTpe = (refs) =>
      (refs || [])
        .map((ref) =>
          state.tpe.find(
            (t) => t.id === ref || t.serial === ref || t.numeroSerieTpe === ref,
          ),
        )
        .filter(Boolean);

    const meta = {
      reference: decharge.reference || "",
      beneficiary: decharge.beneficiary || decharge.nom_beneficiaire || "",
      functionLabel:
        decharge.functionLabel || decharge.fonction_beneficiaire || "",
      date: decharge.date || decharge.date_sortie || "",
      bts: decharge.bts || decharge.numero_bordereau_bts || "",
      structure: decharge.to || decharge.destination || "",
      district: decharge.from || decharge.source || "",
      reason: decharge.object || "",
      destination: decharge.to || decharge.destination || "",
      substitution: decharge.substitution || "",
    };

    if (decharge.assetType === "TPE") {
      const tpeObjs = resolveTpe(decharge.cards);
      const tpeToUse = tpeObjs.length
        ? tpeObjs
        : (decharge.cards || []).map((s) => ({
            serial: s,
            idTerminal: "—",
            nomCommercial: "—",
            station: meta.structure,
            district: meta.district,
          }));
      if (decharge.kind === "type1")
        pdfDataUri = await generateTpeDechargeType1(tpeToUse, meta);
      else if (decharge.kind === "type2")
        pdfDataUri = await generateTpeDechargeType2(tpeToUse, meta);
      else if (decharge.kind === "type3")
        pdfDataUri = await generateTpeDechargeType3(tpeToUse, meta);
      else
        pdfDataUri = await generateSimpleDechargePdf({ ...decharge, ...meta });
    } else {
      // Cartes (assetType === 'Carte' ou non défini)
      const cardObjs = resolveCards(decharge.cards);
      const mkCard = (num) => ({
        number: num,
        codeClient: "—",
        company: "—",
        owner: "—",
        station: meta.structure,
        district: meta.district,
        anomaly: "—",
        status: "—",
      });
      const cardsToUse = cardObjs.length
        ? cardObjs
        : (decharge.cards || []).map(mkCard);

      if (decharge.kind === "type1")
        pdfDataUri = await generateDechargeType1(cardsToUse, meta);
      else if (decharge.kind === "type2")
        pdfDataUri = await generateDechargeType2(cardsToUse, meta);
      else if (decharge.kind === "type3")
        pdfDataUri = await generateDechargeType3(cardsToUse, meta);
      else
        pdfDataUri = await generateSimpleDechargePdf({ ...decharge, ...meta });
    }

    if (pdfDataUri) {
      decharge.pdfDataUri = pdfDataUri; // mise en cache pour les prochains clics
      downloadBlob(
        dataUriToBlob(pdfDataUri),
        `${decharge.reference || "decharge"}.pdf`,
      );
      return;
    }
  } catch (e) {
    console.warn("Régénération PDF locale échouée :", e);
  }

  // Cas 3 : Repli sur l'endpoint serveur (HTML imprimable dans un nouvel onglet)
  const numero = decharge.numero_decharge || decharge.reference;
  const baseUrl = window.API?.BASE_URL || "http://localhost:8081/api";
  const token = window.API?.getAuthToken
    ? window.API.getAuthToken()
    : localStorage.getItem("jwt_token");
  if (!numero) {
    showToast("PDF indisponible pour cette décharge.", true);
    return;
  }
  const url =
    decharge.assetType === "TPE"
      ? `${baseUrl}/tpe/decharge/${encodeURIComponent(numero)}/print`
      : `${baseUrl}/decharges/${encodeURIComponent(numero)}/imprimer`;
  fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    .then(async (res) => {
      const text = await res.text();
      if (!res.ok) throw new Error(text || `Erreur serveur (${res.status})`);
      return text;
    })
    .then((html) => {
      const win = window.open("", "_blank");
      if (!win) {
        showToast("Impossible d'ouvrir le PDF (popup bloqué).", true);
        return;
      }
      win.document.open();
      win.document.write(html);
      win.document.close();
    })
    .catch(() => {
      showToast("PDF indisponible pour cette décharge.", true);
    });
}
// Préchargement du logo Naftal au démarrage
document.addEventListener("DOMContentLoaded", () => {
  getNaftalLogoData().then((data) => {
    if (data) console.log("[PDF] Logo Naftal chargé.");
    else console.warn("[PDF] Logo Naftal non trouvé (naftal-logo.png).");
  });
});
