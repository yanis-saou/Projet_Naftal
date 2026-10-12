// =====================================================================
// OUTILS TPE
// =====================================================================

function tpeStatusesForSuivi() {
  return ["Réservé", "En panne", "Volé", "En traitement"];
}

function pickTpeValue(row, keys, fallback = "") {
  for (const key of keys) {
    if (
      row[key] !== undefined &&
      row[key] !== null &&
      String(row[key]).trim() !== ""
    )
      return String(row[key]).trim();
  }
  return fallback;
}

function computeTpeAmortissement(item) {
  const baseDate =
    item.dateReception || item.maintenanceDate || nowIso().slice(0, 10);
  const start = new Date(baseDate);
  if (Number.isNaN(start.getTime())) return "—";
  const end = new Date(start);
  end.setMonth(end.getMonth() + 36);
  const now = new Date();
  const months = Math.max(
    0,
    Math.round((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30.4)),
  );
  return `${months} mois`;
}

function normalizeTpeRecord(item, index = 0) {
  if (!item) return item;
  if (!item.id) item.id = item.id || uid("tpe");
  const serial =
    item.serial ||
    item.numeroSerieTpe ||
    item["N_serie TPE"] ||
    item["N_serie_TPE"] ||
    `TPE-${String(index + 1).padStart(3, "0")}`;
  item.serial = serial;
  item.numeroSerieTpe = item.numeroSerieTpe || serial;
  item.idTerminal =
    item.idTerminal ||
    item.ID_Terminal ||
    item.terminalId ||
    item.model ||
    `TERM-${String(index + 1).padStart(3, "0")}`;
  item.numCompte =
    item.numCompte ||
    item.N_Compte ||
    item.compte ||
    `CPT-${String(index + 1).padStart(6, "0")}`;
  item.numContrat =
    item.numContrat ||
    item.N_Contrat ||
    item.contrat ||
    `CTR-${String(index + 1).padStart(3, "0")}`;
  item.nomCommercial =
    item.nomCommercial ||
    item.Nom_Commercial ||
    item.owner ||
    item.station ||
    "Structure TPE";
  item.adresse =
    item.adresse || item.Adresse || item.location || "Adresse non renseignée";
  item.tarification = item.tarification || item.Tarification || "Standard";
  item.nbrChargeur = item.nbrChargeur || "1";
  item.dispoChargeur = item.dispoChargeur || item.nbrChargeur;
  item.status = item.status || "En stock";
  item.station = item.station || item.nomCommercial || "AGENCE COM SKIKDA";
  item.district = item.district || item.station || "DISTRICT COM ANNABA";
  item.codeStation = item.codeStation || item.station;
  item.raisonsocialestructure =
    item.raisonsocialestructure || item.nomCommercial || item.station;
  item.wilaya = item.wilaya || "Wilaya inconnue";
  item.numeroSerieSim =
    item.numeroSerieSim || "SIM-" + String(index + 1).padStart(3, "0");
  item.adresseIPSim = item.adresseIPSim || "192.168.1." + String(index + 1);
  item.nTelSim = item.nTelSim || "0555" + String(100000 + index).slice(-6);
  item.dateRemise =
    item.dateRemise || item.dateReception || nowIso().slice(0, 10);
  item.location =
    item.location ||
    (item.status === "En service" ? item.nomCommercial : "Stock DPE");
  item.maintenanceDate =
    item.maintenanceDate || item.dateReception || nowIso().slice(0, 10);
  item.dateReception =
    item.dateReception ||
    item.createdAt ||
    item.maintenanceDate ||
    nowIso().slice(0, 10);
  item.dateSortie = item.dateSortie || "";
  item.transferState =
    item.transferState ||
    (item.status === "En service"
      ? "TPE affecté à la structure"
      : "TPE disponible au stock");
  item.amortissement = item.amortissement || computeTpeAmortissement(item);
  item.events = item.events || [];
  item.selected = !!item.selected;
  return item;
}

function ensureTpeDataset() {
  state.tpe = (state.tpe || []).map((item, index) => {
    if (!item.id) item.id = uid("tpe");
    return normalizeTpeRecord(item, index);
  });
}

// Construit le HTML d'un <select> de structures (Districts / Agences / Antennes)
// + une catégorie "Autres" alimentée par les TPE filtrés par `tpePred`.
function buildTpeStructureOptions(currentVal, tpePred) {
  const structures = Array.isArray(state.structures) ? state.structures : [];
  const byType = (t) =>
    structures
      .filter((s) => String(s.type_structure || "").toUpperCase() === t)
      .map((s) => s.nom_structure)
      .filter(Boolean);

  const districts = [
    ...new Set([
      ...(state.stations || []).map((s) => s.district).filter(Boolean),
      ...byType("DISTRICT"),
    ]),
  ].sort();
  const agences = [...new Set(byType("AGENCE"))].sort();
  const antennes = [...new Set(byType("ANTENNE"))].sort();
  const known = new Set([...districts, ...agences, ...antennes]);
  const autres = [
    ...new Set(
      (state.tpe || [])
        .filter(typeof tpePred === "function" ? tpePred : () => true)
        .map((t) => t.raisonsocialestructure)
        .filter((v) => v && !known.has(v)),
    ),
  ].sort();

  const opts = (vals) =>
    vals
      .map(
        (v) =>
          `<option value="${escapeHtml(v)}"${v === currentVal ? " selected" : ""}>${escapeHtml(v)}</option>`,
      )
      .join("");
  const group = (label, vals) =>
    vals.length
      ? `<optgroup label="${escapeHtml(label)}">${opts(vals)}</optgroup>`
      : "";

  return (
    '<option value="">Toutes structures</option>' +
    group("Districts", districts) +
    group("Agences", agences) +
    group("Antennes", antennes) +
    group("Autres", autres)
  );
}

// Vérifie qu'un TPE correspond à la structure sélectionnée (nom_structure).
// Résout aussi le code de structure pour matcher codeStation/codeStructure.
function tpeMatchesStructure(item, structureName) {
  if (!structureName) return true;
  const structures = Array.isArray(state.structures) ? state.structures : [];
  const sel = structures.find((s) => s.nom_structure === structureName);
  const code = sel?.code || "";
  return (
    item.district === structureName ||
    (item.raisonsocialestructure || "") === structureName ||
    item.station === structureName ||
    item.nomCommercial === structureName ||
    (!!code &&
      (item.codeStation === code ||
        item.station === code ||
        (item.codeStructure || "") === code))
  );
}

