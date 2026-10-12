const prisma = require("../config/prisma");
const {
  ouvrirDossierSuivi,
  cloturerDossierSuivi,
} = require("./SuiviAnomalieController");
const AppError = require("../utils/AppError");
const {
  getScopeFilters,
  combineWhere,
  matchesScope,
} = require("../middlewares/scopeMiddleware");

const normalizeStructureValue = (value) => String(value || "").trim();

const structureIdentityKey = (value) =>
  normalizeStructureValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

const resolveStructureCodeFromList = (structures, value) => {
  const raw = normalizeStructureValue(value);
  if (!raw || raw === "DPE_CENTRE") return raw;

  const key = structureIdentityKey(raw);
  const match = structures.find((structure) => {
    return [structure?.code, structure?.nom_structure].some(
      (candidate) => structureIdentityKey(candidate) === key,
    );
  });

  return match?.code || raw;
};

const canAccessCarteLine = (scope, line = {}) =>
  matchesScope(scope, {
    code_structure:
      line.stock_carte?.code_structure ||
      line.district_concerne ||
      line.structure,
    district: line.stock_carte?.district,
    raisonsocialestructure:
      line.stock_carte?.raisonsocialestructure ||
      line.structure_concernee ||
      line.structure,
  });

const canAccessCarteDecharge = (scope, decharge = {}) => {
  if (!scope || scope.isGlobal) return true;

  const lignes = [
    ...(decharge.ligne_decharge_carte_type1 || []),
    ...(decharge.ligne_decharge_carte_type2 || []),
    ...(decharge.ligne_decharge_carte_type3 || []),
  ];

  return lignes.some((ligne) => canAccessCarteLine(scope, ligne));
};

const getAccessibleCarteDechargeNumbers = async (scope) => {
  if (!scope || scope.isGlobal) return null;

  const [lignesType1, lignesType2, lignesType3] = await Promise.all([
    prisma.ligne_decharge_carte_type1.findMany({
      select: {
        numero_decharge: true,
        structure_concernee: true,
        district_concerne: true,
        stock_carte: {
          select: {
            code_structure: true,
            district: true,
            raisonsocialestructure: true,
          },
        },
      },
    }),
    prisma.ligne_decharge_carte_type2.findMany({
      select: {
        numero_decharge: true,
        structure: true,
        stock_carte: {
          select: {
            code_structure: true,
            district: true,
            raisonsocialestructure: true,
          },
        },
      },
    }),
    prisma.ligne_decharge_carte_type3.findMany({
      select: {
        numero_decharge: true,
        structure: true,
        stock_carte: {
          select: {
            code_structure: true,
            district: true,
            raisonsocialestructure: true,
          },
        },
      },
    }),
  ]);

  const numeros = new Set();
  [...lignesType1, ...lignesType2, ...lignesType3].forEach((ligne) => {
    if (ligne.numero_decharge && canAccessCarteLine(scope, ligne)) {
      numeros.add(ligne.numero_decharge);
    }
  });

  return [...numeros];
};

// ==========================================
// UTILITAIRES INTERNES
// ==========================================

/**
 * Valide que la date de sortie n'est pas dans le futur.
 */
const validerDateSortie = (date_sortie) => {
  const maintenant = new Date();
  const dateSelectionnee = date_sortie ? new Date(date_sortie) : maintenant;
  if (dateSelectionnee > maintenant) {
    throw new Error("La date de sortie ne peut pas être dans le futur.");
  }
  return dateSelectionnee;
};

const genererNumeroDecharge = async () => {
  const annee = new Date().getFullYear();
  const prefix = `${annee}/`;

  // 1. Chercher la décharge avec le numéro le plus élevé pour cette année
  const derniereDecharge = await prisma.decharge_carte.findFirst({
    where: {
      numero_decharge: { startsWith: prefix },
    },
    orderBy: {
      numero_decharge: "desc", // Trie du plus grand au plus petit
    },
  });

  let nextNumero = 1;

  // 2. Si on a trouvé une décharge, on extrait son numéro et on fait +1
  if (derniereDecharge && derniereDecharge.numero_decharge) {
    // Sépare "2026/0015" en ["2026", "0015"]
    const parties = derniereDecharge.numero_decharge.split("/");

    if (parties.length === 2) {
      const dernierChiffre = parseInt(parties[1], 10);
      if (!isNaN(dernierChiffre)) {
        nextNumero = dernierChiffre + 1;
      }
    }
  }

  // 3. Formater sur 4 chiffres (ex: 1 -> "0001", 15 -> "0015")
  const numeroFormate = String(nextNumero).padStart(4, "0");

  return `${prefix}${numeroFormate}`;
};

