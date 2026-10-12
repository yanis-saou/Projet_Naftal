const express = require("express");
const router = express.Router();
const dechargeController = require("../controllers/DechargeController");
const { authMiddleware } = require("../middlewares/auth");

// Middleware de rôle : seuls ADMIN et MEMBRE_DPE peuvent créer/annuler des décharges
const estMembreDPE = (req, res, next) => {
  if (req.user.role === "ADMIN_DPE" || req.user.role === "MEMBRE_DPE") {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: "Accès refusé : Opération réservée à la DPE.",
  });
};

// ==========================================
// CRÉATION DES DÉCHARGES (POST)
// ==========================================
// POST /api/decharges/type1  → Distribution DPE → District
// POST /api/decharges/type2  → Envoi maintenance (ouvre dossier suivi)
// POST /api/decharges/type3  → Retour maintenance (clôture dossier suivi)
router.post("/type1", authMiddleware, estMembreDPE, dechargeController.creerDechargeType1);
router.post("/type2", authMiddleware, estMembreDPE, dechargeController.creerDechargeType2);
router.post("/type3", authMiddleware, estMembreDPE, dechargeController.creerDechargeType3);

// ==========================================
// CONSULTATION (GET)
// ==========================================
// GET /api/decharges/liste                  → Liste paginée de toutes les décharges
// GET /api/decharges/details/:id            → Détail complet d'une décharge
// GET /api/decharges/:numero/imprimer       → HTML imprimable (format Annexe 4 du CDC)
// GET /api/decharges/historique/:numerocarte → Historique d'une carte
router.get("/liste", authMiddleware, dechargeController.getAllDecharges);
router.get("/next-bts", authMiddleware, dechargeController.getNextBTS);
router.get("/details/:id", authMiddleware, dechargeController.voirDetailsDecharge);
router.get("/:numero/imprimer", authMiddleware, dechargeController.imprimerDecharge);
router.get("/historique/:numerocarte", authMiddleware, dechargeController.getHistoriqueCarte);

// ==========================================
// MISES À JOUR (PUT / PATCH)
// ==========================================
// PUT   /api/decharges/:numero/accuse-reception → Enregistrer la date de réception (CDC p.22)
// PATCH /api/decharges/:numero/bts              → Modifier le N° BTS (facultatif, modifiable)
router.put("/:numero/accuse-reception", authMiddleware, dechargeController.accuserReception);
router.patch("/:numero/bts", authMiddleware, estMembreDPE, dechargeController.modifierBTS);

// ==========================================
// ANNULATION (DELETE)
// ==========================================
// DELETE /api/decharges/annuler/:numero → Annuler et remettre les cartes en stock
router.delete("/annuler/:numero", authMiddleware, estMembreDPE, dechargeController.annulerDecharge);

module.exports = router;
