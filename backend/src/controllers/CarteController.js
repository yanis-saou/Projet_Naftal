const XLSX = require("xlsx");
const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const { logAuditAction } = require("../utils/auditLogger");

const {
  getScopeFilters,
  combineWhere,
} = require("../middlewares/scopeMiddleware");

// ==========================================
const ETAT_CARTE_VARIANTS = {
  EN_STOCK: ["En_stock", "EN_STOCK", "en_stock"],
  EN_CIRCULATION: ["En_circulation", "EN_CIRCULATION", "En circulation"],
  RENOUVELEE: [
    "Renouvelée",
    "RENOUVELEE",
    "Renouvelee",
    "renouvelée",
    "renouvelee",
  ],
  EXPIREE: ["Expirée", "EXPIREE", "Expiree"],
  DEFECTUEUSE: ["Défectueuse", "DEFECTUEUSE", "Defectueuse"],
  PERDUE: ["Perdue", "PERDUE"],
  VOLEE: ["Volée", "VOLEE", "Volee"],
  PERDUE_VOLEE: [
    "Perdue/Volée",
    "PERDUE_VOLEE",
    "Perdue/volee",
    "perdue/volée",
    "perdue/volee",
  ],
  EN_COURS_TRAITEMENT: [
    "En cours traitement",
    "EN_COURS_TRAITEMENT",
    "En_cours_traitement",
    "En cours de traitement",
  ],
  ATTENTE_RECEPTION: [
    "En attente de réception",
    "EN_ATTENTE_RECEPTION",
    "En_attente_reception",
  ],
};

const allEtatVariants = (...keys) =>
  keys.flatMap((k) => ETAT_CARTE_VARIANTS[k] || []);
const etatFilter = (rawEtat) => {
  if (!rawEtat) return null;
  const key = String(rawEtat)
    .toUpperCase()
    .replace(/[\s\-]/g, "_");
  const variants = ETAT_CARTE_VARIANTS[key];
  return variants && variants.length ? { in: variants } : { in: [rawEtat] };
};

// ==========================================
// UTILITAIRES (helpers internes)
// ==========================================

/**
 * Enrichit un objet carte avec l'amortissement calculé dynamiquement.
 * CDC p.18-19 : "Amortissement = Temps restant avant l'expiration"
 *
 * Ajoute deux champs calculés (jamais stockés en BDD, toujours frais) :
 *   - amortissement_jours : nombre de jours restants (0 si expirée)
 *   - amortissement_label : version lisible ex. "2 ans 3 mois" ou "EXPIRÉE"
 */
function enrichirCartes(carte) {
  if (!carte) return carte;

  const maintenant = new Date();
  const dateExp = carte.date_expiration
    ? new Date(carte.date_expiration)
    : null;

  let amortissement_jours = null;
  let amortissement_label = "Date inconnue";

  if (dateExp) {
    const diffMs = dateExp - maintenant;
    amortissement_jours = Math.max(0, Math.ceil(diffMs / 86400000)); // 86400000 ms = 1 jour

    if (diffMs <= 0) {
      amortissement_label = "EXPIRÉE";
    } else {
      const ans = Math.floor(amortissement_jours / 365);
      const moisRestants = Math.floor((amortissement_jours % 365) / 30);
      const parts = [];
      if (ans > 0) parts.push(`${ans} an${ans > 1 ? "s" : ""}`);
      if (moisRestants > 0) parts.push(`${moisRestants} mois`);
      if (parts.length === 0)
        parts.push(
          `${amortissement_jours} jour${amortissement_jours > 1 ? "s" : ""}`,
        );
      amortissement_label = parts.join(" ");
    }
  }

  return { ...carte, amortissement_jours, amortissement_label };
}

function buildYearlyExpirationCurve(cartes) {
  const counts = new Map();

  cartes.forEach((carte) => {
    if (!carte?.date_expiration) return;

    const year = new Date(carte.date_expiration).getFullYear();
    if (Number.isNaN(year)) return;

    counts.set(year, (counts.get(year) || 0) + 1);
  });

  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([annee, total]) => ({ annee, total }));
}

/**
 * Valide le format d'un numéro de carte Naftal.
 * Règles : entre 5 et 50 caractères, lettres/chiffres/tirets uniquement.
 * Pourquoi : éviter les données corrompues dans la BDD.
 */
function validerNumeroCarte(numero) {
  if (!numero || typeof numero !== "string") return false;
  const trimmed = numero.trim();
  if (trimmed.length < 5 || trimmed.length > 50) return false;
  // Autorise lettres, chiffres, tirets et underscores
  return /^[A-Za-z0-9\-_]+$/.test(trimmed);
}

/**
 * Enregistre une ligne dans historique_carte (audit trail).
 * Appelée à chaque modification pour tracer QUI a fait QUOI et QUAND.
 */
async function enregistrerHistorique(data) {
  await prisma.historique_carte.create({ data });
}

