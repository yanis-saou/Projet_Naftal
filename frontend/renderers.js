let currentGraphType = "cards";
let usageChart = null;
let currentAlertFilter = "all";

function switchGraph(type) {
  currentGraphType = type;

  el("graphCardsBtn").className =
    type === "cards" ? "btn btn-sm btn-primary" : "btn btn-sm btn-ghost";
  el("graphTpeBtn").className =
    type === "tpe" ? "btn btn-sm btn-primary" : "btn btn-sm btn-ghost";
  el("graphTitle").textContent =
    type === "cards"
      ? "Évolution des utilisations — Cartes"
      : "Évolution des utilisations — TPE";

  renderUsageChart();
}

function switchAlerts(filter) {
  currentAlertFilter = filter;

  el("alertCardsBtn").className =
    filter === "all" ? "btn btn-sm btn-primary" : "btn btn-sm btn-ghost";
  el("alertOnlyCardsBtn").className =
    filter === "cards" ? "btn btn-sm btn-primary" : "btn btn-sm btn-ghost";
  el("alertOnlyTpeBtn").className =
    filter === "tpe" ? "btn btn-sm btn-primary" : "btn btn-sm btn-ghost";

  renderAlerts();
}

function getLast6Months() {
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(
      date.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }),
    );
  }
  return months;
}

function renderUsageChart() {
  const ctx = el("usageChart").getContext("2d");
  const chartData = window.dashboardStats?.chartData;
  const labels = chartData?.labels || getLast6Months();

  let datasets = [];

  if (currentGraphType === "cards") {
    datasets = [
      {
        label: "Cartes en circulation",
        data: chartData?.cards?.circulation || [0, 0, 0, 0, 0, 0],
        borderColor: "rgba(40,167,69,0.8)",
        backgroundColor: "rgba(40,167,69,0.1)",
        fill: true,
        tension: 0.4,
        pointRadius: 4,
      },
      {
        label: "Cartes en anomalie",
        data: chartData?.cards?.alerts || [0, 0, 0, 0, 0, 0],
        borderColor: "rgba(220,53,69,0.8)",
        backgroundColor: "rgba(220,53,69,0.05)",
        fill: true,
        tension: 0.4,
        pointRadius: 4,
      },
    ];
  } else {
    datasets = [
      {
        label: "TPE en service",
        data: chartData?.tpe?.service || [0, 0, 0, 0, 0, 0],
        borderColor: "rgba(0,123,255,0.8)",
        backgroundColor: "rgba(0,123,255,0.1)",
        fill: true,
        tension: 0.4,
        pointRadius: 4,
      },
      {
        label: "TPE en anomalie",
        data: chartData?.tpe?.alerts || [0, 0, 0, 0, 0, 0],
        borderColor: "rgba(255, 127, 7, 0.8)",
        backgroundColor: "rgba(255,193,7,0.05)",
        fill: true,
        tension: 0.4,
        pointRadius: 4,
      },
    ];
  }

  if (usageChart) usageChart.destroy();

  usageChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
    },
  });
}

function renderAlerts() {
  const stats = window.dashboardStats || { alerts: [] };
  let filteredAlerts = stats.alerts;

  if (currentAlertFilter !== "all") {
    filteredAlerts = stats.alerts.filter((a) => a.type === currentAlertFilter);
  }

  el("alertsChips").innerHTML = filteredAlerts
    .map(
      (alert) => {
        const page = alert.type === "tpe" ? "tpe-suivi" : "cards-suivi";
        return `
    <span class="chip alert-chip ${alert.class}" style="cursor:pointer;" onclick="go('${page}')">
      <i class="fa-solid ${alert.icon}"></i>
      <strong>${alert.count}</strong> ${alert.label}
    </span>
  `;
      },
    )
    .join("");
}

//pr le tableau de bord
// Affiche les indicateurs et l'activité du tableau de bord.
async function renderDashboard() {
  try {
    const stats = await API.dashboard.getStats();
    if (!stats) return;

    const { structure } = parseBackendRole(currentUser?.role);
    // Pour les profils non-DPE, on scope les KPI avec les données déjà chargées (state)
    // afin d'éviter d'afficher des totaux globaux d'autres wilayas/structures.
    const scoped =
      structure === "DPE"
        ? stats
        : (() => {
            const cardsVisible = (state?.cards || []).filter(
              (c) => !c.archived && hasScope(c),
            );
            const cardsActive = cardsVisible.filter(
              (c) => c.status === "En circulation",
            ).length;
            const cardsInProcess = cardsVisible.filter(
              (c) => c.status === "En cours traitement",
            ).length;
            const cardsAvailable = cardsVisible.filter(
              (c) => c.status === "Nouvelle carte",
            ).length;

            const tpeVisible = (state?.tpe || []).filter((t) =>
              hasScope({
                ...t,
                station: t.station || t.raisonsocialestructure,
                district: t.district,
                wilaya: t.wilaya,
                codeStructure: t.codeStructure,
                codeStation: t.codeStation,
              }),
            );
            const tpeService = tpeVisible.filter(
              (t) => t.status === "En service",
            ).length;
            const tpeStock = tpeVisible.filter(
              (t) => t.status === "En stock",
            ).length;
            const tpeServiceRate = tpeVisible.length
              ? Math.round((tpeService / tpeVisible.length) * 100)
              : 0;

            const dechargesVisible = (state?.decharges || []).filter((d) =>
              hasScope({
                district: d.district || "",
                station: d.to || d.destination || "",
                wilaya: d.wilaya || "",
              }),
            );
            // ✅ CORRECTION: Séparer les décharges TPE et Cartes
            const dechargesTPETotal = dechargesVisible.filter((d) => d.assetType === "TPE").length;
            const dechargesCarteTotal = dechargesVisible.filter((d) => d.assetType === "Carte").length;

            return {
              ...stats,
              cardsTotal: cardsVisible.length,
              cardsActive,
              cardsInProcess,
              cardsAvailable,
              tpeTotal: tpeVisible.length,
              tpeService,
              tpeStock,
              tpeServiceRate,
              transfersTotal: dechargesVisible.length,
              dechargesTPETotal,
              dechargesCarteTotal,
            };
          })();

    window.dashboardStats = scoped;

    // Petite fonction utilitaire pour mettre à jour seulement si l'élément existe
    const update = (id, val, isHtml = false) => {
      const target = el(id);
      if (target) {
        if (isHtml) target.innerHTML = val;
        else target.textContent = val;
      }
    };

    // 1. Mise à jour des KPI (seulement s'ils sont affichés à l'écran)
    update("kpiCards", scoped.cardsTotal);
    update("kpiCardsActive", scoped.cardsActive);
    update("kpiTpe", scoped.tpeTotal);
    update("kpiTpeActive", String(scoped.tpeService));
    // ✅ CORRECTION: Afficher les deux types de décharges séparément
    update("kpiTransfersTPE", scoped.dechargesTPETotal ?? 0);
    update("kpiTransfersTPECount", `${scoped.dechargesTPETotal ?? 0}`);
    update("kpiTransfersCarte", scoped.dechargesCarteTotal ?? 0);
    update("kpiTransfersCarteCount", `${scoped.dechargesCarteTotal ?? 0}`);

    update("kpiCardsTrend", `${scoped.cardsAvailable} disponibles`);
    // ✅ CORRECTION: Utiliser le bon nombre de cartes en cours de traitement
    update("kpiCardsOk", `Traitement ${scoped.cardsInProcess}`);
    update("kpiTpeStock", `${scoped.tpeStock} en stock`);
    update("kpiTpeRate", `Taux ${scoped.tpeServiceRate}%`);

    // 2. Graphique et Alertes (si les fonctions existent)
    if (typeof renderUsageChart === "function") renderUsageChart();
    if (typeof renderAlerts === "function") renderAlerts();

    // 3. TABLEAU D'ACTIVITÉ
    const activityHtml = (scoped.activity || [])
      .map(
        (item) => `
        <tr>
          <td>${formatDateTime(item.date)}</td>
          <td>${item.action}</td>
          <td>${item.target}</td>
          <td>${item.user}</td>
        </tr>
      `,
      )
      .join("");

    update("activityBody", activityHtml, true);
  } catch (e) {
    console.error("Erreur renderDashboard détaillée :", e);
  }
}

// Affiche le résumé chiffré et les actions globales des cartes.

// Affiche le tableau principal des cartes.     ****************************************************************************************

async function renderCards() {
  await renderCardsSummary();
  updateCardsActionsHeader();
  const cards = await visibleCards();
  const body = el("cardsBody");
  if (!body) return;
  body.innerHTML =
    cards
      .map(
        (card) => `

    <tr>

       ${isWriteAllowed() && cardsSelectionMode ? `<td><input type="checkbox" ${card.selected ? "checked" : ""} onchange="window.toggleCardSelection('${card.id}', this.checked)" ${card.status !== "Nouvelle carte" ? "disabled" : ""}></td>` : ""}
      <td>${escapeHtml(card.number)}</td>
      <td>${badge(card.status)}</td>
      <td><span class="badge info">${escapeHtml(card.type)}</span></td>

      <td>${escapeHtml(card.district)}</td>

      <td>${escapeHtml(card.codeStructure || "—")}</td>
      <td>${escapeHtml(card.codeClient)}</td>
      <td>${escapeHtml(card.owner)}</td>
     <td>${escapeHtml(card.numeroPorteur || card.bts || "—")}</td>


      <td>${formatDate(card.createdAt)}</td>
      <td>${formatDate(card.expirationDate)}</td>


      <td><span class="badge info">${escapeHtml(card.amortissement || "—")}</span></td>


      <td>
        <div style="display:flex;gap:5px;flex-wrap:wrap;">
          <button class="btn btn-ghost btn-sm" title="Voir" onclick="viewCard('${escapeHtml(card.id)}')"><i class="fa-solid fa-eye"></i></button>

        </div>
      </td>
    </tr>
  `,
      )
      .join("") ||
    `<tr><td colspan="${isWriteAllowed() && cardsSelectionMode ? 15 : 14}" class="muted">Aucune carte trouvée.</td></tr>`;
}

// Affiche le tableau de suivi des cartes en circulation ou en traitement.  **************************************************************

let suiviSelectionMode = false;

function toggleSuiviSelectionMode() {
  suiviSelectionMode = !suiviSelectionMode;
  const btn = el("suiviSelectBtn"),
    envBtn = el("suiviEnvoiBtn");
  const selectTh = el("suiviSelectTh");
  if (!suiviSelectionMode) {
    state.cards.forEach((c) => {
      c.suiviSelected = false;
    });
    if (btn)
      btn.innerHTML = '<i class="fa-solid fa-square-check"></i>Sélectionner';
    if (envBtn) envBtn.style.display = "none";
    if (selectTh) selectTh.style.display = "none";
  } else {
    if (btn)
      btn.innerHTML =
        '<i class="fa-solid fa-square-xmark"></i>Quitter sélection';
    if (envBtn) envBtn.style.display = "";
    if (selectTh) selectTh.style.display = "";
  }
  renderCardsSuivi();
}

function toggleSuiviCardSelection(id, checked) {
  const card = state.cards.find((c) => String(c.id) === String(id));
  if (card) {
    card.suiviSelected = checked;
    renderCardsSuivi();
  }
}

// Coche/décoche toutes les cartes visibles dans le suivi (case d'en-tête).
function toggleSelectAllVisibleCardsSuivi(checked) {
  const SUIVI_STATUSES = [
    "En cours traitement",
    "Défectueuse",
    "Perdue",
    "Volée",
    "Bloquée",
    "Expire bientôt",
    "Expirée",
  ];
  state.cards.forEach((card) => {
    if (
      !card.archived &&
      SUIVI_STATUSES.includes(card.status) &&
      hasScope(card)
    ) {
      card.suiviSelected = !!checked;
    }
  });
  renderCardsSuivi();
}

