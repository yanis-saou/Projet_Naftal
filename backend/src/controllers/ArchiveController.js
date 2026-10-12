const prisma = require("../config/prisma");
const { logAuditAction } = require("../utils/auditLogger");

async function findCardBts(numerocarte) {
  try {
    const circ = await prisma.circulation_carte.findFirst({
      where: { numerocarte },
      include: { decharge_carte: true },
    });
    if (circ?.decharge_carte?.numero_bordereau_bts) {
      return circ.decharge_carte.numero_bordereau_bts;
    }

    const dechargeNumbers = new Set();

    const t1s = await prisma.ligne_decharge_carte_type1.findMany({
      where: { numero_carte: numerocarte },
      select: { numero_decharge: true },
    });
    t1s.forEach((l) => { if (l.numero_decharge) dechargeNumbers.add(l.numero_decharge); });

    const t2s = await prisma.ligne_decharge_carte_type2.findMany({
      where: { numero_carte: numerocarte },
      select: { numero_decharge: true },
    });
    t2s.forEach((l) => { if (l.numero_decharge) dechargeNumbers.add(l.numero_decharge); });

    const t3s = await prisma.ligne_decharge_carte_type3.findMany({
      where: { numero_carte_origine: numerocarte },
      select: { numero_decharge: true },
    });
    t3s.forEach((l) => { if (l.numero_decharge) dechargeNumbers.add(l.numero_decharge); });

    if (dechargeNumbers.size > 0) {
      const decharge = await prisma.decharge_carte.findFirst({
        where: {
          numero_decharge: { in: Array.from(dechargeNumbers) },
          numero_bordereau_bts: { not: null },
        },
        orderBy: { date_creation: "desc" },
      });
      if (decharge?.numero_bordereau_bts) {
        return decharge.numero_bordereau_bts;
      }
    }
  } catch (_) {}
  return null;
}

const getArchivedCards = async (req, res, next) => {
  try {
    const archives = await prisma.archivee_carte.findMany({
      orderBy: { date_archivage: "desc" },
    });
    res.json({ success: true, archives });
  } catch (error) {
    next(error);
  }
};

const archiveCard = async (req, res, next) => {
  try {
    const { numerocarte, motif } = req.body;

    if (!numerocarte) {
      return res.status(400).json({ success: false, message: "numerocarte requis." });
    }

    const carte = await prisma.stock_carte.findUnique({
      where: { numerocarte },
    });

    if (!carte) {
      return res.status(404).json({ success: false, message: "Carte non trouvée." });
    }

    const btsValue = await findCardBts(numerocarte);

    const archive = await prisma.archivee_carte.create({
      data: {
        numerocarte,
        etat: carte.etat || null,
        district: carte.district || null,
        code_structure: carte.code_structure || null,
        code_client: carte.code_client || null,
        proprietaire: carte.proprietaire || carte.raisonsocialeclient || null,
        bts: btsValue,
        motif: motif || null,
        archive_par: req.user?.prenom && req.user?.nom
          ? `${req.user.prenom} ${req.user.nom}`.trim()
          : req.user?.email || "Système",
      },
    });

    await prisma.stock_carte.update({
      where: { numerocarte },
      data: { etat: "Archivée", statut: "Sortie" },
    });

    await prisma.historique_carte.create({
      data: {
        numerocarte,
        ancienetat: carte.etat,
        nouveletat: "Archivée",
        commentaire: motif || "Archivage de la carte",
        id_utilisateur: req.user?.id || null,
      },
    });

    await logAuditAction("Archivage carte", numerocarte, null, req);

    res.status(201).json({ success: true, message: "Carte archivée.", archive });
  } catch (error) {
    next(error);
  }
};

const restoreArchivedCard = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: "ID archive invalide." });
    }

    const archive = await prisma.archivee_carte.findUnique({
      where: { id_archive: id },
    });

    if (!archive) {
      return res.status(404).json({ success: false, message: "Entrée archive non trouvée." });
    }

    await prisma.archivee_carte.delete({
      where: { id_archive: id },
    });

    if (archive.numerocarte) {
      await prisma.stock_carte.update({
        where: { numerocarte: archive.numerocarte },
        data: { etat: "Renouvelée", statut: null, nature_carte: "Renouveler" },
      });

      await prisma.historique_carte.create({
        data: {
          numerocarte: archive.numerocarte,
          ancienetat: "Archivée",
          nouveletat: "Renouvelée",
          commentaire: `Restauration depuis archive vers Renouvelée. Motif initial: ${archive.motif || ""}`,
          id_utilisateur: req.user?.id || null,
        },
      });
    }

    await logAuditAction("Restauration archive", archive.numerocarte, null, req);

    res.json({ success: true, message: "Carte restaurée depuis l'archive." });
  } catch (error) {
    next(error);
  }
};

const clearArchives = async (req, res, next) => {
  try {
    await prisma.archivee_carte.deleteMany({});

    await logAuditAction("Suppression archive", "Archive cartes", null, req);

    res.json({ success: true, message: "Archive vidée." });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getArchivedCards,
  archiveCard,
  restoreArchivedCard,
  clearArchives,
};
