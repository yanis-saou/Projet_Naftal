const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const { getScopeFilters, combineWhere } = require("../middlewares/scopeMiddleware");

/**
 * Ouvre un dossier de suivi (Appelé par Décharge Type 2)
 */
const ouvrirDossierSuivi = async (tx, numerocarte, anomalie, date, code_structure) => {
  // Vérifier s'il existe déjà un dossier ouvert pour cette carte
  // (créé par exemple par changerEtat sur une carte Défectueuse/Perdue/Volée).
  // Dans ce cas, on met à jour le dossier existant avec trs_dpe_dcsi plutôt que
  // d'en créer un second — sinon updateSuiviCarte modifie le mauvais dossier
  // et getSuiviCartes déduplique sur le nouveau (sans les modifs) → perte de données.
  const existing = await tx.suivi_maintenance_cartes.findFirst({
    where: { numerocarte, date_validation: null },
    select: { id_suivi: true, trs_str_dpe: true, trs_dpe_dcsi: true },
  });

  if (existing) {
    return await tx.suivi_maintenance_cartes.update({
      where: { id_suivi: existing.id_suivi },
      data: {
        // Ne pas écraser les dates déjà posées (ex: updateSuiviCarte a fixé trs_dcsi_dpe)
        trs_str_dpe: existing.trs_str_dpe || date,
        trs_dpe_dcsi: existing.trs_dpe_dcsi || date,
      },
    });
  }

  return await tx.suivi_maintenance_cartes.create({
    data: {
      numerocarte: numerocarte,
      district: code_structure || "CENTRE",
      date_anomalie: date,
      etat_carte_suivi_maintenance_cartes_etat_panneToetat_carte: {
        connectOrCreate: {
          where: { libelle: anomalie },
          create: { libelle: anomalie },
        },
      },
      // L'ouverture du dossier coïncide avec la décharge type 2 (Envoi DPE → DCSI).
      // On pose explicitement trs_dpe_dcsi = date pour que la colonne "Envoi DPE→DCSI"
      // reflète bien le moment de l'action (et pas un défaut SQL).
      trs_str_dpe: date,
      trs_dpe_dcsi: date,
    },
  });
};

/**
 * Clôture un dossier de suivi (Appelé par Décharge Type 3)
 * Si aucun dossier ouvert n'existe, retourne null sans erreur
 */
const cloturerDossierSuivi = async (tx, ancienne, substitution, date, destination) => {
  const dossier = await tx.suivi_maintenance_cartes.findFirst({
    where: {
      numerocarte: ancienne,
      date_validation: null,
    },
  });

  if (!dossier) {
    // Si aucun dossier de maintenance ouvert n'existe, on log et on continue
    // Cela permet de traiter des cartes qui n'ont pas de dossier de suivi
    console.info(`ℹ️ Aucun dossier de maintenance ouvert pour la carte ${ancienne}, passage outre.`);
    return null;
  }

  // 1. Normalisation des structures
  const [structSource, structDest] = await Promise.all([
    tx.structure.findFirst({
      where: { OR: [{ code: String(dossier.district) }, { nom_structure: String(dossier.district) }] },
      select: { code: true, nom_structure: true }
    }),
    tx.structure.findFirst({
      where: { OR: [{ code: String(destination) }, { nom_structure: String(destination) }] },
      select: { code: true, nom_structure: true }
    })
  ]);

  const codeSource = structSource?.code || dossier.district;
  const codeCible = structDest?.code || destination;

  // 2. LOGIQUE DE VALIDATION ASSOUPLIE
  // On autorise le retour si :
  // - La destination est la DPE (cas rare de transfert)
  // - OU la source est le CENTRE/DPE (Retour de maintenance vers agence)
  // - OU les codes correspondent exactement
  const estProvenanceCentre = (codeSource === 'DPE_CENTRE' || codeSource === 'CENTRE' || codeSource === 'DPE');
  
  if (destination !== 'DPE_CENTRE' && !estProvenanceCentre && codeSource !== codeCible) {
    // Si ce n'est pas un retour du centre et que les districts ne correspondent pas, on avertit sans bloquer
    console.warn(
      `⚠️ Décalage de structure détecté pour ${ancienne} : Dossier ouvert à ${codeSource}, retour vers ${codeCible}.`
    );
    // Note : On ne "throw" plus d'erreur ici pour permettre la validation des stocks
  }

  // 3. Mise à jour du dossier
  return await tx.suivi_maintenance_cartes.update({
    where: { id_suivi: dossier.id_suivi },
    data: {
      trs_dpe_str: date,
      date_validation: date,
      numerocartesubstitution: substitution || ancienne,
    },
  });
};