// cartes en suivi
function renderCardsSuivi() {
  const search = (el("cardsSuiviSearch")?.value || "").trim().toLowerCase();
  const district = el("cardsSuiviDistrict")?.value || "";
  const status = el("cardsSuiviStatus")?.value || "";

  // Filtre : uniquement cartes avec anomalie/traitement (PAS En circulation, PAS Nouvelle carte, PAS Renouvelée)
  const SUIVI_STATUSES = [
    "En cours traitement",
    "Défectueuse",
    "Perdue",
    "Volée",
    "Bloquée",
    "Expire bientôt",
    "Expirée",
  ];

  // First, get all eligible cards (non-archived, in SUIVI_STATUSES, in scope)
  const eligibleCards = state.cards.filter(
    (c) => !c.archived && SUIVI_STATUSES.includes(c.status) && hasScope(c),
  );

  // Then, apply the search, district, and status filters to get the rows for display
  const rows = eligibleCards.filter((card) => {
    const hay = [
      card.number,
      card.codeClient,
      card.owner,
      card.status,
      card.station,
      card.transferState,
    ]
      .join(" ")
      .toLowerCase();
    return (
      (!search || hay.includes(search)) &&
      (!district || card.district === district) &&
      (!status || card.status === status)
    );
  });

  // Mettre à jour les KPIs
  const totalCards = rows.length;
  const processCards = rows.filter(
    (c) => c.status === "En cours traitement",
  ).length;
  const alertCards = rows.filter((c) =>
    [
      "Défectueuse",
      "Perdue",
      "Volée",
      "Bloquée",
      "Expire bientôt",
      "Expirée",
    ].includes(c.status),
  ).length;

  if (el("cardsSuiviKpiTotal"))
    el("cardsSuiviKpiTotal").textContent = String(totalCards);
  if (el("cardsSuiviKpiProcess"))
    el("cardsSuiviKpiProcess").textContent = String(processCards);
  if (el("cardsSuiviKpiAlerts"))
    el("cardsSuiviKpiAlerts").textContent = String(alertCards);

  const selectedCount = rows.filter((c) => c.suiviSelected).length;
  const envBtn = el("suiviEnvoiBtn");
  if (envBtn && suiviSelectionMode)
    envBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i>Envoyer pour traitement (${selectedCount})`;

  // Synchroniser l'en-tête de la colonne sélection avec l'état réel.
  // Sans ça, après "Envoyer pour traitement" le TH reste visible alors que
  // les TD du corps sont masqués → décalage d'une colonne dans l'en-tête.
  const suiviSelectTh = el("suiviSelectTh");
  if (suiviSelectTh)
    suiviSelectTh.style.display = suiviSelectionMode ? "" : "none";
  if (envBtn && !suiviSelectionMode) envBtn.style.display = "none";

  // Peupler district dynamiquement à chaque rendu
  const districtSel = el("cardsSuiviDistrict");
  if (districtSel) {
    const cur = districtSel.value;
    const dVals = [
      ...new Set(state.cards.filter((c) => c.district).map((c) => c.district)),
    ].sort();
    districtSel.innerHTML =
      '<option value="">Tous districts</option>' +
      dVals
        .map(
          (d) =>
            `<option value="${escapeHtml(d)}"${d === cur ? " selected" : ""}>${escapeHtml(d)}</option>`,
        )
        .join("");
  }

  // Colonnes de retour : actives uniquement après une vraie modification suivi
  // (même logique que Suivi TPE — dateSuiviRetour saisi uniquement via la modale).
  const hasDateEnvoi = eligibleCards.some(
    (c) => c.status === "En cours traitement" && c.dateSuiviEnvoi,
  );
  const hasDateRetour = eligibleCards.some(
    (c) => c.suiviModifie === true || !!c.dateSuiviRetour,
  );

  // Afficher/masquer les colonnes d'en-tête
  const colDateEnvoi = document.querySelector('th[data-column="dateEnvoi"]');
  const colDateRetour = document.querySelector('th[data-column="dateRetour"]');
  if (colDateEnvoi) colDateEnvoi.style.display = hasDateEnvoi ? "" : "none";
  if (colDateRetour) colDateRetour.style.display = hasDateRetour ? "" : "none";

  el("cardsSuiviBody").innerHTML =
    rows
      .map((card) => {
        // 🔍 États logiques de la carte
        const isSent = card.status === "En cours traitement"; // Vrai uniquement si envoyée

        // Même logique que Suivi TPE : considéré modifié après "Modification
        // suivi" (la modale est la seule source de dateSuiviRetour).
        const isModified =
          card.suiviModifie === true || !!card.dateSuiviRetour;

        // Durée calculée uniquement APRÈS la modification (Retour saisi)
        let dureeHtml = '<span class="muted">—</span>';
        if (
          isSent &&
          isModified &&
          card.dateSuiviEnvoi &&
          card.dateSuiviRetour
        ) {
          const diff = Math.max(
            0,
            Math.ceil(
              (new Date(card.dateSuiviRetour) - new Date(card.dateSuiviEnvoi)) /
                86400000,
            ),
          );
          dureeHtml = `<span style="background:rgba(40,167,69,.15);color:var(--secondary);border:1px solid rgba(40,167,69,.3);padding:3px 10px;border-radius:999px;font-weight:700;font-size:.8rem;">${diff} j</span>`;
        }

        const canCirculate =
          card.dateSuiviRetour &&
          card.status === "En cours traitement" &&
          !card.retourCirculationDone;

        const selTd = `<td style="display:${suiviSelectionMode ? "table-cell" : "none"};">${suiviSelectionMode ? `<input type="checkbox" ${card.suiviSelected ? "checked" : ""} onchange="toggleSuiviCardSelection('${escapeHtml(card.id)}',this.checked)" style="width:16px;height:16px;cursor:pointer;">` : ""}</td>`;

        return `<tr>
      ${selTd}
      <td>${escapeHtml(card.number)}</td>
      <td>${badge(card.status)} ${getTreatmentAlert(card)} ${getExpirationAlert(card)}</td>
      <td>${escapeHtml(card.district)}</td>
      <td>${escapeHtml(card.codeStructure || "—")}</td>
      <td>${escapeHtml(card.codeClient)}</td>
      <td>${formatDate(card.dateAnomalie || card.createdAt || "—")}</td>
      <td>${escapeHtml(card.numeroCarteSubstitution || "—")}</td>
      <td>${isSent && card.dateSuiviEnvoi ? formatDate(card.dateSuiviEnvoi) : '<span class="muted">—</span>'}</td>
      <td>${isModified ? formatDate(card.dateSuiviRetour) : '<span class="muted">—</span>'}</td>
      <td>${dureeHtml}</td>
      <td>${isModified && card.diagnostic ? escapeHtml(card.diagnostic) : '<span class="muted">—</span>'}</td>
      <td>${escapeHtml(card.anomaly || "—")}</td>
      <td>${isModified ? escapeHtml(card.validePar || "—") : '<span class="muted">—</span>'}</td>
      <td>${isModified && card.dateValidation ? formatDate(card.dateValidation) : '<span class="muted">—</span>'}</td>
      <td>
        <div style="display:flex;gap:5px;flex-wrap:nowrap;align-items:center;">
          <button class="btn btn-ghost btn-sm" title="Historique" onclick="showCardHistory('${escapeHtml(card.id)}')"><i class="fa-solid fa-timeline"></i></button>
          ${
            isWriteAllowed()
              ? `
          <button class="btn btn-ghost btn-sm" title="Modifier suivi" onclick="openSuiviEditModal('${escapeHtml(card.id)}')"><i class="fa-solid fa-pen-to-square"></i></button>
          ${canCirculate ? `<button class="btn btn-ghost btn-sm" title="Retour en circulation" onclick="openRetourCirculationModal('${escapeHtml(card.id)}')" style="color:var(--secondary);border-color:rgba(40,167,69,.4);"><i class="fa-solid fa-circle-check"></i></button>` : ""}
          <button class="btn btn-ghost btn-sm" title="Archiver" onclick="archiveCard('${escapeHtml(card.id)}')" ${!isArchivableCardStatus(card.status) ? 'disabled style="opacity:.45;cursor:not-allowed;pointer-events:none;"' : ""}><i class="fa-solid fa-box-archive"></i></button>
          `
              : ""
          }
        </div>
      </td>
    </tr>`;
      })
      .join("") ||
    `<tr><td colspan="${suiviSelectionMode ? 21 : 20}" class="muted">Aucune carte en suivi.</td></tr>`;
}

// Déduit un libellé d'action lisible à partir du statut d'une carte.

function inferAction(card) {
  if (card.status === "En circulation") return "Carte remise / active";
  if (card.status === "En cours traitement")
    return "Transfert vers DCSI / district";
  return card.status;
}

// Affiche la liste des décharges liées aux cartes.  ***********************************************************************************************

function renderCardsDecharges() {
  const dateFilter = el("cardsDechargesDateFilter")?.value || "";
  const isOnOrAfterDate = (value, filter) => {
    if (!filter) return true;
    if (!value) return false;
    const normalizedFilter = String(filter).slice(0, 10);
    if (!normalizedFilter) return true;
    const str = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      return str.slice(0, 10) >= normalizedFilter;
    }
    const dt = new Date(value);
    return (
      !Number.isNaN(dt.getTime()) &&
      dt.toISOString().slice(0, 10) >= normalizedFilter
    );
  };
  const rows = state.decharges
    .filter((d) => d.assetType === "Carte")
    .filter((d) =>
      hasScope({
        district: d.district || "",
        station: d.to || d.destination || d.structure_concernee || "",
        wilaya: d.wilaya || "",
      }),
    )
    .filter((d) =>
      isOnOrAfterDate(d.date_sortie || d.date_creation || d.date, dateFilter),
    );
  el("cardsDechargesBody").innerHTML =
    rows
      .map(
        (d) => `
    <tr>
      <td>${escapeHtml(d.numero_decharge || d.reference || "—")}</td>
      <td>${escapeHtml(d.Source || d.from || "—")}</td>
      <td>${escapeHtml(d.Destination || d.to || "—")}</td>
      <td>${escapeHtml(d.nom_beneficiaire || d.beneficiary || "—")}</td>
      <td>${escapeHtml(d.fonction_beneficiaire || d.functionLabel || "—")}</td>
      <td>${formatDate(d.date_sortie || d.date)}</td>
      <td>${formatDate(d.date_creation || d.date)}</td>
      <td>${escapeHtml(d.motif_transfert || d.object || "—")}</td>
      <td>${escapeHtml(d.numero_bordereau_bts || d.bts || "—")}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="downloadStoredPdf('${escapeHtml(d.id)}')"><i class="fa-solid fa-file-pdf"></i></button></td>
    </tr>
  `,
      )
      .join("") ||
    '<tr><td colspan="10" class="muted">Aucune décharge carte.</td></tr>';
}

// Affiche la liste des cartes archivées. ************************************************************************************************************

function renderCardsArchive() {
  const search = (el("cardsArchiveSearch")?.value || "").trim().toLowerCase();
  const rows = state.archives
    .filter((a) => hasScope(a))
    .filter((item) => {
      const hay = [
        item.number,
        item.status,
        item.owner,
        item.reason,
        item.district,
      ]
        .join(" ")
        .toLowerCase();
      return !search || hay.includes(search);
    });
  el("cardsArchiveBody").innerHTML =
    rows
      .map(
        (item) => `
    <tr>
      <td>${formatDateTime(item.archivedAt)}</td>
      <td>${escapeHtml(item.number)}</td>
      <td>${badge(item.status)}</td>
      <td>${escapeHtml(item.district)}</td>
      <td>${escapeHtml(item.owner)}</td>
      <td>${escapeHtml(item.bts || "")}</td>
      <td>${escapeHtml(item.reason)}</td>
      <td>${escapeHtml(item.user)}</td>
      <td>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn btn-ghost btn-sm" onclick="viewArchiveItem('${escapeHtml(item.id)}')"><i class="fa-solid fa-eye"></i>Voir</button>
          ${isWriteAllowed() ? `<button class="btn btn-ghost btn-sm" onclick="restoreArchivedCard('${escapeHtml(item.id)}')"><i class="fa-solid fa-rotate-left"></i>Restaurer</button>` : ""}
        </div>
      </td>
    </tr>
  `,
      )
      .join("") ||
    '<tr><td colspan="8" class="muted">Aucune carte archivée.</td></tr>';
}

// Affiche le résumé chiffré des TPE visibles.

function renderTpeSummary() {
  const rows = visibleTpe();
  const chunks = [
    ["Total visible", rows.length, "fa-solid fa-mobile-screen-button"],
    [
      "Disponibles",
      rows.filter((t) => t.status === "Disponible").length,
      "fa-solid fa-box-open",
    ],
    [
      "En service",
      rows.filter((t) => t.status === "En service").length,
      "fa-solid fa-plug-circle-check",
    ],
    [
      "En traitement",
      rows.filter((t) => t.status === "En traitement").length,
      "fa-solid fa-screwdriver-wrench",
    ],
  ];
  el("tpeSummaryContent").innerHTML = chunks
    .map(
      ([label, value, icon]) =>
        `<span class="chip"><i class="${icon}"></i>${escapeHtml(label)} : ${value}</span>`,
    )
    .join("");
}

// Affiche la table de suivi maintenance des TPE.

// Modale : modifier suivi TPE (retour BEA, état panne, durée)
function openTpeSuiviEditModal(id) {
  if (!requireWrite()) return;
  const tpe = state.tpe.find((t) => t.id === id);
  if (!tpe) return;
  const dureeActuelle =
    tpe.dateEnvoiBea && tpe.dateRetourBea
      ? Math.max(
          0,
          Math.ceil(
            (new Date(tpe.dateRetourBea) - new Date(tpe.dateEnvoiBea)) /
              86400000,
          ),
        ) + " jour(s)"
      : tpe.dateEnvoiBea
        ? Math.max(
            0,
            Math.ceil((new Date() - new Date(tpe.dateEnvoiBea)) / 86400000),
          ) + " j (en cours)"
        : "—";
  openModal(
    "Modifier suivi TPE — " + escapeHtml(tpe.serial),
    `
    <div class="form-grid">
      <div class="field full"><label>TPE</label><input disabled value="${escapeHtml(tpe.serial)} — ${escapeHtml(tpe.idTerminal || "—")}"></div>
      <div class="field"><label>Date retour BEA → DPE</label>
        <input id="tpeSuiviRetourDate" type="date" value="${tpe.dateRetourBea || ""}">
      </div>
      <div class="field"><label>État de panne / diagnostic</label>
        <select id="tpeSuiviEtatPanne">
          <option value="">— Sélectionner —</option>
          <option value="Au niveau de la SATIM" ${tpe.etatPanne === "Au niveau de la SATIM" ? "selected" : ""}>Au niveau de la SATIM</option>
          <option value="Réparé" ${tpe.etatPanne === "Réparé" ? "selected" : ""}>Réparé</option>
          <option value="Changement raison sociale" ${tpe.etatPanne === "Changement raison sociale" ? "selected" : ""}>Changement raison sociale</option>
          <option value="TPE endommagée physiquement" ${tpe.etatPanne === "TPE endommagée physiquement" ? "selected" : ""}>TPE endommagée physiquement</option>
          <option value="Fonction tactile défaillante" ${tpe.etatPanne === "Fonction tactile défaillante" ? "selected" : ""}>Fonction tactile défaillante</option>
          <option value="Lecteur de cartes" ${tpe.etatPanne === "Lecteur de cartes" ? "selected" : ""}>Lecteur de cartes</option>
          <option value="Réseau" ${tpe.etatPanne === "Réseau" ? "selected" : ""}>Réseau</option>
          <option value="Problème imprimante" ${tpe.etatPanne === "Problème imprimante" ? "selected" : ""}>Problème imprimante</option>
          <option value="Problème de batterie" ${tpe.etatPanne === "Problème de batterie" ? "selected" : ""}>Problème de batterie</option>
          <option value="Autre" ${tpe.etatPanne === "Autre" ? "selected" : ""}>Autre</option>
        </select>
      </div>
      <div class="field" style="grid-column:1/-1;">
        <label>Durée calculée (envoi BEA → retour)</label>
        <span id="tpeSuiviDureeVal" style="display:inline-block;background:rgba(40,167,69,.15);color:var(--secondary);border:1px solid rgba(40,167,69,.3);padding:8px 16px;border-radius:12px;font-weight:700;">${dureeActuelle}</span>
      </div>
      <div class="field full"><label>Observation</label>
        <textarea id="tpeSuiviObs" placeholder="Résultat réparation, observations...">${escapeHtml(tpe.objet_dia || "")}</textarea>
      </div>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
     <button class="btn btn-primary" onclick="confirmTpeSuiviEdit('${escapeHtml(tpe.id)}')"><i class="fa-solid fa-floppy-disk"></i>Enregistrer</button>`,
  );
  el("tpeSuiviRetourDate")?.addEventListener("input", function () {
    const val = el("tpeSuiviDureeVal");
    if (tpe.dateEnvoiBea && this.value && val) {
      const diff = Math.max(
        0,
        Math.ceil(
          (new Date(this.value) - new Date(tpe.dateEnvoiBea)) / 86400000,
        ),
      );
      val.textContent = diff + " jour(s)";
    }
  });
}

function confirmTpeSuiviEdit(id) {
  if (!requireWrite()) return;
  const tpe = state.tpe.find((t) => t.id === id);
  if (!tpe) return;
  const retourDate = el("tpeSuiviRetourDate")?.value;
  const etatPanne = el("tpeSuiviEtatPanne")?.value;
  const obs = el("tpeSuiviObs")?.value.trim();

  // Préparer les données pour l'API
  const payload = {
    numeroserietpe: tpe.serial || tpe.numeroserietpe,
    dateRetourBea: retourDate || null,
    etatPanne: etatPanne || null,
    diagnostic: obs || null,
    observation: obs || null,
  };

  // Appeler l'API pour sauvegarder en base de données
  API.tpe
    .updateSuivi(payload)
    .then((response) => {
      if (response.success) {
        // Mettre à jour l'état local seulement après succès de l'API
        if (retourDate) tpe.dateRetourBea = retourDate;
        if (etatPanne) tpe.etatPanne = etatPanne;
        if (obs) tpe.objet_dia = obs;

        let dureeMsg = "";
        if (tpe.dateEnvoiBea && retourDate) {
          const diff = Math.max(
            0,
            Math.ceil(
              (new Date(retourDate) - new Date(tpe.dateEnvoiBea)) / 86400000,
            ),
          );
          tpe.dureeTraitement = diff + " j";
          dureeMsg = " — Durée : " + diff + " j";
        }

        // Mettre à jour la date de validation et l'utilisateur
        tpe.dateValidationSuivi = new Date().toISOString().split("T")[0];
        tpe.validePar =
          response.data?.valide_par || currentUser?.name || "Utilisateur";
        tpe.suiviModifie = true; // Marquer le suivi comme modifié

        logTpeEvent(
          id,
          "Modification suivi",
          "Retour BEA: " +
            (retourDate || "—") +
            " | État: " +
            (etatPanne || "—"),
        );
        saveState();
        closeModal();
        renderAll();
        showToast("Suivi TPE mis à jour avec succès." + dureeMsg);
      } else {
        showToast(
          response.message || "Erreur lors de la mise à jour du suivi TPE.",
          true,
        );
      }
    })
    .catch((error) => {
      console.error("Erreur lors de la mise à jour du suivi TPE:", error);
      showToast(
        error.message || "Erreur serveur lors de la mise à jour du suivi TPE.",
        true,
      );
    });
}

// Fonction utilitaire pour toggle les sous-menus de navigation
function toggleNavSubmenu(submenuId, linkEl) {
  const submenu = document.getElementById(submenuId);
  if (!submenu) return;
  const isOpen = submenu.style.display !== "none";
  submenu.style.display = isOpen ? "none" : "block";
  const caret = linkEl?.querySelector(".nav-caret i");
  if (caret) {
    caret.style.transform = isOpen ? "" : "rotate(90deg)";
  }
}

// Affiche la liste des décharges liées aux TPE.         ***********************************************************************************************

function renderTpeDecharges() {
  const dateFilter = el("tpeDechargesDateFilter")?.value || "";
  const isOnOrAfterDate = (value, filter) => {
    if (!filter) return true;
    if (!value) return false;
    const normalizedFilter = String(filter).slice(0, 10);
    if (!normalizedFilter) return true;
    const str = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      return str.slice(0, 10) >= normalizedFilter;
    }
    const dt = new Date(value);
    return (
      !Number.isNaN(dt.getTime()) &&
      dt.toISOString().slice(0, 10) >= normalizedFilter
    );
  };
  // Sequential numbering: oldest = IN_TERM-1, newest = IN_TERM-N.
  // Display LIFO (newest first), so the top row's n° inventaire is
  // always (next row + 1).
  const allTpeFirst = state.decharges.filter((d) => d.assetType === "TPE");
  const sortedFirst = [...allTpeFirst].sort((a, b) => {
    const da = new Date(a.date_sortie || a.date_creation || a.date || 0);
    const db = new Date(b.date_sortie || b.date_creation || b.date || 0);
    return da - db;
  });
  const invNumMapFirst = new Map();
  sortedFirst.forEach((d, idx) => {
    invNumMapFirst.set(d.id, `IN_TERM-${String(idx + 1).padStart(2, "0")}`);
  });

  const rows = state.decharges
    .filter((d) => d.assetType === "TPE")
    .filter((d) =>
      hasScope({
        district: d.district || "",
        station: d.to || d.destination || d.structure_concernee || "",
        wilaya: d.wilaya || "",
      }),
    )
    .filter((d) =>
      isOnOrAfterDate(d.date_sortie || d.date_creation || d.date, dateFilter),
    )
    .sort((a, b) => {
      const da = new Date(a.date_sortie || a.date_creation || a.date || 0);
      const db = new Date(b.date_sortie || b.date_creation || b.date || 0);
      return db - da; // LIFO: newest first
    });

  el("tpeDechargesBody").innerHTML =
    rows
      .map(
        (d) => `
    <tr>
      <td>${escapeHtml(d.numero_decharge || d.reference || "—")}</td>
      <td>${escapeHtml(d.Source || d.from || "—")}</td>
      <td>${escapeHtml(d.Destination || d.to || "—")}</td>
      <td>${escapeHtml(d.nom_beneficiaire || d.beneficiary || "—")}</td>
      <td>${escapeHtml(d.fonction_beneficiaire || d.functionLabel || "—")}</td>
      <td>${formatDate(d.date_sortie || d.date)}</td>
      <td>${formatDate(d.date_creation || d.date)}</td>
      <td>${escapeHtml(invNumMapFirst.get(d.id) || d.numero_inventaire || "—")}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="downloadStoredPdf('${escapeHtml(d.id)}')"><i class="fa-solid fa-file-pdf"></i></button></td>
    </tr>
  `,
      )
      .join("") ||
    '<tr><td colspan="9" class="muted">Aucune décharge TPE.</td></tr>';
}

// Affiche la liste des stations avec leurs informations principales.

// renderers.js — renderStations corrigée (tpeCount depuis backend)
async function renderStations() {
  try {
    // ✅ Recharger depuis le backend à chaque appel pour avoir le tpeCount à jour
    const freshStations = await API.tpe.getStations();
    // Mettre à jour le state local
    if (freshStations && Array.isArray(freshStations)) {
      state.stations = freshStations.map(normalizeStationRecord);
    }

    const search = (el("stationSearch")?.value || "").trim().toLowerCase();

    const rows = state.stations.filter((st) => {
      const hay = [st.name, st.code, st.wilaya, st.district || "", st.status]
        .join(" ")
        .toLowerCase();
      return (
        hasScope({
          district: st.district || "",
          station: st.name || st.code || "",
          wilaya: st.wilaya || "",
        }) &&
        (!search || hay.includes(search))
      );
    });

    el("stationsBody").innerHTML =
      rows
        .map((st) => {
          // ✅ tpeCount vient directement du backend via normalizeStationRecord
          const count = st.tpeCount ?? 0;

          // Calcul de l'évolution (flèche basée sur le nombre de TPE)
          let evolutionBadge = '<span class="badge b-neutral">—</span>';
          if (count > 0) {
            if (count >= 5) {
              evolutionBadge =
                '<span class="badge b-success" title="Forte activité">▲▲ ' +
                count +
                " TPE</span>";
            } else if (count >= 2) {
              evolutionBadge =
                '<span class="badge b-info" title="Activité modérée">▲ ' +
                count +
                " TPE</span>";
            } else {
              evolutionBadge =
                '<span class="badge b-warning" title="Faible activité">▸ ' +
                count +
                " TPE</span>";
            }
          } else {
            evolutionBadge =
              '<span class="badge b-danger" title="Aucun TPE">▼ 0</span>';
          }

          return `
              <tr>
                <td>${escapeHtml(st.name)}</td>
                <td>${escapeHtml(st.code)}</td>
                <td>${escapeHtml(st.wilaya)}</td>
                <td>${escapeHtml(st.structure || "—")}</td>
                <td>${escapeHtml(st.codeStructure || "—")}</td>
                <td>
                  ${evolutionBadge}
                </td>
                <td>
                  <button class="btn btn-ghost btn-sm"
                          onclick='viewStation(${JSON.stringify(st.code)})'>
                    <i class="fa-solid fa-eye"></i> Consulter
                  </button>
                  ${
                    isWriteAllowed()
                      ? `
                  <button class="btn btn-primary btn-sm"
                          onclick='editStation(${JSON.stringify(st.code)})'>
                    <i class="fa-solid fa-pen"></i> Modifier
                  </button>`
                      : ""
                  }
                </td>
              </tr>`;
        })
        .join("") ||
      '<tr><td colspan="6" class="muted">Aucune station.</td></tr>';
  } catch (error) {
    console.error("renderStations error:", error);
    el("stationsBody").innerHTML =
      '<tr><td colspan="6" class="muted">Erreur chargement stations.</td></tr>';
    showToast("Erreur lors du chargement des stations", true);
  }
}
function viewStation(code) {
  const station = state.stations.find((st) => st.code === code);
  if (!station) return;
  const tpeList = state.tpe.filter(
    (t) =>
      t.codeStation === station.code ||
      t.station === station.code ||
      t.station === station.name ||
      t.raisonsocialestructure === station.name,
  );

  const tpeRows =
    tpeList
      .map(
        (tpe) => `
    <tr>
      <td>${escapeHtml(tpe.serial || "—")}</td>
      <td>${escapeHtml(tpe.idTerminal || "—")}</td>
      <td>${escapeHtml(tpe.model || tpe.nomCommercial || "—")}</td>
      <td>${badge(tpe.status)}</td>
      <td>${escapeHtml(tpe.numCompte || "—")}</td>
      <td>${formatDate(tpe.dateReception || tpe.dateRemise)}</td>
    </tr>
  `,
      )
      .join("") ||
    '<tr><td colspan="7" class="muted">Aucun TPE associé.</td></tr>';

  openModal(
    `Détails de la station — ${station.name}`,
    `
    <div class="form-grid">
      <div class="field"><label>Nom</label><input disabled value="${escapeHtml(station.name)}"></div>
      <div class="field"><label>Code</label><input disabled value="${escapeHtml(station.code)}"></div>
      <div class="field"><label>Wilaya</label><input disabled value="${escapeHtml(station.wilaya)}"></div>
      <div class="field"><label>District</label><input disabled value="${escapeHtml(station.district || "")}"></div>
      <div class="field"><label>Nombre de TPE</label>
        <input disabled value="${tpeList.length}" style="font-weight:700;color:var(--primary);">
      </div>
    </div>
    <hr style="margin:12px 0;border-color:var(--border);">
    <h4 style="margin-bottom:10px;font-size:.95rem;">
      TPE associés <span style="background:rgba(0,123,255,.15);color:var(--primary);border:1px solid rgba(0,123,255,.3);padding:2px 10px;border-radius:999px;font-size:.8rem;font-weight:700;">${tpeList.length}</span>
    </h4>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>N° Série</th>
            <th>ID Terminal</th>
            <th>Modèle / Nom commercial</th>
            <th>État</th>
            <th>N° Compte</th>
            <th>Date réception</th>
          </tr>
        </thead>
        <tbody>${tpeRows}</tbody>
      </table>
    </div>`,
    `<button class="btn btn-primary" onclick="closeModal()">Fermer</button>`,
  );
}
async function editStation(code) {
  try {
    const response = await API.station.getStation(code);
    const fiche = response?.fiche;
    if (!fiche) {
      showToast("Station introuvable", "error");
      return;
    }

    const station = fiche.identite || {};

    openModal(
      `Modifier la station — ${station.nom || code}`,
      `
            <div class="form-grid">
                <div class="field"><label>Nom</label>
                    <input id="editStationName" value="${escapeHtml(station.nom || "")}"></div>
                <div class="field"><label>Code</label>
                    <input disabled value="${escapeHtml(station.code || "")}"></div>
                <div class="field"><label>Wilaya</label>
                    <input id="editStationWilaya" value="${escapeHtml(station.wilaya || "")}"></div>
                <div class="field"><label>District</label>
                    <input id="editStationDistrict" value="${escapeHtml(station.district || "")}"></div>
                <div class="field full"><label>Adresse</label>
                    <input id="editStationAdresse" value="${escapeHtml(station.adresse || "")}"></div>
            </div>`,
      `<button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
             <button class="btn btn-primary" onclick='saveStation(${JSON.stringify(station.code || code)})'>Enregistrer</button>`,
    );
  } catch (error) {
    console.error(error);
    showToast("Impossible de charger la station pour modification", "error");
  }
}

async function saveStation(code) {
  try {
    const data = {
      nom_station: el("editStationName")?.value?.trim() || undefined,
      wilaya: el("editStationWilaya")?.value?.trim() || undefined,
      adresse: el("editStationAdresse")?.value?.trim() || undefined,
      district: el("editStationDistrict")?.value?.trim() || undefined,
      // ❌ status: retiré — n'existe pas dans la table station
    };

    // Nettoyer les undefined
    Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

    const response = await API.station.updateStation(code, data);
    if (response?.success) {
      showToast("Station mise à jour avec succès");
      closeModal();

      // Mettre à jour le state local
      const idx = state.stations.findIndex((s) => s.code === code);
      if (idx >= 0) {
        state.stations[idx] = {
          ...state.stations[idx],
          name: data.nom_station || state.stations[idx].name,
          wilaya: data.wilaya || state.stations[idx].wilaya,
          adresse: data.adresse || state.stations[idx].adresse,
          district: data.district || state.stations[idx].district,
        };
      }
      renderStations();
    } else {
      showToast("Impossible de mettre à jour la station", "error");
    }
  } catch (error) {
    console.error("Failed to save station:", error);
    showToast("Erreur lors de l'enregistrement de la station", "error");
  }
}



// Affiche la liste des profils utilisateurs de démonstration.

// renderUsers is now in core.js
async function loadAudit() {
  try {
    const data = await get("/auth/audit");

    state.audit = data.logs || [];
    renderAudit();
  } catch (err) {
    console.error("Erreur audit:", err);
  }
}
// Affiche le journal d'audit des dernières actions.

async function renderAudit() {
  try {
    const response = await API.auth.getAuditLogs();
    if (response.success) {
      el("auditBody").innerHTML = response.logs
        .slice(0, 80)
        .map(
          (item) => `
        <tr>
          <td>${formatDateTime(item.date)}</td>
          <td>${escapeHtml(item.action)}</td>
          <td>${escapeHtml(item.target || "—")}</td>
          <td>${escapeHtml(item.user || "—")}</td>
        </tr>
      `,
        )
        .join("");
    } else {
      el("auditBody").innerHTML =
        '<tr><td colspan="4" class="muted">Erreur de chargement.</td></tr>';
    }
  } catch (error) {
    console.error("Erreur chargement audit:", error);
    el("auditBody").innerHTML =
      '<tr><td colspan="4" class="muted">Erreur de chargement.</td></tr>';
  }
}

// =====================================================================
// CARTES EN CIRCULATION
// =====================================================================
function resetCirculationFilters() {
  ["circulationSearch", "circulationDistrict"].forEach((id) => {
    if (el(id)) el(id).value = "";
  });
  renderCardsCirculation();
}

function toggleCirculationAdvancedFilters() {
  const box = el("circulationAdvancedFilters");
  if (box) box.style.display = box.style.display === "none" ? "block" : "none";
}

function toggleSuiviCardsAdvancedFilters() {
  const box = el("suiviCardsAdvancedFilters");
  if (box) box.style.display = box.style.display === "none" ? "block" : "none";
}

function resetSuiviCardsFilters() {
  ["cardsSuiviSearch", "cardsSuiviDistrict", "cardsSuiviStatus"].forEach(
    (id) => {
      if (el(id)) el(id).value = "";
    },
  );
  renderCardsSuivi();
}

function renderCardsCirculation() {
  const body = el("circulationBody");
  if (!body) return;
  const search = (el("circulationSearch")?.value || "").trim().toLowerCase();
  const df = el("circulationDistrict")?.value || "";
  const statusF = el("circulationStatus")?.value || "";
  // Peupler district dynamiquement à chaque rendu
  const dSel = el("circulationDistrict");
  if (dSel) {
    const cur = dSel.value;
    const dVals = [
      ...new Set(
        state.cards
          .filter(
            (c) =>
              !c.archived &&
              c.status !== "Nouvelle carte" &&
              c.status !== "Renouvelée" &&
              c.district,
          )
          .map((c) => c.district),
      ),
    ].sort();
    dSel.innerHTML =
      '<option value="">Tous districts</option>' +
      dVals
        .map(
          (d) =>
            `<option value="${escapeHtml(d)}"${d === cur ? " selected" : ""}>${escapeHtml(d)}</option>`,
        )
        .join("");
  }
  const cards = state.cards
    .filter(
      (c) =>
        !c.archived &&
        c.status !== "Nouvelle carte" &&
        c.status !== "Renouvelée" &&
        hasScope(c),
    )
    .filter((c) => {
      if (df && c.district !== df) return false;
      if (statusF && c.status !== statusF) return false;
      return (
        !search ||
        [
          c.district,
          c.station,
          c.number,
          c.codeClient,
          c.owner,
          c.company,
          c.type,
          c.status,
        ]
          .join(" ")
          .toLowerCase()
          .includes(search)
      );
    });
  body.innerHTML =
    cards
      .map((card) => {
        const cardBts = getCardBts(card) || "—";
        const dec = state.decharges.find(
          (d) =>
            d.cards &&
            d.cards.includes(card.id) &&
            ["type1", "type2"].includes(d.kind),
        );
        const numDec = dec ? escapeHtml(dec.reference) : "—";
        const dateSortie = dec
          ? formatDate(dec.date)
          : formatDate(card.createdAt);
        const diff = Math.max(
          0,
          Math.ceil(
            (new Date() -
              (dec ? new Date(dec.date) : new Date(card.createdAt))) /
              86400000,
          ),
        );
        return `<tr>
      <td>${escapeHtml(card.number)}</td>
      <td>${badge(card.status)} ${getTreatmentAlert(card)} ${getExpirationAlert(card)}</td>
      <td><span class="badge info">${escapeHtml(card.type)}</span></td>
      <td>${escapeHtml(card.district)}</td>
      <td>${escapeHtml(card.codeStructure)}</td>

      <td>${escapeHtml(card.codeClient)}</td>
      <td>${escapeHtml(card.owner)}</td>
      <td>${numDec}</td>
      <td>${dateSortie}</td>
      <td><span class="badge info">${escapeHtml(card.amortissement || "—")}</span></td>
      <td>${card.createdAt ? formatDate(card.createdAt) : "—"}</td>
      <td>${escapeHtml(cardBts)}</td>

      <td><div style="display:flex;gap:5px;">
        <button class="btn btn-ghost btn-sm" title="Infos" onclick="viewCirculationCard('${escapeHtml(card.id)}')"><i class="fa-solid fa-eye"></i></button>
        ${canEditRestitution() ? `<button class="btn btn-ghost btn-sm" title="Restitution" onclick="openRestitutionModal('${escapeHtml(card.id)}')"><i class="fa-solid fa-rotate-left"></i></button>` : ""}
        <button class="btn btn-ghost btn-sm" title="Historique & décharges" onclick="showCardFullHistory('${escapeHtml(card.id)}')"><i class="fa-solid fa-timeline"></i></button>
      </div></td>
    </tr>`;
      })
      .join("") ||
    '<tr><td colspan="14" class="muted">Aucune carte en circulation.</td></tr>';
}

function viewCirculationCard(id) {
  const card = state.cards.find((c) => c.id === id);
  if (!card) return;
  const cardBts = getCardBts(card) || "";
  const dec = state.decharges.find((d) => d.cards && d.cards.includes(id));
  openModal(
    "Détail carte en circulation",
    `
    <div class="form-grid">
      <div class="field"><label>N° Carte</label><input disabled value="${escapeHtml(card.number)}"></div>
      <div class="field"><label>Type</label><input disabled value="${escapeHtml(card.type)}"></div>
      <div class="field"><label>Code client</label><input disabled value="${escapeHtml(card.codeClient)}"></div>
      <div class="field"><label>Raison sociale</label><input disabled value="${escapeHtml(card.company || card.owner)}"></div>
      <div class="field"><label>District</label><input disabled value="${escapeHtml(card.district)}"></div>
      <div class="field"><label>Structure</label><input disabled value="${escapeHtml(card.station)}"></div>
      <div class="field"><label>État</label><input disabled value="${escapeHtml(card.status)}"></div>
      <div class="field"><label>Expiration</label><input disabled value="${formatDate(card.expirationDate)}"></div>
      <div class="field"><label>Num BTS</label><input disabled value="${escapeHtml(cardBts || "-")}"></div>
      <div class="field"><label>Localisation</label><input disabled value="${escapeHtml(card.location)}"></div>
    </div>
    <hr style="margin:12px 0;border-color:var(--border);">
    <h4 style="margin-bottom:10px;font-size:.95rem;">Décharge associée</h4>
    <div class="form-grid">
      <div class="field"><label>N° Décharge</label><input disabled value="${dec ? escapeHtml(dec.reference) : "—"}"></div>
      <div class="field"><label>Date de sortie</label><input disabled value="${dec ? formatDate(dec.date) : "—"}"></div>
      <div class="field"><label>De</label><input disabled value="${dec ? escapeHtml(dec.from) : "—"}"></div>
      <div class="field"><label>Vers</label><input disabled value="${dec ? escapeHtml(dec.to) : "—"}"></div>
    </div>`,
    `<button class="btn btn-primary" onclick="closeModal()">Fermer</button>${dec ? `<button class="btn btn-ghost" onclick="downloadStoredPdf('${escapeHtml(dec.id)}')"><i class="fa-solid fa-file-pdf"></i>PDF</button>` : ""}`,
  );
}
function showCardFullHistory(id) {
  const card = state.cards.find((c) => c.id === id);
  if (!card) return;

  let dbHistory = [];
  let loading = true;

  function isOnOrAfterDate(value, dateFilter) {
    if (!dateFilter) return true;
    if (!value) return false;
    const filter = String(dateFilter).slice(0, 10);
    if (!filter) return true;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10) >= filter;
    }
    const str = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      return str.slice(0, 10) >= filter;
    }
    const fr = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (fr) {
      const ymd = `${fr[3]}-${fr[2]}-${fr[1]}`;
      return ymd >= filter;
    }
    const dt = new Date(value);
    if (!Number.isNaN(dt.getTime())) {
      return dt.toISOString().slice(0, 10) >= filter;
    }
    return false;
  }

  function resolveUser(idu) {
    if (!idu) return "Système";
    const u = (state.users || []).find((x) => x.backendId === idu);
    return u?.name || `Utilisateur #${idu}`;
  }

  function combinedEvents() {
    const dateFilter = el("historyDateFilter")?.value || "";
    const dbRows = dbHistory.map((h) => ({
      date: h.dateoperation,
      etats: `${escapeHtml(h.ancienetat || "—")} → ${escapeHtml(h.nouveletat || "—")}`,
      structures: `${escapeHtml(h.structure_ancienne || "—")} → ${escapeHtml(h.structure_actuelle || "—")}`,
      commentaire: h.commentaire || "—",
      user: resolveUser(h.id_utilisateur),
    }));
    const sessionRows = (card.events || []).map((ev) => ({
      date: ev.date,
      etats: escapeHtml(ev.action || "—"),
      structures: "—",
      commentaire: ev.detail || "—",
      user: ev.user || "Système",
    }));
    return [...dbRows, ...sessionRows]
      .filter((r) => isOnOrAfterDate(r.date, dateFilter))
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }

  function renderFilteredHistory() {
    const evTarget = el("historyEventsTable");
    const decTarget = el("historyDecTable");
    if (!evTarget || !decTarget) return;

    const dateFilter = el("historyDateFilter")?.value || "";
    const decs = state.decharges
      .filter((d) => d.cards && d.cards.includes(id))
      .filter((d) => isOnOrAfterDate(d.date, dateFilter));

    if (loading) {
      evTarget.innerHTML =
        '<p class="muted" style="padding:12px;">Chargement de l\'historique…</p>';
    } else {
      const evR =
        combinedEvents()
          .map(
            (r) => `
        <tr>
          <td>${formatDateTime(r.date)}</td>
          <td>${r.etats}</td>
          <td>${r.structures}</td>
          <td>${escapeHtml(r.commentaire)}</td>
          <td>${escapeHtml(r.user)}</td>
        </tr>`,
          )
          .join("") || '<tr><td colspan="5" class="muted">Aucun.</td></tr>';
      evTarget.innerHTML = `<table><thead><tr><th>Horodatage</th><th>État (ancien → nouveau)</th><th>Structure (ancienne → actuelle)</th><th>Commentaire</th><th>Utilisateur</th></tr></thead><tbody>${evR}</tbody></table>`;
    }

    const dR =
      decs
        .map(
          (d) =>
            `<tr><td>${escapeHtml(d.reference)}</td><td>${escapeHtml(d.object)}</td><td>${formatDate(d.date)}</td><td>${badge(d.status)}</td><td><button class="btn btn-ghost btn-sm" onclick="downloadStoredPdf('${escapeHtml(d.id)}')"><i class="fa-solid fa-file-pdf"></i></button></td></tr>`,
        )
        .join("") ||
      '<tr><td colspan="5" class="muted">Aucune décharge.</td></tr>';
    decTarget.innerHTML = `<table><thead><tr><th>Réf</th><th>Objet</th><th>Date</th><th>Statut</th><th>PDF</th></tr></thead><tbody>${dR}</tbody></table>`;
  }

  window.renderFilteredHistory = renderFilteredHistory;

  openModal(
    `Historique — ${card.number}`,
    `
    <div class="advanced-filters-grid" style="margin-bottom:16px;">
      <div class="field">
        <label>Afficher à partir du</label>
        <input id="historyDateFilter" type="date" oninput="renderFilteredHistory()" onchange="renderFilteredHistory()">
      </div>
    </div>
    <h4 style="margin-bottom:8px;font-size:.95rem;">Événements</h4>
    <div class="table-wrap" id="historyEventsTable"></div>
    <h4 style="margin:14px 0 8px;font-size:.95rem;">Décharges associées</h4>
    <div class="table-wrap" id="historyDecTable"></div>`,
    `<button class="btn btn-ghost" onclick="el('historyDateFilter').value=''; renderFilteredHistory()">Réinitialiser</button>
     <button class="btn btn-primary" onclick="closeModal()">Fermer</button>`,
  );

  renderFilteredHistory();

  API.cartes
    .getHistorique(card.number)
    .then((resp) => {
      dbHistory = Array.isArray(resp?.historique) ? resp.historique : [];
    })
    .catch((err) => {
      console.error("getHistorique carte failed:", err);
      dbHistory = [];
    })
    .finally(() => {
      loading = false;
      renderFilteredHistory();
    });
}
function openRestitutionModal(id) {
  if (!requireRestitutionEdit()) return;
  const card = state.cards.find((c) => c.id === id);
  if (!card) return;
  openModal(
    "Formulaire de restitution",
    `
    <div class="form-grid">
      <div class="field full"><label>Carte</label><input disabled value="${escapeHtml(card.number)} — ${escapeHtml(card.owner)}"></div>
      <div class="field"><label>Mode de l'opération</label>
        <select id="restitutionMode" onchange="toggleDiagnosticField()">
          <option value="Défectueuse">Défectueuse</option>
          <option value="Perdue/Volée">Perdue/Volée</option>
        </select>
      </div>
      <div class="field"><label>Date de transmission</label>
        <input id="restitutionDate" type="date" value="${nowIso().slice(0, 10)}">
      </div>
      <div class="field" id="diagnosticField">
        <label>1er diagnostic — Type de problème</label>
        <select id="restitutionDiagnostic">
          <option value="">— Sélectionner —</option>
          <option value="SIM endommagée">SIM endommagée</option>
          <option value="Puce défectueuse">Puce défectueuse</option>
          <option value="Carte bloquée">Carte bloquée</option>
          <option value="Carte expirée">Carte expirée</option>
          <option value="Bande magnétique HS">Bande magnétique HS</option>
          <option value="Carte cassée / physiquement endommagée">Carte cassée</option>
          <option value="Code PIN bloqué">Code PIN bloqué</option>
          <option value="Autre">Autre</option>
        </select>
      </div>
      <div class="field full"><label>Observation supplémentaire</label>
        <textarea id="restitutionObservation" placeholder="Observations, détails..."></textarea>
      </div>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
     <button class="btn btn-primary" onclick="confirmRestitution('${escapeHtml(card.id)}')"><i class="fa-solid fa-circle-check"></i>Valider la restitution</button>`,
  );
}
function toggleDiagnosticField() {
  const mode = el("restitutionMode")?.value;
  const field = el("diagnosticField");
  if (field) field.style.display = mode === "Défectueuse" ? "" : "none";
}

