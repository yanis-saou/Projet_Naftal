const express = require("express");
const router = express.Router();
const porteurController = require("../controllers/PorteurController");
const authMiddleware = require("../middlewares/auth");

// Route pour enregistrer un porteur (ex: un chauffeur qui reçoit sa carte)
router.post(
  "/assigner",
  authMiddleware,
  porteurController.creerPorteurEtAssignerCarte,
);

// Route pour lister les porteurs
router.get("/liste", authMiddleware, porteurController.getPorteurs);

module.exports = router;
