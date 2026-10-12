const prisma = require("../config/prisma");

// Créer un porteur et lui assigner une carte immédiatement
const creerPorteurEtAssignerCarte = async (req, res) => {
  const { matricule, nom, prenom, id_structure, numerocarte } = req.body;

  try {
    const resultat = await prisma.$transaction(async (tx) => {
      // 1. Créer ou mettre à jour les infos du porteur (Upsert)
      const porteur = await tx.porteur.upsert({
        where: { matricule: matricule },
        update: {
          nom: nom,
          prenom: prenom,
          id_structure: id_structure,
        },
        create: {
          matricule: matricule,
          nom: nom,
          prenom: prenom,
          id_structure: id_structure,
        },
      });

      // 2. Si un numéro de carte est fourni, on l'assigne à ce porteur dans le stock
      if (numerocarte) {
        // Vérifier si la carte existe
        const carte = await tx.stock_carte.findUnique({
          where: { numerocarte: numerocarte },
        });

        if (!carte)
          throw new Error(
            `La carte ${numerocarte} n'existe pas dans le stock.`,
          );

        await tx.stock_carte.update({
          where: { numerocarte: numerocarte },
          data: { id_porteur: porteur.id_porteur },
        });
      }

      return porteur;
    });

    res.status(201).json({
      success: true,
      message: "Porteur créé et carte assignée avec succès",
      data: resultat,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Récupérer la liste des porteurs avec leurs cartes
const getPorteurs = async (req, res) => {
  try {
    const porteurs = await prisma.porteur.findMany({
      include: {
        stock_carte: true, // Pour voir quelle carte possède chaque porteur
      },
    });
    res.json({ success: true, data: porteurs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  creerPorteurEtAssignerCarte,
  getPorteurs,
};