// Valide la restitution, envoie les données au backend et met à jour l'interface.
async function confirmRestitution(id) {
  if (!requireRestitutionEdit()) return;
  const card = state.cards.find((c) => c.id === id);
  if (!card) return;
  const mode = el("restitutionMode").value;
  const date = el("restitutionDate").value || nowIso().slice(0, 10);
  const diag = el("restitutionDiagnostic")?.value || "";
  const obs = el("restitutionObservation").value.trim();

  try {
    // Envoyer au backend
    await API.cartes.updateEtat(card.number, {
      etat:
        mode === "Défectueuse"
          ? "Défectueuse"
          : mode === "Perdue"
            ? "Perdue"
            : mode === "Volée"
              ? "Volée"
              : mode === "Perdue/Volée"
                ? "Perdue"
                : mode,
      commentaire: `Restitution — ${mode}. Diagnostic: ${diag || "—"}. ${obs}`,
      ancienEtat: card.status,
    });

    closeModal();
    await loadState(); // Recharger les données depuis le backend pour s'assurer d'avoir les dernières infos à jour
    renderAll();
    showToast("Restitution enregistrée — carte envoyée au suivi.");
  } catch (error) {
    showToast(error.message || "Erreur lors de la restitution.", true);
  }
}

// =====================================================================
// SUIVI EDIT + RETOUR CIRCULATION + ENVOI DCSI
// =====================================================================
function openSuiviEditModal(id) {
  if (!requireWrite()) return;
  const card = state.cards.find((c) => c.id === id);
  if (!card) return;
  const etatOptions = [
    "SIM endommagée",
    "Carte bloquée",
    "Puce défectueuse",
    "Carte expirée",
    "Autre",
  ];
  const currentEtat = card.anomaly || "";
  const etatOptionsHtml = etatOptions
    .map(
      (opt) =>
        `<option value="${escapeHtml(opt)}"${opt === currentEtat ? " selected" : ""}>${escapeHtml(opt)}</option>`,
    )
    .join("");
  openModal(
    "Modifier le suivi — " + card.number,
    `
    <div class="form-grid">
      <div class="field full"><label>Carte</label><input disabled value="${escapeHtml(card.number)} — ${escapeHtml(card.owner)}"></div>
      <div class="field"><label>Date retour DCSI → DPE</label><input id="suiviRetourDate" type="date" value="${card.dateSuiviRetour || ""}"></div>
      <div class="field"><label>État de panne</label>
        <select id="suiviEtatPanne">
          <option value="">— Sélectionner —</option>
          ${etatOptionsHtml}
        </select>
      </div>
      <div class="field full"><label>Détail / observation</label>
        <textarea id="suiviDetail" placeholder="Précisions...">${escapeHtml(card.diagnostic || "")}</textarea>
      </div>
      <div class="field full" id="suiviDureeInfo" style="display:none;">
        <span style="background:rgba(40,167,69,.15);color:var(--secondary);border:1px solid rgba(40,167,69,.3);padding:6px 14px;border-radius:999px;font-weight:700;display:inline-block;">
          <i class="fa-solid fa-clock"></i> Durée de traitement : <strong id="suiviDureeVal"></strong>
        </span>
      </div>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
     <button class="btn btn-primary" onclick="confirmSuiviEdit('${escapeHtml(card.id)}')"><i class="fa-solid fa-floppy-disk"></i>Enregistrer</button>`,
  );
  el("suiviRetourDate")?.addEventListener("input", function () {
    if (card.dateSuiviEnvoi && this.value) {
      const diff = Math.max(
        0,
        Math.ceil(
          (new Date(this.value) - new Date(card.dateSuiviEnvoi)) / 86400000,
        ),
      );
      el("suiviDureeVal").textContent = diff + " jour(s)";
      el("suiviDureeInfo").style.display = "";
    }
  });
}

