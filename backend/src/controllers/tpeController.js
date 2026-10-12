const prisma = require('../config/prisma')
const PDFDocument = require('pdfkit')
const { logAuditAction } = require('../utils/auditLogger');

async function nextTpeDechargeInventaire() {
  // NOTE: do not use Prisma's orderBy on numero_inventaire — that's a
  // lexical sort, so "IN_TERM-99" > "IN_TERM-100" and we'd cap at 99.
  // Scan all rows and pick the numeric max instead.
  const rows = await prisma.decharge_tpe.findMany({
    where: { numero_inventaire: { not: null } },
    select: { numero_inventaire: true }
  });
  let max = 0;
  for (const r of rows) {
    const m = (r.numero_inventaire || '').match(/^IN_TERM-(\d+)$/i);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  if (max === 0) {
    const count = await prisma.decharge_tpe.count();
    return `IN_TERM-${String(count + 1).padStart(2, "0")}`;
  }
  return `IN_TERM-${String(max + 1).padStart(2, "0")}`;
}

const { getScopeFilters, combineWhere, matchesScope } = require('../middlewares/scopeMiddleware');

const canAccessTpeTransferLine = (scope, line = {}) => matchesScope(scope, {
    code_structure: line.stock_tpe?.code_structure || line.structure || line.district_concerne,
    district: line.stock_tpe?.district || line.suivi_maintenance_tpe?.district,
    raisonsocialestructure: line.stock_tpe?.raisonsocialestructure,
    structure_concernee: line.structure_concernee,
    structure_concerne: line.structure_concerne || line.suivi_maintenance_tpe?.structure_concerne,
    code_station: line.code_station || line.stock_tpe?.code_station || line.suivi_maintenance_tpe?.code_station,
});

const canAccessTpeDecharge = (scope, decharge = {}) => {
    if (!scope || scope.isGlobal) return true;

    const lignes = [
        ...(decharge.lignesType1 || []),
        ...(decharge.lignesType2 || []),
        ...(decharge.lignesType3 || []),
    ];

    return lignes.some((ligne) => canAccessTpeTransferLine(scope, ligne));
};



// ================================
// GET /api/tpe/stock
// TPE en stock (etat_tpe = EN_STOCK)
// ================================
const getStock = async (req, res) => {
    try {
        const { whereTPE } = await getScopeFilters(req);
        const tpes = await prisma.stock_tpe.findMany({
            where: combineWhere(whereTPE, { etat_tpe: 'En_stock' }),
            include: { station: true }
        })
        res.json({ success: true, total: tpes.length, tpes })
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erreur serveur', erreur: error.message })
    }
}

// ================================
// GET /api/tpe/maintenance-stock
// Complément de getStock : tous les TPE qui ne sont PAS En_stock.
// Couvre En_service / En_panne / Volé / En_traitement / Réservé / À restituer
// + tout libellé futur. Évite que des TPE coincés dans un état intermédiaire
// (ex : stock_tpe.En_service sans ligne circulation_tpe miroir) disparaissent
// de la vue Parc/Service côté front.
// ================================
const getMaintenanceStock = async (req, res) => {
    try {
        const { whereTPE } = await getScopeFilters(req);
        const tpes = await prisma.stock_tpe.findMany({
            where: combineWhere(whereTPE, {
                etat_tpe: { not: 'En_stock' }
            }),
            include: { station: true }
        })
        res.json({ success: true, total: tpes.length, tpes })
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erreur serveur', erreur: error.message })
    }
}

// ================================
// GET /api/tpe/parc
// TPE en service → lire circulation_tpe
// ================================
const getParc = async (req, res) => {
    try {
        const { whereCirculationTPE } = await getScopeFilters(req);
        // On lit la table circulation_tpe
        // car un TPE entre dans le parc UNIQUEMENT après accusé de réception
        const tpes = await prisma.circulation_tpe.findMany({
            where: combineWhere(whereCirculationTPE, {
                etat: { in: ['En_service', 'Volé'] }
            }),
            include: {
                // Inclure les infos de la station liée
                station_circulation_tpe_code_stationTostation: true,
                // Inclure les infos du stock original
                stock_tpe: true
            },
            orderBy: { id_circulation: 'desc' }
        })

        res.json({
            success: true,
            total: tpes.length,
            tpes  // ← chaque élément contient les données de circulation_tpe
        })
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Erreur serveur',
            erreur: error.message
        })
    }
}
// ================================
// GET /api/tpe/maintenance
// TPE hors service
// ================================
const getMaintenance = async (req, res) => {
    try {
        const { whereSuiviTPE } = await getScopeFilters(req);
        const maintenances = await prisma.suivi_maintenance_tpe.findMany({
            where: combineWhere(whereSuiviTPE, {
                etat_panne: {
                    in: ['En_traitement', 'En_panne', 'Réparé']
                }
            }),
            include: {
                station_suivi_maintenance_tpe_code_stationTostation: {
                    include: { structure: true }
                }
            },
            orderBy: { date_panne: 'desc' }
        })

        const maintenancesAvecCouleurs = maintenances.map(m => {
            let couleur = '#000000'
            switch(m.etat_panne) {
    case 'En_traitement':   couleur = '#FFA500'; break;
    case 'Réparé':          couleur = '#008000'; break;
    case 'En_service':      couleur = '#00FF00'; break;
    default:                couleur = '#FF0000';
}
            return { ...m, couleur }
        })

        res.json({ success: true, total: maintenances.length, maintenances: maintenancesAvecCouleurs })
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erreur serveur', erreur: error.message })
    }
}


// ================================
// GET /api/tpe/:id
// Un seul TPE par numeroserietpe
// ================================
const getTPEById = async (req, res) => {
    try {
        const { id } = req.params
        const { whereTPE } = await getScopeFilters(req);

        const tpe = await prisma.stock_tpe.findFirst({
            where: combineWhere(whereTPE, { numeroserietpe: id }),
            include: {
                station: true,
                ligne_decharge_tpe_type1: true,
                ligne_decharge_tpe_type2: true,
                ligne_decharge_tpe_type4: true
            }
        })

        if (!tpe) {
            return res.status(404).json({ success: false, message: 'TPE non trouvé !' })
        }

        res.json({ success: true, tpe })
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erreur serveur', erreur: error.message })
    }
}

// ================================
// PUT /api/tpe/:id/etat
// Changer l'état d'un TPE
// ================================
const changerEtat = async (req, res) => {
    try {
        const { id } = req.params
        const { etat_tpe, commentaire } = req.body

        const avant = await prisma.stock_tpe.findUnique({
            where: { numeroserietpe: id },
            select: { etat_tpe: true, code_structure: true }
        })
        if (!avant) {
            return res.status(404).json({ success: false, message: 'TPE introuvable.' })
        }

        // Retour en stock : finir le cycle de circulation, sinon la vue Parc continue
        // à exposer le TPE en "En_service" (dédup côté front, la ligne circulation_tpe
        // gagne sur stock_tpe).
        const tpe = await prisma.$transaction(async (tx) => {
            const updated = await tx.stock_tpe.update({
                where: { numeroserietpe: id },
                data: {
                    etat_tpe: etat_tpe,
                    ...(etat_tpe === 'En_stock' ? { code_structure: null } : {}),
                },
            })

            if (etat_tpe === 'En_stock') {
                await tx.circulation_tpe.deleteMany({
                    where: { numero_serie_tpe: id },
                })
            }

            await tx.historique_tpe.create({
                data: {
                    numeroserietpe: id,
                    ancienetat: avant.etat_tpe,
                    nouveletat: etat_tpe,
                    id_utilisateur: req.user?.id || null,
                    commentaire: commentaire || `Changement d'état ${avant.etat_tpe} → ${etat_tpe}`,
                },
            })

            return updated
        })

        await logAuditAction('Changement état TPE', id, null, req)

        res.json({
            success: true,
            message: `État TPE changé en : ${etat_tpe}`,
            tpe
        })
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erreur serveur', erreur: error.message })
    }
}