// ==========================================
// 1. IMPORT EXCEL (avec validations renforcées)
// last updated: 5/7/2026
// ==========================================
const importExcel = async (req, res, next) => {
  if (!req.file) {
    return res
      .status(400)
      .json({ success: false, message: "Aucun fichier fourni." });
  }

  let rows;
  try {
    const workbook = XLSX.read(req.file.buffer, {
      type: "buffer",
      cellDates: true,
      codepage: 65001,
    });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    rows = XLSX.utils.sheet_to_json(worksheet, { defval: null });
  } catch (parseError) {
    return res.status(400).json({
      success: false,
      message: "Erreur lecture Excel.",
      erreur: parseError.message,
    });
  }

  const resultats = {
    total: rows.length,
    inseres: 0,
    mis_a_jour: 0,
    ignores: 0,
    erreurs: [],
  };

  // ✅ Récupérer les dernières valeurs pour auto-incrémentation
  const [derniereCarteCodeClient, derniereCarteNumPorteur, derniereCarte] =
    await Promise.all([
      prisma.stock_carte.findFirst({
        where: { code_client: { startsWith: "CLI-" } },
        orderBy: { code_client: "desc" },
        select: { code_client: true },
      }),
      prisma.stock_carte.findFirst({
        orderBy: { numeroporteur: "desc" },
        select: { numeroporteur: true },
      }),
      prisma.stock_carte.findFirst({
        where: { numerocarte: { startsWith: "NC-" } },
        orderBy: { numerocarte: "desc" },
        select: { numerocarte: true },
      }),
    ]);

  let nextCodeClient =
    derniereCarteCodeClient && derniereCarteCodeClient.code_client
      ? parseInt(derniereCarteCodeClient.code_client.split("-")[1]) + 1
      : 1;

  let nextNumPorteur =
    derniereCarteNumPorteur && derniereCarteNumPorteur.numeroporteur
      ? parseInt(derniereCarteNumPorteur.numeroporteur) + 1
      : 100;

  let nextNumCarte =
    derniereCarte && derniereCarte.numerocarte
      ? parseInt(derniereCarte.numerocarte.split("-")[1]) + 1
      : 1;

  await Promise.all(
    rows.map(async (row, i) => {
      // ✅ Générer automatiquement si absent
      const numeroCarte =
        row["numeroCarte"]?.toString().trim() || `NC-${nextNumCarte++}`;

      if (!numeroCarte || numeroCarte.toLowerCase().includes("numero")) {
        resultats.ignores++;
        return;
      }

      if (!validerNumeroCarte(numeroCarte)) {
        resultats.erreurs.push({
          ligne: i + 2,
          numeroCarte,
          raison: `Format invalide. Doit contenir 5-50 caractères alphanumériques.`,
        });
        resultats.ignores++;
        return;
      }

      const dateRec =
        row["dateReception"] instanceof Date && !isNaN(row["dateReception"])
          ? row["dateReception"]
          : new Date();

      let dateExp =
        row["dateExpiration"] instanceof Date && !isNaN(row["dateExpiration"])
          ? row["dateExpiration"]
          : null;

      if (!dateExp) {
        dateExp = new Date(dateRec);
        dateExp.setFullYear(dateExp.getFullYear() + 3);
      }

      if (dateExp <= dateRec) {
        resultats.erreurs.push({
          ligne: i + 2,
          numeroCarte,
          raison: `Date expiration invalide.`,
        });
        resultats.ignores++;
        return;
      }

      const typeCarteImporte =
        row["type_carte"]?.toString().trim() || "Nouvelle";
      const natureForced = req.query?.nature;
      const natureCalculée =
        natureForced === "Renouveler" || natureForced === "Nouvelle"
          ? natureForced
          : typeCarteImporte === "Renouvellée" ||
              typeCarteImporte === "Renouveler"
            ? "Renouveler"
            : "Nouvelle";

      // ✅ NOUVEAU : Extraction conditionnelle du numéro BTS
      // Si la carte est "Nouvelle", numeroBts reste "undefined". Prisma ignorera alors ce champ.
      let numeroBts = undefined;
      if (natureCalculée === "Renouveler") {
        numeroBts =
          row["numero_bts"]?.toString().trim() ||
          row["numeroBts"]?.toString().trim() ||
          row["Numero_BTS"]?.toString().trim() ||
          row["numero bts"]?.toString().trim() ||
          null; // S'il est renouvelé mais vide dans l'Excel, on insère null
      }

      const codeClient =
        row["codeClient"]?.toString().trim() || `CLI-${nextCodeClient++}`;

      const numeroPorteur =
        row["numeroPorteur"]?.toString().trim() ||
        String(nextNumPorteur++).padStart(6, "0");

      const raisonSociale =
        row["raisonSocialeClient"]?.toString().trim() || "SONATRACH";
      const district = row["district"]?.toString().trim() || null;
      const etatLibelle =
        natureCalculée === "Renouveler" ? "Renouvelée" : "En_stock";
      const codeStructure =
        row["code_structure"]?.toString().trim() ||
        row["codeStructure"]?.toString().trim() ||
        "DPE_CENTRE";

      const typeCarteRel = {
        connectOrCreate: {
          where: { libelle: typeCarteImporte },
          create: { libelle: typeCarteImporte },
        },
      };

      const etatRel = {
        connectOrCreate: {
          where: { libelle: etatLibelle },
          create: { libelle: etatLibelle },
        },
      };

      try {
        await prisma.stock_carte.upsert({
          where: { numerocarte: numeroCarte },
          update: {
            code_client: codeClient,
            numeroporteur: numeroPorteur,
            raisonsocialeclient: raisonSociale,
            date_expiration: dateExp,
            district,
            
            type_carte_stock_carte_type_carteTotype_carte: typeCarteRel,
            nature_carte: natureCalculée,
            etat_carte: etatRel,
            structure: { connect: { code: codeStructure } },
          },
          create: {
            numerocarte: numeroCarte,
            code_client: codeClient,
            numeroporteur: numeroPorteur,
            raisonsocialeclient: raisonSociale,
            date_reception: dateRec,
            date_expiration: dateExp,
            
            type_carte_stock_carte_type_carteTotype_carte: typeCarteRel,
            nature_carte: natureCalculée,
            etat_carte: etatRel,
            statut: "Entree",
            district,
            structure: { connect: { code: codeStructure } },
          },
        });
        resultats.inseres++;
      } catch (error) {
        resultats.erreurs.push({
          ligne: i + 2,
          numeroCarte,
          raison: error.message,
        });
      }
    }),
  );

  return res.status(200).json({
    success: resultats.inseres > 0,
    message: `Import terminé. ${resultats.inseres} traitées, ${resultats.erreurs.length} erreurs.`,
    resultats,
  });
};