function populateTpeFilterOptions() {
  ensureTpeDataset();

  // --- Filtre Station (section Stock) ---
  // Valeurs uniques de code ou code_station (code de la station)
  const stockStationSel = el("tpeStockStation");
  if (stockStationSel) {
    const currentVal = stockStationSel.value;
    const stationNames = [
      ...new Set(
        (state.stations || [])
          .map((s) => s.code || s.code_station)
          .filter(Boolean),
      ),
    ].sort();
    stockStationSel.innerHTML =
      '<option value="">Toutes stations</option>' +
      stationNames
        .map(
          (v) =>
            `<option value="${escapeHtml(v)}"${v === currentVal ? " selected" : ""}>${escapeHtml(v)}</option>`,
        )
        .join("");
  }

  // --- Filtre Structure (section Stock) ---
  // Districts / Agences / Antennes (state.structures) + "Autres" depuis TPE en stock.
  const stockStructureSel = el("tpeStockStructure");
  if (stockStructureSel) {
    stockStructureSel.innerHTML = buildTpeStructureOptions(
      stockStructureSel.value,
      (item) => item.status === "En stock",
    );
  }

  // --- Filtre Structure (section Service — barre de contrôle) ---
  // Garde la liste plate (station + raison sociale) historique pour ne pas casser
  // les rapprochements existants ; le filtre groupé est sur le panneau avancé.
  const serviceStationSel = el("tpeServiceStation");
  if (serviceStationSel) {
    const currentVal = serviceStationSel.value;
    const serviceStationValues = [
      ...new Set(
        state.tpe.flatMap((item) =>
          [item.station, item.raisonsocialestructure].filter(Boolean),
        ),
      ),
    ].sort();
    serviceStationSel.innerHTML =
      '<option value="">Toutes structures</option>' +
      serviceStationValues
        .map(
          (v) =>
            `<option value="${escapeHtml(v)}"${v === currentVal ? " selected" : ""}>${escapeHtml(v)}</option>`,
        )
        .join("");
  }

  // --- Filtre Structure (section Suivi) ---
  // Mêmes groupes (Districts / Agences / Antennes) que les sections Stock & Service,
  // restreint aux TPE qui apparaissent dans la table de suivi.
  const suiviStationSel = el("tpeSuiviStation");
  if (suiviStationSel) {
    const suiviStatuses = new Set(tpeStatusesForSuivi());
    suiviStationSel.innerHTML = buildTpeStructureOptions(
      suiviStationSel.value,
      (item) => suiviStatuses.has(item.status) || !!item.dateEnvoiBea,
    );
  }

  // --- Filtre Station (section Service — panneau avancé) ---
  // Valeurs uniques de codeStation provenant de state.stations
  const serviceNomStationSel = el("tpeServiceNomStation");
  if (serviceNomStationSel) {
    const currentVal = serviceNomStationSel.value;
    const stationCodes = [
      ...new Set(
        (state.stations || [])
          .map((s) => s.codeStation || s.code || s.code_station)
          .filter(Boolean),
      ),
    ].sort();
    serviceNomStationSel.innerHTML =
      '<option value="">Toutes stations</option>' +
      stationCodes
        .map(
          (v) =>
            `<option value="${escapeHtml(v)}"${v === currentVal ? " selected" : ""}>${escapeHtml(v)}</option>`,
        )
        .join("");
  }

  // --- Filtre Structure (section Service — panneau avancé) ---
  const serviceStructureSel = el("tpeServiceStructure");
  if (serviceStructureSel) {
    serviceStructureSel.innerHTML = buildTpeStructureOptions(
      serviceStructureSel.value,
      (item) => item.status !== "En stock",
    );
  }

  // --- Filtre Tarification (sections Stock et Service) ---
  // Toujours proposer Standard et Premium + valeurs dynamiques du stock
  const tariffValues = [
    ...new Set([
      "Standard",
      "Premium",
      ...state.tpe.map((item) => item.tarification).filter(Boolean),
    ]),
  ].sort();
  ["tpeTarification", "tpeServiceTarification"].forEach((id) => {
    const select = el(id);
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML =
      '<option value="">Toutes</option>' +
      tariffValues
        .map(
          (v) =>
            `<option value="${escapeHtml(v)}"${v === currentVal ? " selected" : ""}>${escapeHtml(v)}</option>`,
        )
        .join("");
  });
}

function visibleTpe() {
  const search = (el("tpeSearch")?.value || "").trim().toLowerCase();
  const stationF = el("tpeStockStation")?.value || ""; // filtre Station
  const structureF = el("tpeStockStructure")?.value || ""; // filtre Structure
  const tarification = el("tpeTarification")?.value || ""; // filtre Tarification
  return (state?.tpe || [])
    .filter((item) => item.status === "En stock")
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
        item.numCompte,
        item.numContrat,
        item.nomCommercial,
        item.adresse,
        item.tarification,
        item.station,
        item.district || "",
        item.raisonsocialestructure || "",
      ]
        .join(" ")
        .toLowerCase();
      // Filtre Station : correspond au nom commercial ou au code station
      const matchStation =
        !stationF ||
        item.nomCommercial === stationF ||
        item.station === stationF;
      // Filtre Structure : district / agence / antenne (nom_structure ou code).
      const matchStructure = tpeMatchesStructure(item, structureF);
      return (
        (!search || hay.includes(search)) &&
        matchStation &&
        matchStructure &&
        (!tarification || item.tarification === tarification)
      );
    });
}

function getTpeServiceRows() {
  const search = (el("tpeServiceSearch")?.value || "").trim().toLowerCase();
  const station = el("tpeServiceStation")?.value || ""; // barre de contrôle
  const nomStation = el("tpeServiceNomStation")?.value || ""; // panneau avancé — Station
  const structure = el("tpeServiceStructure")?.value || ""; // panneau avancé — Structure
  const tarification = el("tpeServiceTarification")?.value || "";
  const status = el("tpeServiceStatus")?.value || "";
  return (state?.tpe || [])
    .filter((item) => item.status !== "En stock")
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
        item.numCompte,
        item.numContrat,
        item.nomCommercial,
        item.adresse,
        item.tarification,
        item.station,
        item.status,
        item.district || "",
        item.raisonsocialestructure || "",
      ]
        .join(" ")
        .toLowerCase();
      // Filtre barre de contrôle : code station ou raison sociale
      const matchStation =
        !station ||
        item.station === station ||
        (item.raisonsocialestructure || "") === station;
      // Filtre panneau avancé — Station : nom commercial de la station physique
      const matchNomStation =
        !nomStation ||
        item.nomCommercial === nomStation ||
        item.station === nomStation;
      // Filtre — Structure : district / agence / antenne (nom_structure ou code).
      const matchStructure = tpeMatchesStructure(item, structure);
      return (
        (!search || hay.includes(search)) &&
        matchStation &&
        matchNomStation &&
        matchStructure &&
        (!tarification || item.tarification === tarification) &&
        (!status || item.status === status)
      );
    });
}

