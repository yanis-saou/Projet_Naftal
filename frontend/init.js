// Affiche la fenêtre des alertes de cartes à surveiller.
function openAlertsModal() {
  const cardAlerts = (state?.cards || [])
    .filter((c) =>
      ["Expire bientôt", "Expirée", "Défectueuse", "Perdue", "Volée", "en panne", "Volé", "En panne"].includes(
        c.status,
      ),
    )
    .map((card) => ({ type: "Carte", item: card }));

  const tpeAlerts = (state?.tpe || [])
    .filter((t) => ["En panne", "Volé"].includes(t.status))
    .map((tpe) => ({ type: "TPE", item: tpe }));

  const allAlerts = [...cardAlerts, ...tpeAlerts];

  const rows =
    allAlerts
      .map((alert) => {
        const { type, item } = alert;
        if (type === "Carte") {
          return `<tr><td>${type}</td><td>${escapeHtml(item.number)}</td><td>${badge(item.status)}</td><td>${formatDate(item.expirationDate)}</td><td>${escapeHtml(item.station)}</td></tr>`;
        } else {
          return `<tr><td>${type}</td><td>${escapeHtml(item.serial)}</td><td>${badge(item.status)}</td><td>${formatDate(item.datePanne || item.date_panne)}</td><td>${escapeHtml(item.station)}</td></tr>`;
        }
      })
      .join("") || '<tr><td colspan="5" class="muted">Aucune alerte.</td></tr>';

  openModal(
    "Alertes prioritaires",
    `<div class="table-wrap"><table><thead><tr><th>Type</th><th>Élément</th><th>Etat</th><th>Date</th><th>Structure</th></tr></thead><tbody>${rows}</tbody></table></div>`,
    `<button class="btn btn-primary" onclick="closeModal()">Fermer</button>`,
  );
}

// Réinitialise les filtres de recherche des cartes.

function resetCardsFilters() {
  ["cardsSearch", "cardsType", "cardsDistrict"].forEach((id) => {
    if (el(id)) el(id).value = "";
  });
  // Reset date filters
  if (el("cardsDateReceptionDebut")) el("cardsDateReceptionDebut").value = "";
  if (el("cardsDateReceptionFin")) el("cardsDateReceptionFin").value = "";
  renderCards();
}

// Réinitialise les filtres de recherche des TPE.

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

// Initialise les événements d'ouverture et de fermeture de la modale.

function setupModal() {
  el("closeModalX")?.addEventListener("click", closeModal);
  el("modalOverlay")?.addEventListener("click", (e) => {
    if (e.target.id === "modalOverlay") closeModal();
  });
}

// Initialise l'application au chargement de la page.

function setupLoginUi() {
  // Toggle visibilité mot de passe
  el("loginPassToggle")?.addEventListener("click", () => {
    const input = el("loginPass");
    const icon = el("loginPassToggle").querySelector("i");
    if (input.type === "password") {
      input.type = "text";
      icon.classList.remove("fa-eye");
      icon.classList.add("fa-eye-slash");
    } else {
      input.type = "password";
      icon.classList.remove("fa-eye-slash");
      icon.classList.add("fa-eye");
    }
  });

  // Touche Entrée
  el("loginPass")?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") doLogin();
  });
  el("loginUser")?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") el("loginPass").focus();
  });
}