// ==========================================
// 1. TYPE 1 : Distribution (DPE → District)
// Carte neuve retirée du stock, mise en circulation dans la structure.
// CDC p.22 : "Nouvelle carte → retirée du Stock → ajoutée en circulation avec état En circulation"
// ==========================================
const creerDechargeType1 = async (req, res, next) => {
  const {
    source,
    destination,
    nom_beneficiaire,
    fonction_beneficiaire,
    date_sortie,
    numero_bordereau_bts,
    cartes, // [{ numero, raison_sociale, code_client, raisonsocialeclient }]
  } = req.body;

  if (!destination) {
    return res
      .status(400)
      .json({
        success: false,
        message: "Le champ 'destination' est obligatoire.",
      });
  }
  if (!cartes || cartes.length === 0) {
    return res
      .status(400)
      .json({ success: false, message: "Aucune carte sélectionnée." });
  }

  try {
    const dateValidee = validerDateSortie(date_sortie);
    const numeroDecharge = await genererNumeroDecharge();

    const resultat = await prisma.$transaction(async (tx) => {
      // Créer la décharge
      const nouvelleDecharge = await tx.decharge_carte.create({
        data: {
          numero_decharge: numeroDecharge,
          numero_bordereau_bts: numero_bordereau_bts || null,
          source: source || "DPE_CENTRE",
          destination,
          nom_beneficiaire: nom_beneficiaire || null,
          fonction_beneficiaire: fonction_beneficiaire || null,
          date_sortie: dateValidee,
        },
      });

      for (const item of cartes) {
        // Récupérer l'état actuel de la carte
        const avant = await tx.stock_carte.findUnique({
          where: { numerocarte: item.numero },
        });

        const etatsAutorisés = ["En_stock", "Renouvelée"];
        if (!avant || !etatsAutorisés.includes(avant.etat)) {
          throw new AppError(
            `La carte ${item.numero} n'est pas disponible en stock (état actuel : ${avant?.etat || "introuvable"}).`,
            400,
          );
        }

        // La carte passe directement en circulation vers la structure destinataire.
        await tx.stock_carte.update({
          where: { numerocarte: item.numero },
          data: {
            etat: "En_circulation",
            statut: "Sortie",
            code_structure: destination,
            date_remise: dateValidee,
          },
        });

        // Insertion dans circulation_carte : la carte quitte le stock DPE et
        // devient active dans la structure destinataire (CDC p.22).
        await tx.circulation_carte.create({
          data: {
            numerocarte: item.numero,
            district: avant.district,
            code_structure: destination,
            raisonsocialestructure: item.raison_sociale || null,
            code_client: item.code_client || avant.code_client || null,
            raisonsocialeclient:
              item.raisonsocialeclient || avant.raisonsocialeclient || null,
            numero_decharge: nouvelleDecharge.numero_decharge,
            date_sortie: dateValidee,
            amortissement: avant.amortissement,
            numero_porteur: avant.numeroporteur,
            etat: "En_circulation",
          },
        });

        // Audit trail
        await tx.historique_carte.create({
          data: {
            numerocarte: item.numero,
            ancienetat: avant.etat,
            nouveletat: "En_circulation",
            structure_ancienne: avant.code_structure,
            structure_actuelle: destination,
            id_utilisateur: req.user?.id || null,
            commentaire: `Transfert via décharge ${numeroDecharge}`,
          },
        });

        // Ligne de décharge
        await tx.ligne_decharge_carte_type1.create({
          data: {
            numero_decharge: nouvelleDecharge.numero_decharge,
            numero_carte: item.numero,
            structure_concernee: item.raison_sociale || null,
            district_concerne: destination,
            code_client: item.code_client || null,
            raisonsocialeclient: item.raisonsocialeclient || null,
          },
        });
      }

      return nouvelleDecharge;
    });

    res.status(201).json({
      success: true,
      message: `Décharge ${resultat.numero_decharge} créée avec succès.`,
      data: resultat,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 2. TYPE 2 : Envoi en Maintenance (Structure → DPE → DCSI)
// Carte défectueuse/perdue/volée envoyée à la DCSI pour traitement.
// CDC p.21 : ouvre automatiquement un dossier dans Suivi cartes NAFTALCARD.
// ==========================================
const creerDechargeType2 = async (req, res, next) => {
  const {
    destination,
    nom_beneficiaire,
    fonction_beneficiaire,
    date_sortie,
    numero_bordereau_bts, // Ajouté (manquait dans l'ancienne version)
    cartesAnomalies, // [{ numero, anomalie }]
  } = req.body;

  if (!cartesAnomalies || cartesAnomalies.length === 0) {
    return res
      .status(400)
      .json({ success: false, message: "Aucune carte fournie." });
  }

  const perfStart = Date.now();
  const perfMark = (label, since) =>
    console.log(`[perf][decharge Type2] ${label}: ${Date.now() - since}ms`);

  try {
    const dateValidee = validerDateSortie(date_sortie);
    const tNum = Date.now();
    const numeroDecharge = await genererNumeroDecharge();
    perfMark("genererNumeroDecharge", tNum);

    const tTx = Date.now();
    const resultat = await prisma.$transaction(async (tx) => {
      const tCreate = Date.now();
      const nouvelleDecharge = await tx.decharge_carte.create({
        data: {
          numero_decharge: numeroDecharge,
          numero_bordereau_bts: numero_bordereau_bts || null, // AJOUT
          source: "DPE_CENTRE",
          destination: destination || "DCSI_MAINTENANCE",
          nom_beneficiaire: nom_beneficiaire || null,
          fonction_beneficiaire: fonction_beneficiaire || null,
          date_sortie: dateValidee,
        },
      });
      perfMark("tx.decharge_carte.create", tCreate);

      let idx = 0;
      for (const item of cartesAnomalies) {
        const tItem = Date.now();
        idx++;
        const tFind = Date.now();
        const avant = await tx.stock_carte.findUnique({
          where: { numerocarte: item.numero },
        });
        perfMark(`item#${idx} stock_carte.findUnique`, tFind);
        if (!avant)
          throw new AppError(`La carte ${item.numero} n'existe pas.`, 400);

        // La carte passe "En cours de traitement" pendant la maintenance.
        // Utilise la relation avec connectOrCreate pour auto-seeder le libellé
        // s'il manque dans etat_carte (évite P2003 sur stock_carte_etat_fkey).
        const tUpd = Date.now();
        await tx.stock_carte.update({
          where: { numerocarte: item.numero },
          data: {
            etat_carte: {
              connectOrCreate: {
                where: { libelle: "En cours de traitement" },
                create: { libelle: "En cours de traitement" },
              },
            },
            statut: "Sortie",
          },
        });
        perfMark(`item#${idx} stock_carte.update`, tUpd);

        // Ouverture automatique du dossier de suivi (CDC p.20)
        const tSuivi = Date.now();
        await ouvrirDossierSuivi(
          tx,
          item.numero,
          item.anomalie,
          dateValidee,
          avant.code_structure,
        );
        perfMark(`item#${idx} ouvrirDossierSuivi`, tSuivi);

        // Audit trail
        const tHist = Date.now();
        await tx.historique_carte.create({
          data: {
            numerocarte: item.numero,
            ancienetat: avant.etat,
            nouveletat: "En cours de traitement",
            structure_ancienne: avant.code_structure,
            structure_actuelle: avant.code_structure,
            id_utilisateur: req.user?.id || null,
            commentaire: `Envoi maintenance via décharge ${numeroDecharge} — Anomalie : ${item.anomalie}`,
          },
        });
        perfMark(`item#${idx} historique_carte.create`, tHist);

        // Prisma masque potentiellement le scalaire `numero_carte` (même collision
        // que Type-3). On passe par la relation pour rester robuste.
        const tLigne = Date.now();
        await tx.ligne_decharge_carte_type2.create({
          data: {
            numero_decharge: nouvelleDecharge.numero_decharge,
            stock_carte: { connect: { numerocarte: item.numero } },
            anomalie_constatee: item.anomalie,
            raisonsocialeclient: item.raisonsocialeclient || null,
          },
        });
        perfMark(`item#${idx} ligne_decharge_carte_type2.create`, tLigne);
        perfMark(`item#${idx} TOTAL`, tItem);
      }

      return nouvelleDecharge;
    });
    perfMark("prisma.$transaction", tTx);
    perfMark("TOTAL creerDechargeType2", perfStart);

    res.status(201).json({
      success: true,
      message: `Décharge ${resultat.numero_decharge} créée. Dossiers de suivi ouverts.`,
      data: resultat,
    });
  } catch (error) {
    console.error(
      `[perf][decharge Type2] FAILED after ${Date.now() - perfStart}ms`,
    );
    next(error);
  }
};

// ==========================================
// 3. TYPE 3 : Retour de Maintenance (DCSI → DPE → Structure)
// Carte réparée/remplacée retournée vers son district d'origine.
// CDC p.21 : clôture le dossier de suivi.
// ==========================================
const creerDechargeType3 = async (req, res, next) => {
  const {
    destination,
    nom_beneficiaire,
    fonction_beneficiaire,
    date_sortie,
    numero_bordereau_bts, // Ajouté
    operations, // [{ ancienne, substitution, diagnostic, etatFinal }]
  } = req.body;

  if (!operations || operations.length === 0) {
    return res
      .status(400)
      .json({ success: false, message: "Aucune opération fournie." });
  }

  const perfStart = Date.now();
  const perfMark = (label, since) =>
    console.log(`[perf][decharge Type3] ${label}: ${Date.now() - since}ms`);

  try {
    const dateValidee = validerDateSortie(date_sortie);
    const tNum = Date.now();
    const numeroDecharge = await genererNumeroDecharge();
    perfMark("genererNumeroDecharge", tNum);

    const tTx = Date.now();
    const resultat = await prisma.$transaction(async (tx) => {
      const tStruct = Date.now();
      const structures = await tx.structure.findMany({
        select: { code: true, nom_structure: true },
      });
      perfMark("structure.findMany", tStruct);
      const destinationRetour = resolveStructureCodeFromList(
        structures,
        destination,
      );

      const tCreate = Date.now();
      const nouvelleDecharge = await tx.decharge_carte.create({
        data: {
          numero_decharge: numeroDecharge,
          numero_bordereau_bts: numero_bordereau_bts || null, // AJOUT
          source: "DPE_CENTRE",
          destination: destinationRetour || destination || null,
          nom_beneficiaire: nom_beneficiaire || null,
          fonction_beneficiaire: fonction_beneficiaire || null,
          date_sortie: dateValidee,
        },
      });
      perfMark("tx.decharge_carte.create", tCreate);

      let idx = 0;
      for (const op of operations) {
        const tItem = Date.now();
        idx++;
        const tFind = Date.now();
        const carteOriginale = await tx.stock_carte.findUnique({
          where: { numerocarte: op.ancienne },
        });
        perfMark(`op#${idx} stock_carte.findUnique(ancienne)`, tFind);
        if (!carteOriginale)
          throw new AppError(`Carte [${op.ancienne}] introuvable.`, 404);

        // La structure de rattachement réelle est celle de la dernière mise
        // en circulation (Type 1). `stock_carte.code_structure` peut rester
        // DPE_CENTRE si la carte n'a pas été redistribuée, d'où le fallback.
        const tCirc = Date.now();
        const derniereCirculation = await tx.circulation_carte.findFirst({
          where: { numerocarte: op.ancienne },
          orderBy: { id_circulation: "desc" },
        });
        perfMark(`op#${idx} circulation_carte.findFirst`, tCirc);
        const structureRattachementBrut =
          derniereCirculation?.code_structure || carteOriginale.code_structure;
        const structureRattachement = resolveStructureCodeFromList(
          structures,
          structureRattachementBrut,
        );

        // Règle Naftal : vérification cohérence district (CDC p.21)
        if (
          structureRattachement &&
          destinationRetour &&
          destinationRetour !== "DPE_CENTRE" &&
          structureRattachement !== destinationRetour
        ) {
          throw new AppError(
            `Conflit : La carte ${op.ancienne} appartient à ${structureRattachement}, retour impossible vers ${destinationRetour}.`,
            400,
          );
        }
        // Clôture du dossier de suivi
        const tCloture = Date.now();
        await cloturerDossierSuivi(
          tx,
          op.ancienne,
          op.substitution,
          dateValidee,
          destinationRetour,
        );
        perfMark(`op#${idx} cloturerDossierSuivi`, tCloture);

        // Helper : relation avec connectOrCreate pour éviter P2003 si un libellé
        // d'état carte n'existe pas encore dans etat_carte.
        const etatConnect = (libelle) => ({
          connectOrCreate: {
            where: { libelle },
            create: { libelle },
          },
        });

        const tUpd = Date.now();
        if (op.substitution && op.substitution !== op.ancienne) {
          // Cas Substitution : ancienne → mise au rebut, nouvelle → en circulation
          await tx.stock_carte.update({
            where: { numerocarte: op.ancienne },
            data: { etat_carte: etatConnect("Archivée"), statut: "Sortie" },
          });
          await tx.stock_carte.update({
            where: { numerocarte: op.substitution },
            data: {
              etat_carte: etatConnect("En_circulation"),
              statut: "Sortie",
              ...(destinationRetour
                ? { structure: { connect: { code: destinationRetour } } }
                : {}),
            },
          });
          perfMark(`op#${idx} stock_carte.update x2 (substitution)`, tUpd);
        } else {
          // Cas Réparation simple : remise en circulation
          await tx.stock_carte.update({
            where: { numerocarte: op.ancienne },
            data: {
              etat_carte: etatConnect("En_circulation"),
              statut: "Sortie",
              ...(destinationRetour
                ? { structure: { connect: { code: destinationRetour } } }
                : {}),
            },
          });
          perfMark(`op#${idx} stock_carte.update (reparation)`, tUpd);
        }

        // Audit trail
        const tHist = Date.now();
        await tx.historique_carte.create({
          data: {
            numerocarte: op.ancienne,
            ancienetat: carteOriginale.etat,
            nouveletat:
              op.substitution && op.substitution !== op.ancienne
                ? "Archivée"
                : "En_circulation",
            structure_ancienne: carteOriginale.code_structure,
            structure_actuelle: destinationRetour,
            id_utilisateur: req.user?.id || null,
            commentaire: `Retour maintenance via décharge ${numeroDecharge}`,
          },
        });
        perfMark(`op#${idx} historique_carte.create`, tHist);

        // Prisma masque le scalaire `numero_carte_origine` (collision avec la
        // relation `stock_carte`) — on passe par la relation.
        // `etat_final` idem (collision avec `etat_carte`).
        const tLigne = Date.now();
        await tx.ligne_decharge_carte_type3.create({
          data: {
            numero_decharge: nouvelleDecharge.numero_decharge,
            stock_carte: { connect: { numerocarte: op.ancienne } },
            carte_substitution: op.substitution || op.ancienne,
            diagnostic_carte: op.diagnostic,
            ...(op.etatFinal
              ? {
                  etat_carte: {
                    connectOrCreate: {
                      where: { libelle: op.etatFinal },
                      create: { libelle: op.etatFinal },
                    },
                  },
                }
              : {}),
          },
        });
        perfMark(`op#${idx} ligne_decharge_carte_type3.create`, tLigne);
        perfMark(`op#${idx} TOTAL`, tItem);
      }

      return nouvelleDecharge;
    });
    perfMark("prisma.$transaction", tTx);
    perfMark("TOTAL creerDechargeType3", perfStart);

    res.status(201).json({
      success: true,
      message: `Décharge ${resultat.numero_decharge} créée. Dossiers de suivi clôturés.`,
      data: resultat,
    });
  } catch (error) {
    console.error(
      `[perf][decharge Type3] FAILED after ${Date.now() - perfStart}ms`,
    );
    next(error);
  }
};

// ==========================================
// 4. ACCUSÉ DE RÉCEPTION
// Endpoint : PUT /api/decharges/:numero/accuse-reception
// Quand le destinataire remplit la date de réception (CDC p.22),
// cela déclenche automatiquement le changement d'état des cartes concernées.
// ==========================================
const accuserReception = async (req, res, next) => {
  const { numero } = req.params;
  const { date_reception } = req.body;

  if (!date_reception) {
    return res
      .status(400)
      .json({
        success: false,
        message: "La date de réception est obligatoire.",
      });
  }

  try {
    const dateReception = new Date(date_reception);

    const decharge = await prisma.decharge_carte.findUnique({
      where: { numero_decharge: numero },
      include: {
        ligne_decharge_carte_type1: true,
        ligne_decharge_carte_type2: true,
        ligne_decharge_carte_type3: true,
      },
    });

    if (!decharge) {
      return res
        .status(404)
        .json({ success: false, message: "Décharge introuvable." });
    }

    let cartesModifiees = 0;

    await prisma.$transaction(async (tx) => {
      // 1. Enregistrer la date de réception sur la décharge (accusé officiel)
      await tx.decharge_carte.update({
        where: { numero_decharge: numero },
        data: { date_creation: dateReception },
      });

      // Type 1 : la mise en circulation est déjà effectuée au moment de la création
      // de la décharge ; l'accusé n'a plus d'effet sur l'état des cartes.

      // DÉCLENCHEUR TYPE 2 (retour de maintenance, CDC p.21) :
      // Quand la DCSI retourne les cartes traitées, enregistrement du TRS_DCSI_DPE
      for (const ligne of decharge.ligne_decharge_carte_type2) {
        if (!ligne.numero_carte) continue;

        // Mise à jour de la date TRS_DCSI_DPE dans le dossier de suivi
        await tx.suivi_maintenance_cartes.updateMany({
          where: {
            numerocarte: ligne.numero_carte,
            date_validation: null, // Dossier encore ouvert
          },
          data: { trs_dcsi_dpe: dateReception },
        });

        cartesModifiees++;
      }
    });

    res.json({
      success: true,
      message: `Accusé de réception enregistré pour la décharge ${numero}. ${cartesModifiees} carte(s) mise(s) à jour.`,
      date_reception: dateReception,
      cartes_mises_a_jour: cartesModifiees,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 5. GÉNÉRER LE PROCHAIN NUMÉRO BTS
// Endpoint : GET /api/decharges/next-bts
// Format : BTS-001, BTS-002, ...
// ==========================================
const getNextBTS = async (req, res, next) => {
  try {
    // Chercher le plus grand BTS dans les décharges (format BTS-XXX)
    const derniereDecharge = await prisma.decharge_carte.findFirst({
      where: {
        numero_bordereau_bts: { startsWith: "BTS-" },
      },
      orderBy: {
        numero_bordereau_bts: "desc",
      },
    });

    // Chercher aussi dans les archives
    const derniereArchive = await prisma.archivee_carte.findFirst({
      where: {
        bts: { startsWith: "BTS-" },
      },
      orderBy: {
        bts: "desc",
      },
    });

    let maxNumero = 0;

    const extraireNumero = (valeur) => {
      if (!valeur) return 0;
      const match = String(valeur).match(/^BTS-(\d+)$/);
      if (!match) return 0;
      return parseInt(match[1], 10);
    };

    const numDecharge = extraireNumero(
      derniereDecharge?.numero_bordereau_bts,
    );
    const numArchive = extraireNumero(derniereArchive?.bts);

    maxNumero = Math.max(numDecharge, numArchive);

    const prochainNumero = maxNumero + 1;
    const btsFormate = `BTS-${String(prochainNumero).padStart(3, "0")}`;

    res.json({
      success: true,
      data: { numero_bordereau_bts: btsFormate },
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 6. MODIFIER LE N° BTS D'UNE DÉCHARGE
// Endpoint : PATCH /api/decharges/:numero/bts
// Le N° BTS est facultatif et modifiable (CDC p.22).
// ==========================================
const modifierBTS = async (req, res, next) => {
  const { numero } = req.params;
  const { numero_bordereau_bts } = req.body;

  try {
    const decharge = await prisma.decharge_carte.update({
      where: { numero_decharge: numero },
      data: { numero_bordereau_bts: numero_bordereau_bts || null },
    });

    res.json({
      success: true,
      message: "N° BTS mis à jour.",
      data: decharge,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 6. LISTE DE TOUTES LES DÉCHARGES
// ==========================================
const getAllDecharges = async (req, res, next) => {
  try {
    const { scope } = await getScopeFilters(req);
    const accessibleNumbers = await getAccessibleCarteDechargeNumbers(scope);
    const { source, destination } = req.query;

    const where = {};
    if (source) where.source = source;
    if (destination) where.destination = destination;
    if (accessibleNumbers && accessibleNumbers.length === 0) {
      return res.json({
        success: true,
        decharges: [],
      });
    }
    if (accessibleNumbers) {
      where.numero_decharge = { in: accessibleNumbers };
    }

    const decharges = await prisma.decharge_carte.findMany({
      where,
      orderBy: { date_sortie: "desc" },
    });

    // Pas de back-relation `ligne_decharge_carte_type*[]` dans le schéma Prisma
    // (les lignes référencent `numero_decharge` en simple String) — on joint ici.
    const dechargesEnrichies = await attacherLignesAuxDecharges(
      decharges,
      false,
    );

    res.json({
      success: true,
      decharges: dechargesEnrichies,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Attache les `ligne_decharge_carte_type1/2/3` à un tableau de `decharge_carte`
 * en effectuant un seul batch par type (where numero_decharge IN [...]).
 * @param {Array} decharges tableau de décharges déjà fetched.
 * @param {boolean} withStockCarte si vrai, inclut l'objet stock_carte sur chaque ligne.
 */
async function attacherLignesAuxDecharges(decharges, withStockCarte = false) {
  const numeros = decharges.map((d) => d.numero_decharge).filter(Boolean);
  if (!numeros.length) {
    return decharges.map((d) => ({
      ...d,
      ligne_decharge_carte_type1: [],
      ligne_decharge_carte_type2: [],
      ligne_decharge_carte_type3: [],
    }));
  }

  const includeOpt = withStockCarte ? { include: { stock_carte: true } } : {};
  const [t1, t2, t3] = await Promise.all([
    prisma.ligne_decharge_carte_type1.findMany({
      where: { numero_decharge: { in: numeros } },
      ...includeOpt,
    }),
    prisma.ligne_decharge_carte_type2.findMany({
      where: { numero_decharge: { in: numeros } },
      ...includeOpt,
    }),
    prisma.ligne_decharge_carte_type3.findMany({
      where: { numero_decharge: { in: numeros } },
      ...includeOpt,
    }),
  ]);

  const bucket = (arr) =>
    arr.reduce((acc, l) => {
      const k = l.numero_decharge;
      if (!k) return acc;
      (acc[k] ||= []).push(l);
      return acc;
    }, {});
  const t1Map = bucket(t1);
  const t2Map = bucket(t2);
  const t3Map = bucket(t3);

  return decharges.map((d) => ({
    ...d,
    ligne_decharge_carte_type1: t1Map[d.numero_decharge] || [],
    ligne_decharge_carte_type2: t2Map[d.numero_decharge] || [],
    ligne_decharge_carte_type3: t3Map[d.numero_decharge] || [],
  }));
}

// ==========================================
// 7. DÉTAILS D'UNE DÉCHARGE
// ==========================================
const voirDetailsDecharge = async (req, res, next) => {
  const { id } = req.params;

  try {
    const { scope } = await getScopeFilters(req);
    const decharge = await prisma.decharge_carte.findUnique({
      where: { numero_decharge: id },
    });

    if (!decharge) {
      return res
        .status(404)
        .json({ success: false, message: "Décharge introuvable" });
    }

    const [enrichie] = await attacherLignesAuxDecharges([decharge], true);
    if (!canAccessCarteDecharge(scope, enrichie)) {
      return res
        .status(404)
        .json({ success: false, message: "Décharge introuvable" });
    }
    res.json({ success: true, data: enrichie });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 8. GÉNÉRATION HTML DE LA DÉCHARGE (Impression PDF)
// Endpoint : GET /api/decharges/:numero/imprimer
// Retourne du HTML au format exact de l'Annexe 4 du CDC.
// Le frontend ouvre une nouvelle fenêtre et le navigateur imprime en PDF.
// ==========================================
const imprimerDecharge = async (req, res, next) => {
  const { numero } = req.params;

  try {
    const { scope } = await getScopeFilters(req);
    const base = await prisma.decharge_carte.findUnique({
      where: { numero_decharge: numero },
    });

    if (!base) {
      return res
        .status(404)
        .json({ success: false, message: "Décharge introuvable." });
    }

    const [decharge] = await attacherLignesAuxDecharges([base], true);
    if (!canAccessCarteDecharge(scope, decharge)) {
      return res
        .status(404)
        .json({ success: false, message: "Décharge introuvable." });
    }

    // Déterminer le type et construire les lignes du tableau
    const estType1 = decharge.ligne_decharge_carte_type1.length > 0;
    const estType2 = decharge.ligne_decharge_carte_type2.length > 0;
    const estType3 = decharge.ligne_decharge_carte_type3.length > 0;

    let lignesTableau = "";
    let enteteTableau = "";

    if (estType1) {
      // Décharge distribution (Annexe 4 du CDC)
      enteteTableau = `<th>N°</th><th>Code Client</th><th>Raison Sociale</th><th>Numéro de carte</th>`;
      decharge.ligne_decharge_carte_type1.forEach((l, i) => {
        lignesTableau += `<tr>
          <td>${i + 1}</td>
          <td>${l.stock_carte?.code_client || ""}</td>
          <td>${l.stock_carte?.raisonsocialeclient || l.raisonsocialeclient || ""}</td>
          <td>${l.numero_carte || ""}</td>
        </tr>`;
      });
    } else if (estType2) {
      enteteTableau = `<th>N°</th><th>Numéro de carte</th><th>Anomalie constatée</th><th>Raison sociale client</th>`;
      decharge.ligne_decharge_carte_type2.forEach((l, i) => {
        lignesTableau += `<tr>
          <td>${i + 1}</td>
          <td>${l.numero_carte || ""}</td>
          <td>${l.anomalie_constatee || ""}</td>
          <td>${l.raisonsocialeclient || ""}</td>
        </tr>`;
      });
    } else if (estType3) {
      enteteTableau = `<th>N°</th><th>Carte origine</th><th>Carte substitution</th><th>Diagnostic</th><th>État final</th>`;
      decharge.ligne_decharge_carte_type3.forEach((l, i) => {
        lignesTableau += `<tr>
          <td>${i + 1}</td>
          <td>${l.numero_carte_origine || ""}</td>
          <td>${l.carte_substitution || ""}</td>
          <td>${l.diagnostic_carte || ""}</td>
          <td>${l.etat_final || ""}</td>
        </tr>`;
      });
    }

    const nbCartes =
      decharge.ligne_decharge_carte_type1.length +
      decharge.ligne_decharge_carte_type2.length +
      decharge.ligne_decharge_carte_type3.length;

    const dateStr = decharge.date_sortie
      ? new Date(decharge.date_sortie).toLocaleDateString("fr-FR")
      : new Date().toLocaleDateString("fr-FR");

    // HTML au format Annexe 4 du CDC
    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>DECHARGE (N°${decharge.numero_decharge})</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 13px; margin: 40px; color: #000; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
    .logo { font-weight: bold; font-size: 16px; color: #003366; }
    .titre { text-align: center; font-size: 16px; font-weight: bold; margin: 20px 0; text-transform: uppercase; }
    .intro { margin: 15px 0; line-height: 1.8; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border: 1px solid #000; padding: 6px 10px; text-align: left; font-size: 12px; }
    th { background-color: #e8e8e8; font-weight: bold; }
    .signatures { display: flex; justify-content: space-between; margin-top: 50px; }
    .signature-block { text-align: center; width: 45%; }
    .signature-block p { margin-bottom: 40px; }
    @media print { body { margin: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">NAFTAL spa</div>
      <div>Branche Commercialisation</div>
      <div>Direction Paiement Électronique</div>
    </div>
  </div>

  <div class="titre">DÉCHARGE (N°${decharge.numero_decharge})</div>

  <div class="intro">
    <p>
      Je soussigné(e) (Mr/Mme) : <strong>${decharge.nom_beneficiaire || "_______________"}</strong>
      &nbsp;&nbsp; Fonction : <strong>${decharge.fonction_beneficiaire || "_______________"}</strong>
    </p>
    <p>Structure : <strong>${decharge.destination || "_______________"}</strong></p>
    ${decharge.numero_bordereau_bts ? `<p>N° BTS : <strong>${decharge.numero_bordereau_bts}</strong></p>` : ""}
    <p>
      Reconnais avoir reçu, ce jour, le <strong>${dateStr}</strong> de la Direction Paiement Électronique/
      Branche Commercialisation (NAFTAL spa), <strong>(${nbCartes})</strong> carte(s) de paiement NAFTALCARD suivante(s) :
    </p>
  </div>

  <table>
    <thead><tr>${enteteTableau}</tr></thead>
    <tbody>${lignesTableau}</tbody>
  </table>

  <div class="signatures">
    <div class="signature-block">
      <p>salima.kernoua :</p>
      <p>visa/cachet :</p>
    </div>
    <div class="signature-block">
      <p>Le BÉNÉFICIAIRE :</p>
      <p>visa/cachet :</p>
    </div>
  </div>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 9. HISTORIQUE D'UNE CARTE
// ==========================================
const getHistoriqueCarte = async (req, res, next) => {
  const { numerocarte } = req.params;

  try {
    const { whereCarte } = await getScopeFilters(req);
    const carte = await prisma.stock_carte.findFirst({
      where: combineWhere(whereCarte, { numerocarte }),
      select: { numerocarte: true },
    });

    if (!carte) {
      return res
        .status(404)
        .json({ success: false, message: "Carte introuvable." });
    }

    const historique = await prisma.historique_carte.findMany({
      where: { numerocarte },
      orderBy: { dateoperation: "desc" },
    });

    if (!historique || historique.length === 0) {
      return res
        .status(404)
        .json({
          success: false,
          message: "Aucun historique trouvé pour cette carte.",
        });
    }

    res.json({ success: true, count: historique.length, data: historique });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 10. ANNULER UNE DÉCHARGE (remettre les cartes en stock)
// ==========================================
const annulerDecharge = async (req, res, next) => {
  const { numero } = req.params;

  try {
    await prisma.$transaction(async (tx) => {
      const decharge = await tx.decharge_carte.findUnique({
        where: { numero_decharge: numero },
        include: {
          ligne_decharge_carte_type1: true,
          ligne_decharge_carte_type2: true,
          ligne_decharge_carte_type3: true,
        },
      });

      if (!decharge) throw new AppError("Décharge introuvable.", 404);

      const numerosCartes = [
        ...decharge.ligne_decharge_carte_type1.map((l) => l.numero_carte),
        ...decharge.ligne_decharge_carte_type2.map((l) => l.numero_carte),
        ...decharge.ligne_decharge_carte_type3.map(
          (l) => l.numero_carte_origine,
        ),
      ].filter(Boolean);

      // CORRECTION : champ 'etat' (pas 'etat_carte')
      await tx.stock_carte.updateMany({
        where: { numerocarte: { in: numerosCartes } },
        data: {
          etat: "En_stock",
          statut: "Entree",
          code_structure: "DPE_CENTRE",
        },
      });

      await tx.decharge_carte.delete({ where: { numero_decharge: numero } });
    });

    res.json({
      success: true,
      message: "Décharge annulée. Cartes remises en stock à la DPE.",
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  creerDechargeType1,
  creerDechargeType2,
  creerDechargeType3,
  accuserReception,
  getNextBTS,
  modifierBTS,
  getAllDecharges,
  voirDetailsDecharge,
  imprimerDecharge,
  getHistoriqueCarte,
  annulerDecharge,
};