function resetTpeFilters() {
  [
    "tpeSearch",
    "tpeStatus",
    "tpeStockStation",
    "tpeStockStructure",
    "tpeTarification",
  ].forEach((id) => {
    if (el(id)) el(id).value = "";
  });
  renderTpe();
}

function resetTpeServiceFilters() {
  [
    "tpeServiceSearch",
    "tpeServiceStation",
    "tpeServiceNomStation",
    "tpeServiceStructure",
    "tpeServiceTarification",
    "tpeServiceStatus",
  ].forEach((id) => {
    if (el(id)) el(id).value = "";
  });
  renderTpeService();
}

function resetTpeSuiviFilters() {
  ["tpeSuiviSearch", "tpeSuiviStatus", "tpeSuiviStation"].forEach((id) => {
    if (el(id)) el(id).value = "";
  });
  renderTpeSuivi();
}

function toggleTpeAdvancedFilters() {
  const box = el("tpeAdvancedFilters");
  if (box) box.style.display = box.style.display === "none" ? "block" : "none";
}

function toggleTpeServiceAdvancedFilters() {
  const box = el("tpeServiceAdvancedFilters");
  if (box) box.style.display = box.style.display === "none" ? "block" : "none";
}

function toggleTpeSuiviAdvancedFilters() {
  const box = el("tpeSuiviAdvancedFilters");
  if (box) box.style.display = box.style.display === "none" ? "block" : "none";
}

// =====================================================================
// IMPORT / EXPORT
// =====================================================================

function importTpeFromCsv(text) {
  if (!requireWrite()) return;
  const rows = csvParse(text);
  if (!rows.length) {
    showToast("CSV TPE vide.", true);
    return;
  }
  ensureTpeDataset();
  let added = 0;
  rows.forEach((row, index) => {
    const serial = pickTpeValue(row, [
      "serial",
      "N° Série",
      "N° Série TPE",
      "N_serie TPE",
      "N_serie_TPE",
      "numero",
      "numero_serie",
    ]);
    if (!serial || state.tpe.some((item) => item.serial === serial)) return;
    const createdAt = pickTpeValue(
      row,
      ["dateReception", "Date Réception", "Date_Reception", "createdAt"],
      nowIso().slice(0, 10),
    );
    const item = normalizeTpeRecord(
      {
        id: uid("tpe"),
        serial,
        numeroSerieTpe: serial,
        idTerminal: pickTpeValue(
          row,
          ["idTerminal", "ID Terminal", "ID_Terminal"],
          `TERM-${String(index + 1).padStart(3, "0")}`,
        ),
        numCompte: pickTpeValue(
          row,
          ["numCompte", "N° Compte", "N_Compte"],
          `CPT-${Math.floor(Math.random() * 900000 + 100000)}`,
        ),
        numContrat: pickTpeValue(
          row,
          ["numContrat", "N° Contrat", "N_Contrat"],
          `CTR-${String(index + 1).padStart(3, "0")}`,
        ),
        nomCommercial: pickTpeValue(
          row,
          ["nomCommercial", "Nom commercial", "Nom_Commercial", "Station"],
          "Station importée",
        ),
        adresse: pickTpeValue(
          row,
          ["adresse", "Adresse"],
          "Adresse non renseignée",
        ),
        tarification: pickTpeValue(
          row,
          ["tarification", "Tarification"],
          "Standard",
        ),
        status: pickTpeValue(row, ["status", "État", "Etat"], "En stock"),
        station: pickTpeValue(
          row,
          [
            "station",
            "Station",
            "nomCommercial",
            "Nom commercial",
            "Nom_Commercial",
          ],
          "AGENCE COM SKIKDA",
        ),
        district: pickTpeValue(
          row,
          ["district", "District"],
          pickTpeValue(row, ["station", "Station"], "DISTRICT COM ANNABA"),
        ),
        maintenanceDate: pickTpeValue(
          row,
          ["maintenanceDate", "Dernière maintenance", "Maintenance"],
          createdAt,
        ),
        dateReception: createdAt,
        dateSortie: pickTpeValue(
          row,
          ["dateSortie", "Date sortie", "Date_Sortie"],
          "",
        ),
        location: pickTpeValue(row, ["location", "Localisation"], "Stock DPE"),
        createdAt,
      },
      state.tpe.length + index,
    );
    state.tpe.unshift(item);
    logTpeEvent(item.id, "Import TPE", "TPE importé dans le stock");
    added += 1;
  });
  saveState();
  populateScopeFilters();
  renderAll();
  showToast(`${added} TPE importé(s).`);
}

function exportTpeCSV() {
  ensureTpeDataset();
  const rows = visibleTpe().map((item) => ({
    "N_serie TPE": item.serial,
    ID_Terminal: item.idTerminal,
    N_Compte: item.numCompte,
    N_Contrat: item.numContrat,
    Nom_Commercial: item.nomCommercial,
    Adresse: item.adresse,
    Tarification: item.tarification,
    Etat: item.status,
    Station: item.station,
    Date_Reception: item.dateReception,
    Date_Sortie: item.dateSortie,
  }));
  const columns = [
    "N_serie TPE",
    "ID_Terminal",
    "N_Compte",
    "N_Contrat",
    "Nom_Commercial",
    "Adresse",
    "Tarification",
    "Etat",
    "Station",
    "Date_Reception",
    "Date_Sortie",
  ];
  const csv = csvStringify(rows, columns);
  downloadBlob(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
    "stock-tpe.csv",
  );
  showToast("Export CSV TPE terminé.");
}

// =====================================================================
// MODALES / ACTIONS TPE
// =====================================================================

function openNewTpeModal() {
  if (!requireWrite()) return;
  openModal(
    "Ajouter TPE",
    `
    <div class="form-grid">
      <div class="field"><label>N° Série TPE</label><input id="newTpeSerial"></div>
      <div class="field"><label>ID Terminal</label><input id="newTpeTerminal"></div>
      <div class="field"><label>N° Compte</label><input id="newTpeCompte"></div>
      <div class="field"><label>N° Contrat</label><input id="newTpeContrat"></div>
      <div class="field"><label>Nom commercial</label><input id="newTpeNomCommercial" value="AGENCE COM SKIKDA"></div>
      <div class="field"><label>Adresse</label><input id="newTpeAdresse" value="Adresse non renseignée"></div>
      <div class="field"><label>Tarification</label><select id="newTpeTarification"><option>Standard</option><option>Premium</option></select></div>
      <div class="field"><label>Etat</label><select id="newTpeStatus">${TPE_STATES.map((s) => `<option>${escapeHtml(s)}</option>`).join("")}</select></div>
      <div class="field"><label>Structure</label><input id="newTpeStation" value="AGENCE COM SKIKDA"></div>
      <div class="field"><label>Date réception</label><input id="newTpeReception" type="date" value="${nowIso().slice(0, 10)}"></div>
      <div class="field"><label>Localisation</label><input id="newTpeLocation" value="Stock DPE"></div>
    </div>`,
    `
    <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
    <button class="btn btn-primary" onclick="confirmNewTpe()">Ajouter</button>
  `,
  );
}