function init() {
  // D'abord imposer l'état initial de l'UI
  populateLoginUsers();

  // Vérifier session existante
  const savedUser = loadSession();
  if (savedUser) {
    el("loginUser").value = savedUser.id;
    setCurrentUser(savedUser);
    el("loginScreen").style.display = "none";
    el("navbar").style.display = "flex";
    el("sidebar").style.display = "block";
    el("main").style.display = "block";
    showToast(`Bienvenue ${savedUser.name}`);
  } else {
    if (el("loginScreen")) el("loginScreen").style.display = "flex";
    if (el("navbar")) el("navbar").style.display = "none";
    if (el("sidebar")) el("sidebar").style.display = "none";
    if (el("main")) el("main").style.display = "none";
  }

  setupLoginUi();
  setupNavigation();
  setupHeaderUi();
  setupImports();
  setupModal();
  // Exposer les fonctions globalement pour les appels depuis le HTML
  window.doLogin = doLogin;
  window.logout = logout;
  window.switchUser = switchUser;
  window.openMyProfile = openMyProfile;
  window.go = go;
  window.showToast = showToast;
  window.triggerCardsImport = triggerCardsImport;
  window.triggerRenouvCardsImport = triggerRenouvCardsImport;
  window.triggerTpeImport = triggerTpeImport;
  window.exportCardsCSV = exportCardsCSV;
  window.exportTpeCSV = exportTpeCSV;
  window.renderCards = renderCards;
  window.renderRenouvCards = renderRenouvCards;
  window.renderCardsSuivi = renderCardsSuivi;
  window.renderCardsArchive = renderCardsArchive;
  window.renderTpe = renderTpe;
  window.renderTpeSuivi = renderTpeSuivi;
  window.renderStations = renderStations;
  window.resetCardsFilters = resetCardsFilters;
  window.resetTpeFilters = resetTpeFilters;
  window.resetTpeSuiviFilters = resetTpeSuiviFilters;
  window.toggleTpeAdvancedFilters = toggleTpeAdvancedFilters;
  window.toggleTpeServiceAdvancedFilters = toggleTpeServiceAdvancedFilters;
  window.toggleTpeSuiviAdvancedFilters = toggleTpeSuiviAdvancedFilters;
  window.toggleCardsAdvancedFilters = toggleCardsAdvancedFilters;
  window.toggleRenouvCardsAdvancedFilters = toggleRenouvCardsAdvancedFilters;
  window.toggleCirculationAdvancedFilters = toggleCirculationAdvancedFilters;
  window.toggleSuiviCardsAdvancedFilters = toggleSuiviCardsAdvancedFilters;
  window.toggleCommandesAdvancedFilters = toggleCommandesAdvancedFilters;
  window.resetSuiviCardsFilters = resetSuiviCardsFilters;
  window.toggleSelectAllVisibleCards = toggleSelectAllVisibleCards;
  window.clearCardsSelection = clearCardsSelection;
  window.bulkSetSelectedCardsToCirculation = bulkSetSelectedCardsToCirculation;
  window.confirmBulkCirculation = confirmBulkCirculation;
  window.viewCard = viewCard;
  window.changeCardStatus = changeCardStatus;
  window.confirmChangeCardStatus = confirmChangeCardStatus;
  window.showCardHistory = showCardHistory;
  window.transferCard = transferCard;
  window.confirmTransferCard = confirmTransferCard;
  window.archiveCard = archiveCard;
  window.clearCardsArchive = clearCardsArchive;
  window.viewArchiveItem = viewArchiveItem;
  window.restoreArchivedCard = restoreArchivedCard;
  window.openNewTpeModal = openNewTpeModal;
  window.confirmNewTpe = confirmNewTpe;
  window.viewTpe = viewTpe;
  window.changeTpeStatus = changeTpeStatus;
  window.confirmChangeTpeStatus = confirmChangeTpeStatus;
  window.openNewDechargeModal = openNewDechargeModal;
  window.confirmManualDecharge = confirmManualDecharge;
  window.downloadStoredPdf = downloadStoredPdf;
  window.openAlertsModal = openAlertsModal;
  window.closeModal = closeModal;
  window.toggleCardsSelectionMode = toggleCardsSelectionMode;
  window.toggleCardSelection = toggleCardSelection;
  window.toggleRenouvCardSelection = toggleRenouvCardSelection;
  window.toggleRenouvCardsSelectionMode = toggleRenouvCardsSelectionMode;
  window.toggleSelectAllVisibleRenouvCards = toggleSelectAllVisibleRenouvCards;
  window.bulkSetRenouvCardsToCirculation = bulkSetRenouvCardsToCirculation;
  window.confirmBulkCirculationRenouv = confirmBulkCirculationRenouv;
  window.resetRenouvCardsFilters = resetRenouvCardsFilters;
  window.importRenouvCardsFromCsv = importRenouvCardsFromCsv;
  // Cartes en circulation
  window.renderCardsCirculation = renderCardsCirculation;
  window.resetCirculationFilters = resetCirculationFilters;
  window.viewCirculationCard = viewCirculationCard;
  window.showCardFullHistory = showCardFullHistory;
  window.openRestitutionModal = openRestitutionModal;
  window.confirmRestitution = confirmRestitution;
  // Suivi workflow
  window.toggleSuiviSelectionMode = toggleSuiviSelectionMode;
  window.toggleSuiviCardSelection = toggleSuiviCardSelection;
  window.openSuiviEditModal = openSuiviEditModal;
  window.confirmSuiviEdit = confirmSuiviEdit;
  window.openRetourCirculationModal = openRetourCirculationModal;
  window.confirmRetourCirculation = confirmRetourCirculation;
  window.openEnvoiDcsiModal = openEnvoiDcsiModal;
  window.confirmEnvoiDcsi = confirmEnvoiDcsi;
  // TPE en service
  window.renderTpeService = renderTpeService;
  window.resetTpeServiceFilters = resetTpeServiceFilters;
  window.viewTpeService = viewTpeService;
  window.showTpeFullHistory = showTpeFullHistory;
  window.openTpeRestitutionModal = openTpeRestitutionModal;
  window.confirmTpeRestitution = confirmTpeRestitution;
  window.showDechargeModal = showDechargeModal;
  window.toggleDiagnosticField = toggleDiagnosticField;
  window.toggleTpeStockSelectionMode = toggleTpeStockSelectionMode;
  window.toggleTpeSelection = toggleTpeSelection;
  window.toggleSelectAllVisibleTpe = toggleSelectAllVisibleTpe;
  window.toggleSelectAllVisibleCardsSuivi = toggleSelectAllVisibleCardsSuivi;
  window.switchAlerts = switchAlerts;
  window.switchGraph = switchGraph;
  window.viewStation = viewStation;
  window.openTpeMiseEnServiceModal = openTpeMiseEnServiceModal;
  window.confirmTpeMiseEnService = confirmTpeMiseEnService;
  window.toggleTpeSuiviSelectionMode = toggleTpeSuiviSelectionMode;
  window.toggleTpeSuiviSelection = toggleTpeSuiviSelection;
  window.toggleSelectAllVisibleTpeSuivi = toggleSelectAllVisibleTpeSuivi;
  window.openTpeEnvoiTraitementModal = openTpeEnvoiTraitementModal;
  window.confirmTpeEnvoiTraitement = confirmTpeEnvoiTraitement;
  window.openTpeRetourServiceModal = openTpeRetourServiceModal;
  window.confirmTpeRetourService = confirmTpeRetourService;
  window.openTpeSuiviEditModal = openTpeSuiviEditModal;
  window.confirmTpeSuiviEdit = confirmTpeSuiviEdit;
  window.toggleNavSubmenu = toggleNavSubmenu;
  // Commandes
  window.exportCommandesCSV = exportCommandesCSV;
  window.renderCommandes = renderCommandes;
  window.resetCommandesFilters = resetCommandesFilters;
  window.openNewCommandeModal = openNewCommandeModal;
  window.confirmNewCommande = confirmNewCommande;
  window.viewCommande = viewCommande;
  window.triggerCommandesImport = triggerCommandesImport;
  window.openConfirmOrderModal = openConfirmOrderModal;
  window.confirmOrder = confirmOrder;
  window.cancelOrder = cancelOrder;
  window.addToStock = addToStock;
  window.importCommandesFromCsv = importCommandesFromCsv;
  window.loadCommandesFromServer = loadCommandesFromServer;
  window.openAddUserModal = openAddUserModal;
  window.confirmAddUser = confirmAddUser;
  window.openEditUserModal = openEditUserModal;
  window.confirmEditUser = confirmEditUser;
  window.toggleUserAccount = toggleUserAccount;
  window.renderResetRequests = renderResetRequests;
  window.refreshPasswordResetRequests = refreshPasswordResetRequests;
  window.validateResetRequest = validateResetRequest;
  window.refuseResetRequest = refuseResetRequest;
  window.confirmRefuseResetRequest = confirmRefuseResetRequest;
  window.openResetPasswordRequestModal = openResetPasswordRequestModal;
  window.confirmResetPasswordRequest = confirmResetPasswordRequest;
  window.showForgotPasswordForm = showForgotPasswordForm;
}