function confirmSuiviEdit(id) {
  if (!requireWrite()) return;
  const card = state.cards.find((c) => c.id === id);
  if (!card) return;
  const retourDate = el("suiviRetourDate").value;
  const etat = el("suiviEtatPanne").value;
  const detail = el("suiviDetail").value.trim();

  // Préparer les données pour l'API
  const payload = {
    numerocarte: card.number,
    dateRetourDcsiDpe: retourDate || null,
    etatPanne: etat || null,
    observation: detail || null,
    diagnostic: detail || null,
  };

  // Appeler l'API pour sauvegarder en base de données
  API.suivi
    .updateCarte(payload)
    .then((response) => {
      if (response.success) {
        // Mettre à jour l'état local seulement après succès de l'API
        if (retourDate) card.dateSuiviRetour = retourDate;
        if (etat) card.anomaly = etat;
        if (detail) card.diagnostic = detail;

        // Mettre à jour la date de validation et l'utilisateur
        card.dateValidation = new Date().toISOString().split("T")[0];
        card.validePar = response.data?.valide_par || "Utilisateur";
        card.suiviModifie = true; // Marquer le suivi comme modifié

        let msg = "";
        if (card.dateSuiviEnvoi && retourDate) {
          const diff = Math.max(
            0,
            Math.ceil(
              (new Date(retourDate) - new Date(card.dateSuiviEnvoi)) / 86400000,
            ),
          );
          msg = ` — Durée : ${diff} j`;
        }

        logCardEvent(
          id,
          "Modification suivi",
          `Retour: ${retourDate || "—"} | Anomalie: ${detail || etat || "—"}`,
        );
        saveState();
        closeModal();
        renderAll();
        showToast(`Suivi mis à jour avec succès.${msg}`);
      } else {
        showToast(
          response.message || "Erreur lors de la mise à jour du suivi.",
          true,
        );
      }
    })
    .catch((error) => {
      console.error("Erreur lors de la mise à jour du suivi:", error);
      showToast(
        error.message || "Erreur serveur lors de la mise à jour du suivi.",
        true,
      );
    });
}

function openRetourCirculationModal(id) {
  if (!requireWrite()) return;
  const card = state.cards.find((c) => c.id === id);
  if (!card) return;
  const cardBts = getCardBts(card) || "";
  openModal(
    "Retour en circulation — Décharge type 3",
    `
    <div class="form-grid">
      <div class="field full"><label>Carte</label><input disabled value="${escapeHtml(card.number)} — ${escapeHtml(card.owner)}"></div>
      <div class="field"><label>Date de remise en circulation</label><input id="retourCircDate" type="date" value="${nowIso().slice(0, 10)}"></div>
    </div>
    <hr style="margin:12px 0;border-color:var(--border);">
    <h4 style="margin-bottom:10px;font-size:.95rem;">Informations décharge type 3</h4>
    <div class="form-grid">
      <div class="field"><label>Nom du destinataire</label><input id="retourNomDest" placeholder="Nom complet"></div>
      <div class="field"><label>Fonction</label><input id="retourFonction" placeholder="Ex: Chauffeur"></div>
      <div class="field"><label>Num BTS</label><input id="retourBts" value="${escapeHtml(cardBts)}"></div>
      <div class="field"><label>Structure destinataire</label><input id="retourStructure" value="${escapeHtml(card.station)}"></div>
      <div class="field full"><label>Motif</label><textarea id="retourMotif" placeholder="Ex: Carte réparée, remise au client..."></textarea></div>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
     <button class="btn btn-primary" onclick="confirmRetourCirculation('${escapeHtml(card.id)}')"><i class="fa-solid fa-circle-check"></i>Confirmer & générer décharge type 3</button>`,
  );
}

async function confirmRetourCirculation(id) {
  if (!requireWrite()) return;
  const card = state.cards.find((c) => c.id === id);
  if (!card) return;
  const date = el("retourCircDate").value || nowIso().slice(0, 10);
  const nomDest = el("retourNomDest").value.trim();
  const fonction = el("retourFonction").value.trim();
  const bts = el("retourBts").value.trim();
  const structure = el("retourStructure").value.trim() || card.station;
  const backendDestination = resolveCardRetourDestination(card, structure);
  const motif = el("retourMotif").value.trim() || "Retour en circulation";
  if (!nomDest) {
    showToast("Le nom du destinataire est obligatoire.", true);
    return;
  }
  if (!fonction) {
    showToast("La fonction est obligatoire.", true);
    return;
  }
  if (!bts || bts === "Non spécifié") {
    showToast("Le N° BTS est obligatoire.", true);
    return;
  }
  if (!backendDestination) {
    showToast("La structure destinataire est obligatoire.", true);
    return;
  }

  let reference = "";
  try {
    // Persiste la décharge Type-3 côté backend en utilisant la structure métier courante
    // de la carte, plutôt qu'un ancien code technique pouvant encore pointer vers DPE_CENTRE.
    const resp = await API.decharges.createType3({
      destination: backendDestination,
      nom_beneficiaire: nomDest,
      fonction_beneficiaire: fonction,
      date_sortie: date,
      numero_bordereau_bts: bts,
      operations: [
        {
          ancienne: card.number,
          substitution: card.number,
          diagnostic: motif,
          etatFinal: "Réparée",
        },
      ],
    });
    reference = resp?.data?.numero_decharge || nextReference("type3");
  } catch (err) {
    showToast(err?.message || "Erreur lors du retour en circulation.", true);
    return;
  }

  card.status = "En circulation";
  card.transferState = "Retour en circulation après traitement";
  card.location = structure;
  card.retourCirculationDone = true;
  card.sentToDistrictForAnomaly = false;
  syncCardBts(card, bts);
  let pdfDataUri = null;
  try {
    pdfDataUri = await generateDechargeType3([card], {
      destination: nomDest,
      functionLabel: fonction,
      bts,
      reason: motif,
      date,
      substitution: "",
      reference,
    });
  } catch (e) {
    console.warn(e);
  }
  storeDecharge({
    kind: "type3",
    assetType: "Carte",
    object: `Retour en circulation — ${structure}`,
    from: "DPE",
    to: structure,
    date,
    status: "Générée",
    cards: [card.id],
    pdfDataUri,
    reference,
    nom_beneficiaire: nomDest,
    fonction_beneficiaire: fonction,
    beneficiary: nomDest,
    functionLabel: fonction,
    numero_bordereau_bts: bts,
  });
  logCardEvent(id, "Retour en circulation", `Type 3. Dest: ${nomDest}`);
  saveState();
  closeModal();
  renderAll();
  showToast("Carte remise en circulation — décharge type 3 générée.");
}

function openEnvoiDcsiModal() {
  if (!requireWrite()) return;
  const selected = state.cards.filter((c) => c.suiviSelected && !c.archived);
  if (!selected.length) {
    showToast("Aucune carte sélectionnée.", true);
    return;
  }
  const selectedBtsValues = [
    ...new Set(selected.map((card) => getCardBts(card)).filter(Boolean)),
  ];
  const defaultBts = selectedBtsValues[0] || "";
  const btsHint =
    selectedBtsValues.length > 1
      ? `<div class="field full"><span class="muted">Plusieurs num BTS existent dans la selection. Le premier a ete prerempli, modifiez-le si besoin.</span></div>`
      : "";
  const totalEC = state.cards.filter(
    (c) => c.status === "En cours traitement",
  ).length;
  const dejaEnv = state.decharges.filter((d) => d.kind === "type2").length;
  openModal(
    "Envoi pour traitement DCSI — Décharge type 2",
    `
    <div class="form-grid">
      <div class="field"><label>Cartes sélectionnées</label><input disabled value="${selected.length} carte(s)"></div>
      <div class="field"><label>Date d'envoi au DCSI</label><input id="dcsiEnvoiDate" type="date" value="${nowIso().slice(0, 10)}"></div>
      <div class="field"><label>Nom bénéficiaire / Responsable DCSI <span style="color:var(--danger)">*</span></label>
       <input id="dcsiResponsable" placeholder="Nom complet" value="${escapeHtml(currentUser?.name || "")}"></div>
      <div class="field"><label>Fonction <span style="color:var(--danger)">*</span></label>
        <input id="dcsiFonction" placeholder="Ex: Technicien DCSI"></div>
      <div class="field"><label>Structure émettrice <span style="color:var(--danger)">*</span></label>
        <input id="dcsiStructure" value="Direction Paiement Electronique"></div>
      <div class="field"><label>N° Bordereau BTS <span style="color:var(--danger)">*</span></label>
        <input id="dcsiBts" placeholder="Ex: BTS-2024-001" value="${escapeHtml(defaultBts)}"></div>
        <div class="field full"><label>Motif d'envoi</label>
        <input id="dcsiMotif" placeholder="Ex: Carte défectueuse, SIM endommagée..."></div>
        ${btsHint}
    </div>
    <div class="table-wrap" style="margin-top:12px;max-height:180px;overflow:auto;">
      <table><thead><tr><th>N° Carte</th><th>Code client</th><th>Client</th><th>Anomalie</th></tr></thead>
      <tbody>${selected.map((c) => `<tr><td>${escapeHtml(c.number)}</td><td>${escapeHtml(c.codeClient)}</td><td>${escapeHtml(c.owner)}</td><td>${escapeHtml(c.anomaly || "—")}</td></tr>`).join("")}</tbody></table>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
     <button class="btn btn-primary" onclick="confirmEnvoiDcsi()"><i class="fa-solid fa-paper-plane"></i>Envoyer & générer décharge type 2</button>`,
  );
}