async function confirmNewTpe() {
  if (!requireWrite()) return;
  const serial = el("newTpeSerial").value.trim();
  if (!serial) {
    showToast("Le numéro de série est obligatoire.", true);
    return;
  }
  const tpeData = normalizeTpeRecord({
    serial,
    numeroSerieTpe: serial,
    idTerminal:
      el("newTpeTerminal").value.trim() ||
      `TERM-${Math.floor(Math.random() * 900 + 100)}`,
    numCompte:
      el("newTpeCompte").value.trim() ||
      `CPT-${Math.floor(Math.random() * 900000 + 100000)}`,
    numContrat:
      el("newTpeContrat").value.trim() ||
      `CTR-${Math.floor(Math.random() * 900 + 100)}`,
    nomCommercial: el("newTpeNomCommercial").value.trim() || "Structure TPE",
    adresse: el("newTpeAdresse").value.trim() || "Adresse non renseignée",
    tarification: el("newTpeTarification").value || "Standard",
    status: el("newTpeStatus").value,
    station: el("newTpeStation").value.trim() || "AGENCE COM SKIKDA",
    district: el("newTpeStation").value.trim() || "DISTRICT COM ANNABA",
    maintenanceDate: el("newTpeReception").value || nowIso().slice(0, 10),
    dateReception: el("newTpeReception").value || nowIso().slice(0, 10),
    location: el("newTpeLocation").value.trim() || "Stock DPE",
  });

  try {
    // Appeler API pour créer le TPE
    const createdTpe = await API.tpe.create(tpeData);

    // Mettre à jour l'état local avec la réponse API
    state.tpe.unshift(normalizeTpeRecord(createdTpe));
    logTpeEvent(createdTpe.id, "Ajout TPE", "Création manuelle");

    closeModal();
    await loadState();
    renderAll();
    showToast("TPE ajouté.");
  } catch (error) {
    showToast(error.message || "Erreur lors de la création du TPE", true);
  }
}

async function changeTpeStatus(tpeId) {
  if (!requireWrite()) return;

  const tpe = state.tpe.find((t) => t.id === tpeId);
  if (!tpe) return;

  openModal(
    "Modifier statut TPE",
    `
    <div class="form-grid">
      <div class="field"><label>N° Série</label><input disabled value="${escapeHtml(tpe.serial)}"></div>
      <div class="field"><label>Statut actuel</label><input disabled value="${escapeHtml(tpe.status)}"></div>
      <div class="field"><label>Nouveau statut</label>
        <select id="tpeNewStatus">
          ${TPE_STATES.map((s) => `<option value="${escapeHtml(s)}" ${tpe.status === s ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}
        </select>
      </div>
      <div class="field full"><label>Commentaire</label><textarea id="tpeStatusComment" placeholder="Raison du changement..."></textarea></div>
    </div>`,
    `
    <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
    <button class="btn btn-primary" onclick="confirmChangeTpeStatus('${escapeHtml(tpeId)}')">Enregistrer</button>
  `,
  );
}

async function confirmChangeTpeStatus(tpeId) {
  if (!requireWrite()) return;

  const newStatus = el("tpeNewStatus").value;
  const comment = el("tpeStatusComment").value.trim();
  const backendStatus = uiTpeStatusToBackend(newStatus);

  try {
    // Si panne / volé / traitement → appeler signalerPanne qui insère dans suivi_maintenance_tpe
    if (
      backendStatus === "Volé" ||
      backendStatus === "En_panne" ||
      backendStatus === "En_traitement"
    ) {
      const tpe = state.tpe.find((t) => t.id === tpeId);
      await API.tpe.signalerPanne({
        numeroserietpe: tpeId,
        code_station: tpe?.codeStation || tpe?.station || null,
        anomalie_constatee: comment || "Anomalie signalée",
        mode_operation_tpe: newStatus,
      });
    } else {
      // Pour les autres états → update normal
      await API.tpe.updateEtat(tpeId, {
        etat_tpe: backendStatus,
        commentaire: comment,
      });
    }

    closeModal();
    await loadState();
    renderAll();
    showToast("Statut TPE mis à jour.");
  } catch (error) {
    showToast(
      error.message || "Erreur lors de la modification du statut",
      true,
    );
  }
}

function viewTpe(id) {
  ensureTpeDataset();
  const item = state.tpe.find((t) => t.id === id);
  if (!item) return;
  openModal(
    "Détail TPE",
    `
    <div class="form-grid">
      <div class="field"><label>N° Série TPE</label><input disabled value="${escapeHtml(item.serial)}"></div>
      <div class="field"><label>ID Terminal</label><input disabled value="${escapeHtml(item.idTerminal)}"></div>
      <div class="field"><label>N° Compte</label><input disabled value="${escapeHtml(item.numCompte)}"></div>
      <div class="field"><label>N° Contrat</label><input disabled value="${escapeHtml(item.numContrat)}"></div>
      <div class="field"><label>Nom commercial</label><input disabled value="${escapeHtml(item.nomCommercial)}"></div>
      <div class="field"><label>Adresse</label><input disabled value="${escapeHtml(item.adresse)}"></div>
      <div class="field"><label>Tarification</label><input disabled value="${escapeHtml(item.tarification)}"></div>
      <div class="field"><label>Etat</label><input disabled value="${escapeHtml(item.status)}"></div>
      <div class="field"><label>Structure</label><input disabled value="${escapeHtml(item.station)}"></div>
      <div class="field"><label>Date réception</label><input disabled value="${formatDate(item.dateReception)}"></div>
      <div class="field"><label>Date sortie</label><input disabled value="${item.dateSortie ? formatDate(item.dateSortie) : "—"}"></div>
      <div class="field full"><label>Dernier état de transfert</label><input disabled value="${escapeHtml(item.transferState || "—")}"></div>
    </div>`,
    `<button class="btn btn-primary" onclick="closeModal()">Fermer</button>`,
  );
}

function openNewDechargeModal(assetType) {
  if (!requireWrite()) return;
  openModal(
    `Nouvelle décharge ${assetType}`,
    `
    <div class="form-grid">
      <div class="field"><label>Référence</label><input id="manualDechargeRef" placeholder="Référence"></div>
      <div class="field"><label>Objet</label><input id="manualDechargeObject" value="Transfert ${assetType}"></div>
      <div class="field"><label>De</label><input id="manualDechargeFrom" value="DPE"></div>
      <div class="field"><label>Vers</label><input id="manualDechargeTo" placeholder="Destination"></div>
      <div class="field"><label>Date</label><input id="manualDechargeDate" type="date" value="${nowIso().slice(0, 10)}"></div>
      <div class="field"><label>Statut</label><input id="manualDechargeStatus" value="Générée"></div>
    </div>
    <p class="muted" style="margin-top:12px;">Cette action crée une décharge simple lorsque la génération automatique n'est pas déclenchée par un workflow carte/TPE.</p>`,
    `
    <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
    <button class="btn btn-primary" onclick="confirmManualDecharge('${assetType}')">Créer</button>
  `,
  );
}

