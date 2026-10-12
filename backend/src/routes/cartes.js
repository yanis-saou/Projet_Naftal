const express = require("express");
const router = express.Router();
const carteController = require("../controllers/CarteController");
const multer = require("multer");
const upload = multer(); // Stockage en mémoire (buffer)
const { authMiddleware } = require("../middlewares/auth");

// ================================================================
// ROUTES PROTÉGÉES PAR JWT
// Le middleware authMiddleware vérifie le token Bearer dans le header.
// Toutes les routes ci-dessous exigent une authentification.
// ================================================================
router.use(authMiddleware);

// ==========================================
// ROUTES D'IMPORT / EXPORT
// ==========================================
// POST /api/cartes/import         → Importer un fichier Excel de cartes
// GET  /api/cartes/export         → Exporter en CSV ou Excel (?format=csv|xlsx)
router.post("/import", upload.single("file"), carteController.importExcel);
router.get("/export", carteController.exportCartes);

// ==========================================
// ROUTES DE CONSULTATION
// ==========================================
// GET /api/cartes/stock           → Cartes en stock à la DPE (?sort=date_expiration&order=asc)
// GET /api/cartes/circulation     → Cartes en circulation dans les districts
// GET /api/cartes/search          → Recherche avancée multi-critères
// GET /api/cartes/suivi          → Données de suivi des cartes
router.get("/stock", carteController.getStock);
router.get("/circulation", carteController.getCirculation);
router.get("/search", carteController.searchCartes);
router.get("/suivi", carteController.getSuiviCartes);

// ==========================================
// ROUTES DE STATISTIQUES / RAPPORTS
// ==========================================
// GET /api/cartes/statistiques         → Stats globales (total, par état, par nature, alertes)
// GET /api/cartes/statistiques/avancees → Stats par structure, district, client, courbe amortissement
router.get("/statistiques", carteController.getStatistiques);
router.get("/statistiques/avancees", carteController.getStatistiquesAvancees);

// ==========================================
// ROUTES D'ALERTES EXPIRATION
// ==========================================
// GET /api/cartes/alertes/expiration?jours=30  → Cartes expirant dans 30 jours
// GET /api/cartes/alertes/expiration?jours=0   → Cartes déjà expirées
router.get("/alertes/expiration", carteController.getCartesExpiration);

// ==========================================
// ROUTES DE MAINTENANCE (admin)
// ==========================================
// GET  /api/cartes/debug/dates           → Voir un échantillon des dates d'expiration
// POST /api/cartes/maintenance/fix-dates → Corriger les dates d'expiration NULL
router.get("/debug/dates", carteController.getDebugDates);
router.post("/maintenance/fix-dates", carteController.fixMissingExpirationDates);

// ==========================================
// ROUTES PAR IDENTIFIANT DE CARTE (en dernier pour éviter les conflits)
// ==========================================
// GET    /api/cartes/:id              → Détail complet d'une carte
// PUT    /api/cartes/:id              → Modifier les informations d'une carte (UPDATE)
// DELETE /api/cartes/:id              → Archiver une carte (suppression logique)
// PUT    /api/cartes/:id/etat         → Changer uniquement l'état
// POST   /api/cartes/:id/porteur      → Assigner un porteur à la carte
// POST   /api/cartes/:id/renouveler   → Lancer le processus de renouvellement
// GET    /api/cartes/:id/historique   → Audit trail : toutes les modifications de cette carte
router.get("/:id", carteController.getCarteById);
router.put("/:id", carteController.updateCarte);
router.delete("/:id", carteController.archiverCarte);
router.put("/:id/etat", carteController.changerEtat);
router.post("/:id/porteur", carteController.assignerPorteur);
router.post("/:id/renouveler", carteController.renouvelerCarte);
router.get("/:id/historique", carteController.getHistoriqueCarte);

module.exports = router;