// ==============================================
//                ENVOI DCSI
// ==============================================
async function confirmEnvoiDcsi() {
  if (!requireWrite()) return;
  const selected = state.cards.filter((c) => c.suiviSelected && !c.archived);
  if (!selected.length) return;
  const date = el("dcsiEnvoiDate").value || nowIso().slice(0, 10);
  const responsable = el("dcsiResponsable").value.trim();
  const fonctionDcsi = el("dcsiFonction")?.value.trim();
  const structure =
    el("dcsiStructure").value.trim() || "Direction Paiement Electronique";
  const btsDcsi = el("dcsiBts")?.value.trim();
  const motifDcsi =
    el("dcsiMotif")?.value.trim() || "Envoi pour traitement DCSI";
  if (!responsable) {
    showToast("Le nom du bénéficiaire est obligatoire.", true);
    return;
  }
  if (!fonctionDcsi) {
    showToast("La fonction est obligatoire.", true);
    return;
  }
  if (!btsDcsi) {
    showToast("Le N° Bordereau BTS est obligatoire.", true);
    return;
  }

  let reference = "";
  try {
    // Persiste la décharge Type-2 côté backend — ouvre un dossier suivi pour chaque carte.
    const resp = await API.decharges.createType2({
      destination: "DCSI_MAINTENANCE",
      nom_beneficiaire: responsable,
      fonction_beneficiaire: fonctionDcsi,
      date_sortie: date,
      numero_bordereau_bts: btsDcsi,
      cartesAnomalies: selected.map((c) => ({
        numero: c.number,
        anomalie: c.anomaly || motifDcsi,
        raisonsocialeclient: c.company || c.owner,
      })),
    });
    reference = resp?.data?.numero_decharge || nextReference("type2");
  } catch (err) {
    showToast(err?.message || "Erreur lors de l'envoi au DCSI.", true);
    return;
  }

  selected.forEach((card) => {
    card.status = "En cours traitement";
    card.transferState = `Transmis DCSI — ${reference}`;
    card.dateSuiviEnvoi = date;
    card.sentToDistrictForAnomaly = true;
    card.suiviSelected = false;
    syncCardBts(card, btsDcsi);
    logCardEvent(card.id, "Envoi DCSI", `Décharge ${reference} — ${date}`);
  });
  let pdfDataUri = null;
  try {
    pdfDataUri = await generateDechargeType2(selected, {
      destination: "DCSI",
      beneficiary: responsable,
      functionLabel: fonctionDcsi,
      bts: btsDcsi,
      reason: motifDcsi,
      date,
      reference,
    });
  } catch (e) {
    console.warn(e);
  }
  storeDecharge({
    kind: "type2",
    assetType: "Carte",
    object: `Transmission DCSI — ${selected.length} carte(s)`,
    from: structure,
    to: "DCSI",
    date,
    status: "Générée",
    cards: selected.map((c) => c.id),
    pdfDataUri,
    reference,
    numero_bordereau_bts: btsDcsi,
    nom_beneficiaire: responsable,
    fonction_beneficiaire: fonctionDcsi,
    beneficiary: responsable,
    functionLabel: fonctionDcsi,
  });
  suiviSelectionMode = false;
  const btn = el("suiviSelectBtn"),
    envBtn = el("suiviEnvoiBtn");
  if (btn)
    btn.innerHTML = '<i class="fa-solid fa-square-check"></i>Sélectionner';
  if (envBtn) envBtn.style.display = "none";
  saveState();
  closeModal();
  renderAll();
  showToast(
    `${selected.length} carte(s) envoyée(s) au DCSI — décharge type 2 générée.`,
  );
}

// viewTpeService affiche les détails d'un TPE en service, incluant les informations de base et la décharge associée s'il y en a une. Permet également de télécharger la décharge au format PDF si disponible.
function viewTpeService(id) {
  const tpe = state.tpe.find((t) => t.id === id);
  if (!tpe) return;
  const dec = state.decharges.find(
    (d) => d.cards && d.cards.includes(id) && d.assetType === "TPE",
  );
  openModal(
    "Détail TPE en service",
    `
    <div class="form-grid">
      <div class="field"><label>N° Série</label><input disabled value="${escapeHtml(tpe.serial)}"></div>
      <div class="field"><label>Modèle</label><input disabled value="${escapeHtml(tpe.model)}"></div>
      <div class="field"><label>État</label><input disabled value="${escapeHtml(tpe.status)}"></div>
      <div class="field"><label>Station</label><input disabled value="${escapeHtml(tpe.station)}"></div>
      <div class="field"><label>Localisation</label><input disabled value="${escapeHtml(tpe.location)}"></div>
      <div class="field"><label>Dernière maintenance</label><input disabled value="${formatDate(tpe.maintenanceDate)}"></div>
    </div>
    <hr style="margin:12px 0;border-color:var(--border);">
    <h4 style="margin-bottom:10px;font-size:.95rem;">Décharge associée</h4>
    <div class="form-grid">
      <div class="field"><label>N° Décharge</label><input disabled value="${dec ? escapeHtml(dec.reference) : "—"}"></div>
      <div class="field"><label>Date affectation</label><input disabled value="${dec ? formatDate(dec.date) : "—"}"></div>
      <div class="field"><label>De</label><input disabled value="${dec ? escapeHtml(dec.from) : "—"}"></div>
      <div class="field"><label>Vers</label><input disabled value="${dec ? escapeHtml(dec.to) : "—"}"></div>
    </div>`,
    `<button class="btn btn-primary" onclick="closeModal()">Fermer</button>${dec ? `<button class="btn btn-ghost" onclick="downloadStoredPdf('${escapeHtml(dec.id)}')"><i class="fa-solid fa-file-pdf"></i>PDF</button>` : ""}`,
  );
}

// Ouvre un modal affichant l'historique complet d'un TPE donné, incluant les événements enregistrés et les décharges associées. Permet de filtrer l'historique à partir d'une date spécifique.
function showTpeFullHistory(id) {
  const tpe = state.tpe.find((t) => t.id === id);
  if (!tpe) return;

  let dbHistory = [];
  let loading = true;

  function isOnOrAfterDate(value, dateFilter) {
    if (!dateFilter) return true;
    if (!value) return false;
    const filter = String(dateFilter).slice(0, 10);
    if (!filter) return true;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10) >= filter;
    }
    const str = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      return str.slice(0, 10) >= filter;
    }
    const fr = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (fr) {
      const ymd = `${fr[3]}-${fr[2]}-${fr[1]}`;
      return ymd >= filter;
    }
    const dt = new Date(value);
    if (!Number.isNaN(dt.getTime())) {
      return dt.toISOString().slice(0, 10) >= filter;
    }
    return false;
  }

  function resolveUser(idu) {
    if (!idu) return "Système";
    const u = (state.users || []).find((x) => x.backendId === idu);
    return u?.name || `Utilisateur #${idu}`;
  }

  function combinedEvents() {
    const dateFilter = el("historyTpeDateFilter")?.value || "";
    const dbRows = dbHistory.map((h) => ({
      date: h.dateoperation,
      etats: `${escapeHtml(h.ancienetat || "—")} → ${escapeHtml(h.nouveletat || "—")}`,
      commentaire: h.commentaire || "—",
      user: resolveUser(h.id_utilisateur),
    }));
    const sessionRows = state.tpeHistory
      .filter((e) => e.tpeId === id)
      .map((ev) => ({
        date: ev.date,
        etats: escapeHtml(ev.action || "—"),
        commentaire: ev.detail || "—",
        user: ev.user || "Système",
      }));
    return [...dbRows, ...sessionRows]
      .filter((r) => isOnOrAfterDate(r.date, dateFilter))
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }

  function renderFilteredTpeHistory() {
    const evTarget = el("historyTpeEventsTable");
    const decTarget = el("historyTpeDecTable");
    if (!evTarget || !decTarget) return;

    const dateFilter = el("historyTpeDateFilter")?.value || "";
    const decs = state.decharges
      .filter((d) => d.cards && d.cards.includes(id) && d.assetType === "TPE")
      .filter((d) => isOnOrAfterDate(d.date, dateFilter));

    if (loading) {
      evTarget.innerHTML =
        '<p class="muted" style="padding:12px;">Chargement de l\'historique…</p>';
    } else {
      const evR =
        combinedEvents()
          .map(
            (r) => `
        <tr>
          <td>${formatDateTime(r.date)}</td>
          <td>${r.etats}</td>
          <td>${escapeHtml(r.commentaire)}</td>
          <td>${escapeHtml(r.user)}</td>
        </tr>`,
          )
          .join("") || '<tr><td colspan="4" class="muted">Aucun.</td></tr>';
      evTarget.innerHTML = `<table><thead><tr><th>Horodatage</th><th>État (ancien → nouveau)</th><th>Commentaire</th><th>Utilisateur</th></tr></thead><tbody>${evR}</tbody></table>`;
    }

    const dR =
      decs
        .map(
          (d) =>
            `<tr><td>${escapeHtml(d.reference)}</td><td>${escapeHtml(d.object)}</td><td>${formatDate(d.date)}</td><td>${badge(d.status)}</td><td><button class="btn btn-ghost btn-sm" onclick="downloadStoredPdf('${escapeHtml(d.id)}')"><i class="fa-solid fa-file-pdf"></i></button></td></tr>`,
        )
        .join("") ||
      '<tr><td colspan="5" class="muted">Aucune décharge.</td></tr>';
    decTarget.innerHTML = `<table><thead><tr><th>Réf</th><th>Objet</th><th>Date</th><th>Statut</th><th>PDF</th></tr></thead><tbody>${dR}</tbody></table>`;
  }

  window.renderFilteredTpeHistory = renderFilteredTpeHistory;

  openModal(
    `Historique TPE — ${tpe.serial}`,
    `
    <div class="advanced-filters-grid" style="margin-bottom:16px;">
      <div class="field">
        <label>Afficher à partir du</label>
        <input id="historyTpeDateFilter" type="date" oninput="renderFilteredTpeHistory()" onchange="renderFilteredTpeHistory()">
      </div>
    </div>
    <h4 style="margin-bottom:8px;font-size:.95rem;">Événements</h4>
    <div class="table-wrap" id="historyTpeEventsTable"></div>
    <h4 style="margin:14px 0 8px;font-size:.95rem;">Décharges associées</h4>
    <div class="table-wrap" id="historyTpeDecTable"></div>`,
    `<button class="btn btn-ghost" onclick="el('historyTpeDateFilter').value=''; renderFilteredTpeHistory()">Réinitialiser</button>
     <button class="btn btn-primary" onclick="closeModal()">Fermer</button>`,
  );

  renderFilteredTpeHistory();

  API.tpe
    .getHistorique(tpe.serial)
    .then((resp) => {
      dbHistory = Array.isArray(resp)
        ? resp
        : Array.isArray(resp?.historique)
          ? resp.historique
          : [];
    })
    .catch((err) => {
      console.error("getHistorique tpe failed:", err);
      dbHistory = [];
    })
    .finally(() => {
      loading = false;
      renderFilteredTpeHistory();
    });
}

// Ouvre le modal de restitution pour un TPE donné, permettant de saisir le mode de restitution, la date, et des observations. Pré-remplit les informations du TPE concerné.
function openTpeRestitutionModal(id) {
  if (!requireRestitutionEdit()) return;
  const tpe = state.tpe.find((t) => t.id === id);
  if (!tpe) return;
  openModal(
    "Restitution TPE",
    `
    <div class="form-grid">
      <div class="field full"><label>TPE</label><input disabled value="${escapeHtml(tpe.serial)} — ${escapeHtml(tpe.model)}"></div>
      <div class="field"><label>Mode de l'opération</label>
        <select id="tpeRestitMode">
          <option value="En panne">En panne</option>
          <option value="Volé">Volé</option>
        </select>
      </div>
      <div class="field"><label>Date de restitution</label><input id="tpeRestitDate" type="date" value="${nowIso().slice(0, 10)}"></div>
      <div class="field full"><label>Observation</label><textarea id="tpeRestitObs" placeholder="Observations..."></textarea></div>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
     <button class="btn btn-primary" onclick="confirmTpeRestitution('${escapeHtml(tpe.id)}')"><i class="fa-solid fa-circle-check"></i>Valider</button>`,
  );
}

// Confirme la restitution d'un TPE — persiste dans restitution_reconfig_tpe côté backend
// puis met à jour l'état local.
async function confirmTpeRestitution(id) {
  if (!requireRestitutionEdit()) return;
  const tpe = state.tpe.find((t) => t.id === id);
  if (!tpe) return;
  const mode = el("tpeRestitMode").value;
  const obs = el("tpeRestitObs").value.trim();
  const motif = obs ? `${mode} — ${obs}` : mode;

  try {
    await API.tpe.restituer({
      numeroserietpe: tpe.serial,
      motif_restitution: motif,
    });
  } catch (err) {
    showToast(err?.message || "Erreur lors de la restitution.", true);
    return;
  }

  tpe.status = mode;
  tpe.location = `Restitution — ${mode}`;
  logTpeEvent(id, "Restitution TPE", `Mode: ${mode}. ${obs}`);
  saveState();
  closeModal();
  renderAll();
  showToast(`TPE restitué — statut : ${mode}`);
}

// Rafraîchit l'ensemble des vues de l'application.
function renderAll() {
  refreshStatuses();
  renderDashboard();
  renderCards();
  renderRenouvCards();
  renderCardsCirculation();
  renderCardsSuivi();
  renderCardsDecharges();
  renderCardsArchive();
  renderTpe();
  renderTpeService();
  renderTpeSuivi();
  renderTpeDecharges();
  renderCommandes();
  renderStations();
  renderUsers();
  renderResetRequests();
  renderAudit();
  const cardAlerts = state.cards.filter((c) =>
    ["Expire bientôt", "Expirée", "Défectueuse", "Perdue", "Volée"].includes(c.status),
  ).length;
  const tpeAlerts = (state.tpe || []).filter((t) =>
    ["En panne", "Volé"].includes(t.status),
  ).length;
  el("notifCount").textContent = String(cardAlerts + tpeAlerts);
}

// =====================================================================
// TPE -
// =====================================================================

// Rend la section de résumé des TPE, avec les indicateurs clés (total visible, en stock, en service, suivi) et les actions rapides (mise en service, export). Utilise les données filtrées selon les critères de recherche et de filtre appliqués.
function renderTpeSummary() {
  const rows = visibleTpe();
  const total = rows.length;
  const stock = rows.filter((t) =>
    ["En stock", "Disponible", "Réservé"].includes(t.status),
  ).length;
  const service = state.tpe.filter((t) => t.status === "En service").length;
  const rate = total ? Math.round((service / total) * 100) : 0;
  const chunks = [
    ["Total visible", total, "fa-solid fa-mobile-screen-button"],
    ["En stock", stock, "fa-solid fa-box-open"],
    ["En service", service, "fa-solid fa-plug-circle-check"],
    [
      "Suivi",
      state.tpe.filter((t) => tpeStatusesForSuivi().includes(t.status)).length,
      "fa-solid fa-screwdriver-wrench",
    ],
  ];
  if (el("tpeStockKpiTotal"))
    el("tpeStockKpiTotal").textContent = String(total);
  if (el("tpeStockKpiStock"))
    el("tpeStockKpiStock").textContent = String(stock);
  if (el("tpeStockKpiRate")) el("tpeStockKpiRate").textContent = `${rate}%`;
  el("tpeSummaryContent").innerHTML = chunks
    .map(
      ([label, value, icon]) =>
        `<span class="chip"><i class="${icon}"></i>${escapeHtml(label)} : ${value}</span>`,
    )
    .join("");
}

let tpeStockSelectionMode = false;

// Active/désactive le mode de sélection pour les TPE en stock, permettant de sélectionner plusieurs TPE pour des actions groupées (ex: mise en service). Met à jour l'affichage des boutons et colonnes associés.
function toggleTpeStockSelectionMode() {
  tpeStockSelectionMode = !tpeStockSelectionMode;
  const btn = el("tpeStockSelectBtn"),
    svcBtn = el("tpeStockServiceBtn");
  const selectTh = el("tpeStockSelectTh");
  if (!tpeStockSelectionMode) {
    state.tpe.forEach((t) => {
      t.tpeSelected = false;
    });
    if (btn)
      btn.innerHTML = '<i class="fa-solid fa-square-check"></i>Sélectionner';
    if (svcBtn) svcBtn.style.display = "none";
    if (selectTh) selectTh.style.display = "none";
  } else {
    if (btn)
      btn.innerHTML =
        '<i class="fa-solid fa-square-xmark"></i>Quitter sélection';
    if (svcBtn) svcBtn.style.display = "";
    if (selectTh) selectTh.style.display = "";
  }
  renderTpe();
}

