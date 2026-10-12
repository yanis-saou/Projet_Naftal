const XLSX = require("xlsx");
const prisma = require("../config/prisma");
const { logAuditAction } = require("../utils/auditLogger");

const importTPE = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: "Aucun fichier fourni.",
    });
  }

  let rows;
  try {
    const workbook = XLSX.read(req.file.buffer, {
      type: "buffer",
      cellDates: true,
    });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    rows = XLSX.utils.sheet_to_json(worksheet, { defval: null });
  } catch (parseError) {
    return res.status(400).json({
      success: false,
      message: "Impossible de lire le fichier Excel.",
      erreur: parseError.message,
    });
  }

  if (!rows || rows.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Le fichier est vide.",
    });
  }

  console.log("📋 Colonnes Excel détectées :", Object.keys(rows[0]));

  const resultats = { total: rows.length, inseres: 0, ignores: 0, erreurs: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const numeroLigne = i + 2;

    // ── Extraction des champs ──
    const numeroSerie =
      row["N_serie TPE"]?.toString().trim() ||
      row["numeroserietpe"]?.toString().trim() ||
      row["N_Serie_TPE"]?.toString().trim();

    const codeStation =
      row["Code_Station"]?.toString().trim() ||
      row["code_station"]?.toString().trim();

    const district =
      row["District"]?.toString().trim() ||
      row["district"]?.toString().trim() ||
      "NON_DEFINI";

    const dotation =
      row["Dotation"]?.toString().trim() ||
      row["dotation"]?.toString().trim() ||
      row["Modele"]?.toString().trim() ||
      "STANDARD";

    const numeroSerieSim =
      row["N_Serie_SIM"]?.toString().trim() ||
      row["numero_serie_sim"]?.toString().trim() ||
      "SIM-INCONNU";

    const adresseIPSim =
      row["Adresse_IP_SIM"]?.toString().trim() ||
      row["adresse_IP_SIM"]?.toString().trim() ||
      "0.0.0.0";

    const nTelephoneSim =
      row["N_Telephone_SIM"]?.toString().trim() ||
      row["n_telephone_SIM"]?.toString().trim() ||
      "0000000000";

    // ── Champs optionnels ──
    const idtpe = row["ID_Terminal"]?.toString().trim() || null;
    const nomcommercial = row["Nom_Commercial"]?.toString().trim() || null;
    const adresse = row["Adresse"]?.toString().trim() || null;
    const wilaya = row["Wilaya"]?.toString().trim() || null;
    const codeStructure = row["Code_Structure"]?.toString().trim() || null;
    const raisonSociale = row["Raison_Sociale"]?.toString().trim() || null;
    const nCommande = row["N_Commande"]?.toString().trim() || null;

    // ── VALIDATION 1 : numéro de série OBLIGATOIRE ──
    if (!numeroSerie) {
      resultats.ignores++;
      resultats.erreurs.push({
        ligne: numeroLigne,
        raison: "N_serie TPE manquant — ligne ignorée.",
      });
      continue;
    }

    // ── VALIDATION 2 : code_structure OBLIGATOIRE ──
    if (!codeStructure) {
      resultats.ignores++;
      resultats.erreurs.push({
        ligne: numeroLigne,
        numeroSerie,
        raison: "Code_Structure manquant — ligne ignorée.",
      });
      continue;
    }

    // ── VALIDATION 3 : N_Commande OBLIGATOIRE ──
    if (!nCommande) {
      resultats.ignores++;
      resultats.erreurs.push({
        ligne: numeroLigne,
        numeroSerie,
        raison: "N_Commande manquant — ligne ignorée.",
      });
      continue;
    }

    // ── VALIDATION 4 : code_station OPTIONNEL (peut être null) ──
    // Pas de vérification, peut être null

    try {
      // ── Vérifier doublon ──
      const existant = await prisma.stock_tpe.findUnique({
        where: { numeroserietpe: numeroSerie },
      });
      if (existant) {
        resultats.ignores++;
        resultats.erreurs.push({
          ligne: numeroLigne,
          numeroSerie,
          raison: "Doublon ignoré — déjà dans la base.",
        });
        continue;
      }

      // ── Vérifier que la structure existe (OBLIGATOIRE) ──
      const structureTrouvee = await prisma.structure.findUnique({
        where: { code: codeStructure },
        include: { structure: true }, // ← pour avoir la structure parente
      });
      if (!structureTrouvee) {
        resultats.ignores++;
        resultats.erreurs.push({
          ligne: numeroLigne,
          numeroSerie,
          raison: `Structure "${codeStructure}" introuvable.`,
        });
        continue;
      }

      // Déterminer le district : si parent existe, prendre le nom du parent, sinon prendre le nom de la structure
      const districtValue =
        structureTrouvee.structure?.nom_structure ||
        structureTrouvee.nom_structure;

      // ── Vérifier que la station existe (OPTIONNEL - seulement si fournie) ──
      let stationTrouvee = null;
      if (codeStation) {
        stationTrouvee = await prisma.station.findUnique({
          where: { code_station: codeStation },
        });
        if (!stationTrouvee) {
          resultats.ignores++;
          resultats.erreurs.push({
            ligne: numeroLigne,
            numeroSerie,
            raison: `Station "${codeStation}" introuvable.`,
          });
          continue;
        }
      }

      // ── Vérifier dotation dans type_tpe ──
      const typeTpeTrouve = await prisma.type_tpe.findUnique({
        where: { libelle: dotation },
      });
      let dotationFinale = dotation;
      if (!typeTpeTrouve) {
        const premierType = await prisma.type_tpe.findFirst();
        if (!premierType) {
          resultats.ignores++;
          resultats.erreurs.push({
            ligne: numeroLigne,
            numeroSerie,
            raison: `Type TPE "${dotation}" introuvable.`,
          });
          continue;
        }
        dotationFinale = premierType.libelle;
        console.log(
          `⚠️ Ligne ${numeroLigne} : dotation "${dotation}" remplacée par "${dotationFinale}"`,
        );
      }

      // ── Vérifier que En_stock existe dans etat_tpe ──
      const etatTrouve = await prisma.etat_tpe.findUnique({
        where: { libelle: "En_stock" },
      });
      if (!etatTrouve) {
        resultats.ignores++;
        resultats.erreurs.push({
          ligne: numeroLigne,
          numeroSerie,
          raison: `L'état "En_stock" n'existe pas dans etat_tpe.`,
        });
        continue;
      }

      // ── Vérifier/Créer la commande (N_Commande) ──
      let commandeExistante = await prisma.commande_cib.findUnique({
        where: { numero_commande: nCommande },
      });
      
      // Si la commande n'existe pas, la créer avec le statut "En attente"
      if (!commandeExistante) {
        console.log(`⚠️ Ligne ${numeroLigne} : Création automatique de la commande "${nCommande}"`);
        commandeExistante = await prisma.commande_cib.create({
          data: {
            numero_commande: nCommande,
            statut: 'En attente',
            date_commande: new Date(),
            id_structure_emmetrice: structureTrouvee.idstructure,
            code_station: codeStation || null,
            raison_sociale: adresse || raisonSociale || null,
          },
        });
      }else {
  // IMPORTANT : Si elle existe, on met quand même à jour le district s'il est vide
  console.log(`🔄 Mise à jour du district pour la commande existante "${nCommande}"`);
  commandeExistante = await prisma.commande_cib.update({
    where: { numero_commande: nCommande },
    data: { 
      code_station: codeStation || null 
    }
  });
}

      // ── TRANSACTION : TPE + historique + màj commande ──
      await prisma.$transaction(async (tx) => {
        // A. Créer le TPE
        await tx.stock_tpe.create({
          data: {
            numeroserietpe: numeroSerie,
            code_station: codeStation, // OPTIONNEL
            district: districtValue,
            dotation: dotationFinale,
            numero_serie_sim: numeroSerieSim,
            adresse_IP_SIM: adresseIPSim,
            n_telephone_SIM: nTelephoneSim,
            etat_tpe: "En_stock",
            idtpe: idtpe,
            nomcommercial: nomcommercial,
            adresse: adresse,
            n_contrat: nCommande,
            wilaya: wilaya,
            code_structure: codeStructure,
            raisonsocialestructure: structureTrouvee.nom_structure, // ← garde le nom de la structure
            date_reception: new Date(),
          },
        });

        // B. Créer l'historique
        await tx.historique_tpe.create({
          data: {
            numeroserietpe: numeroSerie,
            ancienetat: "NON_EXISTANT",
            nouveletat: "En_stock",
            commentaire: `Import Excel — Structure : ${codeStructure}`,
            dateoperation: new Date(),
          },
        });

        // C. Mettre à jour le statut de la commande (vérifier et potentiellement fermer si tous les TPE sont reçus)
        const commande = await tx.commande_cib.findUnique({
          where: { numero_commande: nCommande },
        });

        if (commande) {
          // Compter TPE déjà liés à cette commande (APRÈS création du nouveau TPE ci-dessus)
          const tpesLies = await tx.stock_tpe.count({
            where: { n_contrat: nCommande },
          });

          // Quantité totale commandée (si des lignes de commande existent)
          const lignes = await tx.ligne_commande_cib.findMany({
            where: { id_commande: commande.id },
          });
          const quantiteTotale = lignes.reduce(
            (sum, l) => sum + (l.quantite || 0),
            0,
          );

          console.log(
            `📦 Commande ${nCommande} : ${tpesLies}/${quantiteTotale} TPE reçus`,
          );

          // Si tous les TPE sont reçus ET qu'il y a des lignes de commande → fermer la commande
          if (quantiteTotale > 0 && tpesLies >= quantiteTotale) {
            await tx.commande_cib.update({
              where: { numero_commande: nCommande },
              data: { statut: "Reçue" },
            });
            console.log(`✅ Commande ${nCommande} passée à "Reçue" !`);
          } else if (quantiteTotale === 0) {
            // Si aucune ligne de commande n'existe encore, garder le statut "En attente"
            console.log(`⏳ Commande ${nCommande} reste en "En attente" (pas encore de lignes de commande)`);
          }
        }
      });

      resultats.inseres++;
      await logAuditAction('Import TPE', `TPE ${numeroSerie} — Commande ${nCommande}`, null, req);
    } catch (error) {
      resultats.ignores++;
      resultats.erreurs.push({
        ligne: numeroLigne,
        numeroSerie,
        raison: error.message,
      });
      console.error(
        `❌ Ligne ${numeroLigne} (${numeroSerie}) :`,
        error.message,
      );
    }
  }

  return res.status(resultats.inseres > 0 ? 200 : 422).json({
    success: resultats.inseres > 0,
    message: `Import terminé : ${resultats.inseres} insérés, ${resultats.ignores} ignorés sur ${resultats.total}.`,
    resultats,
  });
};

module.exports = { importTPE };