// ================================
// ================================
// POST /api/tpe/transfert/type1
// Décharge Type 1 : DPE → Structure
// Plusieurs TPE, même structure obligatoire
// ================================
// ================================
// POST /api/tpe/transfert/type1
// Décharge Type 1 : DPE → Structure
// Tous les TPE doivent aller vers 
// des stations de la MÊME structure
// ================================
const genererTransfertType1 = async (req, res) => {
    try {
        const {
            numeros_serie_tpe,
            source,
            destination,
            nom_beneficiaire,
            fonction_beneficiaire,
            idstructure_destination  // ← ID de la structure destination
        } = req.body

        // ── Validation tableau ──
        if (!Array.isArray(numeros_serie_tpe) || numeros_serie_tpe.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'numeros_serie_tpe doit être un tableau non vide !'
            })
        }

        // ── Validation structure destination ──
        if (!idstructure_destination) {
            return res.status(400).json({
                success: false,
                message: 'idstructure_destination est obligatoire !'
            })
        }

        // ── Vérifier que la structure existe ──
        const structure = await prisma.structure.findUnique({
            where: { idstructure: parseInt(idstructure_destination) },
            include: { station: true }
        })

        if (!structure) {
            return res.status(404).json({
                success: false,
                message: 'Structure destination non trouvée !'
            })
        }

        // ── Récupérer les codes stations de cette structure ──
        const codesStationsStructure = structure.station.map(s => s.code_station)

        if (codesStationsStructure.length === 0) {
            return res.status(400).json({
                success: false,
                message: `La structure "${structure.nom_structure}" n'a aucune station !`
            })
        }

        // ── Vérifier que tous les TPE existent et sont EN_STOCK ──
        const tpes = await prisma.stock_tpe.findMany({
            where: {
                numeroserietpe: { in: numeros_serie_tpe },
                etat_tpe:  'En_stock'
            },
            include: { station: true }
        })

        if (tpes.length !== numeros_serie_tpe.length) {
            const trouves = tpes.map(t => t.numeroserietpe)
            const manquants = numeros_serie_tpe.filter(n => !trouves.includes(n))
            return res.status(400).json({
                success: false,
                message: 'Certains TPE n\'existent pas ou ne sont pas EN_STOCK !',
                tpes_manquants: manquants
            })
        }

        // ── Vérifier que les TPE qui ont déjà une station
        //    appartiennent bien à la structure destination ──
        const tpesHorsStructure = tpes.filter(tpe => {
            if (!tpe.station) return false
            return !codesStationsStructure.includes(tpe.station.code_station)
        })

        if (tpesHorsStructure.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Ces TPE appartiennent à une autre structure — impossible de les inclure dans cette décharge !`,
                tpes_hors_structure: tpesHorsStructure.map(t => ({
                    numeroserietpe: t.numeroserietpe,
                    station_actuelle: t.station?.code_station,
                    structure_actuelle: t.station?.idstructure
                })),
                structure_destination: {
                    id: structure.idstructure,
                    nom: structure.nom_structure,
                    stations_autorisees: codesStationsStructure
                }
            })
        }

        // ── Tout est OK → Créer la décharge ──
        const numeroDecharge = `DT1-${Date.now()}`
        const invNum1 = await nextTpeDechargeInventaire()
        const decharge = await prisma.decharge_tpe.create({
            data: {
                numero_decharge:       numeroDecharge,
                numero_inventaire:     invNum1,
                source:                source        || 'DPE',
                destination:           structure.nom_structure,
                nom_beneficiaire:      nom_beneficiaire      || null,
                fonction_beneficiaire: fonction_beneficiaire || null,
                date_sortie:           new Date(),
                date_creation:         new Date()
            }
        })

        // ── Pour chaque TPE → SEULEMENT créer la ligne de décharge ──
        // ⚠️ ON NE CHANGE PAS L'ÉTAT ICI !
        // L'état passera EN_SERVICE seulement après accusé de réception
      /*  for (const tpe of tpes) {
            await prisma.ligne_decharge_tpe_type1.create({
                data: {
                    numero_decharge:     numeroDecharge,
                    numero_serie_tpe:    tpe.numeroserietpe,
                    id_tpe_logiciel:     tpe.idtpe    || null,
                    structure_concernee: structure.nom_structure,
                    district_concerne:   structure.code || null,
                    code_station:        tpe.code_station || null,
                    raison_sociale:      tpe.station?.nom_station || null,
                    commentaire:         null
                }
            })
            
        }*/ 
       // Au lieu de la boucle for , utilise :
const tpeDataToInsert = tpes.map(tpe => ({
    numero_decharge: numeroDecharge,
    numero_serie_tpe: tpe.numeroserietpe,
    id_tpe_logiciel: tpe.idtpe || null,
    structure_concernee: structure.nom_structure,
    district_concerne: structure.code || null,
    code_station: tpe.code_station || null,
    raison_sociale: tpe.station?.nom_station || null,
}));

await prisma.ligne_decharge_tpe_type1.createMany({
    data: tpeDataToInsert
});




//  Mettre à jour l'état des TPE en "En_service"
await prisma.stock_tpe.updateMany({
    where: { numeroserietpe: { in: numeros_serie_tpe } },
    data: {
        etat_tpe: 'En_service',
        code_structure: structure.code,
        raisonsocialestructure: structure.nom_structure,
        date_remise: new Date(),
    }
});

//  Insérer dans circulation_tpe
await prisma.circulation_tpe.createMany({
    data: tpes.map(tpe => ({
        district: structure.nom_structure,
        code_structure: structure.code,
        raison_sociale_structure: structure.nom_structure,
        numero_serie_tpe: tpe.numeroserietpe,
        id_tpe: tpe.idtpe || null,
        code_station: tpe.code_station || null,
        date_reception: new Date(),
        date_remise: new Date(),
        dotation: tpe.dotation,
        etat: 'En_service',
        wilaya: structure.adresse || null,
    }))
});




//  Créer l'historique pour chaque TPE
await prisma.historique_tpe.createMany({
    data: tpes.map(tpe => ({
        numeroserietpe: tpe.numeroserietpe,
        ancienetat: 'En_stock',
        nouveletat: 'En_service',
        commentaire: `Mise en service → ${structure.nom_structure} — Décharge ${numeroDecharge}`,
        dateoperation: new Date(),
    }))
});

// Journal d'audit
await logAuditAction('Mise en service TPE', tpes.map(t => t.numeroserietpe).join(', '), `${req.user?.prenom || ''} ${req.user?.nom || ''}`.trim() || req.user?.email || 'Utilisateur inconnu', req);

       res.json({
    success: true,
    message: `${tpes.length} TPE transférés vers "${structure.nom_structure}" !`,
    numero_decharge: numeroDecharge,
    pdf_url: `/api/tpe/decharge/${numeroDecharge}/print`,  // ← AJOUT
    structure_destination: structure.nom_structure,
    tpes_transferes: tpes.map(t => t.numeroserietpe),
    decharge
})

// Journal d'audit
await logAuditAction('Décharge TPE type 1', tpes.map(t => t.numeroserietpe).join(', '), `${req.user?.prenom || ''} ${req.user?.nom || ''}`.trim() || req.user?.email || 'Utilisateur inconnu', req);

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Erreur serveur',
            erreur: error.message
        })
    }
}


// ================================
// POST /api/tpe/transfert/type2
// Décharge Type 2 : DPE → BEA (envoi en maintenance)
// TPE doivent être Volé ou En_panne (ou déjà En_traitement)
// Structures différentes OK
// ================================
const genererTransfertType2 = async (req, res) => {
    try {
        const {
            numeros_serie_tpe,
            nom_beneficiaire,
            fonction_beneficiaire,
            motif,
            anomalie_constatee
        } = req.body

        // Vérifier que numeros_serie_tpe est un tableau
        if (!Array.isArray(numeros_serie_tpe) || numeros_serie_tpe.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'numeros_serie_tpe doit être un tableau non vide !'
            })
        }

        // 1) Vérifier l'existence (séparée de l'état pour donner un message clair)
        const tpesAll = await prisma.stock_tpe.findMany({
            where: { numeroserietpe: { in: numeros_serie_tpe } }
        })
        const trouves = tpesAll.map(t => t.numeroserietpe)
        const tpesIntrouvables = numeros_serie_tpe.filter(n => !trouves.includes(n))
        if (tpesIntrouvables.length > 0) {
            return res.status(404).json({
                success: false,
                message: `TPE introuvables en base : ${tpesIntrouvables.join(', ')}`,
                tpes_introuvables: tpesIntrouvables
            })
        }

        // 2) Permettre l'envoi même si déjà dans le pipeline maintenance
        //    On autorise l'envoi pour permettre la réévaluation ou le suivi
        //    On va juste logger l'état actuel pour information
        const ETATS_PIPELINE = ['En_traitement', 'Réparé']
        const tpesEnPipeline = tpesAll.filter(t => ETATS_PIPELINE.includes(t.etat_tpe))
        
        // Logger les TPE déjà en pipeline pour information
        if (tpesEnPipeline.length > 0) {
            console.log(`TPE déjà en pipeline: ${tpesEnPipeline.map(t => `${t.numeroserietpe} (${t.etat_tpe})`).join(', ')}`);
        }

        const tpes = tpesAll
        const anomalieGlobale = anomalie_constatee || motif || null

        // suivi_maintenance_tpe.code_station est NOT NULL FK. Si un TPE n'a pas de
        // code_station valide (cas des TPE auto-générés depuis confirmerCommande sur
        // une commande sans station), on retombe sur la première station disponible
        // pour éviter un P2003 qui ferait échouer toute la décharge.
        let stationFallback = null
        const needsFallback = tpes.some(t => !t.code_station)
        if (needsFallback) {
            const fallback = await prisma.station.findFirst({ select: { code_station: true } })
            stationFallback = fallback?.code_station || null
            if (!stationFallback) {
                return res.status(400).json({
                    success: false,
                    message: 'Aucune station disponible — impossible de créer le suivi maintenance.',
                })
            }
        }
        const resolveCodeStation = (t) => t.code_station || stationFallback

        // etat_panne='En_traitement' est FK vers etat_tpe.libelle. On garantit la ligne.
        if (!(await prisma.etat_tpe.findUnique({ where: { libelle: 'En_traitement' } }))) {
            await prisma.etat_tpe.create({ data: { libelle: 'En_traitement' } });
        }

        // 1. Créer la décharge
        const numeroDecharge = `DT2-${Date.now()}`
        const invNum2 = await nextTpeDechargeInventaire()
        const decharge = await prisma.decharge_tpe.create({
            data: {
                numero_decharge:       numeroDecharge,
                numero_inventaire:     invNum2,
                source:                'DPE',
                destination:           'BEA',
                nom_beneficiaire:      nom_beneficiaire      || null,
                fonction_beneficiaire: fonction_beneficiaire || null,
                date_sortie:           new Date(),
                date_creation:         new Date()
            }
        })
        // Dans genererTransfertType2, après la création de la décharge
// et avant de boucler sur les TPE

// 1.5. Récupérer ou créer le suivi maintenance pour chaque TPE
for (const tpe of tpes) {
    // Vérifier si un suivi existe déjà
    let suivi = await prisma.suivi_maintenance_tpe.findFirst({
        where: { numeroserietpe: tpe.numeroserietpe }
    })

    if (!suivi) {
        // Créer un suivi si inexistant
        suivi = await prisma.suivi_maintenance_tpe.create({
            data: {
                numeroserietpe: tpe.numeroserietpe,
                idtpe: tpe.idtpe,
                code_station: resolveCodeStation(tpe),
                // raisonsociale est NOT NULL → fallback sur la station/numéro si manquant.
                raisonsociale: tpe.raisonsocialestructure || tpe.code_station || resolveCodeStation(tpe) || 'N/A',
                modele_tpe: tpe.dotation,
                date_panne: new Date(),
                etat_panne: 'En_traitement',
                // diagnostic est FK vers etat_tpe.libelle — on ne peut PAS y mettre du
                // texte libre. On stocke l'anomalie dans objet_dia (pas de FK) et on
                // laisse diagnostic null.
                diagnostic: null,
                objet_dia: anomalieGlobale,
                // TRS ST → STR = maintenant (Station → Structure)
                trs_st_str: new Date(),
                // TRS STR → DPE = maintenant (Structure → DPE)
                trs_str_dpe: new Date(),
                // TRS DPE → BEA = maintenant (DPE → BEA)
                trs_dpe_bea: new Date(),
                // trs_bea_dpe est NOT NULL dans le schéma → placeholder
                trs_bea_dpe: new Date(0)
            }
        })
    } else {
        // Mettre à jour le suivi existant
        await prisma.suivi_maintenance_tpe.update({
            where: { id_suivi: suivi.id_suivi },
            data: {
                etat_panne: 'En_traitement',
                // Préserver une date trs_st_str déjà saisie ; sinon, la poser maintenant
                // (l'envoi pour traitement est le moment où la pièce part de la station).
                trs_st_str: suivi.trs_st_str || new Date(),
                trs_str_dpe: suivi.trs_str_dpe || new Date(),
                trs_dpe_bea: new Date()
            }
        })
    }
}

        // 2. Pour chaque TPE → créer ligne + changer état
        for (const tpe of tpes) {
    const ancienEtat = tpe.etat_tpe

    // ⭐ Récupérer le suivi maintenance pour ce TPE
    const suivi = await prisma.suivi_maintenance_tpe.findUnique({
        where: { numeroserietpe: tpe.numeroserietpe }
    })

    // ⭐ Récupérer l'anomalie depuis le suivi (fallback sur le motif global de la requête)
    const anomalie = suivi?.objet_dia || suivi?.diagnostic || anomalieGlobale

    // ⭐ Récupérer le nom de la station (avec fallback si manquant)
    const codeStationLigne = resolveCodeStation(tpe)
    const stationNom = tpe.station?.nom_station || codeStationLigne

    // Ajouter ligne décharge type2 (avec les infos)
    await prisma.ligne_decharge_tpe_type2.create({
        data: {
            numero_decharge:    numeroDecharge,
            numero_serie_tpe:   tpe.numeroserietpe,
            anomalie_constatee: anomalie,
            code_station:       codeStationLigne,
            raison_sociale:     stationNom
        }
    })

            // Changer état → EN_COURS_TRAITEMENT
            await prisma.stock_tpe.update({
                where: { numeroserietpe: tpe.numeroserietpe },
                data: { etat_tpe: 'En_traitement' }
            })
            // ⭐ Mettre à jour circulation_tpe SI elle existe (TPE en stock = pas de circulation)
            const circ = await prisma.circulation_tpe.findUnique({
                where: { numero_serie_tpe: tpe.numeroserietpe }
            })
            if (circ) {
                await prisma.circulation_tpe.update({
                    where: { numero_serie_tpe: tpe.numeroserietpe },
                    data: { etat: 'En_traitement' }
                })
            }

            // Enregistrer dans historique
            await prisma.historique_tpe.create({
                data: {
                    numeroserietpe: tpe.numeroserietpe,
                    ancienetat:     ancienEtat,
                    nouveletat:     'En_traitement',
                    commentaire:    `Décharge Type 2 → BEA pour réparation`
                }
            })
        }

        res.json({
    success: true,
    message: `${tpes.length} TPE envoyés à BEA pour réparation !`,
    numero_decharge: numeroDecharge,
    pdf_url: `/api/tpe/decharge/${numeroDecharge}/print`,
    tpes_envoyes: tpes.map(t => ({
        numeroserietpe: t.numeroserietpe,
        ancien_etat: t.etat_tpe,
        nouvel_etat: 'En_traitement'
    })),
    decharge
})

// Journal d'audit
await logAuditAction('Décharge TPE type 2', tpes.map(t => t.numeroserietpe).join(', '), `${req.user?.prenom || ''} ${req.user?.nom || ''}`.trim() || req.user?.email || 'Utilisateur inconnu', req);

// Journal d'audit
await logAuditAction('Envoi en traitement TPE', tpes.map(t => t.numeroserietpe).join(', '), `${req.user?.prenom || ''} ${req.user?.nom || ''}`.trim() || req.user?.email || 'Utilisateur inconnu', req);

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Erreur serveur',
            erreur: error.message
        })
    }
}

// ================================
// POST /api/tpe/transfert/type3
// Décharge Type 3 : DPE → Structure (Retour réparé)
// Plusieurs TPE, même structure
// ================================
const genererTransfertType3 = async (req, res) => {
    try {
        const {
            numeros_serie_tpe,
            destination,
            nom_beneficiaire,
            fonction_beneficiaire,
            structure_concernee,
            district_concerne
        } = req.body

        // Vérifier que numeros_serie_tpe est un tableau
        if (!Array.isArray(numeros_serie_tpe) || numeros_serie_tpe.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'numeros_serie_tpe doit être un tableau non vide !'
            })
        }

        // Vérifier que tous les TPE sont EN_COURS_TRAITEMENT
        const tpes = await prisma.stock_tpe.findMany({
            where: {
                numeroserietpe: { in: numeros_serie_tpe },
                etat_tpe: 'En_traitement'
            }
        })

        if (tpes.length !== numeros_serie_tpe.length) {
            return res.status(400).json({
                success: false,
                message: 'Certains TPE n\'existent pas ou ne sont pas EN_COURS_TRAITEMENT !',
                tpes_trouves: tpes.map(t => t.numeroserietpe)
            })
        }

        // Garantir les libellés etat_tpe utilisés ci-dessous (FK).
        if (!(await prisma.etat_tpe.findUnique({ where: { libelle: 'En_service' } }))) {
            await prisma.etat_tpe.create({ data: { libelle: 'En_service' } });
        }
        if (!(await prisma.etat_tpe.findUnique({ where: { libelle: 'Réparé' } }))) {
            await prisma.etat_tpe.create({ data: { libelle: 'Réparé' } });
        }

        // 1. Créer la décharge
        const numeroDecharge = `DT3-${Date.now()}`
        const invNum3 = await nextTpeDechargeInventaire()
        const decharge = await prisma.decharge_tpe.create({
            data: {
                numero_decharge:       numeroDecharge,
                numero_inventaire:     invNum3,
                source:                'DPE',
                destination:           destination   || null,
                nom_beneficiaire:      nom_beneficiaire      || null,
                fonction_beneficiaire: fonction_beneficiaire || null,
                date_sortie:           new Date(),
                date_creation:         new Date() }
        })

        // 2. Pour chaque TPE → créer ligne + changer état
        for (const tpe of tpes) {
            // Ajouter ligne décharge type3
            await prisma.ligne_decharge_tpe_type3.create({
                data: {
                    numero_decharge:  numeroDecharge,
                    numero_serie_tpe: tpe.numeroserietpe,
                    diagnostic_tpe:   null,
                    etat_final:       'Réparé'
                }
            })

            // Changer état → EN_SERVICE
            await prisma.stock_tpe.update({
                where: { numeroserietpe: tpe.numeroserietpe },
                data: { etat_tpe: 'En_service' }
            })
            // Mettre à jour circulation_tpe SEULEMENT si elle existe.
            // Un TPE envoyé en maintenance directement depuis le stock (type 2)
            // n'a jamais eu de ligne circulation → un update strict throw P2025.
            const circT3 = await prisma.circulation_tpe.findUnique({
                where: { numero_serie_tpe: tpe.numeroserietpe }
            })
            if (circT3) {
                await prisma.circulation_tpe.update({
                    where: { numero_serie_tpe: tpe.numeroserietpe },
                    data: { etat: 'En_service' }
                })
            }
// Mettre à jour le suivi maintenance
const suivi = await prisma.suivi_maintenance_tpe.findFirst({
    where: { numeroserietpe: tpe.numeroserietpe }
})

if (suivi) {
    // Calcul des durées
    const trsDpeBea = suivi.trs_dpe_bea
    const trsBeaDpe = new Date() // maintenant = retour de BEA
    
    let dureeTrait = null
    if (trsDpeBea && trsBeaDpe) {
        dureeTrait = Math.ceil((trsBeaDpe - new Date(trsDpeBea)) / (1000 * 60 * 60 * 24))
    }
    
    await prisma.suivi_maintenance_tpe.update({
        where: { id_suivi: suivi.id_suivi },
        data: {
            etat_panne:'Réparé',
            trs_bea_dpe: trsBeaDpe,
            trs_dpe_str: new Date(), // DPE → Structure
            duree_trait: dureeTrait
        }
    })
}

            // Enregistrer dans historique
            await prisma.historique_tpe.create({
                data: {
                    numeroserietpe: tpe.numeroserietpe,
                    ancienetat:     'En_traitement',
                    nouveletat:     'En_service',
                    commentaire:    `Décharge Type 3 retour vers ${destination}`
                }
            })
        }

        // Journal d'audit
        await logAuditAction('Retour en service TPE', tpes.map(t => t.numeroserietpe).join(', '), `${req.user?.prenom || ''} ${req.user?.nom || ''}`.trim() || req.user?.email || 'Utilisateur inconnu', req);

        res.json({
            success: true,
            message: `${tpes.length} TPE retournés en service !`,
            numero_decharge: numeroDecharge,
            pdf_url: `/api/tpe/decharge/${numeroDecharge}/print`,
            tpes_retournes: tpes.map(t => t.numeroserietpe),
            decharge
        })

        // Journal d'audit
        await logAuditAction('Retour en service TPE type 3', tpes.map(t => t.numeroserietpe).join(', '), `${req.user?.prenom || ''} ${req.user?.nom || ''}`.trim() || req.user?.email || 'Utilisateur inconnu', req);

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Erreur serveur',
            erreur: error.message
        })
    }
}
// ================================
// GET /api/tpe/decharge/:numero/print
// Générer un PDF pour une décharge
// ================================
const printDecharge = async (req, res) => {
    try {
        const { numero } = req.params
        const { scope } = await getScopeFilters(req);

        // Récupérer la décharge avec ses lignes
        const decharge = await prisma.decharge_tpe.findUnique({
            where: { numero_decharge: numero },
            include: {
                ligne_decharge_tpe_type1: {
                    include: { stock_tpe: true, station: true }
                },
                ligne_decharge_tpe_type2: {
                    include: { stock_tpe: true }
                },
              ligne_decharge_tpe_type3: {
    include: { suivi_maintenance_tpe: true }
}
            }
        })

        if (!decharge) {
            return res.status(404).json({ success: false, message: 'Décharge non trouvée' })
        }

        const dechargeAvecLignes = {
            lignesType1: decharge.ligne_decharge_tpe_type1,
            lignesType2: decharge.ligne_decharge_tpe_type2,
            lignesType3: decharge.ligne_decharge_tpe_type3,
        }

        if (!canAccessTpeDecharge(scope, dechargeAvecLignes)) {
            return res.status(404).json({ success: false, message: 'Décharge non trouvée' })
        }

        // Déterminer le type
        let type = 1
        let lignes = decharge.ligne_decharge_tpe_type1
        if (decharge.ligne_decharge_tpe_type2.length > 0) {
            type = 2
            lignes = decharge.ligne_decharge_tpe_type2
        } else if (decharge.ligne_decharge_tpe_type3.length > 0) {
            type = 3
            lignes = decharge.ligne_decharge_tpe_type3
        }

        // Générer le PDF
        const doc = new PDFDocument({ margin: 50 })
        const filename = `decharge_${numero}.pdf`

        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
        doc.pipe(res)

        // En-tête NAFTAL
        doc.fontSize(18).text('NAFTAL spa', { align: 'center' })
        doc.fontSize(12).text('Direction Paiement Electronique', { align: 'center' })
        doc.fontSize(10).text('Branche Commercialisation', { align: 'center' })
        doc.moveDown()

        // Titre selon type
        let titre = ''
        if (type === 1) titre = `DÉCHARGE TYPE 1 : DPE → STRUCTURE`
        else if (type === 2) titre = `DÉCHARGE TYPE 2 : DPE → BEA (Envoi maintenance)`
        else titre = `DÉCHARGE TYPE 3 : DPE → STRUCTURE (Retour réparé)`

        doc.fontSize(14).text(titre, { align: 'center' })
        doc.fontSize(11).text(`N°: ${numero}`, { align: 'center' })
        doc.moveDown()

        // Infos générales
        doc.fontSize(10)
        doc.text(`Source: ${decharge.source || 'DPE'}`)
        doc.text(`Destination: ${decharge.destination || '-'}`)
        doc.text(`Date de création: ${new Date(decharge.date_creation).toLocaleDateString()}`)
        doc.text(`Date de sortie: ${decharge.date_sortie ? new Date(decharge.date_sortie).toLocaleDateString() : '-'}`)
        
        if (decharge.nom_beneficiaire) {
            doc.text(`Bénéficiaire: ${decharge.nom_beneficiaire}`)
            doc.text(`Fonction: ${decharge.fonction_beneficiaire || '-'}`)
        }
        doc.moveDown()

        // Tableau des TPE
        doc.fontSize(11).text('LISTE DES TPE:', { underline: true })
        doc.moveDown(0.5)

        // En-têtes
        let y = doc.y
        doc.fontSize(9)
        doc.text('N° Série', 50, y)
        doc.text('Modèle', 180, y)
        doc.text('Station', 280, y)
        
        if (type === 2) {
            doc.text('Anomalie', 380, y)
        } else if (type === 3) {
            doc.text('Diagnostic', 380, y)
        }
        
        doc.moveDown()
        y = doc.y

        // Lignes
        for (const ligne of lignes) {
            const tpe = ligne.stock_tpe
            doc.text(tpe?.numeroserietpe || ligne.numero_serie_tpe || '-', 50, y)
            doc.text(tpe?.dotation || '-', 180, y)
            
            let stationName = '-'
            if (type === 1 && ligne.station) stationName = ligne.station.nom_station
            else if (tpe?.station) stationName = tpe.station.nom_station
            else if (ligne.code_station) stationName = ligne.code_station
            doc.text(stationName, 280, y)
            
            let info = '-'
            if (type === 2) info = ligne.anomalie_constatee || '-'
            if (type === 3) info = ligne.diagnostic_tpe || ligne.suivi_maintenance_tpe?.diagnostic || '-'
            doc.text(info, 380, y)
            
            y += 20
            if (y > 700) { doc.addPage(); y = 50 }
        }

        // Signatures
        doc.moveDown()
        doc.text('Le bénéficiaire:', 50, doc.y + 20)
        doc.text('La DPE:', 400, doc.y)
        
        doc.end()

    } catch (error) {
        console.error('printDecharge error:', error)
        res.status(500).json({ success: false, message: error.message })
    }
}

// ================================
// POST /api/tpe/:id/suivi
// Créer un suivi maintenance
// ================================
const creerSuivi = async (req, res) => {
    try {
        const { id } = req.params
        const { diagnostic, nouvel_etat_tpe } = req.body

        const tpe = await prisma.stock_tpe.findUnique({
            where: { numeroserietpe: id }
        })
        if (!tpe) {
            return res.status(404).json({ success: false, message: 'TPE non trouvé.' })
        }

        // `etat_panne` et `diagnostic` sont des scalaires masqués (FK vers etat_tpe).
        // + `raisonsociale` est NOT NULL dans le schéma — il faut un fallback sûr.
        // + les deux champs `trs_dpe_bea` et `trs_bea_dpe` sont NOT NULL dans le schéma.
        const datePlaceholder = new Date('2099-12-31')
        const suivi = await prisma.suivi_maintenance_tpe.create({
            data: {
                idtpe: tpe.idtpe,
                numeroserietpe: tpe.numeroserietpe,
                code_station: tpe.code_station,
                raisonsociale: tpe.raisonsocialestructure || tpe.code_station || 'Non renseignée',
                modele_tpe: tpe.dotation,
                date_panne: new Date(),
                etat_tpe_suivi_maintenance_tpe_etat_panneToetat_tpe: {
                    connectOrCreate: {
                        where: { libelle: 'En_traitement' },
                        create: { libelle: 'En_traitement' },
                    },
                },
                ...(diagnostic
                    ? {
                        etat_tpe_suivi_maintenance_tpe_diagnosticToetat_tpe: {
                            connectOrCreate: {
                                where: { libelle: diagnostic },
                                create: { libelle: diagnostic },
                            },
                        },
                    }
                    : {}),
                trs_dpe_bea: datePlaceholder,
                trs_bea_dpe: datePlaceholder,
            }
        })

        if (nouvel_etat_tpe) {
            await prisma.stock_tpe.update({
                where: { numeroserietpe: id },
                data: { etat_tpe: nouvel_etat_tpe }
            })
        }

        res.json({ success: true, message: 'Suivi créé avec succès.', suivi })
    } catch (error) {
        res.status(500).json({ success: false, message: error.message })
    }
}

// ================================
// PUT /api/tpe/:id/suivi/:sid
// Mettre à jour un suivi
// ================================








// ================================
// PUT /api/tpe/suivi
// Mettre à jour le suivi TPE par numéro de série
// ================================
const updateSuiviTpe = async (req, res) => {
    const { numeroserietpe, dateRetourBea, etatPanne, diagnostic, observation } = req.body;
    
    if (!numeroserietpe) {
        return res.status(400).json({ success: false, message: "Numéro de série requis." });
    }
    
    try {
        const { whereSuiviTPE } = await getScopeFilters(req);
        
        const suivi = await prisma.suivi_maintenance_tpe.findFirst({
            where: combineWhere(whereSuiviTPE, { numeroserietpe }),
            orderBy: { date_panne: 'desc' },
        });
        
        if (!suivi) return res.status(404).json({ success: false, message: "Dossier introuvable." });

        const updateData = {};

        // 1. FIX REFRESH : On utilise la colonne de RETOUR (trs_bea_dpe)
        // C'est ce qui permet au tableau de retrouver la date après le refresh
        if (dateRetourBea) {
            const dateRetour = new Date(dateRetourBea);
            updateData.trs_bea_dpe = dateRetour; 

            // Calcul de la durée de traitement (Retour - Envoi)
            if (suivi.trs_dpe_bea && suivi.trs_dpe_bea.getFullYear() < 2099) {
                const duree = Math.max(0, Math.ceil((dateRetour - new Date(suivi.trs_dpe_bea)) / (1000 * 60 * 60 * 24)));
                updateData.duree_trait = duree;
            }
        }

        // 2. FIX P2002 & VALIDATION : Utilisation des noms de relations exacts
        // Prisma refuse "etat_panne" car il attend le nom de la relation (vu dans ton erreur)
        if (etatPanne) {
            updateData.etat_tpe_suivi_maintenance_tpe_etat_panneToetat_tpe = {
                connectOrCreate: {
                    where: { libelle: String(etatPanne) },
                    create: { libelle: String(etatPanne) }
                }
            };
        }

        if (diagnostic) {
            updateData.etat_tpe_suivi_maintenance_tpe_diagnosticToetat_tpe = {
                connectOrCreate: {
                    where: { libelle: String(diagnostic) },
                    create: { libelle: String(diagnostic) }
                }
            };
            // On remplit aussi le champ texte pour l'affichage simple
            updateData.objet_dia = observation || diagnostic;
        }

        // 3. Validation et Utilisateur
        updateData.date_validation = new Date();
        if (req.user?.email) {
            updateData.utilisateur = {
                connect: { email: req.user.email }
            };
        }

        // 4. L'UPDATE
        const updated = await prisma.suivi_maintenance_tpe.update({
            where: { id_suivi: suivi.id_suivi },
            data: updateData
        });

        // 5. Audit Log (Pour Naftal)
        await logAuditAction('Validation Maintenance TPE', numeroserietpe, null, req);

        res.json({ success: true, data: updated });

    } catch (error) {
        console.error("Erreur critique updateSuiviTpe:", error);
        res.status(500).json({ 
            success: false, 
            message: "Erreur de mise à jour", 
            detail: error.message 
        });
    }
};


// ================================
// GET /api/tpe/suivi
// Récupérer tous les suivis TPE
// ================================
const getSuiviTpes = async (req, res) => {
  try {
    const { whereSuiviTPE } = await getScopeFilters(req);
    
    // Récupérer tous les dossiers de suivi
    const suivis = await prisma.suivi_maintenance_tpe.findMany({
      where: whereSuiviTPE,
      include: {
        station_suivi_maintenance_tpe_code_stationTostation: {
          select: { nom_station: true }
        }
      },
      orderBy: { date_panne: "desc" }
    });

    // Les champs trs_dpe_bea / trs_bea_dpe sont NOT NULL au schéma — on stocke
    // un placeholder 2099-12-31 pour matérialiser "pas encore rempli". On le
    // re-masque ici pour ne pas le montrer côté UI.
    const PLACEHOLDER_ISO = '2099-12-31';
    const stripPlaceholder = (d) => {
      if (!d) return null;
      const iso = (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);
      return iso === PLACEHOLDER_ISO ? null : d;
    };

    // Formater les données pour le frontend avec tous les champs correctement mappés
    const suivisFormates = suivis.map(suivi => {
      const trsDpeBea = stripPlaceholder(suivi.trs_dpe_bea);
      const trsBeaDpe = stripPlaceholder(suivi.trs_bea_dpe);

      // Calculer la durée si elle n'est pas enregistrée
      // trs_dpe_bea = envoi vers BEA (DPE→BEA)
      // trs_bea_dpe = retour de BEA (BEA→DPE)
      let dureeTraitement = null;
      if (trsDpeBea && trsBeaDpe) {
        const dateEnvoi = new Date(trsDpeBea);
        const dateRetour = new Date(trsBeaDpe);
        const dureeEnJours = Math.max(0, Math.ceil((dateRetour - dateEnvoi) / (1000 * 60 * 60 * 24)));
        dureeTraitement = dureeEnJours;
      } else if (suivi.duree_trait) {
        dureeTraitement = suivi.duree_trait;
      }

      return {
        id: suivi.id_suivi,
        numeroserietpe: suivi.numeroserietpe,
        datePanne: suivi.date_panne,
        dateEnvoiBea: trsDpeBea,
        dateRetourBea: trsBeaDpe,
        etatPanne: suivi.etat_panne,
        diagnostic: suivi.diagnostic,
        objet_dia: suivi.objet_dia,
        dureeTraitement: dureeTraitement ? dureeTraitement + ' j' : null,
        modeleTPE: suivi.modele_tpe,
        stationNom: suivi.station_suivi_maintenance_tpe_code_stationTostation?.nom_station,
        codeStation: suivi.code_station,
        raisonsociale: suivi.raisonsociale,
        dateValidation: suivi.date_validation,
        validePar: suivi.valide_par,
        district: suivi.district,
        structureConcerne: suivi.structure_concerne,
        trs_st_str: suivi.trs_st_str,
        trs_str_dpe: suivi.trs_str_dpe,
        trs_dpe_str: suivi.trs_dpe_str,
        trs_str_st: suivi.trs_str_st
      };
    });

    res.json({ 
      success: true, 
      suivis: suivisFormates 
    });
  } catch (error) {
    console.error("Erreur lors de la récupération du suivi TPE:", error);
    res.status(500).json({ 
      success: false, 
      message: "Erreur serveur lors de la récupération du suivi TPE.",
      erreur: error.message 
    });
  }
};

// ================================
// GET /api/tpe/maintenance/suivi/:id
// Détail suivi maintenance avec couleurs
// ================================
const getSuiviMaintenance = async (req, res) => {
    try {
        const { id } = req.params
        const { whereSuiviTPE } = await getScopeFilters(req);

        const suivi = await prisma.suivi_maintenance_tpe.findFirst({
            where: combineWhere(whereSuiviTPE, { id_suivi: parseInt(id) }),
            include: {
                station_suivi_maintenance_tpe_code_stationTostation: {
                    include: { structure: true }
                }
            }
        })

        if (!suivi) {
            return res.status(404).json({ success: false, message: 'Suivi non trouvé' })
        }

        // Déterminer la couleur selon l'état
       const getCouleur = (etat) => {
    switch(etat) {
        case 'En_traitement':   return '#FFA500'  // Orange
        case 'Réparé':          return '#008000'  // Vert
        case 'En_service':      return '#00FF00'  // Vert clair
        default:                return '#FF0000'  // Rouge
    }
}

        const etapesTRS = [
            { nom: 'Station → Structure', date: suivi.trs_st_str, status: suivi.trs_st_str ? 'COMPLET' : 'EN_ATTENTE' },
            { nom: 'Structure → DPE', date: suivi.trs_str_dpe, status: suivi.trs_str_dpe ? 'COMPLET' : 'EN_ATTENTE' },
            { nom: 'DPE → BEA', date: suivi.trs_dpe_bea, status: suivi.trs_dpe_bea ? 'COMPLET' : 'EN_ATTENTE' },
            { nom: 'BEA → DPE', date: suivi.trs_bea_dpe, status: suivi.trs_bea_dpe ? 'COMPLET' : 'EN_ATTENTE' },
            { nom: 'DPE → Structure', date: suivi.trs_dpe_str, status: suivi.trs_dpe_str ? 'COMPLET' : 'EN_ATTENTE' },
            { nom: 'Structure → Station', date: suivi.trs_str_st, status: suivi.trs_str_st ? 'COMPLET' : 'EN_ATTENTE' }
        ]

        res.json({
            success: true,
            suivi: {
                ...suivi,
                couleur: getCouleur(suivi.etat_panne)
            },
            etapesTRS,
            duree_trait: suivi.duree_trait,
            duree_immobilisation: suivi.duree_immobilisation
        })

    } catch (error) {
        console.error('getSuiviMaintenance error:', error)
        res.status(500).json({ success: false, message: error.message })
    }
}

// ================================
// POST /api/tpe/restitution
// Restituer un TPE (retirer définitivement du parc)
// ================================
const restituerTPE = async (req, res) => {
    try {
        const { numeroserietpe, motif_restitution } = req.body

        if (!numeroserietpe) {
            return res.status(400).json({ success: false, message: 'numeroserietpe est obligatoire.' })
        }

        // 1. Vérifier que le TPE existe dans stock_tpe
        const tpe = await prisma.stock_tpe.findUnique({
            where: { numeroserietpe },
            include: {
                station: { include: { structure: true } }
            }
        })
        if (!tpe) {
            return res.status(404).json({ success: false, message: 'TPE non trouvé.' })
        }

        // 2. Vérifier que le TPE est dans le parc (circulation_tpe)
        const circulation = await prisma.circulation_tpe.findUnique({
            where: { numero_serie_tpe: numeroserietpe }
        })
        if (!circulation) {
            return res.status(400).json({
                success: false,
                message: 'TPE non trouvé dans le parc. Il doit être dans circulation_tpe pour être restitué.'
            })
        }

        // 3. Vérifier qu'une restitution n'existe pas déjà
        const restitutionExistante = await prisma.restitution_reconfig_tpe.findUnique({
            where: { n_serie_tpe: numeroserietpe }
        })
        if (restitutionExistante) {
            return res.status(409).json({
                success: false,
                message: `Une restitution existe déjà pour ce TPE.`
            })
        }

        await prisma.$transaction(async (tx) => {

            // ── ÉTAPE 1 : Créer restitution_reconfig_tpe ──
            await tx.restitution_reconfig_tpe.create({
                data: {
                    id_res:                  circulation.id_circulation,
                    n_serie_tpe:             numeroserietpe,
                    code_station_ancienne:   circulation.code_station     || null,
                    raison_sociale_ancienne: circulation.raison_sociale   || null,
                    modele_tpe:              tpe.dotation                 || null,
                    motif_restitution:       motif_restitution            || 'RESTITUTION',
                    etat:                    'Restitué',
                    str_ancienne:            circulation.code_structure   || null,
                    n_serie_sim:             tpe.numero_serie_sim         || null,
                    adresse_IP_SIM:          tpe.adresse_IP_SIM           || null,
                }
            })

            // ── ÉTAPE 2 : Créer la decharge_tpe ──
            const numeroDecharge4 = `DT4-REST-${Date.now()}`
            const invNum4 = await nextTpeDechargeInventaire()
            await tx.decharge_tpe.create({
                data: {
                    numero_decharge:       numeroDecharge4,
                    numero_inventaire:     invNum4,
                    source:                circulation.code_station || 'STRUCTURE',
                    destination:           'DPE',
                    date_sortie:           new Date(),
                    date_creation:         new Date(),
                }
            })

            // ── ÉTAPE 3 : Créer ligne_decharge_tpe_type4 ──
            await tx.ligne_decharge_tpe_type4.create({
                data: {
                    numero_decharge:         numeroDecharge4,
                    id_ligne_type4:          circulation.id_circulation,
                    code_station_ancienne:   circulation.code_station     || null,
                    raison_sociale_ancienne: circulation.raison_sociale   || null,
                    str_ancienne:            tpe.station?.structure?.nom_structure || null,
                    numeroserietpe:          numeroserietpe,
                    n_serie_sim:             tpe.numero_serie_sim || null,
                }
            })

            // ── ÉTAPE 4 : Changer l'état dans circulation_tpe ──
            await tx.circulation_tpe.update({
                where: { numero_serie_tpe: numeroserietpe },
                data:  { etat: 'À restituer' }
            })

            // ── ÉTAPE 5 : Remettre le TPE en stock ──
            await tx.stock_tpe.update({
                where: { numeroserietpe },
                data:  { etat_tpe: 'En_stock' }
            })

            // ── ÉTAPE 6 : Historique ──
            await tx.historique_tpe.create({
                data: {
                    numeroserietpe,
                    ancienetat:    tpe.etat_tpe,
                    nouveletat:    'En_stock',
                    commentaire:   `Restitution - Motif: ${motif_restitution || 'Non spécifié'}`,
                    dateoperation: new Date()
                }
            })
        })

        await logAuditAction('Restitution TPE', numeroserietpe, null, req)

        res.json({
            success: true,
            message: 'TPE restitué. Il est retiré du parc et remis en stock (En_stock).'
        })

    } catch (error) {
        console.error('restituerTPE error:', error)
        if (error.code === 'P2002') {
            return res.status(409).json({
                success: false,
                message: 'Une restitution existe déjà pour ce TPE.'
            })
        }
        res.status(500).json({ success: false, message: error.message })
    }
}
// ================================
// GET /api/tpe/transfert
// Liste toutes les décharges TPE
// ================================
const getTransferts = async (req, res) => {
    try {
        const { scope } = await getScopeFilters(req);
        // Récupérer toutes les décharges
        const transferts = await prisma.decharge_tpe.findMany({
            orderBy: { date_creation: 'desc' }
        })

        // Récupérer les lignes pour chaque décharge
        const transfertsAvecLignes = await Promise.all(
            transferts.map(async (decharge) => {
                const lignesType1 = await prisma.ligne_decharge_tpe_type1.findMany({
                    where: { numero_decharge: decharge.numero_decharge },
                    include: { stock_tpe: true }
                })
                const lignesType2 = await prisma.ligne_decharge_tpe_type2.findMany({
                    where: { numero_decharge: decharge.numero_decharge },
                    include: { stock_tpe: true }
                })
                const lignesType3 = await prisma.ligne_decharge_tpe_type3.findMany({
                    where: { numero_decharge: decharge.numero_decharge },
                    include: {  suivi_maintenance_tpe: true  }
                })

                return {
                    ...decharge,
                    lignesType1,
                    lignesType2,
                    lignesType3
                }
            })
        )

        const transfertsFiltres = scope?.isGlobal
            ? transfertsAvecLignes
            : transfertsAvecLignes.filter((decharge) => canAccessTpeDecharge(scope, decharge));

        res.json({
            success: true,
            total: transfertsFiltres.length,
            transferts: transfertsFiltres
        })

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Erreur serveur',
            erreur: error.message
        })
    }
}

// ================================
// PUT /api/tpe/transferts/:id/reception
// Accusé de réception :
//   1. TPE passe EN_SERVICE dans stock_tpe
//   2. Nouveau record créé dans circulation_tpe
//   3. Historique enregistré
// ================================
const accuseReception = async (req, res) => {
    try {
        const { id } = req.params
        // id = id_decharge_tpe (le numéro entier de la décharge)

        // ── Étape 1 : Récupérer la décharge + ses lignes + les TPE liés ──
        const decharge = await prisma.decharge_tpe.findUnique({
            where: { id_decharge_tpe: parseInt(id) },
            include: {
                ligne_decharge_tpe_type1: {
                    include: {
                        stock_tpe: {
                            include: { station: true }  // ← pour récupérer les infos station
                        }
                    }
                }
            }
        })

        if (!decharge) {
            return res.status(404).json({
                success: false,
                message: 'Décharge non trouvée !'
            })
        }

        // Vérifier qu'il y a bien des lignes
        if (!decharge.ligne_decharge_tpe_type1 || decharge.ligne_decharge_tpe_type1.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Cette décharge ne contient aucun TPE !'
            })
        }

        const tpesTraites = []

        // ── Étape 2 : Pour chaque TPE dans la décharge ──
        for (const ligne of decharge.ligne_decharge_tpe_type1) {
            const tpe = ligne.stock_tpe

            if (!tpe) continue  // sécurité : passer si TPE introuvable

            // 2a. Changer l'état dans stock_tpe → EN_SERVICE
            await prisma.stock_tpe.update({
                where: { numeroserietpe: tpe.numeroserietpe },
                data:  { etat_tpe: 'En_service' }
            })

            // 2b. Vérifier si ce TPE est déjà dans circulation_tpe
            // (pour éviter un doublon car numero_serie_tpe est @unique)
            const dejaEnCirculation = await prisma.circulation_tpe.findUnique({
                where: { numero_serie_tpe: tpe.numeroserietpe }
            })

            if (!dejaEnCirculation) {
                // 2c. Créer le record dans circulation_tpe
                await prisma.circulation_tpe.create({
                    data: {
                        // district obligatoire → on prend celui du stock_tpe
                        district:           tpe.district,

                        // infos de la structure destination
                        code_structure:     ligne.district_concerne || null,
                        raison_sociale_structure: ligne.structure_concernee || null,

                        // infos de la station
                        code_station:       ligne.code_station     || tpe.code_station || null,
                        raison_sociale:     ligne.raison_sociale    || tpe.station?.nom_station || null,

                        // infos du TPE
                        numero_serie_tpe:   tpe.numeroserietpe,
                        id_tpe:             tpe.idtpe              || null,
                        dotation:           tpe.dotation           || null,
                        n_compte_bancaire:  tpe.station?.n_compte_bancaire || null,

                        // dates
                        date_reception:     new Date(),
                        date_remise:        tpe.date_remise        || null,
                        date_expiration:    tpe.date_expiration     || null,

                        // état par défaut
                        etat:                'En_service'
                    }
                })
            }

            // 2d. Enregistrer dans historique
            await prisma.historique_tpe.create({
                data: {
                    numeroserietpe: tpe.numeroserietpe,
                    ancienetat:     'En_stock',
                    nouveletat:     'En_service',
                    dateoperation:  new Date(),
                    commentaire:    `Accusé de réception — Décharge ${decharge.numero_decharge}`
                }
            })

            tpesTraites.push(tpe.numeroserietpe)
        }

        await logAuditAction('Accusé réception TPE', tpesTraites.join(', '), null, req)

        // ── Étape 3 : Réponse ──
        res.json({
            success: true,
            message: `Accusé de réception enregistré ! ${tpesTraites.length} TPE passés EN_SERVICE et ajoutés au Parc.`,
            numero_decharge: decharge.numero_decharge,
            tpes_traites: tpesTraites
        })

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Erreur serveur',
            erreur: error.message
        })
    }
}


// ─── MODULE STRUCTURES & STATIONS ────────────────────────────

const getStructures = async (req, res) => {
  try {
    const { whereStructure } = await getScopeFilters(req);
    const structures = await prisma.structure.findMany({
      where: whereStructure,
      orderBy: { nom_structure: 'asc' },
    });
    res.json(structures);
  } catch (error) {
    console.error('getStructures error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des structures.' });
  }
};

const getStations = async (req, res) => {
  try {
    const { whereStation } = await getScopeFilters(req);
    const stations = await prisma.station.findMany({
      where: whereStation,
      include: {
        structure: { select: { nom_structure: true, code: true } },
        _count: { select: { stock_tpe: true } },
      },
      orderBy: { nom_station: 'asc' },
    });
    res.json(stations);
  } catch (error) {
    console.error('getStations error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des stations.' });
  }
};

const getStationsByStructure = async (req, res) => {
  const { idstructure } = req.params;
  try {
    const { whereStation } = await getScopeFilters(req);
    const stations = await prisma.station.findMany({
      where: combineWhere(whereStation, { idstructure: parseInt(idstructure) }),
      include: {
        structure: { select: { nom_structure: true, code: true } },
        _count: { select: { stock_tpe: true } },
      },
      orderBy: { nom_station: 'asc' },
    });
    res.json(stations);
  } catch (error) {
    console.error('getStationsByStructure error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des stations.' });
  }
};

// ─── MODULE HISTORIQUE TPE ────────────────────────────────────

const getHistoriqueTPE = async (req, res) => {
  const { id } = req.params; // id = numeroserietpe
  try {
    const { whereTPE } = await getScopeFilters(req);
    const tpe = await prisma.stock_tpe.findFirst({
      where: combineWhere(whereTPE, { numeroserietpe: id }),
      select: { numeroserietpe: true },
    });

    if (!tpe) {
      return res.status(404).json({ error: 'TPE non trouvé.' });
    }

    const historique = await prisma.historique_tpe.findMany({
      where: { numeroserietpe: id },
      orderBy: { dateoperation: 'desc' },
    });
    if (historique.length === 0) {
      return res.status(404).json({ error: 'Aucun historique trouvé pour ce TPE.' });
    }
    res.json(historique);
  } catch (error) {
    console.error('getHistoriqueTPE error:', error);
    res.status(500).json({ error: "Erreur lors de la récupération de l'historique." });
  }
};

const creerTPE = async (req, res) => {
  // Champs réels du modèle `stock_tpe` (cf. prisma/schema.prisma) :
  //   numeroserietpe, idtpe, operateur_mobile, nomcommercial, date_reception,
  //   date_expiration, amortissement, n_contrat, adresse, district (NOT NULL),
  //   code_structure, raisonsocialestructure, wilaya, code_station (NOT NULL),
  //   numero_serie_sim (NOT NULL), adresse_IP_SIM (NOT NULL),
  //   n_telephone_SIM (NOT NULL), date_remise, dotation (FK NOT NULL),
  //   etat_tpe (FK NOT NULL).
  //
  // Accepte aussi les alias "UI" envoyés par le formulaire frontend :
  //   serial, idTerminal, nomCommercial, station (nom ou code), dateReception, status.
  const b = req.body || {};
  const numeroserietpe = b.numeroserietpe || b.serial || b.numero_serie_tpe;
  const idtpe = b.idtpe || b.idTerminal || null;
  const nomcommercial = b.nomcommercial || b.nomCommercial || null;
  const adresse = b.adresse || null;
  const n_contrat = b.n_contrat || b.numContrat || null;
  const date_reception = b.date_reception || b.dateReception;
  const date_expiration = b.date_expiration || b.dateExpiration;
  const amortissement = b.amortissement;
  const operateur_mobile = b.operateur_mobile || null;
  let wilaya = b.wilaya || null;
  let district = b.district || null;
  let code_structure = b.code_structure || null;
  let raisonsocialestructure = b.raisonsocialestructure || b.nomCommercial || null;

  // Résolution du station : accepte `code_station` direct ou un nom via `station`.
  let code_station = b.code_station || null;
  const stationFallback = b.station || null;

  // Placeholder pour les champs NOT NULL que le formulaire legacy ne collecte pas.
  const numero_serie_sim = b.numero_serie_sim || `SIM-${numeroserietpe || Date.now()}`;
  const adresse_IP_SIM = b.adresse_IP_SIM || '0.0.0.0';
  const n_telephone_SIM = b.n_telephone_SIM || '0000000000';

  const typeLibelle = b.dotation || b.tarification || 'STANDARD';
  const etatLibelle = b.etat_tpe || b.status || 'En_stock';

  if (!numeroserietpe) {
    return res.status(400).json({ error: 'numeroserietpe (ou serial) est obligatoire.' });
  }

  try {
    const existant = await prisma.stock_tpe.findUnique({ where: { numeroserietpe } });
    if (existant) {
      return res.status(409).json({ error: 'Ce numéro de série existe déjà.' });
    }

    // Recherche du station_code : si pas fourni explicitement, tenter une résolution par nom.
    if (!code_station && stationFallback) {
      const match = await prisma.station.findFirst({
        where: {
          OR: [
            { code_station: stationFallback },
            { nom_station: stationFallback },
          ],
        },
        select: { code_station: true, district: true, wilaya: true, structure: { select: { code: true, nom_structure: true } } },
      });
      if (match) {
        code_station = match.code_station;
        district = district || match.district;
        wilaya = wilaya || match.wilaya;
        code_structure = code_structure || match.structure?.code || null;
        raisonsocialestructure = raisonsocialestructure || match.structure?.nom_structure || null;
      }
    }

    if (!code_station) {
      return res.status(400).json({
        error: 'code_station est obligatoire (soit directement, soit via un nom de station existant).',
      });
    }

    if (!district) {
      // Dernier recours : prendre le district de la station.
      const st = await prisma.station.findUnique({
        where: { code_station },
        select: { district: true },
      });
      district = st?.district || 'NON_DEFINI';
    }

    const tpe = await prisma.$transaction(async (tx) => {
      const nouveau = await tx.stock_tpe.create({
        data: {
          numeroserietpe,
          idtpe,
          nomcommercial,
          operateur_mobile,
          adresse,
          wilaya,
          district,
          code_structure,
          raisonsocialestructure,
          numero_serie_sim,
          adresse_IP_SIM,
          n_telephone_SIM,
          date_reception: date_reception ? new Date(date_reception) : new Date(),
          date_expiration: date_expiration ? new Date(date_expiration) : null,
          amortissement: amortissement != null ? parseInt(amortissement) : null,
          n_contrat,
          // Scalaires masqués par Prisma → on passe par les relations.
          station: { connect: { code_station } },
          type_tpe: {
            connectOrCreate: {
              where: { libelle: typeLibelle },
              create: { libelle: typeLibelle },
            },
          },
          etat_tpe_stock_tpe_etat_tpeToetat_tpe: {
            connectOrCreate: {
              where: { libelle: etatLibelle },
              create: { libelle: etatLibelle },
            },
          },
        },
      });

      await tx.historique_tpe.create({
        data: {
          numeroserietpe,
          ancienetat: 'NON_EXISTANT',
          nouveletat: etatLibelle,
          commentaire: 'Création manuelle',
          dateoperation: new Date(),
        },
      });

      return nouveau;
    });

    res.status(201).json({ message: 'TPE créé avec succès.', tpe });
  } catch (error) {
    console.error('creerTPE error:', error);
    res.status(500).json({ error: 'Erreur lors de la création du TPE.', details: error.message });
  }
};
// ================================
// POST /api/tpe/panne/signaler
// La structure signale un TPE en panne
// ================================
// ================================================================
// CORRECTION À FAIRE DANS tpeController.js
// Remplacez UNIQUEMENT la fonction signalerPanne par celle-ci
// ================================================================

// ================================
// POST /api/tpe/panne/signaler
// La structure signale un TPE en panne
//
// POURQUOI L'ERREUR SE PRODUISAIT :
// Le schéma Prisma a plusieurs champs OBLIGATOIRES (sans ?) dans suivi_maintenance_tpe :
//   - trs_dpe_bea  DateTime   ← pas de ?, donc obligatoire
//   - trs_bea_dpe  DateTime   ← pas de ?, donc obligatoire
//   - raisonsociale String    ← pas de ?, donc obligatoire
//   - etat_panne est une FK vers etat_tpe.libelle (attention aux valeurs)
//
// Body attendu :
// {
//   "numeroserietpe": "TPE-IMP-001",
//   "code_station": "ST-ORAN-001",
//   "anomalie_constatee": "Écran cassé"
// }
// ================================
const signalerPanne = async (req, res) => {
    try {
        const { numeroserietpe, code_station, anomalie_constatee, mode_operation_tpe } = req.body

        if (!numeroserietpe) {
            return res.status(400).json({ success: false, message: 'numeroserietpe est obligatoire.' })
        }

        const tpe = await prisma.stock_tpe.findUnique({
            where: { numeroserietpe },
            include: { station: true }
        })
        if (!tpe) {
            return res.status(404).json({ success: false, message: `TPE "${numeroserietpe}" non trouvé.` })
        }

        const codeStationFinal = code_station || tpe.code_station
        if (!codeStationFinal) {
            return res.status(400).json({ success: false, message: 'code_station est obligatoire.' })
        }

        const station = await prisma.station.findUnique({ where: { code_station: codeStationFinal } })
        if (!station) {
            return res.status(404).json({ success: false, message: `Station "${codeStationFinal}" non trouvée.` })
        }

        // L'état demandé vient du mode choisi dans l'UI, pas du texte libre de
        // l'observation (sinon n'importe quel texte basculait jadis en rapatriement).
        const modeUI = String(mode_operation_tpe || '').trim();
        const mapModeToEtat = (m) => {
            if (m === 'Volé') return 'Volé';
            if (m === 'En panne') return 'En_panne';
            // "En maintenance" est fusionné dans "En_traitement" : un seul état
            // pour les TPE envoyés en maintenance/traitement.
            if (m === 'En maintenance' || m === 'En traitement') return 'En_traitement';
            return 'En_panne'; // fallback sûr : un signalement non reconnu = panne
        };

        const suiviExistant = await prisma.suivi_maintenance_tpe.findUnique({ where: { numeroserietpe } })
       if (suiviExistant) {
    // ✅ Mettre à jour le suivi existant au lieu de bloquer
    const etatDemande = mapModeToEtat(modeUI);

        if (!(await prisma.etat_tpe.findUnique({ where: { libelle: etatDemande } }))) {
            await prisma.etat_tpe.create({ data: { libelle: etatDemande } });
        }

    // Nouveau cycle de panne : on efface les dates du cycle précédent.
    // trs_st_str sera reposé uniquement quand l'utilisateur fera
    // « Envoyer pour traitement ». trs_dpe_bea / trs_bea_dpe sont NOT NULL
    // au schéma → on les remet à un placeholder (vu comme "non rempli" côté UI).
    const datePlaceholderReset = new Date('2099-12-31');
    await prisma.suivi_maintenance_tpe.update({
        where: { numeroserietpe },
        data: {
            etat_panne: etatDemande,
            objet_dia: anomalie_constatee || suiviExistant.objet_dia,
            trs_st_str: null,
            trs_str_dpe: null,
            trs_dpe_str: null,
            trs_str_st: null,
            trs_dpe_bea: datePlaceholderReset,
            trs_bea_dpe: datePlaceholderReset,
            date_panne: new Date(),
        }
    });

    await prisma.stock_tpe.update({
        where: { numeroserietpe },
        data: { etat_tpe: etatDemande }
    });

    const circulation = await prisma.circulation_tpe.findUnique({
        where: { numero_serie_tpe: numeroserietpe }
    });
    if (circulation) {
        await prisma.circulation_tpe.update({
            where: { numero_serie_tpe: numeroserietpe },
            data: { etat: etatDemande }
        });
    }

    await logAuditAction('Signalement panne TPE', numeroserietpe, null, req);

    return res.json({ success: true, message: `Suivi mis à jour — état : ${etatDemande}.` });
}
        // ✅ Déterminer l'état selon le mode UI (pas l'observation libre).
        const etatDemande = mapModeToEtat(modeUI);

        // ✅ Créer l'état dans etat_tpe s'il n'existe pas
        if (!(await prisma.etat_tpe.findUnique({ where: { libelle: etatDemande } }))) {
            await prisma.etat_tpe.create({ data: { libelle: etatDemande } });
        }

        const datePlaceholder = new Date('2099-12-31')

        const suivi = await prisma.$transaction(async (tx) => {
            const nouveauSuivi = await tx.suivi_maintenance_tpe.create({
                data: {
                    numeroserietpe: tpe.numeroserietpe,
                    idtpe: tpe.idtpe || null,
                    modele_tpe: tpe.dotation || null,
                    code_station: codeStationFinal,
                    raisonsociale: station.nom_station || tpe.raisonsocialestructure || codeStationFinal,
                    date_panne: new Date(),
                    etat_panne: etatDemande, // ✅ Volé / En_panne / En_traitement
                    
                    // 🔴 FIX here : On passe null au lieu de 'anomalie_constatee' 
                    // pour éviter le crash de la clé étrangère (P2003)
                    diagnostic: null, 
                    
                    // ✅ L'information n'est pas perdue, elle est stockée en texte libre ici :
                    objet_dia: anomalie_constatee || null, 
                    
                    mode_operation_tpe: null,
                    // trs_st_str sera posé uniquement à l'« Envoyer pour traitement »
                    // (genererTransfertType2), pas au signalement de panne.
                    trs_st_str: null,
                    trs_str_dpe: null,
                    trs_dpe_str: null,
                    trs_str_st: null,
                    trs_dpe_bea: datePlaceholder,
                    trs_bea_dpe: datePlaceholder,
                }
            })

            // ✅ Mettre à jour stock_tpe avec le bon état
            await tx.stock_tpe.update({
                where: { numeroserietpe },
                data: { etat_tpe: etatDemande }
            })

            // ✅ Mettre à jour circulation_tpe si existe
            const circulation = await tx.circulation_tpe.findUnique({
                where: { numero_serie_tpe: numeroserietpe }
            })
            if (circulation) {
                await tx.circulation_tpe.update({
                    where: { numero_serie_tpe: numeroserietpe },
                    data: { etat: etatDemande }
                })
            }

            // ✅ Historique
            await tx.historique_tpe.create({
                data: {
                    numeroserietpe,
                    ancienetat: tpe.etat_tpe,
                    nouveletat: etatDemande,
                    commentaire: `Signalement — ${anomalie_constatee || 'Anomalie non spécifiée'}`,
                    dateoperation: new Date()
                }
            })

            return nouveauSuivi
        })

        await logAuditAction('Signalement panne TPE', numeroserietpe, null, req)

        res.json({ success: true, message: `TPE passé en "${etatDemande}".`, suivi })

    } catch (error) {
        console.error('signalerPanne error:', error)
        res.status(500).json({ success: false, message: error.message })
    }
}

// ================================
// POST /api/tpe/reconfigurer
// Reconfigurer un TPE (changement de structure/station)
// ================================
// ================================
// POST /api/tpe/reconfigurer
// Reconfigurer un TPE (changement de station, reste dans le parc)
// ================================
const reconfigurerTPE = async (req, res) => {
    try {
        const {
            numeroserietpe,
            nouveau_code_station,
            nouvelle_raison_sociale,
            nouveau_n_telephone_sim,
            nouvelle_adresse_ip_sim,
            motif_reconfiguration
        } = req.body

        if (!numeroserietpe || !nouveau_code_station) {
            return res.status(400).json({
                success: false,
                message: 'numeroserietpe et nouveau_code_station sont obligatoires.'
            })
        }

        // 1. Vérifier que le TPE existe
        const tpe = await prisma.stock_tpe.findUnique({
            where: { numeroserietpe },
            include: { station: { include: { structure: true } } }
        })
        if (!tpe) {
            return res.status(404).json({ success: false, message: 'TPE non trouvé.' })
        }

        // 2. Vérifier que le TPE est dans le parc
        const circulation = await prisma.circulation_tpe.findUnique({
            where: { numero_serie_tpe: numeroserietpe }
        })
        if (!circulation) {
            return res.status(400).json({
                success: false,
                message: 'TPE non trouvé dans le parc (circulation_tpe).'
            })
        }

        // 3. Vérifier que la nouvelle station existe
        const nouvelleStation = await prisma.station.findUnique({
            where: { code_station: nouveau_code_station },
            include: { structure: true }
        })
        if (!nouvelleStation) {
            return res.status(404).json({
                success: false,
                message: `Station "${nouveau_code_station}" non trouvée.`
            })
        }

        // 4. Vérifier qu'une restitution n'existe pas déjà
        const restitutionExistante = await prisma.restitution_reconfig_tpe.findUnique({
            where: { n_serie_tpe: numeroserietpe }
        })
        if (restitutionExistante) {
            return res.status(409).json({
                success: false,
                message: 'Une restitution/reconfiguration existe déjà pour ce TPE.'
            })
        }

        await prisma.$transaction(async (tx) => {

            // ── ÉTAPE 1 : Créer restitution_reconfig_tpe ──
            await tx.restitution_reconfig_tpe.create({
                data: {
                    id_res:                  circulation.id_circulation,
                    n_serie_tpe:             numeroserietpe,
                    code_station_ancienne:   circulation.code_station              || null,
                    raison_sociale_ancienne: circulation.raison_sociale            || null,
                    code_station_nouvelle:   nouveau_code_station,
                    raison_sociale_nouvelle: nouvelle_raison_sociale               || nouvelleStation.nom_station || null,
                    modele_tpe:              tpe.dotation                          || null,
                    motif_restitution:       motif_reconfiguration                 || 'RECONFIGURATION',
                    etat:                    'Reconfiguré',
                    str_ancienne:            circulation.code_structure            || null,
                    str_nouvelle:            nouvelleStation.structure?.code       || null,
                    n_serie_sim:             tpe.numero_serie_sim                  || null,
                    adresse_IP_SIM:          nouvelle_adresse_ip_sim               || tpe.adresse_IP_SIM || null,
                }
            })

            // ── ÉTAPE 2 : Créer la decharge_tpe ──
            const numeroDecharge4 = `DT4-RECONF-${Date.now()}`
            const invNum4 = await nextTpeDechargeInventaire()
            await tx.decharge_tpe.create({
                data: {
                    numero_decharge:       numeroDecharge4,
                    numero_inventaire:     invNum4,
                    source:                circulation.code_station || 'STRUCTURE',
                    destination:           nouveau_code_station,
                    date_sortie:           new Date(),
                    date_creation:         new Date(),
                }
            })

            // ── ÉTAPE 3 : Créer ligne_decharge_tpe_type4 ──
            await tx.ligne_decharge_tpe_type4.create({
                data: {
                    numero_decharge:          numeroDecharge4,
                    id_ligne_type4:           circulation.id_circulation,
                    code_station_ancienne:    circulation.code_station              || null,
                    raison_sociale_ancienne:  circulation.raison_sociale            || null,
                    code_station_nouvelle:    nouveau_code_station,
                    raison_sociale_nouvelle:  nouvelle_raison_sociale               || nouvelleStation.nom_station || null,
                    str_ancienne:             tpe.station?.structure?.nom_structure || null,
                    str_nouvelle:             nouvelleStation.structure?.nom_structure || null,
                    numeroserietpe:           numeroserietpe,
                    n_serie_sim:              tpe.numero_serie_sim || null,
                    motif_restitution:        motif_reconfiguration || 'RECONFIGURATION',
                }
            })

            // ── ÉTAPE 4 : Mettre à jour stock_tpe ──
            await tx.stock_tpe.update({
                where: { numeroserietpe },
                data: {
                    code_station:           nouveau_code_station,
                    raisonsocialestructure: nouvelle_raison_sociale              || nouvelleStation.nom_station || null,
                    code_structure:         nouvelleStation.structure?.code      || null,
                    district:               nouvelleStation.structure?.nom_structure || tpe.district,
                    wilaya:                 nouvelleStation.wilaya                || tpe.wilaya || null,
                    n_telephone_SIM:        nouveau_n_telephone_sim              || tpe.n_telephone_SIM,
                    adresse_IP_SIM:         nouvelle_adresse_ip_sim              || tpe.adresse_IP_SIM,
                    etat_tpe:               'En_service'
                }
            })

            // ── ÉTAPE 5 : Mettre à jour circulation_tpe ──
            await tx.circulation_tpe.update({
                where: { numero_serie_tpe: numeroserietpe },
                data: {
                    code_station:             nouveau_code_station,
                    raison_sociale:           nouvelle_raison_sociale              || nouvelleStation.nom_station || null,
                    code_structure:           nouvelleStation.structure?.code      || null,
                    raison_sociale_structure: nouvelleStation.structure?.nom_structure || null,
                    district:                 nouvelleStation.structure?.nom_structure || circulation.district,
                    wilaya:                   nouvelleStation.wilaya                || null,
                    etat:                     'En_service'
                }
            })

            // ── ÉTAPE 6 : Historique ──
            await tx.historique_tpe.create({
                data: {
                    numeroserietpe,
                    ancienetat:    tpe.etat_tpe,
                    nouveletat:    'En_service',
                    commentaire:   `Reconfiguration : ${circulation.code_station} → ${nouveau_code_station}`,
                    dateoperation: new Date()
                }
            })
        })

        await logAuditAction('Reconfiguration TPE', numeroserietpe, null, req)

        res.json({
            success: true,
            message: `TPE reconfiguré. Nouvelle station : ${nouveau_code_station}. Il reste En_service dans le parc.`,
            ancienne_station: circulation.code_station,
            nouvelle_station:  nouveau_code_station,
        })

    } catch (error) {
        console.error('reconfigurerTPE error:', error)
        if (error.code === 'P2002') {
            return res.status(409).json({
                success: false,
                message: 'Une restitution/reconfiguration existe déjà pour ce TPE.'
            })
        }
        res.status(500).json({ success: false, message: error.message })
    }
}

// ================================
// GET /api/tpe/types-tpe
// Liste des modèles TPE pour le dropdown frontend
// ================================
const getTypesTpe = async (_req, res) => {
  try {
    const types = await prisma.type_tpe.findMany({
      select:  { id_type_tpe: true, libelle: true },
      orderBy: { libelle: 'asc' },
    })
    res.json({ success: true, types })
  } catch (e) {
    console.error('getTypesTpe error:', e)
    res.status(500).json({ error: 'Erreur lors du chargement des modèles TPE.' })
  }
}

module.exports = {
  getStock,
  getTypesTpe,
  getMaintenanceStock,
  getParc,
  getMaintenance,
  getTPEById,
  changerEtat,
  genererTransfertType1,
  genererTransfertType2,
  genererTransfertType3,
  creerSuivi,
  signalerPanne,
  getTransferts,
  accuseReception,
  creerTPE,
  getStructures,
  getStations,
  getStationsByStructure,
  getHistoriqueTPE,
  printDecharge,
  getSuiviTpes,
   getSuiviMaintenance,
    restituerTPE,
     reconfigurerTPE,
  updateSuiviTpe, 
}