function toggleTpeSelection(id, checked) {
  const t = state.tpe.find((t) => String(t.id) === String(id));
  if (t) {
    t.tpeSelected = checked;
    renderTpe();
  }
}

// Coche/décoche tous les TPE visibles du tableau Stock (utilisé par la case d'en-tête).
function toggleSelectAllVisibleTpe(checked) {
  const visibleIds = new Set(visibleTpe().map((t) => String(t.id)));
  state.tpe.forEach((t) => {
    if (visibleIds.has(String(t.id))) t.tpeSelected = !!checked;
  });
  renderTpe();
}

// Ouvre le modal de mise en service pour les TPE sélectionnés, avec pré-remplissage des informations et vérifications nécessaires.
async function openTpeMiseEnServiceModal() {
  if (!requireWrite()) return;
  const selected = state.tpe.filter((t) => t.tpeSelected);
  if (!selected.length) {
    showToast("Aucun TPE sélectionné.", true);
    return;
  }
  // Vérification : tous les TPE doivent être de la même structure
  const stations = [...new Set(selected.map((t) => t.station))];
  if (stations.length > 1) {
    showToast(
      "Tous les TPE sélectionnés doivent appartenir à la même structure.",
      true,
    );
    return;
  }

  // Charge la liste des structures — le backend a besoin de l'idstructure destination.
  let structures = [];
  try {
    const resp = await API.structure.list();
    structures = resp?.structures || [];
  } catch (err) {
    showToast(
      err?.message || "Impossible de charger la liste des structures.",
      true,
    );
    return;
  }
  if (!structures.length) {
    showToast("Aucune structure disponible pour votre compte.", true);
    return;
  }
  const preselect = structures.find(
    (s) => s.nom_structure === stations[0] || s.code === stations[0],
  );
  const structureOptions = structures
    .map(
      (s) =>
        `<option value="${s.idstructure}" data-code="${escapeHtml(s.code)}" data-name="${escapeHtml(s.nom_structure)}" ${preselect && s.idstructure === preselect.idstructure ? "selected" : ""}>${escapeHtml(s.nom_structure)} (${escapeHtml(s.code)})</option>`,
    )
    .join("");

  openModal(
    "Mise en service — Décharge type 1",
    `
    <div class="form-grid">
      <div class="field"><label>TPE sélectionnés</label><input disabled value="${selected.length} TPE"></div>
      <div class="field"><label>Date de sortie</label><input id="tpeServiceDate" type="date" value="${nowIso().slice(0, 10)}"></div>
      <div class="field"><label>Structure destinataire *</label><select id="tpeServiceStructureId" required>${structureOptions}</select></div>
      <div class="field"><label>Responsable</label><input id="tpeServiceResp" value="${escapeHtml(currentUser?.name || "")}"></div>
      <div class="field"><label>Fonction</label><input id="tpeServiceFonction" placeholder="Ex: Responsable structure"></div>
      <div class="field full"><label>Motif / observation</label><textarea id="tpeServiceMotif" placeholder="Motif de l'affectation..."></textarea></div>
    </div>
    <div style="margin-top:12px;" class="muted">${selected.length} TPE — décharge type 1 sera générée.</div>
    <div class="table-wrap" style="margin-top:12px;max-height:160px;overflow:auto;">
      <table><thead><tr><th>N° Série</th><th>ID Terminal</th><th>Nom commercial</th></tr></thead>
      <tbody>${selected.map((t) => `<tr><td>${escapeHtml(t.serial)}</td><td>${escapeHtml(t.idTerminal || "—")}</td><td>${escapeHtml(t.nomCommercial || "—")}</td></tr>`).join("")}</tbody></table>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
     <button class="btn btn-primary" onclick="confirmTpeMiseEnService()"><i class="fa-solid fa-circle-check"></i>Confirmer & générer décharge type 1</button>`,
  );
}

// Confirme la mise en service des TPE sélectionnés, génère une décharge type 1 et met à jour les états.
async function confirmTpeMiseEnService() {
  if (!requireWrite()) return;
  const selected = state.tpe.filter((t) => t.tpeSelected);
  if (!selected.length) return;
  const date = el("tpeServiceDate").value || nowIso().slice(0, 10);
  const structureSelect = el("tpeServiceStructureId");
  const idstructure_destination = parseInt(structureSelect?.value, 10);
  const selectedOption = structureSelect?.selectedOptions?.[0];
  const destCode = selectedOption?.dataset?.code || "";
  const destName = selectedOption?.dataset?.name || "";
  const responsable =
    el("tpeServiceResp").value.trim() || currentUser?.name || "DPE";
  const fonction = el("tpeServiceFonction").value.trim() || "Responsable";
  const motif = el("tpeServiceMotif").value.trim() || "Mise en service TPE";
  if (!idstructure_destination) {
    showToast("Structure destinataire obligatoire.", true);
    return;
  }

  let reference = "";
  try {
    const resp = await API.tpe.transfertType1({
      numeros_serie_tpe: selected.map((t) => t.serial),
      source: "DPE",
      destination: destName || destCode,
      nom_beneficiaire: responsable,
      fonction_beneficiaire: fonction,
      idstructure_destination,
    });
    reference =
      resp?.decharge?.numero_decharge ||
      resp?.numero_decharge ||
      nextReference("tpe");
  } catch (err) {
    showToast(
      err?.message || "Erreur lors de la génération de la décharge.",
      true,
    );
    return;
  }

  selected.forEach((t) => {
    t.status = "En service";
    t.station = destName || destCode;
    t.location = destName || destCode;
    t.dateSortie = date;
    t.transferState = `Mis en service → ${destName || destCode}`;
    t.tpeSelected = false;
    logTpeEvent(
      t.id,
      "Mise en service",
      `Décharge type 1 ${reference} — ${destName || destCode}`,
    );
  });
  let pdfDataUri = null;
  try {
    pdfDataUri = await generateTpeDechargeType1(selected, {
      reference,
      beneficiary: responsable,
      functionLabel: fonction,
      date,
      inventory: reference,
      structure: destName || destCode,
      district: destName || destCode,
    });
  } catch (e) {
    console.warn(e);
  }
  const invNum = `IN_TERM-${String(nextTpeInventoryNum() + 1).padStart(2, "0")}`;
  storeDecharge({
    kind: "tpe",
    assetType: "TPE",
    object: `Mise en service TPE — ${selected.length} appareil(s)`,
    from: "DPE",
    to: destName || destCode,
    date,
    status: "Générée",
    cards: selected.map((t) => t.id),
    pdfDataUri,
    reference,
    nom_beneficiaire: responsable,
    fonction_beneficiaire: fonction,
    beneficiary: responsable,
    functionLabel: fonction,
    numero_inventaire: invNum,
  });
  tpeStockSelectionMode = false;
  const btn = el("tpeStockSelectBtn"),
    svcBtn = el("tpeStockServiceBtn");
  if (btn)
    btn.innerHTML = '<i class="fa-solid fa-square-check"></i>Sélectionner';
  if (svcBtn) svcBtn.style.display = "none";
  saveState();
  closeModal();
  renderAll();
  showToast(`${selected.length} TPE mis en service — décharge type 1 générée.`);
}

//tab stock tpe
function renderTpe() {
  ensureTpeDataset();
  populateTpeFilterOptions();
  renderTpeSummary();
  const rows = visibleTpe();
  const selCount = rows.filter((t) => t.tpeSelected).length;
  const svcBtn = el("tpeStockServiceBtn");
  if (svcBtn && tpeStockSelectionMode)
    svcBtn.innerHTML = `<i class="fa-solid fa-circle-check"></i>Mettre en service (${selCount})`;
  el("tpeBody").innerHTML =
    rows
      .map((item) => {
        const selTd = tpeStockSelectionMode
          ? `<td><input type="checkbox" ${item.tpeSelected ? "checked" : ""} onchange="toggleTpeSelection('${escapeHtml(item.id)}',this.checked)" style="width:16px;height:16px;cursor:pointer;"></td>`
          : "";
        return `<tr>
      ${selTd}
     <td>${escapeHtml(item.idTerminal || "—")}</td>
     <td>${badge(item.status)}</td>
     <td>${escapeHtml(item.serial)}</td>
      <td>${formatDate(item.dotation || "")}</td>

      <td>${formatDate(item.dateReception || item.maintenanceDate)}</td>

      <td><span class="badge b-info">${escapeHtml(item.amortissement || "—")}</span></td>
       <td>${escapeHtml(item.adresse || "—")}</td>
      <td>${escapeHtml(item.district || "—")}</td>
      <td>${escapeHtml(item.numContrat || "—")}</td>
     <td>${escapeHtml(item.codeStructure || "—")}</td>
     <td>${escapeHtml(item.wilaya || "—")}</td>
     <td>${escapeHtml(item.codeStation || "—")}</td>
      <td>${escapeHtml(item.numeroSerieSim || "—")}</td>

      <td>${escapeHtml(item.adresseIPSim || "—")}</td>

      <td>${escapeHtml(item.nTelSim || "—")}</td>
      <td>${escapeHtml(item.dateRemise || "—")}</td>
      <td><span class="badge b-info">${escapeHtml(item.tarification)}</span></td>

      <td>
        <div style="display:flex;gap:5px;flex-wrap:wrap;">
          <button class="btn btn-ghost btn-sm" title="Voir" onclick="viewTpe('${escapeHtml(item.id)}')"><i class="fa-solid fa-eye"></i></button>


        </div>
      </td>
    </tr>`;
      })
      .join("") ||
    `<tr><td colspan="${tpeStockSelectionMode ? 10 : 9}" class="muted">Aucun TPE trouvé.</td></tr>`;
}
// =====================================================================
// DASHBOARD CHARTS & MAP FUNCTIONS
// =====================================================================

// Met à jour le graphique d'évolution des utilisations (Cartes/TPE) sur 6 mois.
function updateEvolutionChart(evolutionData) {
  const ctx = el("usageChart");
  if (!ctx) return;

  const labels = evolutionData.map((d) => d.mois);
  const cartesData = evolutionData.map((d) => d.cartes);
  const tpeData = evolutionData.map((d) => d.tpe);

  new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Cartes",
          data: cartesData,
          borderColor: "#007bff",
          backgroundColor: "rgba(0, 123, 255, 0.1)",
          tension: 0.4,
        },
        {
          label: "TPE",
          data: tpeData,
          borderColor: "#28a745",
          backgroundColor: "rgba(40, 167, 69, 0.1)",
          tension: 0.4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "top" },
      },
      scales: {
        y: { beginAtZero: true },
      },
    },
  });
}

// Met à jour la liste de répartition géographique par wilaya.
function updateGeographicList(repartitionData) {
  // Cette fonction pourrait être utilisée pour afficher une liste ou un tableau
  // des wilayas avec leurs compteurs, mais pour l'instant elle n'est pas utilisée
  // dans le HTML. On la garde pour une future implémentation.
  console.log("Répartition géographique:", repartitionData);
}

// Met à jour la carte Leaflet avec les stations NAFTAL.
function updateMapWithStations(stationsData) {
  const mapDiv = el("algeriaMap");
  if (!mapDiv) return;

  let map = window.algeriaMap;
  if (!map) {
    // Initialiser la carte centrée sur l'Algérie si elle n'existe pas
    map = L.map("algeriaMap").setView([28.0339, 1.6596], 5);

    // Ajouter la couche de tuiles OpenStreetMap
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);

    window.algeriaMap = map;
  } else {
    // Supprimer les anciens marqueurs si la carte existe déjà
    map.eachLayer((layer) => {
      if (layer instanceof L.CircleMarker) {
        map.removeLayer(layer);
      }
    });
  }

  // Ajouter les marqueurs pour chaque station
  stationsData.forEach((station) => {
    if (station.lat && station.lng) {
      const markerColor =
        station.tpe > 0 ? "#28a745" : station.tpe === 0 ? "#ffc107" : "#dc3545";
      const marker = L.circleMarker([station.lat, station.lng], {
        color: markerColor,
        fillColor: markerColor,
        fillOpacity: 0.8,
        radius: 8,
      }).addTo(map);

      marker.bindPopup(`
        <strong>${station.name}</strong><br>
        Code: ${station.code}<br>
        Wilaya: ${station.wilaya}<br>
        TPE: ${station.tpe || 0}
      `);
    }
  });
}

// =====================================================================
// TPE EN SERVICE
// =====================================================================
function renderTpeService() {
  ensureTpeDataset();
  populateTpeFilterOptions();
  const rows = getTpeServiceRows();
  if (el("tpeServiceKpiTotal"))
    el("tpeServiceKpiTotal").textContent = String(
      rows.filter((t) => t.status === "En service").length,
    );
  if (el("tpeServiceKpiActive"))
    el("tpeServiceKpiActive").textContent = String(
      state.decharges.filter((d) => d.assetType === "TPE").length,
    );
  if (el("tpeServiceKpiAlerts"))
    el("tpeServiceKpiAlerts").textContent = String(
      rows.filter((t) => t.status === "En traitement").length,
    );
  el("tpeServiceBody").innerHTML =
    rows
      .map((item) => {
        const dec = state.decharges.find(
          (d) => d.cards && d.cards.includes(item.id) && d.assetType === "TPE",
        );
        return `
      <tr>
     <td>${escapeHtml(item.district || "—")}</td>
     <td>${escapeHtml(item.serial)}</td>
     <td>${badge(item.status)}</td>
     <td>${escapeHtml(item.idTerminal)}</td>
      <td>${escapeHtml(item.dotation)}</td>

      <td>${escapeHtml(item.codeStructure || "—")}</td>

      <td>${escapeHtml(item.wilaya || "—")}</td>
      <td>${escapeHtml(item.codeStation || "—")}</td>
      <td>${escapeHtml(item.adresse || "—")}</td>
      <td>${escapeHtml(item.numCompte || "—")}</td>
      <td>${formatDate(item.dateReception)} </td>
      <td>${escapeHtml(item.dateRemise || "—")}</td>

      <td><span class="badge b-info">${escapeHtml(item.amortissement || computeTpeAmortissement(item))}</span></td>


        <td>
          <div style="display:flex;gap:5px;flex-wrap:nowrap;align-items:center;">
            <button class="btn btn-ghost btn-sm" title="Infos" onclick="viewTpeService('${escapeHtml(item.id)}')"><i class="fa-solid fa-eye"></i></button>

            ${canEditRestitution() ? `<button class="btn btn-ghost btn-sm" title="Restitution" onclick="openTpeRestitutionModal('${escapeHtml(item.id)}')"><i class="fa-solid fa-rotate-left"></i></button>` : ""}
            <button class="btn btn-ghost btn-sm" title="Historique" onclick="showTpeFullHistory('${escapeHtml(item.id)}')"><i class="fa-solid fa-timeline"></i></button>
          </div>
        </td>
      </tr>`;
      })
      .join("") ||
    '<tr><td colspan="13" class="muted">Aucun TPE en service.</td></tr>';
}

// Retourne les TPE actuellement visibles dans la section Suivi (mêmes filtres que
// renderTpeSuivi). Utilisé aussi par toggleSelectAllVisibleTpeSuivi.
function visibleTpeSuivi() {
  const search = (el("tpeSuiviSearch")?.value || "").trim().toLowerCase();
  const status = el("tpeSuiviStatus")?.value || "";
  const structure = el("tpeSuiviStation")?.value || "";
  return state.tpe
    .filter((item) => tpeStatusesForSuivi().includes(item.status))
    .filter((item) =>
      hasScope({
        district: item.district || item.station,
        station: item.station,
        location: item.location,
      }),
    )
    .filter((item) => {
      const hay = [
        item.serial,
        item.idTerminal,
        item.nomCommercial,
        item.status,
        item.transferState,
        item.station,
        item.district || "",
        item.raisonsocialestructure || "",
      ]
        .join(" ")
        .toLowerCase();
      return (
        (!search || hay.includes(search)) &&
        (!status || item.status === status) &&
        tpeMatchesStructure(item, structure)
      );
    });
}

