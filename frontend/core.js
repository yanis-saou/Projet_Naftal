// Génère un identifiant unique avec un préfixe donné.

function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

// Retourne la date et l'heure actuelles au format ISO.

function nowIso() {
  return new Date().toISOString();
}

// Formate une date pour l'afficher en français.

function formatDate(dateLike) {
  if (!dateLike) return "—";
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return String(dateLike);
  return d.toLocaleDateString("fr-FR");
}

// Formate une date et une heure pour l'affichage en français.

function formatDateTime(dateLike) {
  if (!dateLike) return "—";
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return String(dateLike);
  return d.toLocaleString("fr-FR");
}

// Protège une valeur texte avant son insertion dans le HTML.

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Télécharge un fichier dans le navigateur à partir d'un Blob.

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// Construit le badge HTML correspondant à un statut.

function badge(text) {
  const cls = STATUS_BADGES[text] || "b-neutral";
  return `<span class="badge ${cls}">${escapeHtml(text)}</span>`;
}
//alerte de traitement en cours depuis plus de 14 jours
function getTreatmentDays(card) {
  if (card.status !== "En cours traitement" || !card.treatmentStartDate)
    return 0;
  const start = new Date(card.treatmentStartDate);
  const now = new Date();
  const diffTime = Math.abs(now - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

function isTreatmentOverdue(card) {
  return getTreatmentDays(card) > 14;
}

function getTreatmentAlert(card) {
  if (!isTreatmentOverdue(card)) return "";
  return `<span class="badge danger" title="Traitement en cours depuis plus de 14 jours">⚠️ Retard</span>`;
}

function getDaysUntilExpiration(card) {
  if (!card.expirationDate) return 999;
  const exp = new Date(card.expirationDate);
  const now = new Date();
  const diffTime = exp - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}
//alerte
function isExpiringSoon(card) {
  const days = getDaysUntilExpiration(card);
  return days <= 10 && days >= 0;
}

function getExpirationAlert(card) {
  if (!isExpiringSoon(card)) return "";
  const days = getDaysUntilExpiration(card);
  return `<span class="badge warning" title="Expiration imminente dans ${days} jours">⚠️ Expire bientôt</span>`;
}

// Indique si l'utilisateur courant a les droits de modification.

function isWriteAllowed() {
  const { role } = parseBackendRole(currentUser?.role);
  return role === "ADMIN";
}

function roleKey() {
  return String(currentUser?.role || "")
    .trim()
    .toUpperCase();
}

function parseBackendRole(rawRole) {
  const raw = String(rawRole || "").trim();
  if (!raw) return { role: "", structure: "" };
  const norm = raw.toUpperCase();
  const parts = norm.split("_").filter(Boolean);
  // attendu: ADMIN_DPE | MEMBRE_DISTRICT | CONSULTANT_AGENCE | ...
  return {
    role: parts[0] || "",
    structure: parts[1] || "",
  };
}

function isDpeAdmin() {
  const { role, structure } = parseBackendRole(currentUser?.role);
  return role === "ADMIN" && structure === "DPE";
}

function isAdminRole() {
  return parseBackendRole(currentUser?.role).role === "ADMIN";
}

function isMemberRole() {
  return parseBackendRole(currentUser?.role).role === "MEMBRE";
}

function isConsultantRole() {
  return parseBackendRole(currentUser?.role).role === "CONSULTANT";
}

function canManageUsers() {
  // inchangé côté métier actuel: admin (central) + membre district
  const { role, structure } = parseBackendRole(currentUser?.role);
  if (role === "ADMIN") return true;
  return role === "MEMBRE" && structure === "DISTRICT";
}

function canEditRestitution() {
  // restitution = membre + admin (consultant = lecture seule)
  return isAdminRole() || isMemberRole();
}

function canCreateCommande() {
  const { role, structure } = parseBackendRole(currentUser?.role);
  if (role === "CONSULTANT") return false;
  if (role === "ADMIN" && structure === "DPE") return true;
  if (role === "MEMBRE" && ["DISTRICT", "AGENCE", "ANTENNE"].includes(structure))
    return true;
  return false;
}

function requireRestitutionEdit() {
  if (canEditRestitution()) return true;
  showToast("Action non autorisee pour ce profil.", true);
  return false;
}

function requireDpeAdmin() {
  if (isDpeAdmin()) return true;
  showToast("Action réservée à l'administrateur DPE.", true);
  return false;
}

function normalizeTextKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeIdKey(value) {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "";
}

function currentUserWilayaKeys() {
  const keys = new Set();
  if (!currentUser) return keys;

  const direct = Array.isArray(currentUser.wilayas)
    ? currentUser.wilayas
    : [currentUser.wilaya];
  direct.forEach((w) => {
    const key = normalizeTextKey(w);
    if (key) keys.add(key);
  });

  const stations = Array.isArray(state?.stations) ? state.stations : [];
  const userStructure = normalizeTextKey(currentUser.structure);
  stations.forEach((s) => {
    const stationWilaya = normalizeTextKey(s.wilaya);
    if (!stationWilaya) return;
    const byIdStructure =
      currentUser.id_structure &&
      Number(s.idstructure) === Number(currentUser.id_structure);
    const byName =
      userStructure &&
      (normalizeTextKey(s.name) === userStructure ||
        normalizeTextKey(s.district) === userStructure ||
        normalizeTextKey(s.code) === userStructure);
    if (byIdStructure || byName) keys.add(stationWilaya);
  });
  return keys;
}

function resolveItemWilayaKey(item) {
  const direct = normalizeTextKey(item?.wilaya);
  if (direct) return direct;
  const stations = Array.isArray(state?.stations) ? state.stations : [];
  const byStation = stations.find(
    (s) =>
      (item?.codeStation && s.code === item.codeStation) ||
      (item?.code && s.code === item.code) ||
      (item?.station &&
        normalizeTextKey(s.name) === normalizeTextKey(item.station)) ||
      (item?.location &&
        normalizeTextKey(s.name) === normalizeTextKey(item.location)) ||
      (item?.district &&
        normalizeTextKey(s.district) === normalizeTextKey(item.district)),
  );
  return normalizeTextKey(byStation?.wilaya);
}

// Vérifie si un élément est visible selon le périmètre du profil connecté.

function hasScope(item) {
  if (!currentUser) return false;
  // Admin DPE: accès total aux données
  if (isAdminRole()) return true;

  const { structure } = parseBackendRole(currentUser?.role);

  // DPE: accès total (membre/consultant DPE voient tout)
  if (structure === "DPE") return true;

  const structures = Array.isArray(state?.structures) ? state.structures : [];
  const stations = Array.isArray(state?.stations) ? state.stations : [];

  const me =
    structures.find(
      (s) => Number(s.idstructure) === Number(currentUser.id_structure),
    ) ||
    structures.find(
      (s) =>
        structureIdentityKey(s.nom_structure) ===
        structureIdentityKey(currentUser.structure),
    );

  // Si on n'arrive pas à identifier la structure du user, on évite de bloquer l'app.
  if (!me) return true;

  const myCodeKey = structureIdentityKey(me.code);
  const myNameKey = structureIdentityKey(me.nom_structure);

  const itemDistrictKey = structureIdentityKey(item?.district);
  const itemStationKey = structureIdentityKey(item?.station || item?.location);
  const itemCodeStructureKey = structureIdentityKey(
    item?.codeStructure ||
      item?.code_structure ||
      item?.code_structure_concerne,
  );
  const itemWilayaKey = resolveItemWilayaKey(item);

  const allowedStructureCodeKeys = new Set([myCodeKey].filter(Boolean));
  const allowedWilayaKeys = new Set();

  // helper: collect wilayas from stations matched by predicate
  const collectWilayas = (pred) => {
    stations.forEach((st) => {
      if (!pred(st)) return;
      const wk = normalizeTextKey(st.wilaya);
      if (wk) allowedWilayaKeys.add(wk);
    });
  };

  if (structure === "DISTRICT") {
    // autoriser district + enfants (agences/antennes) rattachés par code_parent
    structures
      .filter((s) => structureIdentityKey(s.code_parent) === myCodeKey)
      .forEach((s) => {
        const ck = structureIdentityKey(s.code);
        if (ck) allowedStructureCodeKeys.add(ck);
      });

    // wilayas autorisées : toutes celles des stations appartenant à ce district
    collectWilayas((st) => structureIdentityKey(st.district) === myNameKey);

    const okByDistrict = itemDistrictKey && itemDistrictKey === myNameKey;
    const okByCodeStructure =
      itemCodeStructureKey &&
      allowedStructureCodeKeys.has(itemCodeStructureKey);
    const okWilaya =
      !allowedWilayaKeys.size ||
      !itemWilayaKey ||
      allowedWilayaKeys.has(itemWilayaKey);
    return (okByDistrict || okByCodeStructure) && okWilaya;
  }

  if (structure === "AGENCE") {
    // wilaya autorisée = wilaya de ses stations
    collectWilayas(
      (st) => normalizeIdKey(st.idstructure) === normalizeIdKey(me.idstructure),
    );
    const okByCodeStructure =
      itemCodeStructureKey && itemCodeStructureKey === myCodeKey;
    const okByStationName = itemStationKey && itemStationKey === myNameKey;
    const okWilaya =
      !allowedWilayaKeys.size ||
      !itemWilayaKey ||
      allowedWilayaKeys.has(itemWilayaKey);
    return (okByCodeStructure || okByStationName) && okWilaya;
  }

  if (structure === "ANTENNE") {
    // Antenne: uniquement ses données (pas l'agence parente)
    collectWilayas(
      (st) => normalizeIdKey(st.idstructure) === normalizeIdKey(me.idstructure),
    );
    const okByCodeStructure =
      itemCodeStructureKey && itemCodeStructureKey === myCodeKey;
    const okByStationName = itemStationKey && itemStationKey === myNameKey;
    const okWilaya =
      !allowedWilayaKeys.size ||
      !itemWilayaKey ||
      allowedWilayaKeys.has(itemWilayaKey);
    return (okByCodeStructure || okByStationName) && okWilaya;
  }

  // Par défaut, on ne casse pas l'app: scope permissif
  return true;
}

// Ajoute une action dans le journal d'audit global.

function addAudit(action, target, detail = "") {
  const entry = {
    id: uid("audit"),
    date: nowIso(),
    action,
    target,
    detail,
    user: currentUser ? currentUser.name : "Système",
  };
  state.audit.unshift(entry);
  if (state.audit.length > 300) state.audit = state.audit.slice(0, 300);
  saveState();

  // Envoyer au backend si connecté
  if (currentUser) {
    addAuditBackend(action, target, detail);
  }
}

// Envoie une entrée d'audit au backend.

async function addAuditBackend(action, target, detail = "") {
  try {
    await API.auth.addAudit({ action, target, detail });
  } catch (error) {
    console.error("Erreur envoi audit backend:", error);
  }
}

// Enregistre un événement dans l'historique d'une carte.

function logCardEvent(cardId, action, detail = "") {
  const card = state.cards.find((c) => c.id === cardId);
  if (!card) return;
  const event = {
    id: uid("cev"),
    date: nowIso(),
    cardId,
    cardNumber: card.number,
    codeClient: card.codeClient,
    owner: card.owner,
    status: card.status,
    action,
    detail,
    user: currentUser ? currentUser.name : "Système",
  };
  state.cardHistory.unshift(event);
  card.events = card.events || [];
  card.events.unshift(event);
  if (card.events.length > 100) card.events = card.events.slice(0, 100);
  addAudit(action, `Carte ${card.number}`, detail);
}

// Enregistre un événement dans l'historique d'un TPE.

function logTpeEvent(tpeId, action, detail = "") {
  const tpe = state.tpe.find((t) => t.id === tpeId);
  if (!tpe) return;
  const event = {
    id: uid("tev"),
    date: nowIso(),
    tpeId,
    serial: tpe.serial,
    action,
    detail,
    user: currentUser ? currentUser.name : "Système",
  };
  state.tpeHistory.unshift(event);
  addAudit(action, `TPE ${tpe.serial}`, detail);
}

// Sauvegarde l'état courant de l'application (simulation mémoire ici).

function saveState() {
  // no-op : stockage mémoire uniquement, à remplacer plus tard par API/BDD
}

// Valeurs canoniques côté backend (colonne stock_carte.etat → FK etat_carte.libelle).

const BACKEND_CARD_STATUS = {
  EN_STOCK: "En_stock",
  EN_CIRCULATION: "En_circulation",
  EN_TRAITEMENT: "En cours traitement",
  DEFECTUEUSE: "Défectueuse",
  PERDUE: "Perdue",
  VOLEE: "Volée",
  BLOQUEE: "Bloquée",
  EXPIREE: "Expirée",
  RENOUVELEE: "Renouvelée",
  ARCHIVEE: "Archivée",
};

function mapBackendCardStatus(etat) {
  const s = String(etat || "").toLowerCase();
  if (s.includes("stock") || s === "en_stock") return "Nouvelle carte";
  if (s.includes("circulation")) return "En circulation";
  if (s.includes("traitement")) return "En cours traitement";
  if (s.includes("defect")) return "Défectueuse";
  if (s.includes("perd")) return "Perdue";
  if (s.includes("vol")) return "Volée";
  if (s.includes("bloq")) return "Bloquée";
  if (s.includes("expir")) return "Expirée";
  if (s.includes("renouv")) return "Renouvelée";
  return etat || "Nouvelle carte";
}

// Traduit une étiquette UI (affichée à l'utilisateur) vers la valeur canonique attendue par le backend.
function uiCardStatusToBackend(uiStatus) {
  const s = String(uiStatus || "").toLowerCase();
  if (s.includes("nouvelle") || s.includes("stock"))
    return BACKEND_CARD_STATUS.EN_STOCK;
  if (s.includes("circulation")) return BACKEND_CARD_STATUS.EN_CIRCULATION;
  if (s.includes("traitement")) return BACKEND_CARD_STATUS.EN_TRAITEMENT;
  if (s.includes("defect") || s.includes("défect"))
    return BACKEND_CARD_STATUS.DEFECTUEUSE;
  if (s.includes("perd")) return BACKEND_CARD_STATUS.PERDUE;
  if (s.includes("vol")) return BACKEND_CARD_STATUS.VOLEE;
  if (s.includes("bloq")) return BACKEND_CARD_STATUS.BLOQUEE;
  if (s.includes("expir")) return BACKEND_CARD_STATUS.EXPIREE;
  if (s.includes("renouv")) return BACKEND_CARD_STATUS.RENOUVELEE;
  if (s.includes("archiv")) return BACKEND_CARD_STATUS.ARCHIVEE;
  return uiStatus;
}

function normalizeCardRecord(raw) {
  if (!raw) return raw;
  const number = raw.numerocarte || raw.number || "";
  const toDate = (d) =>
    d
      ? typeof d === "string"
        ? d.slice(0, 10)
        : new Date(d).toISOString().slice(0, 10)
      : "";
  const nature = String(raw.nature_carte || raw.nature || "").trim();
  const isRenouvelee = /^renouv/i.test(nature);
  const isNouvelle = !isRenouvelee;
  return {
    id: raw.id || number || uid("card"),
    number,
    status: mapBackendCardStatus(raw.etat || raw.statut),
    type: raw.type_carte || raw.type || "—",
    nature: nature || (isNouvelle ? "Nouvelle" : "Renouveler"),
    isNouvelle,
    isRenouvelee,
    district: raw.district || "",
    station:
      raw.raisonsocialestructure ||
      raw.raison_sociale_structure ||
      raw.structure?.nom_structure ||
      raw.station ||
      "",
    codeStructure: raw.code_structure || "",
    codeClient: raw.code_client || raw.codeClient || "",
    owner: raw.raisonsocialeclient || raw.owner || "",
    company: raw.libelle_entite || raw.company || raw.raisonsocialeclient || "",
    numeroPorteur: raw.numeroporteur || raw.numeroPorteur || "",
    bts:
      raw.numero_bordereau_bts ||
      raw.numero_bts ||
      raw.numeroBts ||
      raw.bts ||
      raw["num bts"] ||
      raw["Num BTS"] ||
      raw["Num_BTS"] ||
      raw["NUM_BTS"] ||
      raw.numBts ||
      raw.numBTS ||
      raw["num_bts"] ||
      raw["Numéro BTS"] ||
      raw["numero_bts"] ||
      "",
    createdAt: toDate(raw.date_reception || raw.createdAt),
    expirationDate: toDate(raw.date_expiration || raw.expirationDate),
    dateRemise: toDate(raw.date_remise),
    amortissement: raw.amortissement_label || raw.amortissement || "—",
    archived: !!raw.archived,
    selected: false,
    events: [],
  };
}

function mapBackendTpeStatus(etat) {
  const s = String(etat || "")
    .replace(/_/g, " ")
    .toLowerCase();
  if (s.includes("service") || s === "en service") return "En service";
  if (s.includes("stock")) return "En stock";
  if (s.includes("panne")) return "En panne";
  // "En maintenance" et "En rapatriement" ont été supprimés : tout est fusionné
  // dans "En traitement" (un seul état pour les TPE en maintenance/traitement).
  if (s.includes("maintenance")) return "En traitement";
  if (s.includes("rapatri")) return "En traitement";
  if (s.includes("vol")) return "Volé";
  if (s.includes("reserv")) return "Réservé";
  if (s.includes("traitement")) return "En traitement";
  return etat || "En stock";
}

// Traduit un libellé UI ("En service") vers la valeur canonique backend ("En_service")
// qui correspond aux lignes `etat_tpe.libelle` en base. Utiliser AVANT chaque envoi
// qui écrit dans `stock_tpe.etat_tpe` ou `circulation_tpe.etat`.
function uiTpeStatusToBackend(uiStatus) {
  if (!uiStatus) return uiStatus;
  // Règle simple : remplacer les espaces par des underscores. Les valeurs
  // comme "Volé", "RAS", "Réparé" n'ont pas d'espace et sont renvoyées inchangées.
  return String(uiStatus).trim().replace(/\s+/g, "_");
}

function remapBackendTpe(raw) {
  if (!raw) return raw;
  const toDate = (d) =>
    d
      ? typeof d === "string"
        ? d.slice(0, 10)
        : new Date(d).toISOString().slice(0, 10)
      : "";
  const serial = raw.numeroserietpe || raw.numero_serie_tpe || raw.serial;

  // Les TPE "en service" viennent de circulation_tpe (via getParc) qui ne stocke
  // pas adresse, wilaya, ni les champs SIM. Le backend inclut toujours le
  // stock_tpe imbriqué — on s'en sert comme source de secours pour combler
  // les champs absents de circulation_tpe.
  const stock = raw.stock_tpe || {}; // present pour getParc, absent pour getStock
  const station =
    raw.station_circulation_tpe_code_stationTostation || raw.station || {}; // relation station (getParc ou getStock)

  return {
    ...raw,
    id: raw.id || serial,
    serial,
    numeroSerieTpe: serial,
    idTerminal: raw.idtpe || raw.id_tpe || raw.idTerminal || stock.idtpe,
    nomCommercial:
      raw.nomcommercial ||
      raw.raison_sociale ||
      raw.raison_sociale_structure ||
      raw.nomCommercial ||
      stock.nomcommercial ||
      stock.raisonsocialestructure,
    operateur: raw.operateur_mobile || raw.operateur || stock.operateur_mobile,
    numContrat: raw.n_contrat || raw.numContrat || stock.n_contrat,
    numCompte:
      raw.n_compte_bancaire || raw.numCompte || stock.n_compte_bancaire,
    // adresse / wilaya : champs absents de circulation_tpe → fallback stock_tpe puis station
    adresse: raw.adresse || stock.adresse || station.adresse,
    wilaya: raw.wilaya || stock.wilaya || station.wilaya,
    district: raw.district || stock.district,
    codeStructure: raw.code_structure || stock.code_structure,
    raisonsocialestructure:
      raw.raisonsocialestructure ||
      raw.raison_sociale_structure ||
      stock.raisonsocialestructure,
    codeStation: raw.code_station || stock.code_station,
    station:
      raw.code_station ||
      raw.station_circulation_tpe_code_stationTostation?.nom_station ||
      stock.code_station,
    // champs SIM : absents de circulation_tpe → fallback stock_tpe
    numeroSerieSim: raw.numero_serie_sim || stock.numero_serie_sim,
    adresseIPSim: raw.adresse_IP_SIM || stock.adresse_IP_SIM,
    nTelSim: raw.n_telephone_SIM || stock.n_telephone_SIM,
    dateReception: toDate(raw.date_reception || stock.date_reception),
    dateRemise: toDate(raw.date_remise || stock.date_remise),
    dotation: raw.dotation || stock.dotation,
    status: mapBackendTpeStatus(raw.etat_tpe || raw.etat),
    nbrChargeur:
      raw.nbr_chargeur != null
        ? String(raw.nbr_chargeur)
        : stock.nbr_chargeur != null
          ? String(stock.nbr_chargeur)
          : undefined,
    dispoChargeur:
      raw.disponibilite_chargeur == null
        ? stock.disponibilite_chargeur == null
          ? undefined
          : stock.disponibilite_chargeur
            ? "1"
            : "0"
        : raw.disponibilite_chargeur
          ? "1"
          : "0",
    amortissement:
      raw.amortissement != null
        ? `${raw.amortissement} mois`
        : stock.amortissement != null
          ? `${stock.amortissement} mois`
          : undefined,
  };
}

// last updated: 5/6/2024 - normalisation des données station pour garantir les champs nécessaires et éviter les erreurs d'affichage, notamment sur la carte.
function normalizeStationRecord(raw) {
  if (!raw) return raw;
  return {
    id: raw.id || raw.code_station || raw.code,
    idstructure: raw.idstructure || raw.id_structure || null,
    code: raw.code || raw.code_station || "",
    code_station: (raw.code_station || raw.code || "").replace(/"/g, "").trim(), // ✅
    name: raw.name || raw.nom_station || raw.code_station || "—",
    wilaya: raw.wilaya || "",
    district: raw.district || "",
    structure: raw.structure?.nom_structure || raw.structure || "",
    codeStructure: raw.structure?.code || raw.codeStructure || raw.code_structure || "",
    adresse: raw.adresse || "",
    tpeCount: raw.tpeCount ?? raw._count?.stock_tpe ?? 0,
    lat: raw.lat != null ? Number(raw.lat) : null,
    lng: raw.lng != null ? Number(raw.lng) : null,
    status: raw.status || "Active",
  };
}

// Charge l'état initial de l'application en appelant les différentes API du backend.
async function loadState() {
  const emptyState = {
    cards: [],
    tpe: [],
    stations: [],
    decharges: [],
    audit: [],
    archives: [],
    cardHistory: [],
    tpeHistory: [],
    commandes: [],
    resetRequests: [],
    sequence: { type1: 1, type2: 1, type3: 1, tpe: 1, commande: 1 },
  };

  const safeCall = (promise, fallback) =>
    promise.catch((err) => {
      console.error("loadState API call failed:", err);
      return fallback;
    });

  const [
    stockCards,
    circulationCards,
    tpeStock,
    tpeMaintStock,
    tpeParc,
    stationsData,
    dechargesData,
    tpeTransferts,
    commandesData,
    usersData,
    resetRequestsData,
    maintenanceData,
    typesTpeData,
    suiviCartesData,
    suiviTpesData,
    structuresData,
    archivesData,
  ] = await Promise.all([
    safeCall(API.cartes.getStock(), { cartes: [] }),
    safeCall(API.cartes.getCirculation(), { cartes: [] }),
    safeCall(API.tpe.getStock(), { tpes: [] }),
    safeCall(API.tpe.getMaintenanceStock(), { tpes: [] }),
    safeCall(API.tpe.getParc(), { tpes: [] }),
    safeCall(API.tpe.getStations(), []),
    safeCall(API.decharges.list(), { decharges: [] }),
    safeCall(API.tpe.getTransferts(), { transferts: [] }),
    safeCall(API.tpe.getCommandes(), { commandes: [] }),
    safeCall(API.auth.listUsers(), { users: [] }),
    safeCall(
      isDpeAdmin() && API.auth.listPasswordResetRequests
        ? API.auth.listPasswordResetRequests()
        : Promise.resolve({ requests: [] }),
      { requests: [] },
    ),
    safeCall(API.tpe.getMaintenance(), { maintenances: [] }),
    safeCall(API.tpe.getTypesTpe(), { types: [] }),
    safeCall(API.cartes.getSuiviCartes?.() || Promise.resolve({ suivis: [] }), {
      suivis: [],
    }),
    safeCall(API.tpe.getSuiviTpes?.() || Promise.resolve({ suivis: [] }), {
      suivis: [],
    }),

    safeCall(API.structure.list?.() || Promise.resolve({ structures: [] }), {
      structures: [],
    }),
    safeCall(API.archives.list(), { archives: [] }),
  ]);

  // Filet de sécurité : si jamais le backend renvoie la même carte sur /stock
  // ET /circulation, on dédoublonne par numerocarte (premier gagne).

  console.log("stockCards count:", stockCards?.cartes?.length);
  console.log("circulationCards count:", circulationCards?.cartes?.length);

  const rawCardsSeen = new Set();
  const rawCards = [
    ...(stockCards?.cartes || []),
    ...(circulationCards?.cartes || []),
  ].filter((c) => {
    const key = c?.numerocarte || c?.number;
    if (!key) return true;
    if (rawCardsSeen.has(key)) return false;
    rawCardsSeen.add(key);
    return true;
  });
  const allCards = rawCards.map(normalizeCardRecord);

  // Appliquer le cache BTS local pour les cartes renouvelées (BTS absent de la DB)
  applyRenouvBtsCacheToCards(allCards);

  // Fusionner les données de suivi avec les cartes
  if (suiviCartesData?.suivis && Array.isArray(suiviCartesData.suivis)) {
    const suiviMap = {};
    suiviCartesData.suivis.forEach((suivi) => {
      suiviMap[suivi.numerocarte] = suivi;
    });

    allCards.forEach((card) => {
      const cardNumber = card.number || card.numerocarte;
      const suivi = suiviMap[cardNumber];
      if (suivi) {
        // Fusionner les données de suivi dans la carte
        card.dateAnomalie = suivi.dateAnomalie || card.dateAnomalie;
        card.dateSuiviEnvoi = suivi.dateSuiviEnvoi || card.dateSuiviEnvoi;
        card.dateSuiviRetour = suivi.dateSuiviRetour || card.dateSuiviRetour;
        card.dateSuiviRetourStr =
          suivi.dateSuiviRetourStr || card.dateSuiviRetourStr;
        card.dateSuiviRetourDpe =
          suivi.dateSuiviRetourDpe || card.dateSuiviRetourDpe;
        card.anomaly = suivi.etatPanne || card.anomaly;
        card.diagnostic = suivi.diagnostic || card.diagnostic;
        card.codeStructure = suivi.codeStructure || card.codeStructure;
        card.raisonsocialestructure =
          suivi.raisonsocialestructure || card.raisonsocialestructure;
        // Déduire suiviModifie de la présence de données réelles de modification
        // (et non d'un simple changement d'état). Ce flag n'étant pas stocké en BDD,
        // on le recalcule à chaque chargement à partir des champs de modification.
        card.suiviModifie = !!(
          suivi.dateSuiviRetour ||
          suivi.diagnostic ||
          suivi.dateValidation ||
          suivi.validePar ||
          suivi.observation
        );

        // Ne fusionner validePar / dateValidation que si une vraie modification
        // de suivi a eu lieu (dateSuiviRetour, validePar, dateValidation, etc.).
        if (card.suiviModifie) {
          card.dateValidation = suivi.dateValidation || card.dateValidation;
          card.validePar = suivi.validePar || card.validePar;
        }
      }
    });
  }

  // Trois sources : stock (En_stock), maintenance-stock (tout sauf En_stock)
  // et parc (En_service via circulation_tpe). On dédoublonne par numéro de série :
  // un TPE en circulation a toujours une ligne stock_tpe miroir, on garde la ligne
  // circulation (plus riche : station, etat).
  const rawTpeMerged = [
    ...(tpeParc?.tpes || []),
    ...(tpeStock?.tpes || []),
    ...(tpeMaintStock?.tpes || []),
  ];
  const seenTpeSerials = new Set();
  const rawTpe = rawTpeMerged.filter((t) => {
    const serial = t?.numero_serie_tpe || t?.numeroserietpe || t?.serial;
    if (!serial) return true;
    if (seenTpeSerials.has(serial)) return false;
    seenTpeSerials.add(serial);
    return true;
  });
  const allTpe = rawTpe.map((item, index) =>
    normalizeTpeRecord(remapBackendTpe(item), index),
  );

  // Fusionner les données de suivi TPE avec les TPE
  if (suiviTpesData?.suivis && Array.isArray(suiviTpesData.suivis)) {
    const suiviTpeMap = {};
    suiviTpesData.suivis.forEach((suivi) => {
      suiviTpeMap[suivi.numeroserietpe] = suivi;
    });

    allTpe.forEach((tpe) => {
      const tpeSerial = tpe.serial || tpe.numeroserietpe;
      const suivi = suiviTpeMap[tpeSerial];
      if (suivi) {
        // Fusionner les données de suivi dans le TPE
        tpe.datePanne = suivi.datePanne || tpe.datePanne;
        tpe.dateEnvoiBea = suivi.dateEnvoiBea || tpe.dateEnvoiBea;
        tpe.dateRetourBea = suivi.dateRetourBea || tpe.dateRetourBea;
        tpe.etatPanne = suivi.etatPanne || tpe.etatPanne;
        tpe.diagnostic = suivi.diagnostic || tpe.diagnostic;
        tpe.objet_dia = suivi.objet_dia || tpe.objet_dia;
        // Ne fusionner validePar / dateValidation que si une vraie modification
        // de suivi a eu lieu (présence de dateRetourBea). À la restitution, le
        // backend remplit ces champs automatiquement — on veut les ignorer
        // tant que l'utilisateur n'a pas exécuté "Modification suivi".
        if (suivi.dateRetourBea) {
          tpe.dateValidationSuivi = suivi.dateValidation || tpe.dateValidationSuivi;
          tpe.validePar = suivi.validePar || tpe.validePar;
        }
        tpe.stationNom = suivi.stationNom || tpe.stationNom;
        tpe.dureeTraitement = suivi.dureeTraitement || tpe.dureeTraitement;

        // Ajouter les champs de transitions
        tpe.trs_st_str = suivi.trs_st_str || tpe.trs_st_str;
        tpe.trs_str_dpe = suivi.trs_str_dpe || tpe.trs_str_dpe;
        tpe.trs_dpe_str = suivi.trs_dpe_str || tpe.trs_dpe_str;
        tpe.trs_str_st = suivi.trs_str_st || tpe.trs_str_st;

        // Calculer la durée de traitement si on a les dates
        if (suivi.dateEnvoiBea && suivi.dateRetourBea) {
          const diff = Math.max(
            0,
            Math.ceil(
              (new Date(suivi.dateRetourBea) - new Date(suivi.dateEnvoiBea)) /
                86400000,
            ),
          );
          tpe.dureeTraitement = diff + " j";
        }
      }
    });
  }

  // Stations : on fait confiance au backend pour ne pas envoyer de doublons, mais on normalise quand même les données pour être sûr d'avoir les champs nécessaires et éviter les erreurs d'affichage.
  const rawStations = Array.isArray(stationsData) ? stationsData : [];
  const allStations = rawStations.map(normalizeStationRecord);

  // Rendre les stations disponibles pour la carte
  window.realStationsData = rawStations.map((s) => {
    const stationCode = s.code_station || s.code || "";
    const stationName = s.nom_station || s.name || stationCode;
    return {
      nom_station: s.nom_station,
      code_station: stationCode,
      wilaya: s.wilaya,
      latitude: s.latitude || s.geo_latitude || null,
      longitude: s.longitude || s.geo_longitude || null,
      nb_tpe: allTpe.filter(
        (t) =>
          t.codeStation === stationCode ||
          t.station === stationCode ||
          t.station === stationName,
      ).length,
    };
  });

  // Décharges carte : `listDecharges` renvoie { success, decharges } où chaque décharge contient déjà ses lignes associées (type1/2/3) grâce à la requête Prisma avec `include`.
  const rawDechargesCarte = Array.isArray(dechargesData?.decharges)
    ? dechargesData.decharges
    : [];
  const dechargesCarte = rawDechargesCarte.map(normalizeDechargeRecord);

  // TPE transferts : `getTransferts` renvoie { success, total, transferts }
  // où chaque entrée contient déjà `lignesType1/2/3`.
  const rawTpeDecharges = Array.isArray(tpeTransferts?.transferts)
    ? tpeTransferts.transferts
    : [];
  const dechargesTpe = rawTpeDecharges.map(normalizeDechargeTpeRecord);

  // Dédoublonnage par référence (numéro de décharge) — évite les doublons
  // entre une décharge persistée côté backend et son écho local poussé via
  // `storeDecharge` pendant la session courante.
  const dechargesByRef = new Map();
  [...dechargesCarte, ...dechargesTpe].forEach((d) => {
    if (d?.reference) dechargesByRef.set(d.reference, d);
  });

  const rawCommandes = Array.isArray(commandesData?.commandes)
    ? commandesData.commandes
    : [];

  const allCommandes = rawCommandes.map(normalizeCommandeRecord);

  const rawUsers = Array.isArray(usersData?.users) ? usersData.users : [];
  const allUsers = rawUsers.map(normalizeUserRecord);

  const allTypesTpe = (
    Array.isArray(typesTpeData?.types) ? typesTpeData.types : []
  )
    .map((t) => t?.libelle)
    .filter(Boolean);

  // Maintenances : `getMaintenance` renvoie { success, maintenances } où chaque maintenance contient déjà ses suivis associés grâce à la requête Prisma avec `include`.
  const rawMaintenances = Array.isArray(maintenanceData?.maintenances)
    ? maintenanceData.maintenances
    : [];
  const rawSuiviCartes = Array.isArray(suiviCartesData?.suivis)
    ? suiviCartesData.suivis
    : [];

  const maintenancesNormalisees = rawMaintenances.map((m) => ({
    ...m,
    id: m.id_suivi_tpe,
    serial: m.numeroserietpe,
    dateSuiviEnvoi: m.date_panne, // On crée l'alias ici pour l'UI
    anomaly: m.objet_dia || m.etat_panne,
    status: m.etat_panne,
    station: m.raisonsociale,
  }));

  state = {
    ...emptyState,
    cards: allCards,
    suiviCartes: rawSuiviCartes,
    tpe: allTpe,
    stations: allStations,
    decharges: Array.from(dechargesByRef.values()),
    commandes: allCommandes,
    users: allUsers,
    resetRequests: Array.isArray(resetRequestsData?.requests)
      ? resetRequestsData.requests
      : [],
    structures: Array.isArray(structuresData?.structures)
      ? structuresData.structures
      : [],
    maintenances: rawMaintenances,
    typesTpe: allTypesTpe,
    archives: Array.isArray(archivesData?.archives)
      ? archivesData.archives.map((a) => ({
          id: String(a.id_archive),
          number: a.numerocarte || "",
          status: "Archivée",
          district: a.district || "",
          owner: a.proprietaire || "",
          reason: a.motif || "",
          user: a.archive_par || "Système",
          archivedAt: a.date_archivage || "",
          codeClient: a.code_client || "",
          bts: a.bts || "",
        }))
      : [],
  };

  state.cards.forEach((card) => {
    syncCardBts(card);
  });

  return state;
}

// Normalise un utilisateur persisté en la forme utilisée par l'UI.
function normalizeUserRecord(u) {
  const fullName =
    `${u.prenom || ""} ${u.nom || ""}`.trim() ||
    u.email ||
    `Utilisateur #${u.id_utilisateur}`;
  return {
    id: String(u.id_utilisateur),
    backendId: u.id_utilisateur,
    name: fullName,
    nom: u.nom || "",
    prenom: u.prenom || "",
    username: u.email || "",
    email: u.email || "",
    role: u.role || "",
    id_structure: u.id_structure || null,
    structure: u.structure?.nom_structure || u.structure_cree || "",
    estValide: !!u.est_valide,
    initials:
      `${(u.prenom || "")[0] || ""}${(u.nom || "")[0] || ""}`.toUpperCase() ||
      (u.email ? u.email[0].toUpperCase() : "U"),
    disabled: !u.est_valide,
  };
}

// Convertit une commande_cib persistée en la forme utilisée par l'UI.
function normalizeCommandeRecord(c) {
  const firstLigne = Array.isArray(c?.ligne_commande_cib)
    ? c.ligne_commande_cib[0]
    : null;
  return {
    id: c.id,
    backendId: c.id,
    reference: c.numero_commande,
    adresse: c.raison_sociale || c.structure?.nom_structure || "—",
    codeStation: c.code_station || c.structure?.code_station || "—",
    modele: firstLigne?.modele_tpe || "—",
    quantite: c.quantite_totale || firstLigne?.quantite || 0,
    dateCommande: c.date_commande ? String(c.date_commande).slice(0, 10) : "",
    datePrevue: "",
    dateReelle: c.date_validation ? String(c.date_validation).slice(0, 10) : "",
    status: c.statut || "En cours",
    events: [],
    lignes: Array.isArray(c?.ligne_commande_cib) ? c.ligne_commande_cib : [],
  };
}

// Convertit une décharge Prisma en forme attendue par l'UI (storeDecharge/renderCardsDecharges).
function normalizeDechargeRecord(d) {
  const t1 = Array.isArray(d?.ligne_decharge_carte_type1)
    ? d.ligne_decharge_carte_type1
    : [];
  const t2 = Array.isArray(d?.ligne_decharge_carte_type2)
    ? d.ligne_decharge_carte_type2
    : [];
  const t3 = Array.isArray(d?.ligne_decharge_carte_type3)
    ? d.ligne_decharge_carte_type3
    : [];
  const kind = t1.length
    ? "type1"
    : t2.length
      ? "type2"
      : t3.length
        ? "type3"
        : "type1";
  const lines = kind === "type1" ? t1 : kind === "type2" ? t2 : t3;
  const cards = lines
    .map((l) => l.numero_carte || l.numero_carte_origine)
    .filter(Boolean);
  const object =
    kind === "type1"
      ? "Décharge d'envoi initial des cartes"
      : kind === "type2"
        ? "Envoi maintenance"
        : "Retour maintenance";
  return {
    id: `backend-${d.id_decharge_carte || d.numero_decharge}`,
    kind,
    assetType: "Carte",
    object,
    from: d.source || "DPE",
    to: d.destination || "",
    date: d.date_sortie ? String(d.date_sortie).slice(0, 10) : "",
    status: d.date_creation ? "Reçue" : "Générée",
    cards,
    pdfDataUri: null,
    // Conserve `numero_decharge` ET `reference` : les renderers tentent l'un
    // puis l'autre (`d.numero_decharge || d.reference`). Sans cette ligne, la
    // colonne « N° décharge » retombait sur "—" dès qu'une étape downstream
    // écrasait `reference`.
    numero_decharge: d.numero_decharge,
    reference: d.numero_decharge,
    date_creation: d.date_creation,
    date_sortie: d.date_sortie,
    source: d.source,
    destination: d.destination,
    nom_beneficiaire: d.nom_beneficiaire,
    fonction_beneficiaire: d.fonction_beneficiaire,
    motif_transfert: d.motif_transfert,
    numero_bordereau_bts: d.numero_bordereau_bts,
    beneficiary: d.nom_beneficiaire || "",
    functionLabel: d.fonction_beneficiaire || "",
    bts: d.numero_bordereau_bts || "",
  };
}

// Convertit une décharge TPE persistée (decharge_tpe + lignes) en la même
// forme que `normalizeDechargeRecord` pour qu'elles cohabitent dans
// `state.decharges` et soient rendues uniformément côté UI.
function normalizeDechargeTpeRecord(d) {
  const t1 = Array.isArray(d?.lignesType1) ? d.lignesType1 : [];
  const t2 = Array.isArray(d?.lignesType2) ? d.lignesType2 : [];
  const t3 = Array.isArray(d?.lignesType3) ? d.lignesType3 : [];
  const kind = t1.length
    ? "type1"
    : t2.length
      ? "type2"
      : t3.length
        ? "type3"
        : "type1";
  const lines = kind === "type1" ? t1 : kind === "type2" ? t2 : t3;
  const tpes = lines
    .map((l) => l.numero_serie_tpe || l.numeroserietpe)
    .filter(Boolean);
  const object =
    kind === "type1"
      ? "Transfert TPE — DPE → Structure"
      : kind === "type2"
        ? "Envoi TPE en maintenance"
        : "Retour TPE après maintenance";
  return {
    id: `backend-tpe-${d.id_decharge_tpe || d.numero_decharge}`,
    kind,
    assetType: "TPE",
    object,
    from: d.source || "DPE",
    to: d.destination || "",
    date: d.date_sortie ? String(d.date_sortie).slice(0, 10) : "",
    status: d.date_creation ? "Reçue" : "Générée",
    cards: tpes, // réutilise le champ pour ne pas casser les renderers existants
    pdfDataUri: null,
    // Voir commentaire dans normalizeDechargeRecord — on conserve numero_decharge
    // et les champs raw pour que les renderers TPE puissent afficher la valeur
    // d'origine sans dépendre uniquement de l'alias `reference`.
    numero_decharge: d.numero_decharge,
    reference: d.numero_decharge,
    date_creation: d.date_creation,
    date_sortie: d.date_sortie,
    source: d.source,
    destination: d.destination,
    nom_beneficiaire: d.nom_beneficiaire,
    fonction_beneficiaire: d.fonction_beneficiaire,
    numero_bordereau_bts: d.numero_bordereau_bts,
    numero_inventaire: d.numero_inventaire,
    beneficiary: d.nom_beneficiaire || "",
    functionLabel: d.fonction_beneficiaire || "",
    bts: d.numero_bordereau_bts || d.numero_inventaire || "",
  };
}

function normalizeBtsValue(value) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized === "Non spécifié") return "";
  return normalized;
}

function dechargeMatchesCard(decharge, card) {
  if (!decharge || !card || !Array.isArray(decharge.cards)) return false;
  return decharge.cards.some(
    (ref) =>
      String(ref) === String(card.id) || String(ref) === String(card.number),
  );
}

function findCardBtsInDecharges(card) {
  if (!card || !Array.isArray(state?.decharges)) return "";
  const related = state.decharges.filter(
    (decharge) =>
      decharge?.assetType === "Carte" &&
      normalizeBtsValue(decharge.bts) &&
      dechargeMatchesCard(decharge, card),
  );
  const type1 = related.find((decharge) => decharge.kind === "type1");
  return normalizeBtsValue(type1?.bts) || normalizeBtsValue(related[0]?.bts);
}

function getCardBts(card) {
  if (!card) return "";
  return normalizeBtsValue(card.bts) || findCardBtsInDecharges(card);
}

function syncCardBts(card, fallbackValue = "") {
  if (!card) return "";
  card.bts = getCardBts({
    ...card,
    bts: normalizeBtsValue(card.bts) || normalizeBtsValue(fallbackValue),
  });
  return card.bts;
}

function normalizeStructureValue(value) {
  return String(value || "").trim();
}

function structureIdentityKey(value) {
  return normalizeStructureValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function findStructureCodeByValue(value) {
  const key = structureIdentityKey(value);
  if (!key) return "";

  const structures = Array.isArray(globalThis.state?.structures)
    ? globalThis.state.structures
    : [];
  if (!structures.length) return "";

  const match = structures.find((structure) => {
    return [structure?.code, structure?.nom_structure, structure?.name].some(
      (candidate) => structureIdentityKey(candidate) === key,
    );
  });

  return normalizeStructureValue(match?.code);
}

function resolveCardRetourDestination(card, preferredValue = "") {
  const preferred = normalizeStructureValue(preferredValue);
  const station = normalizeStructureValue(card?.station);
  const location = normalizeStructureValue(card?.location);
  const codeStructure = normalizeStructureValue(card?.codeStructure);

  const preferredKey = structureIdentityKey(preferred);
  const stationKey = structureIdentityKey(station);
  const locationKey = structureIdentityKey(location);
  const codeKey = structureIdentityKey(codeStructure);

  const preferredStructureCode = findStructureCodeByValue(preferred);
  if (preferredStructureCode) return preferredStructureCode;

  if (preferred) {
    if (codeStructure && preferredKey === codeKey) return codeStructure;
    if (codeStructure && preferredKey === stationKey) return codeStructure;
    if (codeStructure && preferredKey === locationKey) return codeStructure;
    return preferred;
  }

  const knownStructureCode =
    findStructureCodeByValue(station) || findStructureCodeByValue(location);
  if (knownStructureCode) return knownStructureCode;

  if (station && codeStructure && stationKey === codeKey) return codeStructure;
  if (location && codeStructure && locationKey === codeKey)
    return codeStructure;

  return station || location || codeStructure || "";
}

// Supprimer seedState() - plus de données mockées

// Ajoute un nombre d'années à une date et renvoie le résultat.

function addYears(dateString, years) {
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return dateString;
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

// Met à jour automatiquement les statuts des cartes selon leur expiration.

function refreshStatuses() {
  const today = new Date();
  state.cards.forEach((card) => {
    if (card.archived) return;
    const exp = new Date(card.expirationDate);
    if (Number.isNaN(exp.getTime())) return;
    const diffDays = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
    if (
      [
        "Défectueuse",
        "Perdue",
        "Volée",
        "Bloquée",
        "En cours traitement",
      ].includes(card.status)
    )
      return;
    if (diffDays < 0) {
      if (card.status !== "Expirée") card.status = "Expirée";
      if (!card.archived) {
        card.archived = true;
        state.archives = state.archives || [];
        const alreadyArchived = state.archives.some(
          (a) =>
            a.number === card.number && a.reason === "Expiration automatique",
        );
        if (!alreadyArchived) {
          const entry = {
            id: uid("arch"),
            number: card.number,
            status: "Expirée",
            district: card.district,
            owner: card.owner,
            reason: "Expiration automatique de la carte",
            user: "Système",
            archivedAt: today.toISOString(),
            codeClient: card.codeClient,
            station: card.station,
            bts: card.bts || "",
          };
          state.archives.unshift(entry);
          API.archives
            .create({ numerocarte: card.number, motif: entry.reason })
            .then((res) => {
              if (res?.archive) {
                entry.id = String(res.archive.id_archive);
                entry.bts = res.archive.bts || entry.bts;
              }
            })
            .catch(() => {});
        }
      }
    } else if (diffDays <= 45) {
      if (card.status !== "Renouvelée") card.status = "Expire bientôt";
    }
  });
}

// =====================================================================
// CACHE BTS LOCAL (renouvelées) — persistant en localStorage
// Permet de conserver les valeurs BTS issues du fichier CSV importé
// même après un rechargement depuis le backend (qui ne stocke pas le BTS).
// =====================================================================

function getRenouvBtsCache() {
  try {
    return JSON.parse(localStorage.getItem("renouvBtsCache") || "{}");
  } catch {
    return {};
  }
}

function saveRenouvBtsCache(map) {
  try {
    localStorage.setItem("renouvBtsCache", JSON.stringify(map));
  } catch (e) {
    console.warn("Impossible de sauvegarder le cache BTS:", e);
  }
}

// Applique les BTS du cache local sur les cartes qui n'en ont pas
function applyRenouvBtsCacheToCards(cards) {
  const cache = getRenouvBtsCache();
  if (!cache || !Object.keys(cache).length) return;
  cards.forEach((card) => {
    if (!card.bts && cache[card.number]) {
      card.bts = cache[card.number];
    }
  });
}

// Extrait les paires {numeroCarte → bts} depuis le texte d'un CSV
function extractBtsFromCsv(text) {
  const rows = csvParse(text);
  const btsKeys = [
    "bts",
    "BTS",
    "Numero BTS",
    "N° BTS",
    "N BTS",
    "bts_number",
    "num bts",
    "Num BTS",
    "Num_BTS",
    "NUM_BTS",
    "numBts",
    "numBTS",
    "num_bts",
    "Numéro BTS",
    "numero_bts",
    "numeroBts",
    "numero_bordereau_bts",
    "N_BTS",
    "nbts",
    "NBTS",
  ];
  const result = {};
  rows.forEach((row) => {
    const number =
      row.number || row["N° Carte"] || row.numero || row["numero_carte"];
    if (!number) return;
    let btsValue = null;
    // 1) Clés exactes
    for (const key of btsKeys) {
      const val = row[key];
      if (val !== undefined && val !== null && String(val).trim() !== "") {
        btsValue = String(val).trim();
        break;
      }
    }
    // 2) Fallback insensible à la casse
    if (!btsValue) {
      const fallbackKey = Object.keys(row).find((k) =>
        k
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
          .includes("bts"),
      );
      if (fallbackKey) {
        const val = String(row[fallbackKey]).trim();
        if (val) btsValue = val;
      }
    }
    if (btsValue) result[number] = btsValue;
  });
  return result;
}

// Transforme le contenu d'un fichier CSV en tableau d'objets.

function csvParse(text) {
  // Supprime le BOM UTF-8 que Excel ajoute parfois en debut de fichier
  const cleaned = text.replace(/^\uFEFF/, "");
  const lines = cleaned.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const sep = lines[0].includes(";") ? ";" : ",";
  // Strip BOM + guillemets eventuels autour des en-têtes
  const headers = lines[0].split(sep).map((h) =>
    h
      .trim()
      .replace(/^["'\uFEFF]+|["']+$/g, "")
      .trim(),
  );
  return lines.slice(1).map((line) => {
    const cols = line
      .split(sep)
      .map((v) => v.trim().replace(/^"|"$/g, "").trim());
    return headers.reduce((acc, header, i) => {
      acc[header] = cols[i] ?? "";
      return acc;
    }, {});
  });
}

// Transforme des lignes d'objets en texte CSV.

function csvStringify(rows, columns) {
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [columns.join(";")]
    .concat(rows.map((row) => columns.map((col) => escape(row[col])).join(";")))
    .join("\n");
}

// Retourne la liste des cartes visibles après filtres et contrôle d'accès.

function visibleCards() {
  try {
    refreshStatuses();
    const search = (el("cardsSearch")?.value || "").trim().toLowerCase();
    const type = el("cardsType")?.value || "";
    const district = el("cardsDistrict")?.value || "";
    const dateReceptionDebut = el("cardsDateReceptionDebut")?.value || "";
    const dateReceptionFin = el("cardsDateReceptionFin")?.value || "";

    return (state?.cards || [])
      .filter(
        (card) =>
          !card.archived &&
          hasScope(card) &&
          isNouvelleCard(card) &&
          card.status === "Nouvelle carte",
      )
      .filter((card) => {
        const hay = [
          card.number,
          card.owner,
          card.station,
          card.codeClient,
          card.company,
          card.district,
          card.type,
        ]
          .join(" ")
          .toLowerCase();
        return (
          (!search || hay.includes(search)) &&
          (!type || card.type === type) &&
          (!district || card.district === district) &&
          (!dateReceptionDebut || (card.createdAt && card.createdAt >= dateReceptionDebut)) &&
          (!dateReceptionFin || (card.createdAt && card.createdAt <= dateReceptionFin))
        );
      });
  } catch (error) {
    console.error("Erreur visibleCards:", error);
    return [];
  }
}

// Retourne la liste des TPE visibles après filtres et contrôle d'accès.

function visibleTpe() {
  const search = (el("tpeSearch")?.value || "").trim().toLowerCase();
  const status = el("tpeStatus")?.value || "";
  const station = el("tpeStation")?.value || "";
  return state.tpe
    .filter((item) =>
      hasScope({
        district: item.station,
        station: item.station,
        location: item.location,
      }),
    )
    .filter((item) => {
      const hay = [
        item.serial,
        item.model,
        item.station,
        item.location,
        item.status,
      ]
        .join(" ")
        .toLowerCase();
      return (
        (!search || hay.includes(search)) &&
        (!status || item.status === status) &&
        (!station || item.station === station)
      );
    });
}

// Adapte l'interface selon les droits du profil connecté.
function syncRoleUI() {
  document.querySelectorAll(".requires-write").forEach((node) => {
    node.style.display = isWriteAllowed() ? "" : "none";
    node.disabled = !isWriteAllowed();
  });
  document.querySelectorAll(".requires-commande-write").forEach((node) => {
    node.style.display = canCreateCommande() ? "" : "none";
    node.disabled = !canCreateCommande();
  });
  document.querySelectorAll(".admin-only").forEach((node) => {
    node.style.display = isDpeAdmin() ? "" : "none";
  });
  if (!isWriteAllowed()) cardsSelectionMode = false;
  if (!isDpeAdmin() && typeof renouvCardsSelectionMode !== "undefined")
    renouvCardsSelectionMode = false;
  const selectTh = el("cardsSelectTh");
  if (selectTh)
    selectTh.style.display =
      isWriteAllowed() && cardsSelectionMode ? "" : "none";
  const renouvSelectTh = el("renouvCardsSelectTh");
  if (renouvSelectTh) renouvSelectTh.style.display = "none";
  const bulkBar = el("cardsBulkBar");
  if (bulkBar) bulkBar.style.display = "none";
  updateCardsActionsHeader();
}

// Met à jour l'en-tête de la colonne des actions des cartes.

function updateCardsActionsHeader() {
  const actionsTh = document.querySelector(
    "#naftalcard-nouvelle-page table thead tr th:last-child",
  );
  if (!actionsTh) return;
  actionsTh.innerHTML = "Actions";
}

// Définit l'utilisateur connecté et rafraîchit l'interface.

function setCurrentUser(user) {
  currentUser = user;
  el("currentUserName").textContent = user.name;
  el("currentUserRole").textContent = ROLE_LABELS[user.role] || user.role;
  el("avatar").textContent =
    user.initials ||
    user.name
      .split(" ")
      .map((x) => x[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  syncRoleUI();
  populateScopeFilters();
  renderAll();
}

// La fonction était causant le problème: le champ email est maintenant un input text normal
function populateLoginUsers() {
  // Plus d'utilisation du select avec users hardcodés - on garde le champ email standard
  return;
}

// Remplit les listes de filtres avec les stations et districts disponibles.

async function populateScopeFilters() {
  try {
    const stations = await API.tpe.getStations();

    const districts = [
      ...new Set(stations.map((s) => s.district).filter(Boolean)),
    ].sort();
    const stationNames = stations.map((s) => s.name).sort();
    state.stations = stations.map(normalizeStationRecord);

    const fillSelect = (id, values, placeholder) => {
      const node = el(id);
      if (!node) return;
      const current = node.value;
      node.innerHTML =
        `<option value="">${placeholder}</option>` +
        values
          .map(
            (v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`,
          )
          .join("");
      node.value = values.includes(current) ? current : "";
    };

    fillSelect("cardsDistrict", districts, "Tous districts");
    fillSelect("renouvCardsDistrict", districts, "Tous districts");
    fillSelect("tpeStation", stationNames, "Toutes stations");
  } catch (error) {
    console.error("Failed to load scope filters:", error);
  }
}

// Déduit un libellé d'action lisible à partir du statut d'une carte.

function inferAction(card) {
  if (card.status === "En circulation") return "Carte remise / active";
  if (card.status === "En cours traitement")
    return "Transfert vers DCSI / district";
  return card.status;
}

// Affiche le résumé chiffré des TPE visibles.

async function renderTpeSummary() {
  const rows = await visibleTpe();
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
  el("tpeSummary").innerHTML = chunks
    .map(
      ([label, value, icon]) =>
        `<span class="chip"><i class="${icon}"></i>${escapeHtml(label)} : ${value}</span>`,
    )
    .join("");
}

// Affiche le tableau principal des TPE.******************************************************

async function renderTpe() {
  await renderTpeSummary();
  const rows = await visibleTpe();
  el("tpeBody").innerHTML =
    rows
      .map(
        (item) => `
    <tr>
      <td>${escapeHtml(item.serial)}</td>
      <td>${escapeHtml(item.model)}</td>
      <td>${badge(item.status)}</td>
      <td>${escapeHtml(item.station)}</td>
      <td>${formatDate(item.maintenanceDate)}</td>
      <td>${escapeHtml(item.location)}</td>
      <td>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn btn-ghost btn-sm" title="Voir" aria-label="Voir" onclick="viewTpe('${item.id}')"><i class="fa-solid fa-eye"></i></button>
          ${isWriteAllowed() ? `<button class="btn btn-ghost btn-sm" title="Etat" aria-label="Etat" onclick="changeTpeStatus('${item.id}')"><i class="fa-solid fa-pen"></i></button>` : ""}
        </div>
      </td>
    </tr>
  `,
      )
      .join("") || '<tr><td colspan="7" class="muted">Aucun TPE.</td></tr>';
}

// Affiche l'historique des événements liés aux TPE.*******************************************

function renderTpeSuivi() {
  const search = (el("tpeSuiviSearch")?.value || "").trim().toLowerCase();
  const rows = state.tpeHistory.filter((item) => {
    const hay = [item.serial, item.action, item.detail, item.user]
      .join(" ")
      .toLowerCase();
    return !search || hay.includes(search);
  });
  el("tpeSuiviBody").innerHTML =
    rows
      .map(
        (item) => `
    <tr>
      <td>${formatDateTime(item.date)}</td>
      <td>${escapeHtml(item.serial)}</td>
      <td>${escapeHtml(item.action)}</td>
      <td>${escapeHtml(item.detail)}</td>
      <td>${escapeHtml(item.user)}</td>
    </tr>
  `,
      )
      .join("") ||
    '<tr><td colspan="5" class="muted">Aucun événement TPE.</td></tr>';
}

// Affiche la liste des décharges liées aux TPE.

function renderTpeDecharges() {
  const rows = state.decharges.filter((d) => d.assetType === "TPE");
  el("tpeDechargesBody").innerHTML =
    rows
      .map(
        (d) => `
    <tr>
      <td>${escapeHtml(d.reference)}</td>
      <td>${escapeHtml(d.object)}</td>
      <td>${escapeHtml(d.from)}</td>
      <td>${escapeHtml(d.to)}</td>
      <td>${formatDate(d.date)}</td>
      <td>${badge(d.status)}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="downloadStoredPdf('${d.id}')"><i class="fa-solid fa-file-pdf"></i>Télécharger</button></td>
    </tr>
  `,
      )
      .join("") ||
    '<tr><td colspan="7" class="muted">Aucune décharge TPE.</td></tr>';
}

// Affiche la liste des profils utilisateurs de démonstration.

function renderUsers() {
  const users = state.users || USERS;
  el("usersBody").innerHTML =
    users
      .map((user) => {
        const disabled = user.disabled ? true : false;
        const statusBadge = disabled
          ? '<span class="badge b-danger">Désactivé</span>'
          : '<span class="badge b-success">Actif</span>';
        return `<tr style="${disabled ? "opacity:.55;" : ""}">
      <td>${escapeHtml(user.name)}</td>
      <td>${escapeHtml(user.username || "—")}</td>
      <td><span class="badge b-info">${escapeHtml(ROLE_LABELS[user.role] || user.role)}</span></td>
      <td>${escapeHtml(user.structure || "—")}</td>
      <td>${statusBadge}</td>
      <td>
        <div style="display:flex;gap:5px;flex-wrap:wrap;">
          <button class="btn btn-ghost btn-sm" title="Modifier rôle" onclick="openEditUserModal('${user.id}')"><i class="fa-solid fa-user-gear"></i></button>
          ${
            !disabled
              ? `<button class="btn btn-danger btn-sm" onclick="toggleUserAccount('${user.id}',true)"><i class="fa-solid fa-user-slash"></i>Désactiver</button>`
              : `<button class="btn btn-success btn-sm" onclick="toggleUserAccount('${user.id}',false)"><i class="fa-solid fa-user-check"></i>Activer</button>`
          }
        </div>
      </td>
    </tr>`;
      })
      .join("") ||
    '<tr><td colspan="6" class="muted">Aucun utilisateur.</td></tr>';
}

function resetRequestBadge(status) {
  const labels = {
    EN_ATTENTE: "En attente",
    VALIDEE: "Validee",
    REFUSEE: "Refusee",
    REINITIALISEE: "Reinitialisee",
  };
  const classes = {
    EN_ATTENTE: "b-warning",
    VALIDEE: "b-info",
    REFUSEE: "b-danger",
    REINITIALISEE: "b-success",
  };
  return `<span class="badge ${classes[status] || "b-neutral"}">${escapeHtml(labels[status] || status || "Inconnu")}</span>`;
}

function getResetRequestUserName(request) {
  const user = request?.utilisateur || {};
  return (
    `${user.prenom || ""} ${user.nom || ""}`.trim() ||
    user.email ||
    request.email_demande ||
    "Utilisateur"
  );
}

function renderResetRequests() {
  const body = el("resetRequestsBody");
  if (!body) return;

  if (!isDpeAdmin()) {
    body.innerHTML =
      '<tr><td colspan="7" class="muted">Acces reserve a l administrateur.</td></tr>';
    return;
  }

  const requests = Array.isArray(state.resetRequests) ? state.resetRequests : [];
  body.innerHTML =
    requests
      .map((request) => {
        const user = request.utilisateur || {};
        const structure = user.structure?.nom_structure || "-";
        const actions = [
          request.statut === "EN_ATTENTE"
            ? `<button class="btn btn-success btn-sm" onclick="validateResetRequest(${request.id_demande})"><i class="fa-solid fa-check"></i>Valider</button>`
            : "",
          `<button class="btn btn-danger btn-sm" onclick="refuseResetRequest(${request.id_demande})"><i class="fa-solid fa-xmark"></i>Refuser</button>`,
          `<button class="btn btn-primary btn-sm" onclick="openResetPasswordRequestModal(${request.id_demande})"><i class="fa-solid fa-key"></i>Reinitialiser le mot de passe</button>`,
        ]
          .filter(Boolean)
          .join("");

        return `<tr>
      <td>${formatDateTime(request.date_demande)}</td>
      <td>${escapeHtml(getResetRequestUserName(request))}</td>
      <td>${escapeHtml(request.email_demande || user.email || "-")}</td>
      <td><span class="badge b-info">${escapeHtml(ROLE_LABELS[user.role] || user.role || "-")}</span></td>
      <td>${escapeHtml(structure)}</td>
      <td>${resetRequestBadge(request.statut)}</td>
      <td><div class="reset-actions">${actions}</div></td>
    </tr>`;
      })
      .join("") ||
    '<tr><td colspan="7" class="muted">Aucune demande en attente.</td></tr>';
}

async function refreshPasswordResetRequests(silent = false) {
  if (!isDpeAdmin()) {
    showToast("Action reservee a l administrateur.", true);
    return;
  }

  try {
    const response = await API.auth.listPasswordResetRequests();
    state.resetRequests = Array.isArray(response?.requests)
      ? response.requests
      : [];
    renderResetRequests();
    if (!silent) showToast("Demandes actualisees.");
  } catch (err) {
    showToast(
      err?.error || err?.message || "Impossible de charger les demandes.",
      true,
    );
  }
}

async function validateResetRequest(id) {
  if (!isDpeAdmin()) {
    showToast("Action reservee a l administrateur.", true);
    return;
  }

  try {
    await API.auth.validatePasswordResetRequest(id);
    await refreshPasswordResetRequests(true);
    showToast("Demande validee.");
  } catch (err) {
    showToast(err?.error || err?.message || "Validation impossible.", true);
  }
}

function refuseResetRequest(id) {
  if (!isDpeAdmin()) {
    showToast("Action reservee a l administrateur.", true);
    return;
  }

  const request = (state.resetRequests || []).find(
    (item) => Number(item.id_demande) === Number(id),
  );
  if (!request) return;

  openModal(
    "Refuser la demande",
    `
    <div class="form-grid">
      <div class="field full">
        <label>Utilisateur</label>
        <input value="${escapeHtml(getResetRequestUserName(request))}" disabled>
      </div>
      <div class="field full">
        <label>Motif (optionnel)</label>
        <textarea id="resetRefuseComment" rows="3" placeholder="Motif de refus"></textarea>
      </div>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
     <button class="btn btn-danger" onclick="confirmRefuseResetRequest(${id})"><i class="fa-solid fa-xmark"></i>Refuser</button>`,
  );
}

async function confirmRefuseResetRequest(id) {
  const commentaire = el("resetRefuseComment")?.value.trim() || "";
  try {
    await API.auth.refusePasswordResetRequest(id, commentaire);
    closeModal();
    await refreshPasswordResetRequests(true);
    showToast("Demande refusee.");
  } catch (err) {
    showToast(err?.error || err?.message || "Refus impossible.", true);
  }
}

function openResetPasswordRequestModal(id) {
  if (!isDpeAdmin()) {
    showToast("Action reservee a l administrateur.", true);
    return;
  }

  const request = (state.resetRequests || []).find(
    (item) => Number(item.id_demande) === Number(id),
  );
  if (!request) return;

  openModal(
    "Reinitialiser le mot de passe",
    `
    <div class="form-grid">
      <div class="field full">
        <label>Utilisateur</label>
        <input value="${escapeHtml(getResetRequestUserName(request))}" disabled>
      </div>
      <div class="field full">
        <label>Email</label>
        <input value="${escapeHtml(request.email_demande || request.utilisateur?.email || "")}" disabled>
      </div>
      <div class="field">
        <label>Nouveau mot de passe *</label>
        <input id="adminResetPassword" type="password" placeholder="Nouveau mot de passe">
      </div>
      <div class="field">
        <label>Confirmation *</label>
        <input id="adminResetPasswordConfirm" type="password" placeholder="Confirmer le mot de passe">
      </div>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
     <button class="btn btn-primary" onclick="confirmResetPasswordRequest(${id})"><i class="fa-solid fa-key"></i>Reinitialiser</button>`,
  );
}

async function confirmResetPasswordRequest(id) {
  const password = el("adminResetPassword")?.value || "";
  const confirm = el("adminResetPasswordConfirm")?.value || "";

  if (password.length < 6) {
    showToast("Le mot de passe doit contenir au moins 6 caracteres.", true);
    return;
  }
  if (password !== confirm) {
    showToast("Les mots de passe ne correspondent pas.", true);
    return;
  }

  try {
    await API.auth.resetPasswordFromRequest(id, password);
    closeModal();
    await refreshPasswordResetRequests(true);
    showToast("Mot de passe reinitialise.");
  } catch (err) {
    showToast(
      err?.error || err?.message || "Reinitialisation impossible.",
      true,
    );
  }
}

async function openAddUserModal() {
  if (!canManageUsers()) {
    showToast("Acces refuse pour ce profil.", true);
    return;
  }
  // Charger les structures pour alimenter le dropdown id_structure.
  let structures = [];
  try {
    const resp = await API.structure.list();
    structures = resp?.structures || [];
  } catch (err) {
    showToast(err?.message || "Impossible de charger les structures.", true);
    return;
  }
  const structureOptions = structures
    .map(
      (s) =>
        `<option value="${s.idstructure}">${escapeHtml(s.nom_structure)} (${escapeHtml(s.code)})</option>`,
    )
    .join("");

  const roleOptions = [
    "ADMIN_DPE",
    "MEMBRE_DPE",
    "CONSULTANT_DPE",
    "MEMBRE_DISTRICT",
    "CONSULTANT_DISTRICT",
    "MEMBRE_ANTENNE",
    "CONSULTANT_ANTENNE",
    "MEMBRE_AGENCE",
    "CONSULTANT_AGENCE",
  ]
    .map((r) => `<option value="${r}">${r}</option>`)
    .join("");

  openModal(
    "Ajouter un utilisateur",
    `
    <div class="form-grid">
      <div class="field"><label>Prénom *</label><input id="newUserPrenom" placeholder="Ex: Ahmed"></div>
      <div class="field"><label>Nom *</label><input id="newUserNom" placeholder="Ex: Benali"></div>
      <div class="field"><label>Email *</label><input id="newUserEmail" type="email" placeholder="ex@naftal.dz"></div>
      <div class="field"><label>Mot de passe *</label><input id="newUserPassword" type="password" placeholder="••••••••"></div>
      <div class="field"><label>Rôle *</label><select id="newUserRole">${roleOptions}</select></div>
      <div class="field"><label>Structure *</label><select id="newUserStructure">${structureOptions}</select></div>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
     <button class="btn btn-primary" onclick="confirmAddUser()"><i class="fa-solid fa-user-plus"></i>Créer le compte</button>`,
  );
}

async function confirmAddUser() {
  if (!canManageUsers()) {
    showToast("Acces refuse pour ce profil.", true);
    return;
  }
  const prenom = el("newUserPrenom")?.value.trim();
  const nom = el("newUserNom")?.value.trim();
  const email = el("newUserEmail")?.value.trim();
  const mot_de_passe = el("newUserPassword")?.value;
  const role = el("newUserRole")?.value;
  const id_structure = parseInt(el("newUserStructure")?.value, 10);

  if (!prenom || !nom || !email || !mot_de_passe || !role || !id_structure) {
    showToast("Tous les champs sont obligatoires.", true);
    return;
  }

  try {
    await API.auth.register({
      nom,
      prenom,
      email,
      mot_de_passe,
      role,
      id_structure,
    });
  } catch (err) {
    showToast(
      err?.error || err?.message || "Erreur lors de la création du compte.",
      true,
    );
    return;
  }

  addAudit("Ajout utilisateur", email, `Rôle: ${role}`);
  closeModal();
  await loadState();
  renderUsers();
  showToast(`Compte créé pour ${prenom} ${nom}.`);
}

function openEditUserModal(id) {
  if (!canManageUsers()) {
    showToast("Acces refuse pour ce profil.", true);
    return;
  }
  const users = state.users || USERS;
  const user = users.find((u) => u.id === id);
  if (!user) return;
  openModal(
    `Modifier — ${escapeHtml(user.name)}`,
    `
    <div class="form-grid">
      <div class="field full"><label>Nom complet</label><input id="editUserName" value="${escapeHtml(user.name)}"></div>
      <div class="field"><label>Rôle</label>
        <select id="editUserRole">
          <option value="admin_dpe" ${user.role === "admin_dpe" ? "selected" : ""}>Administrateur DPE</option>
          <option value="membre_dpe" ${user.role === "membre_dpe" ? "selected" : ""}>Membre DPE</option>
          <option value="consultant_dpe" ${user.role === "consultant_dpe" ? "selected" : ""}>Consultant DPE</option>
          <option value="membre_district" ${user.role === "membre_district" ? "selected" : ""}>Membre District</option>
          <option value="consultant_district" ${user.role === "consultant_district" ? "selected" : ""}>Consultant District</option>
          <option value="membre_agence" ${user.role === "membre_agence" ? "selected" : ""}>Membre Agence</option>
          <option value="consultant_agence" ${user.role === "consultant_agence" ? "selected" : ""}>Consultant Agence</option>
          <option value="membre_antenne" ${user.role === "membre_antenne" ? "selected" : ""}>Membre Antenne</option>
          <option value="consultant_antenne" ${user.role === "consultant_antenne" ? "selected" : ""}>Consultant Antenne</option>

        </select>
      </div>
      <div class="field"><label>Structure</label><input id="editUserStructure" value="${escapeHtml(user.structure || "")}"></div>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
     <button class="btn btn-primary" onclick="confirmEditUser('${id}')"><i class="fa-solid fa-floppy-disk"></i>Enregistrer</button>`,
  );
}

function confirmEditUser(id) {
  if (!canManageUsers()) {
    showToast("Acces refuse pour ce profil.", true);
    return;
  }
  if (!state.users) state.users = [...USERS];
  const user = state.users.find((u) => u.id === id);
  if (!user) return;
  user.name = el("editUserName")?.value.trim() || user.name;
  user.role = el("editUserRole")?.value || user.role;
  user.structure = el("editUserStructure")?.value.trim() || user.structure;
  addAudit(
    "Modification utilisateur",
    user.username,
    `Nouveau rôle: ${user.role}`,
  );
  saveState();
  closeModal();
  renderUsers();
  showToast("Utilisateur mis à jour.");
}

async function toggleUserAccount(id, disable) {
  if (!canManageUsers()) {
    showToast("Acces refuse pour ce profil.", true);
    return;
  }
  if (!state.users) state.users = [];
  const user = state.users.find((u) => String(u.id) === String(id));
  if (!user) return;
  const backendId = user.backendId || user.id;

  try {
    if (disable) {
      // Suppression logique côté backend (utilisateur.supprime = true).
      await API.auth.deleteUser(backendId);
    } else {
      // Réactiver = revalider l'utilisateur (ADMIN_DPE uniquement).
      await API.auth.validateUser(backendId);
    }
  } catch (err) {
    showToast(
      err?.error || err?.message || "Erreur lors de la mise à jour du compte.",
      true,
    );
    return;
  }

  addAudit(
    disable ? "Désactivation compte" : "Réactivation compte",
    user.username,
    "",
  );
  await loadState();
  renderUsers();
  showToast(
    disable
      ? `Compte ${user.name} désactivé.`
      : `Compte ${user.name} réactivé.`,
  );
}

// Affiche le journal d'audit des dernières actions.

function renderAudit() {
  el("auditBody").innerHTML = state.audit
    .slice(0, 80)
    .map(
      (item) => `
    <tr>
      <td>${formatDateTime(item.date)}</td>
      <td>${escapeHtml(item.action)}</td>
      <td>${escapeHtml(item.target)}</td>
      <td>${escapeHtml(item.user)}</td>
    </tr>
  `,
    )
    .join("");
}

// Rafraîchit l'ensemble des vues de l'application.

async function renderAll() {
  refreshStatuses();
  await Promise.allSettled([
    renderDashboard(),
    renderCards(),
    renderCardsSuivi(),
    renderCardsDecharges(),
    renderCardsArchive(),
    renderTpe(),
    renderTpeSuivi(),
    renderTpeDecharges(),
    renderStations(),
    renderUsers(),
    renderResetRequests(),
    renderAudit(),
  ]);
    
  const cardAlerts = state.cards.filter((c) =>
    ["Expire bientôt", "Expirée", "Défectueuse", "Perdue", "Volée"].includes(c.status),
  ).length;
  const tpeAlerts = (state.tpe || []).filter((t) =>
    ["En panne", "Volé"].includes(t.status),
  ).length;
  el("notifCount").textContent = String(cardAlerts + tpeAlerts);

}

// Affiche un message temporaire en bas de l'écran.

function showToast(message, isError = false) {
  const toast = el("toast");
  const text = el("toastText");
  if (!toast || !text) return;
  clearTimeout(toastTimer);
  text.textContent = message;
  toast.style.display = "flex";
  toast.style.borderColor = isError ? "rgba(220,53,69,.35)" : "";
  toastTimer = setTimeout(() => {
    toast.style.display = "none";
    toast.style.borderColor = "";
  }, 2800);
}

// Met à jour l'icône du bouton de thème en fonction du mode actuel.
function updateThemeIcon() {
  const icon = document.querySelector("#themeBtn i");

  if (!icon) return;

  const isLight = document.body.classList.contains("light");

  icon.className = isLight
    ? "fa-solid fa-sun"
    : "fa-solid fa-moon";
}

function toggleTheme() {
  document.body.classList.toggle("light");

  updateThemeIcon(); // 👈 AJOUT
}

// Récupère rapidement un élément HTML par son identifiant.

function el(id) {
  return document.getElementById(id);
}

// Ouvre une fenêtre modale avec un titre, un contenu et un pied de page.

function openModal(title, bodyHtml, footerHtml = "") {
  el("modalTitle").textContent = title;
  el("modalBody").innerHTML = bodyHtml;
  el("modalFooter").innerHTML = footerHtml;
  el("modalOverlay").style.display = "flex";
}

// Ferme la fenêtre modale active et nettoie son contenu.

function closeModal() {
  el("modalOverlay").style.display = "none";
  el("modalBody").innerHTML = "";
  el("modalFooter").innerHTML = "";
}

// Change la page affichée dans l'interface et active le lien correspondant.

function go(page, linkNode) {
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.remove("active"));
  document
    .querySelectorAll(".nav-link")
    .forEach((n) => n.classList.remove("active"));
  const pageNode = el(`${page}-page`);
  if (pageNode) pageNode.classList.add("active");
  const navNode = linkNode || document.querySelector(`[data-page="${page}"]`);
  if (navNode) navNode.classList.add("active");

  // Initialiser la carte Algérie quand on arrive sur le dashboard
  if (page === "dashboard") {
    setTimeout(initAlgeriaMap, 100);
  }
}

// Initialise les événements de navigation du menu latéral.

function setupNavigation() {
  document.querySelectorAll(".nav-link[data-page]").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (event.target.closest(".nav-caret")) return;
      const page = link.getAttribute("data-page");
      if (page === "admin" && !canManageUsers()) {
        showToast("Acces refuse pour ce profil.", true);
        return;
      }
      go(page, link);
    });
  });
  document.querySelectorAll("[data-toggle]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const target = el(btn.getAttribute("data-toggle"));
      if (!target) return;
      const visible = target.style.display !== "none";
      target.style.display = visible ? "none" : "block";
      const icon = btn.querySelector("i");
      if (icon)
        icon.style.transform = visible ? "rotate(0deg)" : "rotate(90deg)";
    });
  });
}

// Initialise les interactions de l'en-tête (thème, profil, notifications, menu).

function setupHeaderUi() {
  el("themeBtn")?.addEventListener("click", () => {
    document.body.classList.toggle("dark-mode");
    memoryTheme = document.body.classList.contains("dark-mode")
      ? "dark"
      : "light";
  });
  if (memoryTheme === "dark") document.body.classList.add("dark-mode");

  el("profileBtn")?.addEventListener("click", () =>
    el("profileDropdown")?.classList.toggle("open"),
  );
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".profile-menu"))
      el("profileDropdown")?.classList.remove("open");
  });
  el("notifBtn")?.addEventListener("click", openAlertsModal);
  el("burgerBtn")?.addEventListener("click", () => {
    const sidebar = el("sidebar");
    if (!sidebar) return;
    sidebar.classList.toggle("open");
  });
}

// Initialise les imports de fichiers CSV pour les cartes

async function uploadCardsImport(file) {
  if (!requireWrite()) return;
  showToast("Import en cours…");
  try {
    const result = await API.cartes.import(file);
    const r = result?.resultats || {};
    const msg =
      result?.message ||
      `Import terminé. ${r.inseres || 0} traitées, ${(r.erreurs || []).length} erreurs.`;
    await loadState();
    renderAll();
    showToast(msg, !result?.success);
    if (Array.isArray(r.erreurs) && r.erreurs.length) {
      console.warn("Lignes en erreur:", r.erreurs);
    }
  } catch (err) {
    console.error("Import cartes échoué:", err);
    showToast(err?.message || "Échec de l'import.", true);
  }
}

async function uploadRenouvCardsImport(file) {
  if (!requireWrite()) return;
  showToast("Import en cours…");

  // ① Lire le CSV côté client pour extraire les BTS AVANT l'envoi au backend
  // (le backend ne stocke pas le BTS en base, on le cache localement)
  try {
    const text = await file.text();
    const newBts = extractBtsFromCsv(text);
    if (Object.keys(newBts).length) {
      // Fusionner avec le cache existant
      const cache = getRenouvBtsCache();
      Object.assign(cache, newBts);
      saveRenouvBtsCache(cache);
      console.log(
        `[BTS cache] ${Object.keys(newBts).length} valeur(s) BTS extraite(s) du fichier.`,
        newBts,
      );
    }
  } catch (e) {
    console.warn("[BTS cache] Impossible de lire le fichier côté client:", e);
  }

  // ② Envoyer le fichier au backend pour l'import en base
  try {
    const result = await API.cartes.importRenouv(file);
    const r = result?.resultats || {};
    const msg =
      result?.message ||
      `Import terminé. ${r.inseres || 0} traitées, ${(r.erreurs || []).length} erreurs.`;

    // ③ Recharger depuis la DB puis réappliquer le cache BTS
    await loadState();
    // loadState() appelle déjà applyRenouvBtsCacheToCards en interne

    renderRenouvCards();
    showToast(msg, !result?.success);
    if (Array.isArray(r.erreurs) && r.erreurs.length) {
      console.warn("Lignes en erreur:", r.erreurs);
    }
  } catch (err) {
    console.error("Import renouv cartes échoué:", err);
    showToast(err?.message || "Échec de l'import.", true);
  }
}

function setupImports() {
  el("cardsImportInput")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadCardsImport(file);
    e.target.value = "";
  });

  el("renouvCardsImportInput")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadRenouvCardsImport(file); //  fonction dédiée pour le renouvellement
    e.target.value = "";
  });

  el("tpeImportInput")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    importTpeFromCsv(text);
    e.target.value = "";
  });
}

// Bloque l'action si le profil courant est en lecture seule.

function requireWrite() {
  if (isWriteAllowed()) return true;
  showToast("Mode lecture seule pour ce profil.", true);
  return false;
}

function requireCreateCommande() {
  if (canCreateCommande()) return true;
  showToast("Action non autorisee pour ce profil.", true);
  return false;
}

// Effet visuel pendant la connexion
function setLoginLoading(loading) {
  const btn = el("loginBtn");
  if (loading) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Connexion...';
  } else {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i>Se connecter';
  }
}

// Sauvegarde/charge la session
function saveSession(userId) {
  if (el("loginRemember").checked) {
    localStorage.setItem("cbnnn_user", userId);
    localStorage.setItem("cbnnn_session", Date.now());
  } else {
    localStorage.removeItem("cbnnn_user");
    localStorage.removeItem("cbnnn_session");
  }
}

function loadSession() {
  // Pas de session persistante pour securite - login obligatoire a chaque refresh
  localStorage.removeItem("cbnnn_user");
  localStorage.removeItem("cbnnn_session");
  return null;
}

// Effectue la connexion avec le profil choisi et le mot de passe saisi.
async function doLogin() {
  const emailInput = el("loginUser");
  const passInput = el("loginPass");
  const errorEl = el("login-error");

  // reset
  errorEl.textContent = "";
  emailInput.classList.remove("input-error");
  passInput.classList.remove("input-error");

  const email = emailInput.value.trim().toLowerCase();
  const password = passInput.value;

  if (!email || !password) {
    const msg = "Veuillez saisir votre email et mot de passe.";
    showToast(msg, true);

    errorEl.textContent = msg;

    if (!email) emailInput.classList.add("input-error");
    if (!password) passInput.classList.add("input-error");

    return;
  }

  setLoginLoading(true);

  try {
    const data = await API.auth.login(email, password);

    const user = data.user || {};
    const prenom = user.prenom || "";
    const nom = user.nom || "";
    const fullName = `${prenom} ${nom}`.trim() || user.email || "Utilisateur";
    const initials =
      `${prenom[0] || ""}${nom[0] || ""}`.toUpperCase() ||
      (user.email ? user.email[0].toUpperCase() : "U");

    currentUser = {
      id: user.id,
      name: fullName,
      email: user.email,
      role: user.role,
      initials,
    };

    saveSession(user.id);
    await loadState();
    const hydrated = (state?.users || []).find(
      (u) => String(u.email || "").toLowerCase() === email,
    );
    if (hydrated) {
      currentUser = {
        ...currentUser,
        structure: hydrated.structure || currentUser.structure,
        id_structure: hydrated.id_structure ?? currentUser.id_structure,
      };
    }

    el("loginScreen").style.display = "none";
    el("navbar").style.display = "flex";
    el("sidebar").style.display = "block";
    el("main").style.display = "block";

    setCurrentUser(currentUser);
    addAudit("Connexion", "Session", `Connexion de ${currentUser.name}`);
    setTimeout(initAlgeriaMap, 500);
    showToast(`Bienvenue ${currentUser.name}`);
  } catch (error) {
    console.error("doLogin error:", error);

    const msg =
      error.error || error.message || "Email ou mot de passe invalide.";

    showToast(msg, true);
    errorEl.textContent = msg;

    // champs en rouge
    emailInput.classList.add("input-error");
    passInput.classList.add("input-error");
  } finally {
    setLoginLoading(false);
  }
}


//hna
// Affiche le formulaire de demande (le prompt)
function showForgotPasswordForm() {
  const emailInput = el("loginUser");
  const errorEl = el("login-error");
  const email = (emailInput?.value || "").trim().toLowerCase();

  if (!email) {
    const msg = "Saisissez votre email, puis relancez la demande.";
    showToast(msg, true);
    if (errorEl) errorEl.textContent = msg;
    emailInput?.classList.add("input-error");
    emailInput?.focus();
    return;
  }

  API.auth.forgotPassword(email)
    .then((response) => {
      emailInput?.classList.remove("input-error");
      if (errorEl) errorEl.textContent = "";
      showToast(
        response?.message ||
          "Votre demande de reinitialisation a ete transmise a l'administrateur.",
      );
    })
    .catch((error) => {
      showToast(
        error?.error || error?.message || "Impossible de creer la demande.",
        true,
      );
    });
}

// Déconnecte l'utilisateur courant et réaffiche l'écran de connexion.

async function logout() {
  if (currentUser)
    addAudit("Déconnexion", "Session", `Déconnexion de ${currentUser.name}`);

  await API.auth.logout();

  currentUser = null;
  localStorage.removeItem("cbnnn_user");
  localStorage.removeItem("cbnnn_session");
  el("loginScreen").style.display = "flex";
  el("loginPass").value = "";
  el("loginRemember").checked = false;
  el("navbar").style.display = "none";
  el("sidebar").style.display = "none";
  el("main").style.display = "none";
  closeModal();
  showToast("Vous avez été déconnecté.");
}

// Déconnecte l'utilisateur pour permettre un changement de profil.

function switchUser() {
  logout();
  showToast("Choisissez un autre profil.");
}

// Ouvre la fiche du profil actuellement connecté.

function openMyProfile() {
  if (!currentUser) return;
  openModal(
    "Mon profil",
    `
    <div class="form-grid">
      <div class="field"><label>Nom</label><input disabled value="${escapeHtml(currentUser.name)}"></div>
      <div class="field"><label>Rôle</label><input disabled value="${escapeHtml(ROLE_LABELS[currentUser.role])}"></div>
      <div class="field full"><label>Structure</label><input disabled value="${escapeHtml(currentUser.structure)}"></div>
    </div>
    <p style="margin-top:12px;" class="muted">RBAC appliqué : Admin = acces complet, Membre/District = restitution + consultation, Lecteur = consultation uniquement.</p>`,
    `<button class="btn btn-primary" onclick="closeModal()">Fermer</button>`,
  );
}

// Déclenche la sélection d'un fichier CSV pour importer des cartes.

function triggerCardsImport() {
  if (!requireWrite()) return;
  el("cardsImportInput").click();
}

// Déclenche la sélection d'un fichier CSV pour importer des cartes renouvelées.
function triggerRenouvCardsImport() {
  if (!requireWrite()) return;
  el("renouvCardsImportInput").click();
}

// Déclenche la sélection d'un fichier CSV pour importer des TPE.

function triggerTpeImport() {
  if (!requireWrite()) return;
  el("tpeImportInput").click();
}

// Importe des cartes à partir du texte d'un fichier CSV.

state = {
  cards: [],
  tpe: [],
  stations: [],
  decharges: [],
  reports: [],
  audit: [],
  archives: [],
  cardHistory: [],
  tpeHistory: [],
  commandes: [],
  sequence: { type1: 1, type2: 1, type3: 1, tpe: 1, report: 1, commande: 1 },
};

// Initialise la carte d'Algérie pour le dashboard
function initAlgeriaMap() {
  const mapContainer = el("algeriaMap");
  if (!mapContainer) {
    console.warn("Conteneur de carte non trouvé");
    return;
  }

  // Vérifier si Leaflet est chargé
  if (typeof L === "undefined") {
    console.error("Leaflet n'est pas chargé");
    return;
  }

  try {
    // Créer la carte centrée sur l'Algérie
    const map = L.map("algeriaMap").setView([28.0339, 1.6596], 5);

    // Ajouter la couche de tuiles OpenStreetMap
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    // Stocker la référence de la carte pour utilisation ultérieure
    window.algeriaMap = map;

    console.log("Carte d'Algérie initialisée");
  } catch (error) {
    console.error("Erreur lors de l'initialisation de la carte:", error);
  }
}