async function confirmManualDecharge(assetType) {
  if (!requireWrite()) return;
  const ref =
    el("manualDechargeRef").value.trim() ||
    (assetType === "Carte" ? nextReference("type1") : nextReference("tpe"));
  const data = {
    assetType,
    kind: assetType === "Carte" ? "type1" : "tpe",
    reference: ref,
    object: el("manualDechargeObject").value.trim() || `Transfert ${assetType}`,
    from: el("manualDechargeFrom").value.trim() || "DPE",
    to: el("manualDechargeTo").value.trim() || "Destination",
    date: el("manualDechargeDate").value || nowIso().slice(0, 10),
    status: el("manualDechargeStatus").value.trim() || "Générée",
  };
  const pdfDataUri = await generateSimpleDechargePdf(
    assetType === "Carte"
      ? data
      : { ...data, object: `Décharge TPE - ${data.object}` },
  );
  storeDecharge({ ...data, pdfDataUri, cards: [] });
  saveState();
  closeModal();
  renderAll();
  showToast("Décharge ajoutée.");
}

// =====================================================================
// COMMANDES TPE
// =====================================================================

function normalizeCommandeRecord(item, index = 0) {
  if (!item) return item;
  // Préserver l'id BD (numérique) ET stringifier pour les onclick="...('${id}')".
  const backendId =
    typeof item.id === "number" ? item.id : (item.backendId ?? null);
  item.backendId = backendId;
  item.id = item.id != null ? String(item.id) : uid("cmd");
  item.reference =
    item.reference ||
    item.ref ||
    item.numero_commande ||
    item["N° Commande"] ||
    `CMD-${String(index + 1).padStart(4, "0")}`;
  item.codeStation =
    item.codeStation ||
    item.code_station ||
    item["Code station"] ||
    item.Code_Station ||
    item.CODE_STATION ||
    item.code_Station ||
    item.CodeStation ||
    item["Code_station"] ||
    "";
  item.code_station = item.code_station || item.codeStation;
  item.raisonSocial =
    item.raisonSocial || item.raison_social || item["Raison sociale"] || "";
  item.numCompte =
    item.numCompte ||
    item.n_compte_bancaire ||
    item["N° Compte bancaire"] ||
    "";
  item.adresse = item.adresse || item.Adresse || "Alger";
  // Backend renvoie ligne_commande_cib[]; on prend le premier modèle / la quantité totale.
  const lignes = Array.isArray(item.ligne_commande_cib)
    ? item.ligne_commande_cib
    : [];
  const lignesQty = lignes.reduce(
    (s, l) => s + (parseInt(l?.quantite, 10) || 0),
    0,
  );
  item.modele = item.modele || item.Modele || lignes[0]?.modele_tpe || "";
  item.quantite =
    parseInt(item.quantite, 10) ||
    parseInt(item.Quantite, 10) ||
    parseInt(item.quantite_totale, 10) ||
    lignesQty ||
    1;
  item.dateCommande =
    item.dateCommande ||
    item.date_commande ||
    item["Date commande"] ||
    nowIso().slice(0, 10);
  item.idStructureEmettrice =
    item.idStructureEmettrice ||
    item.id_structure_emmettrice ||
    item.id_structure_emmetrice ||
    item["Str. émettrice"] ||
    "";
  item.codeStructure =
    item.codeStructure || item.structure?.code || item.code_structure || "";
  item.idValidateurDpe =
    item.idValidateurDpe ||
    item.id_validateur_dpe ||
    item["Validateur DPE"] ||
    "";
  item.dateValidation =
    item.dateValidation ||
    item.date_validation ||
    item["Date validation"] ||
    "";
  if (!item.datePrevue && item.dateCommande) {
    const d = new Date(item.dateCommande);
    d.setDate(d.getDate() + 7);
    item.datePrevue = d.toISOString().slice(0, 10);
  } else {
    item.datePrevue = item.datePrevue || item["Date réception prévue"] || "";
  }
  item.dateReelle = item.dateReelle || item["Date réception réelle"] || "";
  // Backend statut : 'EN_COURS' | 'En cours' | 'Reçue' | 'Annulée'. UI : 'En attente' = actionable.
  let rawStatus = item.status || item.Statut || item.statut || "En attente";
  if (["EN_COURS", "En cours", "EN_ATTENTE"].includes(rawStatus))
    rawStatus = "En attente";

  item.status = rawStatus;
  item.events = item.events || [];
  return item;
}

function ensureCommandesDataset() {
  state.commandes = (state.commandes || []).map((item, index) =>
    normalizeCommandeRecord(item, index),
  );
}

// Charger les commandes depuis le serveur
async function loadCommandesFromServer() {
  try {
    const result = await API.tpe.getCommandes();
    if (result && result.commandes) {
      state.commandes = (result.commandes || []).map((item, index) =>
        normalizeCommandeRecord(
          {
            reference: item.numero_commande,
            id: item.id,
            adresse: item.raison_sociale || item.code_station || "",
            modele: item.status || "En attente",
            quantite_totale: item.quantite_totale || 0,
            quantite_recue: item.quantite_recue || 0,
            quantite_restante: item.quantite_restante || 0,
            dateCommande: item.date_commande,
            dateValidation: item.date_validation,
            status: item.statut || "En attente",
            ...item,
          },
          index,
        ),
      );
      saveState();
      renderCommandes();
      return true;
    }
    return false;
  } catch (error) {
    console.error("Erreur lors du chargement des commandes:", error);
    return false;
  }
}

function visibleCommandes() {
  ensureCommandesDataset();
  const search = (el("commandesSearch")?.value || "").trim().toLowerCase();
  const status = el("commandesStatus")?.value || "";
  const dateFrom = el("commandesDateFrom")?.value || "";
  const dateTo = el("commandesDateTo")?.value || "";

  return state.commandes.filter((item) => {
    const hay = [item.reference, item.adresse, item.modele]
      .join(" ")
      .toLowerCase();

    // Date filtering
    const cmdDate = item.date_commande || item.dateCommande;
    let dateMatch = true;
    if (cmdDate) {
      if (dateFrom && cmdDate < dateFrom) dateMatch = false;
      if (dateTo && cmdDate > dateTo) dateMatch = false;
    }

    return (
      (!search || hay.includes(search)) &&
      (!status || item.status === status) &&
      dateMatch
    );
  });
}