// --- Reste des fonctions (getAllSuivis, etc.) ---
const getAllSuivis = async (req, res) => {
  try {
    const { whereSuiviCarte } = await getScopeFilters(req);
    const suivis = await prisma.suivi_maintenance_cartes.findMany({
      where: whereSuiviCarte,
      orderBy: { date_anomalie: "desc" },
    });
    const suivisAvecDuree = suivis.map((s) => {
      let duree = "En cours";
      if (s.date_anomalie && s.date_validation) {
        const debut = new Date(s.date_anomalie);
        const fin = new Date(s.date_validation);
        const jours = Math.floor((fin - debut) / (1000 * 60 * 60 * 24));
        duree = `${jours} jours`;
      }
      return { ...s, duree_immobilisation: duree };
    });
    res.json({ success: true, data: suivisAvecDuree });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getSuiviByCarte = async (req, res) => {
  try {
    const { numerocarte } = req.params;
    const { whereCarte, whereSuiviCarte } = await getScopeFilters(req);
    const carte = await prisma.stock_carte.findFirst({
      where: combineWhere(whereCarte, { numerocarte }),
      select: { numerocarte: true },
    });
    if (!carte) return res.status(404).json({ success: false, message: "Carte introuvable." });
    const suivi = await prisma.suivi_maintenance_cartes.findMany({
      where: combineWhere(whereSuiviCarte, { numerocarte }),
      orderBy: { date_anomalie: "desc" },
    });
    res.json({ success: true, data: suivi });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateEtapeTechnique = async (req, res) => {
  const { id_suivi, etape, date } = req.body;
  const etapesValides = ["trs_str_dpe", "trs_dpe_dcsi", "trs_dcsi_dpe", "trs_dpe_str"];
  if (!etapesValides.includes(etape)) return res.status(400).json({ error: "Étape TRS invalide" });
  try {
    const { whereSuiviCarte } = await getScopeFilters(req);
    const suivi = await prisma.suivi_maintenance_cartes.findFirst({
      where: combineWhere(whereSuiviCarte, { id_suivi: parseInt(id_suivi) }),
      select: { id_suivi: true },
    });
    if (!suivi) return res.status(404).json({ error: "Suivi introuvable" });
    const update = await prisma.suivi_maintenance_cartes.update({
      where: { id_suivi: parseInt(id_suivi) },
      data: { [etape]: date ? new Date(date) : new Date() },
    });
    res.json({ success: true, data: update });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateSuiviCarte = async (req, res) => {
  const { numerocarte, dateRetourDcsiDpe, etatPanne, observation, diagnostic } = req.body;
  
  if (!numerocarte) {
    return res.status(400).json({ success: false, message: "Le numéro de carte est obligatoire." });
  }
  
  try {
    const { whereCarte, whereSuiviCarte } = await getScopeFilters(req);
    
    // Vérifier que la carte existe
    const carte = await prisma.stock_carte.findFirst({
      where: combineWhere(whereCarte, { numerocarte }),
      select: { numerocarte: true },
    });
    if (!carte) {
      return res.status(404).json({ success: false, message: "Carte introuvable." });
    }
    
    // Trouver le dossier de suivi actif le plus récent (non validé)
    // ORDER BY id_suivi DESC pour garantir qu'on modifie le dernier dossier ouvert,
    // et non un ancien dossier créé par changerEtat avant l'envoi DCSI.
    const suivi = await prisma.suivi_maintenance_cartes.findFirst({
      where: combineWhere(whereSuiviCarte, { 
        numerocarte: numerocarte,
        date_validation: null // Dossier encore ouvert
      }),
      orderBy: { id_suivi: "desc" },
    });
    
    if (!suivi) {
      return res.status(404).json({ success: false, message: "Aucun dossier de suivi actif trouvé pour cette carte." });
    }
    
    // Préparer les données de mise à jour
    const updateData = {};
    
    if (dateRetourDcsiDpe) {
      updateData.trs_dcsi_dpe = new Date(dateRetourDcsiDpe);
    }
    
    if (etatPanne) {
      // Mettre à jour l'état de panne
      await prisma.etat_carte.upsert({
        where: { libelle: etatPanne },
        update: {},
        create: { libelle: etatPanne },
      });
      
      updateData.etat_carte_suivi_maintenance_cartes_etat_panneToetat_carte = {
        connect: { libelle: etatPanne }
      };
    }
    
    // Le champ observation n'existe pas dans la table, on utilise objet_dia pour stocker l'observation
    if (observation) {
      updateData.objet_dia = observation;
    }
    
    // Gérer le champ diagnostic
    if (diagnostic) {
      // Mettre à jour le diagnostic
      await prisma.etat_carte.upsert({
        where: { libelle: diagnostic },
        update: {},
        create: { libelle: diagnostic },
      });
      
      updateData.etat_carte_suivi_maintenance_cartes_diagnostiqueToetat_carte = {
        connect: { libelle: diagnostic }
      };
    }
    
    // Mettre à jour la date de validation et l'utilisateur qui a modifié
    updateData.date_validation = new Date();
    updateData.valide_par = req.user?.prenom && req.user?.nom 
      ? `${req.user.prenom} ${req.user.nom}`.trim()
      : req.user?.email || 'Utilisateur inconnu';
    
    // Mettre à jour le dossier de suivi
    const updatedSuivi = await prisma.suivi_maintenance_cartes.update({
      where: { id_suivi: suivi.id_suivi },
      data: updateData,
    });
    
    res.json({ 
      success: true, 
      data: updatedSuivi,
      message: "Suivi mis à jour avec succès."
    });
    
  } catch (error) {
    console.error("Erreur lors de la mise à jour du suivi:", error);
    res.status(500).json({ 
      success: false, 
      message: "Erreur serveur lors de la mise à jour du suivi.",
      erreur: error.message 
    });
  }
};

module.exports = {
  ouvrirDossierSuivi,
  cloturerDossierSuivi,
  getAllSuivis,
  getSuiviByCarte,
  updateEtapeTechnique,
  updateSuiviCarte,
};