// suivi des TPE, avec les indicateurs clés (total en suivi, en maintenance, en panne) et les actions rapides (envoi pour traitement). Utilise les données filtrées selon les critères de recherche et de filtre appliqués.
function renderTpeSuivi() {
  ensureTpeDataset();
  populateTpeFilterOptions();
  el("tpeSuiviSelectTh").style.display = tpeSuiviSelectionMode
    ? "table-cell"
    : "none";
  const rows = visibleTpeSuivi();

  // 2. Mise à jour des blocs KPI basée uniquement sur 'rows'
  if (el("tpeSuiviKpiTotal")) {
    el("tpeSuiviKpiTotal").textContent = String(rows.length);
  }

  if (el("tpeSuiviKpiMaintenance")) {
    // Compte uniquement dans les résultats affichés
    const count = rows.filter((t) =>
      ["En traitement", "En_traitement"].includes(t.status),
    ).length;
    el("tpeSuiviKpiMaintenance").textContent = String(count);
  }

  if (el("tpeSuiviKpiTransit")) {
    // Compte uniquement dans les résultats affichés (TPE bloqués en panne ou volés).
    const count = rows.filter((t) =>
      ["En panne", "Volé"].includes(t.status),
    ).length;
    el("tpeSuiviKpiTransit").textContent = String(count);
  }

  const selectedCount = rows.filter((t) => t.tpeSuiviSelected).length;
  const envBtn = el("tpeSuiviEnvoiBtn");
  if (envBtn && tpeSuiviSelectionMode)
    envBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i>Envoyer pour traitement (${selectedCount})`;

  el("tpeSuiviBody").innerHTML =
    rows
      .map((item) => {
        const last = (state.tpeHistory || []).filter(
          (ev) => ev.tpeId === item.id,
        )[0];

        // Durée traitement basée sur dateEnvoiBea et dateRetourBea
        let dureeTraitement = '<span class="muted">—</span>';
        if (item.dateEnvoiBea && item.dateRetourBea) {
          const diff = Math.max(
            0,
            Math.ceil(
              (new Date(item.dateRetourBea) - new Date(item.dateEnvoiBea)) /
                86400000,
            ),
          );
          dureeTraitement = `<span style="background:rgba(40,167,69,.15);color:var(--secondary);border:1px solid rgba(40,167,69,.3);padding:3px 10px;border-radius:999px;font-weight:700;font-size:.8rem;">${diff} j</span>`;
        } else if (item.dateEnvoiBea) {
          const diff = Math.max(
            0,
            Math.ceil((new Date() - new Date(item.dateEnvoiBea)) / 86400000),
          );
          dureeTraitement = `<span class="badge b-warning">${diff} j (en cours)</span>`;
        }

        const selTd = `<td style="display:${tpeSuiviSelectionMode ? "table-cell" : "none"};">${tpeSuiviSelectionMode ? `<input type="checkbox" ${item.tpeSuiviSelected ? "checked" : ""} onchange="toggleTpeSuiviSelection('${escapeHtml(item.id)}',this.checked)" style="width:16px;height:16px;cursor:pointer;">` : ""}</td>`;

        // Bouton retour en service : disponible tant que le TPE est en traitement
        // et que la remise en service n'a pas déjà été faite. La date de retour
        // BEA est facultative ici — la modale demande la date de remise en service.
        const canReturnService =
          (item.status === "En traitement" ||
            item.status === "En_traitement" ||
            !!item.dateEnvoiBea) &&
          !item.retourServiceDone &&
          isWriteAllowed();

        // Affiche "Validé par / Date validation" uniquement après une vraie
        // modification de suivi (clic utilisateur sur "Modification suivi").
        // La restitution pré-remplit dateValidation côté backend, donc on
        // s'appuie sur dateRetourBea (saisi seulement via la modale) ou sur
        // le flag local suiviModifie pour distinguer les deux cas.
        const isSuiviModified =
          item.suiviModifie === true || !!item.dateRetourBea;

        return `<tr>
      ${selTd}
      <td>${escapeHtml(item.idTerminal)}</td>
      <td>${escapeHtml(item.serial)}</td>
      <td>${badge(item.status)}</td>
      <td>${item.datePanne ? formatDate(item.datePanne) : '<span class="muted">—</span>'}</td>
      <td>${escapeHtml(item.district)}</td>
      <td>${escapeHtml(item.codeStation)}</td>
      <td>${escapeHtml(item.anomaly || item.etatPanne || "—")}</td>
      <td>${dureeTraitement}</td>
      <td>${escapeHtml(item.numCompte || "—")}</td>
      <td>${escapeHtml(item.dotation || "—")}</td>
      <td>${escapeHtml(item.objet_dia || "—")}</td>

      <td>${item.dateEnvoiBea ? formatDate(item.dateEnvoiBea) : '<span class="muted">—</span>'}</td>
      <td>${item.dateRetourBea ? formatDate(item.dateRetourBea) : '<span class="muted">—</span>'}</td>
      <td>${escapeHtml(item.nSerieTpeSubstitution || "—")}</td>

      <td>${isSuiviModified ? escapeHtml(item.validePar || "—") : '<span class="muted">—</span>'}</td>
      <td>${isSuiviModified && item.dateValidationSuivi ? formatDate(item.dateValidationSuivi) : '<span class="muted">—</span>'}</td>


      <td>
       <div style="display:flex;gap:5px;flex-wrap:nowrap;align-items:center;">
          <button class="btn btn-ghost btn-sm" title="Historique" onclick="showTpeFullHistory('${escapeHtml(item.id)}')"><i class="fa-solid fa-timeline"></i></button>
          ${isWriteAllowed() ? `<button class="btn btn-ghost btn-sm" title="Saisir date retour BEA / état panne" onclick="openTpeSuiviEditModal('${escapeHtml(item.id)}')"><i class="fa-solid fa-pen-to-square"></i></button>` : ""}
          ${canReturnService ? `<button class="btn btn-ghost btn-sm" title="Retour en service" onclick="openTpeRetourServiceModal('${escapeHtml(item.id)}')" style="color:var(--secondary);border-color:rgba(40,167,69,.4);"><i class="fa-solid fa-circle-check"></i></button>` : ""}
        </div>
      </td>
    </tr>`;
      })
      .join("") ||
    `<tr><td colspan="21" class="muted">Aucun TPE en suivi.</td></tr>`;
}

function nextTpeInventoryNum() {
  const tpeDecharges = state.decharges.filter((d) => d.assetType === "TPE");
  const maxTerm = tpeDecharges.reduce((max, d) => {
    const num = d.numero_inventaire || d.serial || d.bts || "";
    const m = num.match(/^IN_TERM-(\d+)$/i);
    return m ? Math.max(max, parseInt(m[1], 10)) : max;
  }, 0);
  return maxTerm > 0 ? maxTerm : tpeDecharges.length;
}

function renderTpeDecharges() {
  const dateFilter = el("tpeDechargesDateFilter")?.value || "";
  const isOnOrAfterDate = (value, filter) => {
    if (!filter) return true;
    if (!value) return false;
    const normalizedFilter = String(filter).slice(0, 10);
    if (!normalizedFilter) return true;
    const str = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      return str.slice(0, 10) >= normalizedFilter;
    }
    const dt = new Date(value);
    return (
      !Number.isNaN(dt.getTime()) &&
      dt.toISOString().slice(0, 10) >= normalizedFilter
    );
  };

  // Source of truth for ordering: the numeric part of numero_inventaire
  // (IN_TERM-N). The DB renumbering script guarantees IN_TERM-1 = oldest,
  // IN_TERM-N = newest. LIFO = sort by that number DESC. Falls back to
  // date for any decharge that hasn't received a number yet.
  const invKey = (d) => {
    const m = String(d.numero_inventaire || "").match(/^IN_TERM-(\d+)$/i);
    if (m) return parseInt(m[1], 10);
    const t = new Date(d.date_sortie || d.date_creation || d.date || 0).getTime();
    return Number.isFinite(t) ? t / 1000 : 0;
  };

  // Sequential fallback for any decharge missing numero_inventaire (e.g.
  // freshly created before a reload). Oldest unnumbered -> highest free
  // number after the current max.
  const allTpe = state.decharges.filter((d) => d.assetType === "TPE");
  const currentMax = allTpe.reduce((m, d) => {
    const k = invKey(d);
    return Number.isFinite(k) && k > m ? k : m;
  }, 0);
  const invNumMap = new Map();
  let nextFree = Math.floor(currentMax) + 1;
  [...allTpe]
    .sort((a, b) => {
      const da = new Date(a.date_sortie || a.date_creation || a.date || 0);
      const db = new Date(b.date_sortie || b.date_creation || b.date || 0);
      return da - db;
    })
    .forEach((d) => {
      if (!/^IN_TERM-\d+$/i.test(String(d.numero_inventaire || ""))) {
        invNumMap.set(d.id, `IN_TERM-${String(nextFree).padStart(2, "0")}`);
        nextFree++;
      }
    });

  const rows = state.decharges
    .filter((d) => d.assetType === "TPE")
    .filter((d) =>
      hasScope({
        district: d.district || "",
        station: d.to || d.destination || d.structure_concernee || "",
        wilaya: d.wilaya || "",
      }),
    )
    .filter((d) =>
      isOnOrAfterDate(d.date_sortie || d.date_creation || d.date, dateFilter),
    )
    .sort((a, b) => invKey(b) - invKey(a)); // LIFO by inventory number

  el("tpeDechargesBody").innerHTML =
    rows
      .map((d) => {
        const inventoryNum = d.numero_inventaire || invNumMap.get(d.id) || "—";
        return `
    <tr>
      <td>${escapeHtml(d.numero_decharge || d.reference || "—")}</td>
      <td>${escapeHtml(d.Source || d.from || "—")}</td>
      <td>${escapeHtml(d.Destination || d.to || "—")}</td>
      <td>${escapeHtml(d.nom_beneficiaire || d.beneficiary || "—")}</td>
      <td>${escapeHtml(d.fonction_beneficiaire || d.functionLabel || "—")}</td>
      <td>${formatDate(d.date_sortie || d.date)}</td>
      <td>${formatDate(d.date_creation || d.date)}</td>
      <td>${escapeHtml(inventoryNum)}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="downloadStoredPdf('${escapeHtml(d.id)}')"><i class="fa-solid fa-file-pdf"></i></button></td>
    </tr>
  `;
      })
      .join("") ||
    '<tr><td colspan="9" class="muted">Aucune décharge TPE.</td></tr>';
}

function viewTpeService(id) {
  const item = state.tpe.find((t) => t.id === id);
  if (!item) return;
  const dec = state.decharges.find(
    (d) => d.cards && d.cards.includes(id) && d.assetType === "TPE",
  );
  openModal(
    "Détail TPE en service",
    `
    <div class="form-grid">
      <div class="field"><label>N° Série TPE</label><input disabled value="${escapeHtml(item.serial)}"></div>
      <div class="field"><label>ID Terminal</label><input disabled value="${escapeHtml(item.idTerminal)}"></div>
      <div class="field"><label>N° Compte</label><input disabled value="${escapeHtml(item.numCompte)}"></div>
      <div class="field"><label>N° Contrat</label><input disabled value="${escapeHtml(item.numContrat)}"></div>
      <div class="field"><label>Nom commercial</label><input disabled value="${escapeHtml(item.nomCommercial)}"></div>
      <div class="field"><label>Adresse</label><input disabled value="${escapeHtml(item.adresse)}"></div>
      <div class="field"><label>Tarification</label><input disabled value="${escapeHtml(item.tarification)}"></div>
      <div class="field"><label>État</label><input disabled value="${escapeHtml(item.status)}"></div>
    </div>
    <hr style="margin:12px 0;border-color:var(--border);">
    <div class="form-grid">
      <div class="field"><label>N° Décharge</label><input disabled value="${dec ? escapeHtml(dec.reference) : "—"}"></div>
      <div class="field"><label>Date sortie</label><input disabled value="${item.dateSortie ? formatDate(item.dateSortie) : "—"}"></div>
      <div class="field"><label>Date réception</label><input disabled value="${formatDate(item.dateReception)}"></div>
      <div class="field"><label>Amortissement</label><input disabled value="${escapeHtml(item.amortissement || computeTpeAmortissement(item))}"></div>
    </div>`,
    `<button class="btn btn-primary" onclick="closeModal()">Fermer</button>${dec ? `<button class="btn btn-ghost" onclick="downloadStoredPdf('${escapeHtml(dec.id)}')"><i class="fa-solid fa-file-pdf"></i>PDF</button>` : ""}`,
  );
}

function showTpeFullHistory(id) {
  const item = state.tpe.find((t) => t.id === id);
  if (!item) return;

  let dbHistory = [];
  let loading = true;

  function isOnOrAfterDate(value, dateFilter) {
    if (!dateFilter) return true;
    if (!value) return false;
    const filter = String(dateFilter).slice(0, 10);
    if (!filter) return true;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10) >= filter;
    }
    const str = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      return str.slice(0, 10) >= filter;
    }
    const fr = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (fr) {
      const ymd = `${fr[3]}-${fr[2]}-${fr[1]}`;
      return ymd >= filter;
    }
    const dt = new Date(value);
    if (!Number.isNaN(dt.getTime())) {
      return dt.toISOString().slice(0, 10) >= filter;
    }
    return false;
  }

  function resolveUser(idu) {
    if (!idu) return "Système";
    const u = (state.users || []).find((x) => x.backendId === idu);
    return u?.name || `Utilisateur #${idu}`;
  }

  function combinedEvents() {
    const dateFilter = el("historyTpeDateFilter")?.value || "";
    const dbRows = dbHistory.map((h) => ({
      date: h.dateoperation,
      etats: `${escapeHtml(h.ancienetat || "—")} → ${escapeHtml(h.nouveletat || "—")}`,
      commentaire: h.commentaire || "—",
      user: resolveUser(h.id_utilisateur),
    }));
    const sessionRows = state.tpeHistory
      .filter((ev) => ev.tpeId === id)
      .map((ev) => ({
        date: ev.date,
        etats: escapeHtml(ev.action || "—"),
        commentaire: ev.detail || "—",
        user: ev.user || "Système",
      }));
    return [...dbRows, ...sessionRows]
      .filter((r) => isOnOrAfterDate(r.date, dateFilter))
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }

  function renderFilteredTpeHistory() {
    const evTarget = el("historyTpeEventsTable");
    const decTarget = el("historyTpeDecTable");
    if (!evTarget || !decTarget) return;

    const dateFilter = el("historyTpeDateFilter")?.value || "";
    const decs = state.decharges
      .filter((d) => d.cards && d.cards.includes(id) && d.assetType === "TPE")
      .filter((d) => isOnOrAfterDate(d.date, dateFilter));

    if (loading) {
      evTarget.innerHTML =
        '<p class="muted" style="padding:12px;">Chargement de l\'historique…</p>';
    } else {
      const evRows =
        combinedEvents()
          .map(
            (r) => `
        <tr>
          <td>${formatDateTime(r.date)}</td>
          <td>${r.etats}</td>
          <td>${escapeHtml(r.commentaire)}</td>
          <td>${escapeHtml(r.user)}</td>
        </tr>`,
          )
          .join("") || '<tr><td colspan="4" class="muted">Aucun.</td></tr>';
      evTarget.innerHTML = `<table><thead><tr><th>Horodatage</th><th>État (ancien → nouveau)</th><th>Commentaire</th><th>Utilisateur</th></tr></thead><tbody>${evRows}</tbody></table>`;
    }

    const decRows =
      decs
        .map(
          (d) =>
            `<tr><td>${escapeHtml(d.reference)}</td><td>${escapeHtml(d.object)}</td><td>${formatDate(d.date)}</td><td>${badge(d.status)}</td><td><button class="btn btn-ghost btn-sm" onclick="downloadStoredPdf('${escapeHtml(d.id)}')"><i class="fa-solid fa-file-pdf"></i></button></td></tr>`,
        )
        .join("") ||
      '<tr><td colspan="5" class="muted">Aucune décharge.</td></tr>';
    decTarget.innerHTML = `<table><thead><tr><th>Réf</th><th>Objet</th><th>Date</th><th>Statut</th><th>PDF</th></tr></thead><tbody>${decRows}</tbody></table>`;
  }

  window.renderFilteredTpeHistory = renderFilteredTpeHistory;

  openModal(
    `Historique TPE — ${item.serial}`,
    `
    <div class="advanced-filters-grid" style="margin-bottom:16px;">
      <div class="field">
        <label>Afficher à partir du</label>
        <input id="historyTpeDateFilter" type="date" oninput="renderFilteredTpeHistory()" onchange="renderFilteredTpeHistory()">
      </div>
    </div>
    <h4 style="margin-bottom:8px;font-size:.95rem;">Événements</h4>
    <div class="table-wrap" id="historyTpeEventsTable"></div>
    <h4 style="margin:14px 0 8px;font-size:.95rem;">Décharges associées</h4>
    <div class="table-wrap" id="historyTpeDecTable"></div>`,
    `<button class="btn btn-ghost" onclick="el('historyTpeDateFilter').value=''; renderFilteredTpeHistory()">Réinitialiser</button>
     <button class="btn btn-primary" onclick="closeModal()">Fermer</button>`,
  );

  renderFilteredTpeHistory();

  API.tpe
    .getHistorique(item.serial)
    .then((resp) => {
      dbHistory = Array.isArray(resp)
        ? resp
        : Array.isArray(resp?.historique)
          ? resp.historique
          : [];
    })
    .catch((err) => {
      console.error("getHistorique tpe failed:", err);
      dbHistory = [];
    })
    .finally(() => {
      loading = false;
      renderFilteredTpeHistory();
    });
}

// Ouvre le modal de restitution pour un TPE donné, avec options de mode de restitution, date et observation.
function openTpeRestitutionModal(id) {
  if (!requireRestitutionEdit()) return;
  const item = state.tpe.find((t) => t.id === id);
  if (!item) return;
  openModal(
    "Restitution TPE",
    `
    <div class="form-grid">
      <div class="field full"><label>TPE</label><input disabled value="${escapeHtml(item.serial)} — ${escapeHtml(item.idTerminal)}"></div>
      <div class="field"><label>Mode de l'opération</label>
        <select id="tpeRestitMode">
          <option value="Disponible">Retour stock</option>
          <option value="En panne">En panne</option>
          <option value="Volé">Volé</option>
        </select>
      </div>
      <div class="field"><label>Date de restitution</label><input id="tpeRestitDate" type="date" value="${nowIso().slice(0, 10)}"></div>
      <div class="field full"><label>Observation</label><textarea id="tpeRestitObs" placeholder="Observations..."></textarea></div>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
     <button class="btn btn-primary" onclick="confirmTpeRestitution('${escapeHtml(item.id)}')"><i class="fa-solid fa-circle-check"></i>Valider</button>`,
  );
}