function renderCommandes() {
  ensureCommandesDataset();
  const rows = visibleCommandes();

  // AJOUTE CETTE LIGNE ICI :
  if (rows.length > 0) console.log("Première commande reçue :", rows[0]);

  const isPending = (s) =>
    ["En cours", "En attente", "EN_COURS", "EN_ATTENTE"].includes(s);
  if (el("cmdKpiTotal"))
    el("cmdKpiTotal").textContent = String(state.commandes.length);
  if (el("cmdKpiEnAttente"))
    el("cmdKpiEnAttente").textContent = String(
      state.commandes.filter((c) => isPending(c.status)).length,
    );
  if (el("cmdKpiRecues"))
    el("cmdKpiRecues").textContent = String(
      state.commandes.filter((c) => c.status === "Reçue").length,
    );
  if (el("cmdKpiAnnuLEes"))
    el("cmdKpiAnnuLEes").textContent = String(
      state.commandes.filter((c) => c.status === "Annulée").length,
    );

  const getBadge = (s) => {
    const badges = {
      "En cours": "badge warning",
      "En attente": "badge warning",
      EN_COURS: "badge warning",
      Reçue: "badge success",
      Annulée: "badge danger",
    };
    return badges[s] || "badge";
  };

  el("commandesBody").innerHTML =
    rows
      .map(
        (c) => `
    <tr>
      <td>${escapeHtml(c.reference || "—")}</td>
      <td>${escapeHtml(c.raison_sociale || c.adresse || "—")}</td>
      <td>${escapeHtml(c.code_station || c.codeStation || "—")}</td>
      <td>${escapeHtml(c.modele || "—")}</td>
      <td>${c.quantite || "—"}</td>
      <td>${formatDate(c.dateCommande)}</td>
      <td><span class="${getBadge(c.status)}">${c.status === "EN_COURS" || c.status === "En cours" ? "En attente" : escapeHtml(c.status || "—")}</span></td>
      <td>${c.datePrevue ? formatDate(c.datePrevue) : '<span class="muted">—</span>'}</td>

      <td>${c.dateValidation ? formatDate(c.dateValidation) : '<span class="muted">—</span>'}</td>

      <td>
        <div style="display:flex;gap:5px;">

          <button class="btn btn-ghost btn-sm" title="Voir" onclick="viewCommande('${escapeHtml(c.id)}')"><i class="fa-solid fa-eye"></i></button>





${
  isPending(c.status) && isWriteAllowed()
    ? `
  <button class="btn btn-ghost btn-sm" title="Confirmer" onclick="openConfirmOrderModal('${escapeHtml(c.id)}')">
    <i class="fa-solid fa-check"></i>
  </button>

  <button class="btn btn-ghost btn-sm" title="Annuler" onclick="cancelOrder('${escapeHtml(c.id)}')" style="color: var(--danger); border-color: rgba(220, 53, 69, .3);">
    <i class="fa-solid fa-xmark"></i>
  </button>
`
    : ""
}




        </div>
      </td>
    </tr>
  `,
      )
      .join("") ||
    '<tr><td colspan="10" class="muted">Aucune commande.</td></tr>';
}

function resetCommandesFilters() {
  [
    "commandesSearch",
    "commandesStatus",
    "commandesDateFrom",
    "commandesDateTo",
  ].forEach((id) => {
    if (el(id)) el(id).value = "";
  });
  renderCommandes();
}

function toggleCommandesAdvancedFilters() {
  const box = el("commandesAdvancedFilters");
  if (box) box.style.display = box.style.display === "none" ? "block" : "none";
}

