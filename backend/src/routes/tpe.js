// src/routes/tpe.js
const express = require('express');
const router = express.Router();
const tpeController = require('../controllers/tpeController');
const commandeController = require('../controllers/commandeController');
const upload = require('../middlewares/upload');
const importControllerTpe = require('../controllers/importControllertpe');
const importTPE = importControllerTpe.importTPE;

const { authMiddleware, authorizeRoles } = require('../middlewares/auth');

router.use(authMiddleware);

// ============================================================
// ROUTES EN LECTURE SEULE
// ============================================================
router.get('/stock', tpeController.getStock);
router.get('/maintenance-stock', tpeController.getMaintenanceStock);
router.get('/parc', tpeController.getParc);
router.get('/maintenance', tpeController.getMaintenance);
router.get('/maintenance/suivi/:id', tpeController.getSuiviMaintenance);
router.get('/transferts', tpeController.getTransferts);
router.get('/decharge/:numero/print', tpeController.printDecharge);
router.get('/commandes', commandeController.getCommandes);
router.get('/commandes/:id', commandeController.getCommandeById);
router.get('/types-tpe', tpeController.getTypesTpe);
router.get('/structures', tpeController.getStructures);
router.get('/stations', tpeController.getStations);
router.get('/stations/structure/:idstructure', tpeController.getStationsByStructure);

// ✅ DÉPLACÉ : La route /suivi est maintenant avant les routes /:id
router.get('/suivi', authorizeRoles('ADMIN_DPE', 'MEMBRE_DPE'), tpeController.getSuiviTpes);

// ✅ LES ROUTES DYNAMIQUES SONT PLACÉES APRÈS LES ROUTES STATIQUES
router.get('/:id', tpeController.getTPEById);
router.get('/:id/historique', tpeController.getHistoriqueTPE);

// ============================================================
// ROUTES RÉSERVÉES À LA DPE (ADMIN_DPE ou MEMBRE_DPE)
// ============================================================
router.post('/import', authorizeRoles('ADMIN_DPE', 'MEMBRE_DPE'), upload.single('file'), importTPE);
router.post('/transfert/type1', authorizeRoles('ADMIN_DPE', 'MEMBRE_DPE'), tpeController.genererTransfertType1);
router.post('/transfert/type2', authorizeRoles('ADMIN_DPE', 'MEMBRE_DPE'), tpeController.genererTransfertType2);
router.post('/transfert/type3', authorizeRoles('ADMIN_DPE', 'MEMBRE_DPE'), tpeController.genererTransfertType3);

router.put('/suivi', authorizeRoles('ADMIN_DPE', 'MEMBRE_DPE'), tpeController.updateSuiviTpe);
router.put('/transferts/:id/reception', authorizeRoles('ADMIN_DPE', 'MEMBRE_DPE'), tpeController.accuseReception);
router.post('/restitution', authorizeRoles('ADMIN_DPE', 'MEMBRE_DPE'), tpeController.restituerTPE);
router.post('/reconfigurer', authorizeRoles('ADMIN_DPE', 'MEMBRE_DPE'), tpeController.reconfigurerTPE);
router.post('/', authorizeRoles('ADMIN_DPE', 'MEMBRE_DPE'), tpeController.creerTPE);

router.put('/:id/etat', authorizeRoles('ADMIN_DPE', 'MEMBRE_DPE'), tpeController.changerEtat);
router.post('/:id/suivi', authorizeRoles('ADMIN_DPE', 'MEMBRE_DPE'), tpeController.creerSuivi);

// Commandes
router.get('/commandes/stats', authorizeRoles('ADMIN_DPE', 'MEMBRE_DPE'), commandeController.getCommandesStats);
router.get('/commandes/export/bea', authorizeRoles('ADMIN_DPE', 'MEMBRE_DPE'), commandeController.exporterVersBEA);
router.post('/commandes/regrouper', authorizeRoles('ADMIN_DPE', 'MEMBRE_DPE'), commandeController.regrouperEtExporter);
router.put('/commandes/:id/statut', authorizeRoles('ADMIN_DPE', 'MEMBRE_DPE'), commandeController.changerStatutCommande);
router.post('/commandes/:id/confirmer', authorizeRoles('ADMIN_DPE', 'MEMBRE_DPE'), commandeController.confirmerCommande);

// Structures
router.post('/commandes', authorizeRoles(
    'ADMIN_DPE',
    'MEMBRE_DPE',
    'MEMBRE_DISTRICT',
    'MEMBRE_AGENCE',
    'MEMBRE_ANTENNE'
), commandeController.creerCommande);

router.post('/panne/signaler', authorizeRoles(
    'ADMIN_DPE',
    'MEMBRE_DPE',
    'MEMBRE_DISTRICT',
    'MEMBRE_AGENCE',
    'MEMBRE_ANTENNE'
), tpeController.signalerPanne);

module.exports = router;