document.addEventListener("DOMContentLoaded", init);

// Ajouter l'import CSV :
document.addEventListener("DOMContentLoaded", () => {
  el("commandesImportInput")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    await importCommandesFromCsv(text); // appelle la bonne fonction
    e.target.value = "";
  });
});



//hna
document.addEventListener("DOMContentLoaded", async function () {
  console.log("Initialisation de l'application...");

  // 2. Votre logique d'initialisation actuelle
  try {


    console.log("Session vérifiée, affichage de l'interface.");
  } catch (error) {
    console.error("Erreur lors de l'initialisation :", error);
    // Si la session est invalide, on reste sur le login (déjà visible par défaut)
  }
});




// Initialisation Carte Leaflet Algérie
let algeriaMap;
let stationMarkers = [];

//  carte AlgeriaMap
// Coordonnées par wilaya algérienne
const WILAYA_COORDS = {
  Adrar: [27.87, -0.29],
  Chlef: [36.16, 1.33],
  Laghouat: [33.8, 2.87],
  "Oum El Bouaghi": [35.87, 7.11],
  Batna: [35.55, 6.17],
  Béjaïa: [36.75, 5.08],
  Biskra: [34.85, 5.73],
  Béchar: [31.62, -2.22],
  Blida: [36.47, 2.83],
  Bouira: [36.37, 3.9],
  Tamanrasset: [22.785, 5.52],
  Tébessa: [35.4, 8.12],
  Tlemcen: [34.88, -1.32],
  Tiaret: [35.37, 1.32],
  "Tizi Ouzou": [36.71, 4.05],
  Alger: [36.75, 3.04],
  Djelfa: [34.67, 3.25],
  Jijel: [36.82, 5.77],
  Sétif: [36.19, 5.41],
  Saïda: [34.83, 0.15],
  Skikda: [36.87, 6.9],
  "Sidi Bel Abbès": [35.18, -0.63],
  Annaba: [36.9, 7.77],
  Guelma: [36.46, 7.43],
  Constantine: [36.365, 6.61],
  Médéa: [36.27, 2.75],
  Mostaganem: [35.93, 0.09],
  MSila: [35.7, 4.54],
  Mascara: [35.4, 0.14],
  Ouargla: [31.95, 5.33],
  Oran: [35.69, -0.63],
  "El Bayadh": [33.68, 1.02],
  Illizi: [26.48, 8.48],
  "Bordj Bou Arreridj": [36.07, 4.76],
  Boumerdès: [36.76, 3.47],
  "El Tarf": [36.77, 8.31],
  Tindouf: [27.67, -8.14],
  Tissemsilt: [35.6, 1.81],
  "El Oued": [33.36, 6.86],
  Khenchela: [35.43, 7.14],
  "Souk Ahras": [36.28, 7.95],
  Tipaza: [36.59, 2.44],
  Mila: [36.45, 6.26],
  "Aïn Defla": [36.26, 1.97],
  Naâma: [33.27, -0.31],
  "Aïn Témouchent": [35.3, -1.14],
  Ghardaïa: [32.48, 3.68],
  Relizane: [35.73, 0.56],
};