function openNewCommandeModal() {
  if (!requireCreateCommande()) return;
  const types = Array.isArray(state.typesTpe) ? state.typesTpe : [];
  const hasTypes = types.length > 0;
  const modeleField = hasTypes
    ? `<select id="newCmdModele">${types.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("")}</select>`
    : `<select id="newCmdModele" disabled><option>— aucun modèle disponible —</option></select>`;
  const helper = hasTypes
    ? ""
    : `<p class="muted" style="color:#c0392b">Aucun modèle TPE en base — ajoutez des entrées dans <code>type_tpe</code>.</p>`;
  const createBtn = hasTypes
    ? `<button class="btn btn-primary" onclick="confirmNewCommande()">Créer</button>`
    : `<button class="btn btn-primary" disabled>Créer</button>`;
  const stationOptions = (state.stations || [])
    .map((s) => {
      const cleanCode = (s.code_station || s.code || "").replace(/"/g, "").trim();
      const nom = s.name || s.nom_station || cleanCode;
      return `<option value="${escapeHtml(cleanCode)}">${escapeHtml(nom)} (${escapeHtml(cleanCode)})</option>`;
    })
    .join("");
  openModal(
    "Nouvelle commande TPE",
    `
    <div class="form-grid">
      <div class="field"><label>Référence</label><input id="newCmdReference" placeholder="Auto"></div>
      <div class="field"><label>Adresse</label><input id="newCmdAdresse"></div>
      <div class="field"><label>Code station</label><select id="newCmdCodeStation"><option value="">— Sélectionner —</option>${stationOptions}</select></div>
      <div class="field"><label>Modèle</label>${modeleField}</div>
      <div class="field"><label>Quantité</label><input id="newCmdQuantite" type="number" value="1" min="1"></div>
    </div>
    ${helper}`,
    `
    <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
    ${createBtn}
  `,
  );
}

async function confirmNewCommande() {
  if (!requireCreateCommande()) return;
  ensureCommandesDataset();
  const reference = el("newCmdReference").value.trim() || `CMD-${Date.now()}`;
  const adresse = el("newCmdAdresse").value.trim() || "Alger";
  const codeStation = el("newCmdCodeStation").value.trim();
  const modele = (el("newCmdModele").value || "").trim();
  const quantite = parseInt(el("newCmdQuantite").value, 10) || 1;

  const types = Array.isArray(state.typesTpe) ? state.typesTpe : [];
  if (!modele || !types.includes(modele)) {
    showToast("Veuillez sélectionner un modèle TPE valide.", true);
    return;
  }

  try {
    const resp = await API.tpe.createCommande({
      numero_commande: reference,
      code_station: codeStation || undefined,
      raison_sociale: adresse,
      lignes: [{ modele_tpe: modele, quantite }],
    });
    const backendCmd = resp?.commande || {};
    const item = {
      id: backendCmd.id != null ? String(backendCmd.id) : uid("cmd"),
      backendId: backendCmd.id || null,
      reference: backendCmd.numero_commande || reference,
      adresse,
      codeStation: codeStation,
      code_station: codeStation,
      modele,
      quantite,
      dateCommande: backendCmd.date_commande
        ? String(backendCmd.date_commande).slice(0, 10)
        : nowIso().slice(0, 10),
      datePrevue: "",
      dateReelle: "",
      status: backendCmd.statut || "En cours",
      events: [
        {
          date: nowIso(),
          user: currentUser?.name || "Système",
          action: "Création",
          detail: "Commande créée",
        },
      ],
    };
    state.commandes.unshift(item);
    saveState();
    closeModal();
    renderCommandes();
    showToast("Commande créée.");
  } catch (err) {
    showToast(
      err?.message ||
        err?.error ||
        "Erreur lors de la création de la commande.",
      true,
    );
  }
}

function viewCommande(id) {
  ensureCommandesDataset();
  const cmd = state.commandes.find((c) => c.id === id);
  if (!cmd) return;
  openModal(
    `Commande ${cmd.reference}`,
    `
    <div class="form-grid">
      <div class="field"><label>Référence</label><input disabled value="${escapeHtml(cmd.reference)}"></div>
      <div class="field"><label>Adresse</label><input disabled value="${escapeHtml(cmd.adresse)}"></div>
      <div class="field"><label>Modèle</label><input disabled value="${escapeHtml(cmd.modele)}"></div>
      <div class="field"><label>Quantité</label><input disabled value="${cmd.quantite}"></div>
      <div class="field"><label>Statut</label><input disabled value="${cmd.status}"></div>
    </div>`,
    `<button class="btn btn-primary" onclick="closeModal()">Fermer</button>`,
  );
}

function exportCommandesCSV() {
  ensureCommandesDataset();

  // ✅ On filtre pour garder uniquement "En attente" et "En cours"
  const commandesFiltrees = visibleCommandes().filter((c) =>
    ["En attente", "En cours", "EN_COURS", "En cours", "EN_ATTENTE"].includes(
      c.status,
    ),
  );

  const rows = commandesFiltrees.map((c) => ({
    Référence: c.reference,
    Adresse: c.adresse,
    Modèle: c.modele,
    Quantité: c.quantite,
    Statut: c.status,
  }));

  const csv = csvStringify(rows, [
    "Référence",
    "Adresse",
    "Modèle",
    "Quantité",
    "Statut",
  ]);

  downloadBlob(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
    "commandes-tpe.csv",
  );
  showToast("Export CSV terminé.");
}

function triggerCommandesImport() {
  el("commandesImportInput")?.click();
}

// Ouvre la modale de confirmation de réception d'une commande, avec pré-remplissage de la date et des champs station/district à renseigner.
function openConfirmOrderModal(id) {
  if (!requireWrite()) return;
  ensureCommandesDataset();
  const cmd = state.commandes.find((c) => c.id === id);
  if (!cmd) return;
  const qty = parseInt(cmd.quantite, 10) || 1;

  // Générer les options depuis state.stations
  const stationOptions = (state.stations || [])
    .map((s) => {
      const cleanCode = (s.code_station || s.code || "")
        .replace(/"/g, "")
        .trim();
      const nom = s.name || s.nom_station || cleanCode;
      const district = s.district || "";
      const wilaya = s.wilaya || "";
      return `<option value="${escapeHtml(cleanCode)}" data-district="${escapeHtml(district)}" data-wilaya="${escapeHtml(wilaya)}">${escapeHtml(nom)} (${escapeHtml(cleanCode)})</option>`;
    })
    .join("");

  openModal(
    `Confirmer ${cmd.reference}`,
    `
    <div class="form-grid">
      <div class="field"><label>Commande</label><input disabled value="${escapeHtml(cmd.reference)} — ${escapeHtml(cmd.modele)} (${qty})"></div>
      <div class="field"><label>Date réception</label><input id="cmdConfirmDate" type="date" value="${nowIso().slice(0, 10)}"></div>
      <div class="field"><label>Code Station *</label><select id="cmdConfirmStation" onchange="autoFillStationFields()"><option value="">Sélectionner une station</option>${stationOptions}</select></div>
      <div class="field"><label>District *</label><input id="cmdConfirmDistrict" placeholder="Rempli automatiquement"></div>
      <div class="field"><label>Wilaya</label><input id="cmdConfirmWilaya" placeholder="Rempli automatiquement"></div>
      <div class="field"><label>Adresse</label><input id="cmdConfirmAdresse" placeholder="Adresse de la station"></div>
    </div>
    <p class="muted">${qty} TPE seront générés automatiquement (N° série au format <code>TPE-${escapeHtml(cmd.reference)}-001…</code>) et intégrés au stock TPE.</p>`,
    `
    <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
    <button class="btn btn-primary" onclick="confirmOrder('${escapeHtml(id)}')">Confirmer & intégrer au stock</button>
  `,
  );
}

// Auto-remplir district et wilaya quand on choisit une station
function autoFillStationFields() {
  const select = el("cmdConfirmStation");
  const option = select?.selectedOptions?.[0];
  if (!option) return;
  const district = option.dataset.district || "";
  const wilaya = option.dataset.wilaya || "";
  if (el("cmdConfirmDistrict")) el("cmdConfirmDistrict").value = district;
  if (el("cmdConfirmWilaya")) el("cmdConfirmWilaya").value = wilaya;
}

// Si la commande n'existe que côté client (CSV / état local), la pousser vers le backend
// avant toute opération qui en dépend (confirmer, annuler).
async function ensureCommandeOnBackend(cmd) {
  if (cmd?.backendId) return cmd.backendId;
  if (!cmd?.modele) {
    throw {
      error: `La commande ${cmd?.reference || ""} n'a pas de modèle TPE valide.`,
    };
  }
  try {
    const resp = await API.tpe.createCommande({
      numero_commande: cmd.reference,
      raison_sociale: cmd.raisonSocial || cmd.adresse || "",
      lignes: [
        { modele_tpe: cmd.modele, quantite: parseInt(cmd.quantite, 10) || 1 },
      ],
    });
    const backendCmd = resp?.commande || {};
    if (backendCmd.id) {
      cmd.backendId = backendCmd.id;
      saveState();
      return backendCmd.id;
    }
  } catch (err) {
    if (
      err?.status === 409 ||
      /existe/i.test(err?.error || err?.message || "")
    ) {
      return cmd.reference;
    }
    throw err;
  }
  return cmd.reference;
}

// Confirme la réception d'une commande : appel API pour mise à jour du statut côté backend, puis mise à jour locale et intégration des TPE au stock.
async function confirmOrder(id) {
  if (!requireWrite()) return;
  ensureCommandesDataset();
  const cmd = state.commandes.find((c) => c.id === id);
  if (!cmd) return;

  const date = el("cmdConfirmDate")?.value || nowIso().slice(0, 10);
  const codeStation = el("cmdConfirmStation")?.value?.trim() || null;
  const district = el("cmdConfirmDistrict")?.value?.trim() || null;
  const wilaya = el("cmdConfirmWilaya")?.value?.trim() || null;
  const adresse = el("cmdConfirmAdresse")?.value?.trim() || null;

  if (!codeStation) {
    showToast("Le code station est obligatoire.", true);
    return;
  }
  if (!district) {
    showToast("Le district est obligatoire.", true);
    return;
  }

  try {
    const backendId = await ensureCommandeOnBackend(cmd);
    const qty = parseInt(cmd.quantite, 10) || 1;

    const tpes = Array.from({ length: qty }, (_, i) => ({
      numeroserietpe: `TPE-${cmd.reference}-${String(i + 1).padStart(3, "0")}`,
      code_station: codeStation,
      district: district,
      wilaya: wilaya || "",
      adresse: adresse || "",
      dotation: cmd.modele,
    }));

    // Log ici après définition de tpes
    console.log("TPEs à envoyer:", tpes);
    console.log(
      "Stations disponibles:",
      state.stations.map((s) => s.code_station),
    );

    await API.tpe.confirmerCommande(backendId, {
      date_reception: date,
      tpes,
    });

    cmd.status = "Reçue";
    cmd.dateReelle = date;
    saveState();
    await loadState();
    closeModal();
    renderAll();
    showToast("Commande confirmée — TPE intégrés au stock.");
  } catch (err) {
    showToast(
      err?.error || err?.message || "Erreur lors de la confirmation.",
      true,
    );
  }
}
// Annule une commande : appel API pour mise à jour du statut côté backend, puis mise à jour locale. Les TPE associés ne sont pas créés ni intégrés au stock.
async function cancelOrder(id) {
  if (!requireWrite()) return;
  ensureCommandesDataset();
  const cmd = state.commandes.find((c) => c.id === id);
  if (!cmd) return;

  let backendId;
  try {
    backendId = await ensureCommandeOnBackend(cmd);
  } catch (err) {
    showToast(
      err?.message || err?.error || "Impossible de synchroniser la commande.",
      true,
    );
    return;
  }

  try {
    await API.tpe.changerStatutCommande(backendId, { statut: "Annulée" });
  } catch (err) {
    showToast(
      err?.message || err?.error || "Erreur lors de l'annulation.",
      true,
    );
    return;
  }
  cmd.status = "Annulée";
  cmd.events = cmd.events || [];
  cmd.events.unshift({
    date: nowIso(),
    user: currentUser?.name || "Système",
    action: "Annulation",
    detail: "Commande annulée",
  });
  saveState();
  renderCommandes();
  showToast("Commande annulée.");
}

// L'intégration au stock se fait désormais via confirmOrder() (POST /commandes/:id/confirmer).
// Conservé pour compatibilité avec d'éventuels handlers HTML existants.
function addToStock(id) {
  openConfirmOrderModal(id);
}

//fix commande import from csv: d'abord créer la commande côté backend pour obtenir un ID, puis ajouter localement (sinon les actions de confirmation/annulation ne fonctionnent pas). Ignorer les commandes déjà existantes (409) pour permettre l'import de fichiers partiellement déjà intégrés.
async function importCommandesFromCsv(text) {
  if (!requireWrite()) return;
  const rows = csvParse(text);
  if (!rows.length) {
    showToast("CSV vide.", true);
    return;
  }
  ensureCommandesDataset();
  let added = 0;
  let errors = 0;

  for (const [index, row] of rows.entries()) {
    console.log("row:", row); // ← ajoute ici
    const reference =
      pickValue(row, [
        "reference",
        "ref",
        "Référence",
        "reference_cmd",
        "REF",
      ]) || `CMD-${String(index + 1).padStart(4, "0")}`;

    if (
      state.commandes.some(
        (c) => c.reference.toLowerCase() === reference.toLowerCase(),
      )
    )
      continue;

    const modele =
      pickValue(row, ["modele", "Modèle", "model", "modele_tpe"]) ||
      "Modèle TPE";
    const quantite =
      parseInt(pickValue(row, ["quantite", "Quantité", "qty"])) || 1;
    const codeStation =
      pickValue(row, [
        "codeStation",
        "code_station",
        "Code station",
        "Code_station",
        "Code_Station",
        "CODE_STATION",
        "code_Station",
        "CodeStation",
      ]) || null;
    console.log("codeStation extrait:", codeStation, "de la ligne:", row);
    const raisonSocial =
      pickValue(row, ["raisonSocial", "raison_social", "Raison sociale"]) ||
      null;
    const idStructure =
      pickValue(row, [
        "idStructureEmettrice",
        "id_structure_emmettrice",
        "Str. émettrice",
      ]) || null;

    try {
      //  Envoyer au backend d'abord
      await API.tpe.createCommande({
        numero_commande: reference,
        raison_sociale:
          pickValue(row, ["adresse", "Adresse", "address"]) ||
          raisonSocial ||
          "",
        code_station: codeStation,
        id_structure_emmetrice: idStructure,
        lignes: [{ modele_tpe: modele, quantite }],
      });

      // ✅ Ajouter localement seulement si backend OK
      state.commandes.unshift(
        normalizeCommandeRecord(
          {
            reference,
            adresse:
              pickValue(row, ["adresse", "Adresse", "address"]) || "Alger",
            modele,
            quantite,
            dateCommande:
              pickValue(row, ["dateCommande", "Date commande", "date"]) ||
              nowIso().slice(0, 10),
            datePrevue: pickValue(row, ["datePrevue", "Date réception prévue"]),
            codeStation,
            raisonSocial,
            numCompte: pickValue(row, [
              "numCompte",
              "n_compte_bancaire",
              "N° Compte bancaire",
            ]),
            idStructureEmettrice: idStructure,
            status: "En attente",
          },
          state.commandes.length + added,
        ),
      );

      added++;
    } catch (err) {
      // Si la commande existe déjà côté backend → l'ajouter quand même localement
      if (
        err?.status === 409 ||
        /existe/i.test(err?.error || err?.message || "")
      ) {
        added++;
      } else {
        errors++;
        console.warn(`Commande ${reference} ignorée:`, err);
      }
    }
  }

  await loadState();
  renderCommandes();
  showToast(
    `${added} commande(s) importée(s)${errors > 0 ? `, ${errors} erreur(s).` : "."}`,
  );
}

function pickValue(row, keys, fallback = "") {
  for (const key of keys) {
    if (
      row[key] !== undefined &&
      row[key] !== null &&
      String(row[key]).trim() !== ""
    )
      return String(row[key]).trim();
  }
  return fallback;
}