// ==========================================
// 2. STOCK (Cartes à la DPE) avec TRI
// ==========================================
const getStock = async (req, res, next) => {
  try {
    const { whereCarte } = await getScopeFilters(req);
    const {
      nature,
      recherche,
      client,
      etat,
      statut,
      page = "1",
      limit = "50",
      sort = "date_reception",
      order = "desc", // <-- TRI AJOUTÉ
    } = req.query;

    const where = {};
    if (statut) where.statut = statut;
    if (etat) {
      where.etat = etatFilter(etat);
    } else {
      where.etat = {
        in: allEtatVariants(
          "EN_STOCK",
          "RENOUVELEE",
          "EXPIREE",
          "ATTENTE_RECEPTION",
          "DEFECTUEUSE",
          "PERDUE",
          "VOLEE",
          "EN_COURS_TRAITEMENT",
        ),
      };
    }
    if (nature) {
      if (!["Nouvelle", "Renouveler"].includes(nature))
        return res
          .status(400)
          .json({ success: false, message: "Nature invalide." });
      where.nature_carte = nature;
    }
    if (client) where.code_client = client;
    if (recherche)
      where.numerocarte = { contains: recherche, mode: "insensitive" };

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(500, Math.max(1, parseInt(limit) || 50));
    const skip = (pageNum - 1) * limitNum;
    const scopedWhere = combineWhere(whereCarte, where);

    // Validation du champ de tri
    const champsAutorisés = [
      "date_reception",
      "date_expiration",
      "numerocarte",
      "etat",
      "statut",
      "nature_carte",
    ];
    const sortField = champsAutorisés.includes(sort) ? sort : "date_reception";
    const sortOrder = order === "asc" ? "asc" : "desc";

    const [cartes, total] = await Promise.all([
      prisma.stock_carte.findMany({
        where: scopedWhere,
        include: { structure: true },
        orderBy: { [sortField]: sortOrder }, // TRI DYNAMIQUE
        skip,
        take: limitNum,
      }),
      prisma.stock_carte.count({ where: scopedWhere }),
    ]);

    const stats = {};
    cartes.forEach((c) => {
      const nat = c.nature_carte || "Non défini";
      stats[nat] = (stats[nat] || 0) + 1;
    });

    res.json({
      success: true,
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
      tri: { champ: sortField, ordre: sortOrder },
      filtres: { nature, client, recherche, etat, statut },
      statistiques: stats,
      cartes: cartes.map(enrichirCartes),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ======================================================
// 3. CIRCULATION (Cartes dans les Districts) avec TRI
// ======================================================
const getCirculation = async (req, res, next) => {
  try {
    const { whereCarte } = await getScopeFilters(req);
    const {
      nature,
      recherche,
      district,
      client,
      etat,
      page = "1",
      limit = "50",
      sort = "date_remise",
      order = "desc",
    } = req.query;

    const where = {};
    if (etat) {
      where.etat = etatFilter(etat);
    } else {
      where.etat = {
        in: allEtatVariants(
          "EN_CIRCULATION",
          "DEFECTUEUSE",
          "PERDUE",
          "VOLEE",
          "EN_COURS_TRAITEMENT",
          "PERDUE_VOLEE",
        ),
      };
    }
    if (nature) {
      if (!["Nouvelle", "Renouveler"].includes(nature))
        return res
          .status(400)
          .json({ success: false, message: "Nature invalide." });
      where.nature_carte = nature;
    }
    if (district) where.district = district;
    if (client) where.code_client = client;
    if (recherche)
      where.numerocarte = { contains: recherche, mode: "insensitive" };

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(500, Math.max(1, parseInt(limit) || 50));
    const skip = (pageNum - 1) * limitNum;
    const scopedWhere = combineWhere(whereCarte, where);

    const champsAutorisés = [
      "date_remise",
      "date_expiration",
      "numerocarte",
      "etat",
      "district",
      "nature_carte",
    ];
    const sortField = champsAutorisés.includes(sort) ? sort : "date_remise";
    const sortOrder = order === "asc" ? "asc" : "desc";

    const [cartes, total] = await Promise.all([
      prisma.stock_carte.findMany({
        where: scopedWhere,
        include: {
          structure: true,
          circulation_carte: {
            include: { decharge_carte: true },
            take: 1,
            orderBy: { id_circulation: "desc" },
          },
        },
        orderBy: { [sortField]: sortOrder },
        skip,
        take: limitNum,
      }),
      prisma.stock_carte.count({ where: scopedWhere }),
    ]);

    // Enrichir les cartes avec les données de decharge
    const cartesEnrichies = cartes.map((c) => {
      const enrichie = enrichirCartes(c);
      const circ = c.circulation_carte?.[0];
      if (circ) {
        enrichie.numero_decharge = circ.numero_decharge;
        enrichie.numero_bordereau_bts =
          circ.decharge_carte?.numero_bordereau_bts || null;
      }
      return enrichie;
    });

    const stats = {};
    cartesEnrichies.forEach((c) => {
      const nat = c.nature_carte || "Non défini";
      stats[nat] = (stats[nat] || 0) + 1;
    });

    res.json({
      success: true,
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
      tri: { champ: sortField, ordre: sortOrder },
      filtres: { nature, district, client, recherche, etat },
      statistiques: stats,
      cartes: cartesEnrichies,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 4. STATISTIQUES GLOBALES (Dashboard)
// ==========================================
const getStatistiques = async (req, res, next) => {
  try {
    const { whereCarte } = await getScopeFilters(req);
    const maintenant = new Date();
    const dateLimite60j = new Date();
    dateLimite60j.setDate(dateLimite60j.getDate() + 60);

    const [
      totalCartes,
      parNature,
      parEtat,
      parStatut,
      cartesExpirees,
      cartesProchesExpiration,
    ] = await Promise.all([
      prisma.stock_carte.count({ where: whereCarte }),
      prisma.stock_carte.groupBy({
        by: ["nature_carte"],
        where: whereCarte,
        _count: true,
      }),
      prisma.stock_carte.groupBy({
        by: ["etat"],
        where: whereCarte,
        _count: true,
      }),
      prisma.stock_carte.groupBy({
        by: ["statut"],
        where: whereCarte,
        _count: true,
      }),
      prisma.stock_carte.count({
        where: combineWhere(whereCarte, {
          date_expiration: { lt: maintenant },
        }),
      }),
      prisma.stock_carte.count({
        where: combineWhere(whereCarte, {
          date_expiration: { gte: maintenant, lt: dateLimite60j },
        }),
      }),
    ]);

    res.json({
      success: true,
      totalCartes,
      parNature,
      parEtat,
      parStatut,
      alertes: { cartesExpirees, cartesProchesExpiration },
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 4bis. STATISTIQUES AVANCÉES (Rapports)
// Répartition par structure, district, client
// ==========================================
const getStatistiquesAvancees = async (req, res, next) => {
  try {
    const { whereCarte } = await getScopeFilters(req);
    const maintenant = new Date();

    // Regrouper par structure (code_structure)
    const parStructure = await prisma.stock_carte.groupBy({
      by: ["code_structure", "raisonsocialestructure"],
      where: whereCarte,
      _count: { numerocarte: true },
      orderBy: { _count: { numerocarte: "desc" } },
    });

    // Regrouper par district
    const parDistrict = await prisma.stock_carte.groupBy({
      by: ["district"],
      where: whereCarte,
      _count: { numerocarte: true },
      orderBy: { _count: { numerocarte: "desc" } },
    });

    // Regrouper par client (top 10)
    const parClient = await prisma.stock_carte.groupBy({
      by: ["code_client", "raisonsocialeclient"],
      where: whereCarte,
      _count: { numerocarte: true },
      orderBy: { _count: { numerocarte: "desc" } },
      take: 10,
    });

    // Cartes expirées par district (pour cibler les renouvellements urgents)
    const expireesParDistrict = await prisma.stock_carte.groupBy({
      by: ["district"],
      where: combineWhere(whereCarte, { date_expiration: { lt: maintenant } }),
      _count: { numerocarte: true },
      orderBy: { _count: { numerocarte: "desc" } },
    });

    const cartesParAnnee = buildYearlyExpirationCurve(
      await prisma.stock_carte.findMany({
        where: combineWhere(whereCarte, { date_expiration: { not: null } }),
        select: { date_expiration: true },
      }),
    );

    res.json({
      success: true,
      parStructure,
      parDistrict,
      parClient,
      expireesParDistrict,
      courbeAmortissement: cartesParAnnee,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 5. ALERTES EXPIRATION (endpoint dédié)
// ?jours=30  → cartes expirant dans les 30 prochains jours
// ?jours=0   → cartes déjà expirées
// ==========================================
const getCartesExpiration = async (req, res, next) => {
  try {
    const { whereCarte } = await getScopeFilters(req);
    const jours = parseInt(req.query.jours ?? "60");
    const maintenant = new Date();

    let where;
    let label;

    if (jours === 0) {
      // Cartes déjà expirées
      where = { date_expiration: { lt: maintenant } };
      label = "Cartes expirées";
    } else {
      // Cartes expirant dans les N prochains jours
      const dateLimite = new Date();
      dateLimite.setDate(dateLimite.getDate() + jours);
      where = { date_expiration: { gte: maintenant, lt: dateLimite } };
      label = `Cartes expirant dans les ${jours} prochains jours`;
    }

    const cartes = await prisma.stock_carte.findMany({
      where: combineWhere(whereCarte, where),
      include: { structure: true },
      orderBy: { date_expiration: "asc" }, // Les plus urgentes en premier
    });

    res.json({
      success: true,
      label,
      jours,
      total: cartes.length,
      cartes: cartes.map(enrichirCartes),
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 6. MODIFIER UNE CARTE (UPDATE)
// Endpoint : PUT /api/cartes/:id
// Enregistre chaque changement dans l'historique (audit trail)
// ==========================================
const updateCarte = async (req, res, next) => {
  try {
    const { id } = req.params; // id = numerocarte
    const {
      code_client,
      raisonsocialeclient,
      date_expiration,
      type_carte,
      nature_carte,
      etat,
      statut,
      district,
      commentaire,
    } = req.body;

    // Récupérer l'état actuel pour le diff (avant/après)
    const carteActuelle = await prisma.stock_carte.findUnique({
      where: { numerocarte: id },
    });

    if (!carteActuelle) {
      return res
        .status(404)
        .json({ success: false, message: "Carte non trouvée." });
    }

    // Validation : expiration > reception si fournie
    if (date_expiration) {
      const dateExp = new Date(date_expiration);
      const dateRec = carteActuelle.date_reception || new Date();
      if (dateExp <= dateRec) {
        return res.status(400).json({
          success: false,
          message:
            "La date d'expiration doit être postérieure à la date de réception.",
        });
      }
    }

    // Construire uniquement les champs modifiés
    const data = {};
    if (code_client !== undefined) data.code_client = code_client;
    if (raisonsocialeclient !== undefined)
      data.raisonsocialeclient = raisonsocialeclient;
    if (date_expiration !== undefined)
      data.date_expiration = new Date(date_expiration);
    if (type_carte !== undefined) data.type_carte = type_carte;
    if (nature_carte !== undefined) data.nature_carte = nature_carte;
    if (etat !== undefined) data.etat = etat;
    if (statut !== undefined) data.statut = statut;
    if (district !== undefined) data.district = district;

    const carteModifiée = await prisma.stock_carte.update({
      where: { numerocarte: id },
      data,
      include: { structure: true },
    });

    // Audit trail : enregistrer la modification
    await enregistrerHistorique({
      numerocarte: id,
      ancienetat: carteActuelle.etat,
      nouveletat: etat || carteActuelle.etat,
      commentaire:
        commentaire ||
        `Modification manuelle des champs : ${Object.keys(data).join(", ")}`,
      id_utilisateur: req.user?.id || null,
      structure_ancienne: carteActuelle.code_structure,
      structure_actuelle: carteModifiée.code_structure,
    });

    // Journal d'audit
    if (data.statut === "En circulation" || data.etat === "En circulation") {
      await logAuditAction(
        "Mise en circulation carte",
        id,
        `${req.user?.prenom || ""} ${req.user?.nom || ""}`.trim() ||
          req.user?.email ||
          "Utilisateur inconnu",
        req,
      );
    }

    res.json({
      success: true,
      message: "Carte modifiée avec succès.",
      carte: carteModifiée,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 7. ARCHIVER / SUPPRIMER UNE CARTE (DELETE logique)
// On "archive" plutôt que supprimer pour garder la traçabilité.
// Endpoint : DELETE /api/cartes/:id
// ==========================================
const archiverCarte = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { raison } = req.body;

    const carteActuelle = await prisma.stock_carte.findUnique({
      where: { numerocarte: id },
    });

    if (!carteActuelle) {
      return res
        .status(404)
        .json({ success: false, message: "Carte non trouvée." });
    }

    // Archivage logique : on change l'état en "Archivée" sans supprimer la ligne
    const carteArchivée = await prisma.stock_carte.update({
      where: { numerocarte: id },
      data: { etat: "Archivée", statut: "Sortie" },
    });

    // Audit trail
    await enregistrerHistorique({
      numerocarte: id,
      ancienetat: carteActuelle.etat,
      nouveletat: "Archivée",
      commentaire: raison || "Archivage de la carte",
      id_utilisateur: req.user?.id || null,
    });

    // Journal d'audit
    await logAuditAction(
      "Archivage carte",
      id,
      `${req.user?.prenom || ""} ${req.user?.nom || ""}`.trim() ||
        req.user?.email ||
        "Utilisateur inconnu",
      req,
    );

    res.json({
      success: true,
      message: "Carte archivée avec succès.",
      carte: carteArchivée,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 8. ACTIONS EN MASSE (Bulk Update)
// Endpoint : POST /api/cartes/bulk/etat
// Body : { numeros: ["C001","C002"], etat: "Perdue", commentaire: "..." }
// ==========================================
const bulkUpdateEtat = async (req, res, next) => {
  try {
    const { numeros, etat, statut, commentaire } = req.body;

    if (!numeros || !Array.isArray(numeros) || numeros.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "La liste 'numeros' est requise." });
    }
    if (!etat) {
      return res
        .status(400)
        .json({ success: false, message: "Le champ 'etat' est requis." });
    }
    if (numeros.length > 200) {
      return res
        .status(400)
        .json({ success: false, message: "Maximum 200 cartes par opération." });
    }

    // Récupérer les états actuels pour l'audit
    const cartesAvant = await prisma.stock_carte.findMany({
      where: { numerocarte: { in: numeros } },
      select: { numerocarte: true, etat: true },
    });

    // Mise à jour en une seule requête SQL (performant)
    const resultat = await prisma.stock_carte.updateMany({
      where: { numerocarte: { in: numeros } },
      data: {
        etat,
        statut: statut || "Sortie",
      },
    });

    // Enregistrement dans l'historique (une entrée par carte)
    const historiqueEntries = cartesAvant.map((c) => ({
      numerocarte: c.numerocarte,
      ancienetat: c.etat,
      nouveletat: etat,
      commentaire: commentaire || `Mise à jour en masse`,
      id_utilisateur: req.user?.id || null,
    }));

    await prisma.historique_carte.createMany({ data: historiqueEntries });

    res.json({
      success: true,
      message: `${resultat.count} carte(s) mise(s) à jour.`,
      modifiees: resultat.count,
      demandees: numeros.length,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 9. EXPORT CSV / EXCEL
// Endpoint : GET /api/cartes/export?format=csv&etat=En_stock
// Supporte les mêmes filtres que /search
// ==========================================
const exportCartes = async (req, res, next) => {
  try {
    const { whereCarte } = await getScopeFilters(req);
    const {
      format = "csv",
      nature,
      etat,
      statut,
      district,
      client,
      q,
    } = req.query;

    // Construire les filtres (même logique que searchCartes)
    const where = {};
    if (nature) where.nature_carte = nature;
    if (etat) where.etat = etatFilter(etat);
    if (statut) where.statut = statut;
    if (district) where.district = district;
    if (client) where.code_client = client;
    if (q) {
      where.OR = [
        { numerocarte: { contains: q, mode: "insensitive" } },
        { code_client: { contains: q, mode: "insensitive" } },
        { raisonsocialeclient: { contains: q, mode: "insensitive" } },
      ];
    }

    const cartes = await prisma.stock_carte.findMany({
      where: combineWhere(whereCarte, where),
      include: { structure: true },
      orderBy: { date_reception: "desc" },
      take: 10000, // Sécurité : max 10 000 lignes
    });

    // Transformer pour l'export (colonnes lisibles)
    const data = cartes.map((c) => ({
      "Numéro Carte": c.numerocarte,
      Nature: c.nature_carte || "",
      Type: c.type_carte || "",
      État: c.etat || "",
      Statut: c.statut || "",
      "Code Client": c.code_client || "",
      "Raison Sociale Client": c.raisonsocialeclient || "",
      District: c.district || "",
      Structure: c.code_structure || "",
      "Date Réception": c.date_reception
        ? new Date(c.date_reception).toLocaleDateString("fr-FR")
        : "",
      "Date Expiration": c.date_expiration
        ? new Date(c.date_expiration).toLocaleDateString("fr-FR")
        : "",
      "Date Remise": c.date_remise
        ? new Date(c.date_remise).toLocaleDateString("fr-FR")
        : "",
      Porteur: c.porteur_rel
        ? `${c.porteur_rel.nom || ""} ${c.porteur_rel.prenom || ""}`.trim()
        : "",
    }));

    // Générer le fichier avec la bibliothèque xlsx
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cartes");

    if (format === "xlsx") {
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="export_cartes.xlsx"`,
      );
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      return res.send(buffer);
    } else {
      // Format CSV par défaut
      const csv = XLSX.utils.sheet_to_csv(ws);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="export_cartes.csv"`,
      );
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      return res.send("\uFEFF" + csv); // BOM UTF-8 pour Excel français
    }
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 10. RENOUVELLEMENT D'UNE CARTE
// Endpoint : POST /api/cartes/:id/renouveler
// Crée une nouvelle carte liée à l'ancienne et marque l'ancienne comme renouvelée.
// ==========================================
const renouvelerCarte = async (req, res, next) => {
  try {
    const { id } = req.params; // Numéro de la carte originale
    const { nouveauNumeroCarte } = req.body;

    if (!nouveauNumeroCarte) {
      return res.status(400).json({
        success: false,
        message: "Le numéro de la nouvelle carte est requis.",
      });
    }

    if (!validerNumeroCarte(nouveauNumeroCarte)) {
      return res.status(400).json({
        success: false,
        message: "Format du nouveau numéro de carte invalide.",
      });
    }

    // Vérifier que la carte originale existe
    const carteOriginale = await prisma.stock_carte.findUnique({
      where: { numerocarte: id },
    });
    if (!carteOriginale) {
      return res
        .status(404)
        .json({ success: false, message: "Carte originale non trouvée." });
    }

    // Vérifier que le nouveau numéro n'existe pas déjà (anti-doublon)
    const doublon = await prisma.stock_carte.findUnique({
      where: { numerocarte: nouveauNumeroCarte },
    });
    if (doublon) {
      return res.status(409).json({
        success: false,
        message: `La carte ${nouveauNumeroCarte} existe déjà dans la base de données.`,
      });
    }

    const maintenant = new Date();
    const nouvelleExpiration = new Date(maintenant);
    nouvelleExpiration.setFullYear(nouvelleExpiration.getFullYear() + 3);

    // Les scalaires `type_carte` et `etat` sont masqués par Prisma (collision nom modèle / champ).
    // On doit passer par les relations avec connectOrCreate.
    const etatConnect = (libelle) => ({
      connectOrCreate: {
        where: { libelle },
        create: { libelle },
      },
    });

    // Transaction : les deux opérations réussissent ensemble ou échouent ensemble
    const [carteRenouvellee, nouvelleCarteCreee] = await prisma.$transaction([
      // 1. Marquer l'ancienne carte comme "Renouvelée"
      prisma.stock_carte.update({
        where: { numerocarte: id },
        data: {
          etat_carte: etatConnect("renouvelée"),
          statut: "Sortie",
        },
      }),
      // 2. Créer la nouvelle carte avec les mêmes infos client
      prisma.stock_carte.create({
        data: {
          numerocarte: nouveauNumeroCarte,
          code_client: carteOriginale.code_client,
          raisonsocialeclient: carteOriginale.raisonsocialeclient,
          date_reception: maintenant,
          date_expiration: nouvelleExpiration,
          type_carte_stock_carte_type_carteTotype_carte:
            etatConnect("Renouvellée"),
          nature_carte: "Renouveler",
          etat_carte: etatConnect("En_stock"),
          statut: "Entree",
          ...(carteOriginale.code_structure
            ? {
                structure: { connect: { code: carteOriginale.code_structure } },
              }
            : {}),
          district: carteOriginale.district,
        },
      }),
    ]);

    // Audit trail
    await enregistrerHistorique({
      numerocarte: id,
      ancienetat: carteOriginale.etat,
      nouveletat: "Renouvelée",
      commentaire: `Renouvelée par la carte ${nouveauNumeroCarte}`,
      id_utilisateur: req.user?.id || null,
    });

    res.status(201).json({
      success: true,
      message: `Carte ${id} renouvelée. Nouvelle carte : ${nouveauNumeroCarte}.`,
      carteRenouvellee,
      nouvelleCarteCreee,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 11. HISTORIQUE / AUDIT TRAIL D'UNE CARTE
// Endpoint : GET /api/cartes/:id/historique
// Retourne toutes les opérations effectuées sur cette carte.
// ==========================================
const getHistoriqueCarte = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { whereCarte } = await getScopeFilters(req);

    const carte = await prisma.stock_carte.findFirst({
      where: combineWhere(whereCarte, { numerocarte: id }),
      select: {
        numerocarte: true,
        etat: true,
        nature_carte: true,
        statut: true,
      },
    });

    if (!carte) {
      return res
        .status(404)
        .json({ success: false, message: "Carte non trouvÃ©e." });
    }

    const historique = await prisma.historique_carte.findMany({
      where: { numerocarte: id },
      orderBy: { dateoperation: "desc" },
    });

    res.json({
      success: true,
      carte,
      total: historique.length,
      historique,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 12. CHANGER L'ÉTAT (avec audit + suivi automatique)
// ==========================================

// États qui déclenchent l'ouverture automatique d'un dossier de suivi (CDC p.20)
const ETATS_SUIVI = [
  "Défectueuse",
  "Perdue",
  "Volée",
  "Expirée",
  "Perdue/Volée",
];

const changerEtat = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      etat,
      statut,
      commentaire,
      ancienEtat,
      mode_operation,
      diagnostic,
    } = req.body;
    console.log("changerEtat appelé:", { id, etat, statut });

    if (!etat) {
      return res
        .status(400)
        .json({ success: false, message: "Le champ 'etat' est obligatoire" });
    }

    // Récupérer la carte avant modification (pour avoir code_structure et district)
    const carteAvant = await prisma.stock_carte.findUnique({
      where: { numerocarte: id },
      select: { etat: true, code_structure: true, district: true },
    });

    const carte = await prisma.stock_carte.update({
      where: { numerocarte: id },
      data: { etat, statut: statut || "Sortie" },
      include: { structure: true },
    });

    // Audit trail
    await enregistrerHistorique({
      numerocarte: id,
      ancienetat: ancienEtat || carteAvant?.etat || "N/A",
      nouveletat: etat,
      commentaire: commentaire || null,
      id_utilisateur: req.user?.id || null,
    });

    // Journal d'audit
    await logAuditAction(
      `Changement état carte: ${etat}`,
      id,
      `${req.user?.prenom || ""} ${req.user?.nom || ""}`.trim() ||
        req.user?.email ||
        "Utilisateur inconnu",
      req,
    );

    // Alimentation automatique du suivi (CDC p.20) :
    // Dès qu'une carte passe à Défectueuse/Perdue/Volée/Expirée → ouvrir un
    // dossier de suivi, à condition qu'il n'y en ait pas déjà un en cours.
    // Sans ce garde-fou, on créait une ligne ici PUIS une autre via
    // ouvrirDossierSuivi au moment de la décharge Type 2 → deux suivis pour
    // la même carte, et la colonne "Envoi DPE→DCSI" se confondait au refresh.
    if (ETATS_SUIVI.includes(etat)) {
      const suiviOuvert = await prisma.suivi_maintenance_cartes.findFirst({
        where: { numerocarte: id, date_validation: null },
        select: { id_suivi: true },
      });
      if (suiviOuvert) {
        console.log(
          "ETATS_SUIVI : suivi déjà ouvert pour",
          id,
          "— pas de duplication",
        );
      } else {
        console.log("ETATS_SUIVI déclenché pour:", etat);
        await prisma.suivi_maintenance_cartes.create({
          data: {
            numerocarte: id,
            district: carteAvant?.district || "CENTRE",
            date_anomalie: new Date(),
            trs_str_dpe: new Date(),
            mode_operation_carte: {
              connectOrCreate: {
                where: { libelle: "TRAITEMENT_DEFECTUEUSE" },
                create: { libelle: "TRAITEMENT_DEFECTUEUSE" },
              },
            },
            etat_carte_suivi_maintenance_cartes_etat_panneToetat_carte: {
              connectOrCreate: {
                where: { libelle: etat },
                create: { libelle: etat },
              },
            },
            ...(diagnostic
              ? {
                  etat_carte_suivi_maintenance_cartes_diagnostiqueToetat_carte:
                    {
                      connectOrCreate: {
                        where: { libelle: diagnostic },
                        create: { libelle: diagnostic },
                      },
                    },
                }
              : {}),
            ...(carteAvant?.code_structure
              ? {
                  structure: { connect: { code: carteAvant.code_structure } },
                }
              : {}),
          },
        });
      }
    }

    res.json({ success: true, message: "État mis à jour avec succès", carte });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 13. ASSIGNER UN PORTEUR À UNE CARTE
// ==========================================
const assignerPorteur = async (req, res, next) => {
  const { numerocarte, id_porteur } = req.body;
  try {
    const update = await prisma.stock_carte.update({
      where: { numerocarte },
      data: { id_porteur: parseInt(id_porteur) },
    });
    res.json({ success: true, message: "Porteur assigné", update });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 14. RÉCUPÉRER LE SUIVI DES CARTES
// ==========================================
const getSuiviCartes = async (req, res, next) => {
  try {
    const { whereSuiviCarte } = await getScopeFilters(req);

    // Récupérer tous les dossiers de suivi
    const allSuivis = await prisma.suivi_maintenance_cartes.findMany({
      where: whereSuiviCarte,
      include: {
        etat_carte_suivi_maintenance_cartes_etat_panneToetat_carte: {
          select: { libelle: true },
        },
        etat_carte_suivi_maintenance_cartes_diagnostiqueToetat_carte: {
          select: { libelle: true },
        },
      },
      orderBy: { date_anomalie: "desc" },
    });

    // Une carte peut avoir plusieurs lignes de suivi (changerEtatCarte en crée
    // une automatiquement, puis ouvrirDossierSuivi via décharge Type 2 en crée
    // potentiellement une autre). On garde le plus récent par carte (les rows
    // sont déjà ordonnés date_anomalie DESC → première occurrence vue = la plus
    // récente). Si un trs_dpe_dcsi est présent sur une ligne ancienne mais pas
    // sur la plus récente, on le fait remonter pour ne pas effacer la date
    // d'envoi déjà saisie.
    const suivisByCarte = new Map();
    for (const s of allSuivis) {
      const key = s.numerocarte;
      if (!key) continue;
      const existing = suivisByCarte.get(key);
      if (!existing) {
        suivisByCarte.set(key, s);
      } else if (!existing.trs_dpe_dcsi && s.trs_dpe_dcsi) {
        existing.trs_dpe_dcsi = s.trs_dpe_dcsi;
      }
    }
    const suivis = [...suivisByCarte.values()];

    // Formater les données pour le frontend
    const suivisFormates = suivis.map((suivi) => ({
      numerocarte: suivi.numerocarte,
      // "Date anomalie" (date de détection) — distincte du moment de l'envoi.
      dateAnomalie: suivi.date_anomalie,
      // "Envoi DPE→DCSI" : posé uniquement quand la décharge type 2 a été créée.
      dateSuiviEnvoi: suivi.trs_dpe_dcsi,
      dateSuiviRetour: suivi.trs_dcsi_dpe,
      dateSuiviRetourStr: suivi.trs_str_dpe,
      dateSuiviRetourDpe: suivi.trs_dpe_str,
      etatPanne:
        suivi.etat_carte_suivi_maintenance_cartes_etat_panneToetat_carte
          ?.libelle,
      diagnostic:
        suivi.etat_carte_suivi_maintenance_cartes_diagnostiqueToetat_carte
          ?.libelle,
      // Le champ observation n'existe pas, on utilise objet_dia comme substitut
      observation: suivi.objet_dia,
      codeStructure: suivi.code_structure,
      raisonsocialestructure: suivi.raisonsocialestructure,
      dateValidation: suivi.date_validation,
      validePar: suivi.valide_par,
    }));

    res.json({
      success: true,
      suivis: suivisFormates,
    });
  } catch (error) {
    console.error("Erreur lors de la récupération du suivi des cartes:", error);
    res.status(500).json({
      success: false,
      message: "Erreur serveur lors de la récupération du suivi.",
      erreur: error.message,
    });
  }
};

// ==========================================
// 15. RECHERCHE AVANCÉE (avec tri)
// ==========================================
const searchCartes = async (req, res, next) => {
  try {
    const { whereCarte } = await getScopeFilters(req);
    const {
      q,
      nature,
      etat,
      statut,
      client,
      district,
      porteur_id,
      dateDebut,
      dateFin,
      expiresAvant,
      expiresApres,
      expirées,
      page = "1",
      limit = "50",
      sort = "date_reception",
      order = "desc",
    } = req.query;

    const where = {};

    if (q && q.trim()) {
      where.OR = [
        { numerocarte: { contains: q, mode: "insensitive" } },
        { code_client: { contains: q, mode: "insensitive" } },
        { raisonsocialeclient: { contains: q, mode: "insensitive" } },
        { raisonsocialestructure: { contains: q, mode: "insensitive" } },
      ];
    }

    if (nature && ["Nouvelle", "Renouveler"].includes(nature))
      where.nature_carte = nature;
    if (etat) where.etat = etatFilter(etat);
    if (statut) where.statut = statut;
    if (client) where.code_client = client;
    if (district) where.district = district;
    if (porteur_id) where.id_porteur = parseInt(porteur_id);

    if (dateDebut || dateFin) {
      where.date_reception = {};
      if (dateDebut) where.date_reception.gte = new Date(dateDebut);
      if (dateFin) {
        const finDate = new Date(dateFin);
        finDate.setHours(23, 59, 59, 999);
        where.date_reception.lte = finDate;
      }
    }

    const maintenant = new Date();
    if (expirées === "true") where.date_expiration = { lt: maintenant };
    else if (expirées === "false") where.date_expiration = { gte: maintenant };

    if (expiresAvant || expiresApres) {
      where.date_expiration = where.date_expiration || {};
      if (expiresApres) where.date_expiration.gte = new Date(expiresApres);
      if (expiresAvant) {
        const finDate = new Date(expiresAvant);
        finDate.setHours(23, 59, 59, 999);
        where.date_expiration.lte = finDate;
      }
    }

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(500, Math.max(1, parseInt(limit) || 50));
    const skip = (pageNum - 1) * limitNum;
    const scopedWhere = combineWhere(whereCarte, where);

    const sortFields = [
      "date_reception",
      "numerocarte",
      "code_client",
      "date_expiration",
      "nature_carte",
      "etat",
      "statut",
    ];
    const sortField = sortFields.includes(sort) ? sort : "date_reception";
    const sortOrder = order === "asc" ? "asc" : "desc";

    const [cartes, total] = await Promise.all([
      prisma.stock_carte.findMany({
        where: scopedWhere,
        include: { structure: true },
        orderBy: { [sortField]: sortOrder },
        skip,
        take: limitNum,
      }),
      prisma.stock_carte.count({ where: scopedWhere }),
    ]);

    const stats = { parNature: {}, parEtat: {}, parStatut: {} };
    cartes.forEach((c) => {
      const nat = c.nature_carte || "Non défini";
      stats.parNature[nat] = (stats.parNature[nat] || 0) + 1;
      const e = c.etat || "Non défini";
      stats.parEtat[e] = (stats.parEtat[e] || 0) + 1;
      const st = c.statut || "Non défini";
      stats.parStatut[st] = (stats.parStatut[st] || 0) + 1;
    });

    res.json({
      success: true,
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
      filtres: {
        q,
        nature,
        etat,
        statut,
        client,
        district,
        porteur_id,
        dateDebut,
        dateFin,
        expiresAvant,
        expiresApres,
        expirées,
      },
      tri: { champ: sortField, ordre: sortOrder },
      statistiques: stats,
      cartes: cartes.map(enrichirCartes),
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 15. RÉCUPÉRER UNE CARTE SPÉCIFIQUE
// ==========================================
const getCarteById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { whereCarte } = await getScopeFilters(req);
    const carte = await prisma.stock_carte.findFirst({
      where: combineWhere(whereCarte, { numerocarte: id }),
      include: {
        structure: true,
        circulation_carte: {
          include: { decharge_carte: true, structure: true },
        },
        ligne_decharge_carte_type1: true,
        ligne_decharge_carte_type2: true,
        ligne_decharge_carte_type3: true,
      },
    });

    if (!carte) {
      return res
        .status(404)
        .json({ success: false, message: "Carte non trouvée" });
    }

    res.json({ success: true, carte: enrichirCartes(carte) });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 16. DEBUG : VOIR LES DATES D'EXPIRATION
// ==========================================
const getDebugDates = async (_req, res, next) => {
  try {
    const cartes = await prisma.stock_carte.findMany({
      select: {
        numerocarte: true,
        date_expiration: true,
        date_reception: true,
        nature_carte: true,
        statut: true,
      },
      orderBy: { date_expiration: "asc" },
      take: 20,
    });

    const maintenant = new Date();
    const stats = {
      expirées: cartes.filter((c) => c.date_expiration < maintenant).length,
      "7_jours": cartes.filter(
        (c) =>
          c.date_expiration >= maintenant &&
          c.date_expiration < new Date(maintenant.getTime() + 7 * 86400000),
      ).length,
      "30_jours": cartes.filter(
        (c) =>
          c.date_expiration >= maintenant &&
          c.date_expiration < new Date(maintenant.getTime() + 30 * 86400000),
      ).length,
      "60_jours": cartes.filter(
        (c) =>
          c.date_expiration >= maintenant &&
          c.date_expiration < new Date(maintenant.getTime() + 60 * 86400000),
      ).length,
    };

    res.json({
      success: true,
      maintenant: maintenant.toISOString(),
      echantillon: cartes,
      statistiques: stats,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 17. MAINTENANCE : CORRIGER LES DATES NULL
// ==========================================
const fixMissingExpirationDates = async (_req, res, next) => {
  try {
    const cartesNull = await prisma.stock_carte.findMany({
      where: { date_expiration: null },
      select: { numerocarte: true, date_reception: true },
    });

    if (cartesNull.length === 0) {
      return res.json({
        success: true,
        message: "Aucune date d'expiration manquante",
        updated: 0,
      });
    }

    let updated = 0;
    for (const carte of cartesNull) {
      const dateRec = carte.date_reception || new Date();
      const dateExp = new Date(dateRec);
      dateExp.setFullYear(dateExp.getFullYear() + 3);
      await prisma.stock_carte.update({
        where: { numerocarte: carte.numerocarte },
        data: { date_expiration: dateExp },
      });
      updated++;
    }

    res.json({
      success: true,
      message: `${updated} cartes corrigées`,
      updated,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  importExcel,
  getStock,
  getCirculation,
  getStatistiques,
  getStatistiquesAvancees,
  getCartesExpiration,
  searchCartes,
  getSuiviCartes,
  getCarteById,
  getDebugDates,
  fixMissingExpirationDates,
  changerEtat,
  assignerPorteur,
  updateCarte,
  archiverCarte,
  bulkUpdateEtat,
  exportCartes,
  renouvelerCarte,
  getHistoriqueCarte,
};