async function initAlgeriaMap() {
  if (algeriaMap) {
    algeriaMap.remove();
    algeriaMap = null;
    stationMarkers = [];
  }

  algeriaMap = L.map("algeriaMap").setView([28.0339, 1.6596], 5);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors NAFTAL",
    maxZoom: 18,
  }).addTo(algeriaMap);

  // Restreindre la carte à l'Algérie uniquement
  algeriaMap.setMaxBounds([
    [18.97, -8.67],
    [37.09, 11.99],
  ]);
  algeriaMap.setMinZoom(5);

  //  Utiliser les stations de state
  const stations = Array.isArray(state?.stations) ? state.stations : [];

  if (stations.length === 0) {
    console.log("Aucune station trouvée dans state");
    return;
  }

  stations.forEach((station) => {
    // Trouver les coordonnées via le backend si elles existent
    const wilaya = station.wilaya || "";
    const nomStation =
      station.nom_station || station.name || station.code_station || "—";
    const codeStation = station.code || station.code_station || "";
    let coords = null;

    if (station.lat != null && station.lng != null) {
      coords = [Number(station.lat), Number(station.lng)];
    } else if (station.latitude != null && station.longitude != null) {
      coords = [Number(station.latitude), Number(station.longitude)];
    } else {
      // fallback sur la wilaya quand la station n'a pas de géolocalisation précise
      for (const [key, val] of Object.entries(WILAYA_COORDS)) {
        if (
          wilaya.toLowerCase().includes(key.toLowerCase()) ||
          key.toLowerCase().includes(wilaya.toLowerCase())
        ) {
          coords = val;
          break;
        }
      }
    }

    if (!coords) {
      // Position par défaut au centre de l'Algérie pour les stations sans coordonnées
      coords = [28.0339, 1.6596];
    }

    // Compter TPE et cartes liés à cette station via les données chargées depuis le backend
    const nbTpe = (state?.tpe || []).filter(
      (t) =>
        t.codeStation === codeStation ||
        t.station === codeStation ||
        t.station === nomStation ||
        t.codeStation === nomStation,
    ).length;

    // Couleur selon activité
    let markerColor = "#28a745"; // OK
    if (nbTpe === 0)
      markerColor = "#dc3545"; // Alerte
    else if (nbTpe < 3) markerColor = "#ffc107"; // Maintenance

    const markerIcon = L.divIcon({
      className: "custom-marker",
      html: `<div style="background:${markerColor};width:24px;height:24px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    // Décaler légèrement pour éviter superposition si même wilaya
    const offsetLat = (Math.random() - 0.5) * 0.3;
    const offsetLng = (Math.random() - 0.5) * 0.3;

    const marker = L.marker([coords[0] + offsetLat, coords[1] + offsetLng], {
      icon: markerIcon,
    }).addTo(algeriaMap).bindPopup(`
        <div style="min-width:220px;">
      <h4 style="margin:0 0 8px 0;">${station.name || station.code || "—"}</h4>
      <div><strong>Wilaya:</strong> ${station.wilaya || "—"}</div>
      <div><strong>District:</strong> ${station.district || "—"}</div>
      <div><strong>Code:</strong> ${station.code || "—"}</div>
      <div><strong>TPE en service:</strong> ${nbTpe}</div>


        </div>
      `);

    stationMarkers.push(marker);
  });

  console.log(`✅ ${stationMarkers.length} stations affichées sur la carte`);
}