// Confirme la restitution du TPE avec les informations saisies, met à jour le statut et la localisation, et log l'événement.
async function confirmTpeRestitution(id) {
  if (!requireRestitutionEdit()) return;
  const item = state.tpe.find((t) => t.id === id);
  if (!item) return;
  const mode = el("tpeRestitMode").value;
  const obs = el("tpeRestitObs").value.trim();

  try {
    // Si panne / volé → signalerPanne
    if (["En panne", "Volé"].includes(mode)) {
      await API.tpe.signalerPanne({
        numeroserietpe: item.serial,
        code_station: item.codeStation || null,
        anomalie_constatee: obs || mode,
        mode_operation_tpe: mode,
      });
    } else {
      // Retour au stock → update état normal
      await API.tpe.updateEtat(item.serial, {
        etat_tpe: "En_stock",
        commentaire: obs || "Restitution TPE",
      });
    }

    closeModal();
    await loadState();
    renderAll();
    showToast(`TPE restitué — statut : ${mode}`);
  } catch (error) {
    showToast(error.message || "Erreur lors de la restitution.", true);
  }
}

// =======================================================================================================
// RENDER ALL : rafraîchit toutes les sections de l'interface après une opération ou à l'initialisation.
// =======================================================================================================

function renderAll() {
  refreshStatuses();
  ensureTpeDataset();
  renderDashboard();
  renderCards();
  renderRenouvCards();
  renderCardsCirculation();
  renderCardsSuivi();
  renderCardsDecharges();
  renderCardsArchive();
  renderTpe();
  renderTpeService();
  renderTpeSuivi();
  renderTpeDecharges();
  renderStations();
  renderUsers();
  renderResetRequests();
  renderAudit();
  const cardAlerts = state.cards.filter((c) =>
    ["Expire bientôt", "Expirée", "Défectueuse", "Perdue", "Volée"].includes(c.status),
  ).length;
  const tpeAlerts = (state.tpe || []).filter((t) =>
    ["En panne", "Volé"].includes(t.status),
  ).length;
  el("notifCount").textContent = String(cardAlerts + tpeAlerts);
}

// =====================================================================
// KPI CARTES
// =====================================================================

async function renderCardsSummary() {
  const cards = await visibleCards();
  const total = state.cards.filter(
    (c) => !c.archived && hasScope(c) && isNouvelleCard(c),
  ).length;
  const stock = state.cards.filter(
    (c) =>
      !c.archived &&
      c.status === "Nouvelle carte" &&
      hasScope(c) &&
      isNouvelleCard(c),
  ).length;
  const circulation = state.cards.filter(
    (c) => !c.archived && c.status === "En circulation" && hasScope(c) && isNouvelleCard(c),
  ).length;
  const rate = total ? Math.round((circulation / total) * 100) : 0;
  if (el("cardsStockKpiTotal"))
    el("cardsStockKpiTotal").textContent = String(circulation);
  if (el("cardsStockKpiStock"))
    el("cardsStockKpiStock").textContent = String(stock);
  if (el("cardsStockKpiRate")) el("cardsStockKpiRate").textContent = `${rate}%`;
  const chunks = [
    ["Total visible", cards.length, "fa-solid fa-layer-group"],
    [
      "Nouvelle carte",
      cards.filter((c) => c.status === "Nouvelle carte").length,
      "fa-solid fa-box",
    ],
    [
      "En circulation",
      cards.filter((c) => c.status === "En circulation").length,
      "fa-solid fa-route",
    ],
    [
      "En traitement",
      cards.filter((c) => c.status === "En cours traitement").length,
      "fa-solid fa-screwdriver-wrench",
    ],
    [
      "Expirées/alerte",
      cards.filter((c) => ["Expire bientôt", "Expirée"].includes(c.status))
        .length,
      "fa-solid fa-clock",
    ],
  ];
  const chipsHtml = chunks
    .map(
      ([label, value, icon]) =>
        `<span class="chip"><i class="${icon}"></i>${escapeHtml(label)} : ${value}</span>`,
    )
    .join("");
  let actionsHtml = "";
  if (isWriteAllowed()) {
    actionsHtml = cardsSelectionMode
      ? `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end;"><button class="btn btn-ghost btn-sm" type="button" onclick="toggleCardsSelectionMode()"><i class="fa-solid fa-square-xmark"></i>Quitter sélection</button><button class="btn btn-primary btn-sm" type="button" onclick="bulkSetSelectedCardsToCirculation()"><i class="fa-solid fa-circle-check"></i>Mettre en circulation</button></div>`
      : `<div style="display:flex;align-items:center;justify-content:flex-end;"><button class="btn btn-ghost btn-sm" type="button" onclick="toggleCardsSelectionMode()"><i class="fa-solid fa-square-check"></i>Sélectionner</button></div>`;
  }
  el("cardsSummary").innerHTML =
    `<div style="width:100%;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">${chipsHtml}</div>${actionsHtml}</div>`;
}

// ==============================================
// SUIVI TPE - MODE SELECTION MULTIPLE
// ==============================================
let tpeSuiviSelectionMode = false;

function toggleTpeSuiviSelectionMode() {
  tpeSuiviSelectionMode = !tpeSuiviSelectionMode;
  const btn = el("tpeSuiviSelectBtn"),
    envBtn = el("tpeSuiviEnvoiBtn");
  const selectTh = el("tpeSuiviSelectTh");
  if (!tpeSuiviSelectionMode) {
    state.tpe.forEach((t) => {
      t.tpeSuiviSelected = false;
    });
    if (btn)
      btn.innerHTML = '<i class="fa-solid fa-square-check"></i>Sélectionner';
    if (envBtn) envBtn.style.display = "none";
    if (selectTh) selectTh.style.display = "none";
  } else {
    if (btn)
      btn.innerHTML =
        '<i class="fa-solid fa-square-xmark"></i>Quitter sélection';
    if (envBtn) envBtn.style.display = "";
    if (selectTh) selectTh.style.display = "";
  }
  renderTpeSuivi();
}

function toggleTpeSuiviSelection(id, checked) {
  const t = state.tpe.find((t) => String(t.id) === String(id));
  if (t) {
    t.tpeSuiviSelected = checked;
    renderTpeSuivi();
  }
}

function toggleSelectAllVisibleTpeSuivi(checked) {
  const rows = visibleTpeSuivi();
  rows.forEach((t) => {
    t.tpeSuiviSelected = checked;
  });
  renderTpeSuivi();
}

// Tout TPE non déjà dans le pipeline maintenance peut être envoyé en traitement.
// Le backend prend en charge la transition d'état (signalement panne implicite).
const TPE_ENVOI_INELIGIBLE_STATUSES = ["En traitement", "Réparé"];
const TPE_ENVOI_ELIGIBLE_STATUSES = [
  "Volé",
  "En panne",
  "En service",
  "En stock",
];

function openTpeEnvoiTraitementModal() {
  if (!requireWrite()) return;
  const selected = state.tpe.filter((t) => t.tpeSuiviSelected);
  if (!selected.length) {
    showToast("Aucun TPE sélectionné.", true);
    return;
  }
  const eligible = selected.filter(
    (t) => !TPE_ENVOI_INELIGIBLE_STATUSES.includes(t.status),
  );
  const ineligible = selected.filter((t) =>
    TPE_ENVOI_INELIGIBLE_STATUSES.includes(t.status),
  );
  if (!eligible.length) {
    showToast(
      `Aucun TPE éligible. États acceptés : ${TPE_ENVOI_ELIGIBLE_STATUSES.join(", ")}.`,
      true,
    );
    return;
  }
  const ineligibleBlock = ineligible.length
    ? `
    <div class="muted" style="margin-top:10px;color:#b35c00;">
      <i class="fa-solid fa-triangle-exclamation"></i>
      ${ineligible.length} TPE ignoré(s) (état non éligible) :
      ${ineligible.map((t) => `${escapeHtml(t.serial)} (${escapeHtml(t.status)})`).join(", ")}
    </div>`
    : "";
  openModal(
    "Envoi pour traitement — TPE",
    `
    <div class="form-grid">
      <div class="field"><label>TPE éligibles</label><input disabled value="${eligible.length} TPE"></div>
      <div class="field"><label>Date d'envoi</label><input id="tpeTraitementDate" type="date" value="${nowIso().slice(0, 10)}"></div>
      <div class="field full"><label>Motif / observation</label><textarea id="tpeTraitementMotif" placeholder="Motif de l'envoi en traitement..."></textarea></div>
    </div>
    <div class="table-wrap" style="margin-top:12px;max-height:160px;overflow:auto;">
      <table><thead><tr><th>N° Série</th><th>ID Terminal</th><th>État actuel</th></tr></thead>
      <tbody>${eligible.map((t) => `<tr><td>${escapeHtml(t.serial)}</td><td>${escapeHtml(t.idTerminal || "—")}</td><td>${escapeHtml(t.status)}</td></tr>`).join("")}</tbody>
    </table>${ineligibleBlock}`,
    `
    <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
    <button class="btn btn-primary" onclick="confirmTpeEnvoiTraitement()">Confirmer l'envoi</button>
  `,
  );
}

// Confirme l'envoi des TPE sélectionnés en traitement, en appelant le backend, générant la décharge type 2, et mettant à jour les statuts et historiques.
async function confirmTpeEnvoiTraitement() {
  const selectedAll = state.tpe.filter((t) => t.tpeSuiviSelected);
  const selected = selectedAll.filter(
    (t) => !TPE_ENVOI_INELIGIBLE_STATUSES.includes(t.status),
  );
  if (!selected.length) {
    showToast("Aucun TPE éligible à envoyer.", true);
    return;
  }
  const dateEnvoi = el("tpeTraitementDate").value || nowIso().slice(0, 10);
  const motif = el("tpeTraitementMotif").value.trim() || "Envoi en traitement";

  let reference = "";
  try {
    const resp = await API.tpe.transfertType2({
      numeros_serie_tpe: selected.map((t) => t.serial),
      nom_beneficiaire: currentUser?.name || "DPE",
      fonction_beneficiaire: "Responsable DPE",
      motif,
      anomalie_constatee: motif,
    });
    reference =
      resp?.decharge?.numero_decharge ||
      resp?.numero_decharge ||
      nextReference("type2");
  } catch (err) {
    const invalides = Array.isArray(err?.tpes_non_valides)
      ? err.tpes_non_valides
      : [];
    const introuv = Array.isArray(err?.tpes_introuvables)
      ? err.tpes_introuvables
      : [];
    const parts = [];
    if (introuv.length) parts.push(`introuvables : ${introuv.join(", ")}`);
    if (invalides.length)
      parts.push(`état incompatible : ${invalides.join(", ")}`);
    const detail = parts.length ? ` (${parts.join(" ; ")}).` : "";
    showToast(
      (err?.message || "Erreur lors de l'envoi en traitement.") + detail,
      true,
    );
    return;
  }

  // Générer décharge type 2 (PDF local)
  const pdfDataUri = await generateTpeDechargeType2(selected, {
    reference,
    date: dateEnvoi,
    reason: motif,
  });

  const invNum = `IN_TERM-${String(nextTpeInventoryNum() + 1).padStart(2, "0")}`;
  storeDecharge({
    kind: "type2",
    assetType: "TPE",
    object: `Envoi maintenance TPE (${selected.length} unités)`,
    from: "DPE",
    to: "BEA",
    date: dateEnvoi,
    status: "Générée",
    cards: selected.map((t) => t.id),
    pdfDataUri,
    reference,
    nom_beneficiaire: currentUser?.name || "DPE",
    fonction_beneficiaire: "Responsable DPE",
    beneficiary: currentUser?.name || "DPE",
    functionLabel: "Responsable DPE",
    numero_inventaire: invNum,
  });

  selected.forEach((t) => {
    t.status = "En traitement";
    t.dateSuiviEnvoi = dateEnvoi;
    t.dateEnvoiBea = dateEnvoi; // ← utilisé pour calculer la durée de traitement
    t.dateRetourBea = ""; // reset au cas où
    t.retourServiceDone = false;
    t.tpeSuiviSelected = false;
    t.validePar = "";
    t.dateValidation = "";
    t.suiviModifie = false; // Le suivi n'a pas encore été modifié
    logTpeEvent(t.id, "Envoi maintenance", `${motif} - Décharge ${reference}`);
  });

  tpeSuiviSelectionMode = false;
  el("tpeSuiviSelectBtn").innerHTML =
    '<i class="fa-solid fa-square-check"></i>Sélectionner';
  el("tpeSuiviEnvoiBtn").style.display = "none";
  el("tpeSuiviSelectTh").style.display = "none";

  saveState();
  closeModal();
  renderTpeSuivi();
  renderAll();
  showToast(
    `${selected.length} TPE envoyé(s) en maintenance. Décharge ${reference} générée.`,
  );
}

// ==============================================
// RETOUR EN SERVICE TPE
// ==============================================
function openTpeRetourServiceModal(id) {
  if (!requireWrite()) return;
  const tpe = state.tpe.find((t) => String(t.id) === String(id));
  if (!tpe) return;

  openModal(
    "Retour en service TPE — Décharge type 3",
    `
    <div class="form-grid">
      <div class="field full"><label>TPE</label><input disabled value="${escapeHtml(tpe.serial)} — ${escapeHtml(tpe.idTerminal || "—")}"></div>
      <div class="field"><label>Date de remise en service <span style="color:var(--danger)">*</span></label>
        <input id="tpeRetourDate" type="date" value="${nowIso().slice(0, 10)}"></div>
      <div class="field"><label>Nom bénéficiaire <span style="color:var(--danger)">*</span></label>
        <input id="tpeRetourNomDest" placeholder="Nom complet"></div>
      <div class="field"><label>Fonction <span style="color:var(--danger)">*</span></label>
        <input id="tpeRetourFonction" placeholder="Ex: Responsable station"></div>
      <div class="field"><label>N° inventaire / BTS <span style="color:var(--danger)">*</span></label>
        <input id="tpeRetourBts" value="${escapeHtml(tpe.numContrat || "")}"></div>
      <div class="field"><label>Structure destinataire</label>
        <input id="tpeRetourStructure" value="${escapeHtml(tpe.station || "DPE")}"></div>
      <div class="field full"><label>Motif / Rapport maintenance</label>
        <textarea id="tpeRetourMotif" placeholder="Ex: TPE réparé, remis en service..."></textarea></div>
    </div>`,
    `
    <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
    <button class="btn btn-primary" onclick="confirmTpeRetourService('${escapeHtml(id)}')"><i class="fa-solid fa-circle-check"></i>Confirmer & générer décharge type 3</button>
  `,
  );
}

// pr confirmer
async function confirmTpeRetourService(id) {
  const tpe = state.tpe.find((t) => String(t.id) === String(id));
  if (!tpe) return;

  const dateRetour = el("tpeRetourDate").value || nowIso().slice(0, 10);
  const nomDestTpe = el("tpeRetourNomDest")?.value.trim();
  const fonctionTpe = el("tpeRetourFonction")?.value.trim();
  const btsTpe = el("tpeRetourBts")?.value.trim();
  const structureTpe =
    el("tpeRetourStructure")?.value.trim() || tpe.station || "DPE";
  const motif =
    el("tpeRetourMotif").value.trim() || "Retour maintenance terminée";
  if (!nomDestTpe) {
    showToast("Le nom du bénéficiaire est obligatoire.", true);
    return;
  }
  if (!fonctionTpe) {
    showToast("La fonction est obligatoire.", true);
    return;
  }
  if (!btsTpe) {
    showToast("Le N° inventaire/BTS est obligatoire.", true);
    return;
  }

  let reference = "";
  try {
    const resp = await API.tpe.transfertType3({
      numeros_serie_tpe: [tpe.serial],
      destination: structureTpe,
      nom_beneficiaire: nomDestTpe,
      fonction_beneficiaire: fonctionTpe,
      structure_concernee: tpe.codeStructure || tpe.station,
      district_concerne: tpe.district,
    });
    reference =
      resp?.decharge?.numero_decharge ||
      resp?.numero_decharge ||
      nextReference("type3");
  } catch (err) {
    showToast(err?.message || "Erreur lors du retour en service.", true);
    return;
  }

  // Générer décharge type 3 (PDF local)
  const pdfDataUri = await generateTpeDechargeType3([tpe], {
    reference,
    date: dateRetour,
    reason: motif,
    destination: structureTpe,
    functionLabel: fonctionTpe,
  });

  const invNum = `IN_TERM-${String(nextTpeInventoryNum() + 1).padStart(2, "0")}`;
  storeDecharge({
    kind: "type3",
    assetType: "TPE",
    object: `Retour maintenance TPE ${tpe.serial}`,
    from: "BEA",
    to: "DPE",
    date: dateRetour,
    status: "Générée",
    cards: [tpe.id],
    pdfDataUri,
    reference,
    nom_beneficiaire: nomDestTpe,
    fonction_beneficiaire: fonctionTpe,
    beneficiary: nomDestTpe,
    functionLabel: fonctionTpe,
    numero_inventaire: invNum,
  });

  tpe.status = "En service";
  tpe.dateSuiviRetour = dateRetour;
  tpe.location = tpe.nomCommercial;
  tpe.transferState = "Retour de maintenance - remis en service";
  logTpeEvent(id, "Retour maintenance", `${motif} - Décharge ${reference}`);

  saveState();
  closeModal();
  await loadState(); // recharge depuis la DB
  renderTpeSuivi();
  renderAll();
  showToast(
    `TPE ${tpe.serial} de retour en stock. Décharge ${reference} générée.`,
  );
}
