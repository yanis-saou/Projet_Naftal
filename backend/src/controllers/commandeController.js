// ============================================================
// controllers/commandeController.js
// Gestion des commandes TPE CIB
//
// INSTALLATION (une seule fois) :
//   npm install pdfkit
// ============================================================

const prisma       = require('../config/prisma')
const PDFDocument  = require('pdfkit')   // ← npm install pdfkit
const { logAuditAction } = require('../utils/auditLogger')

prisma.$extends({
  client: {
    $transaction: {
      maxWait: 15000, // 15 secondes
      timeout: 15000,
    },
  },
});

// ================================
// GET /api/commandes
// Liste des commandes avec filtres
// ================================
const getCommandes = async (req, res) => {
    try {
        const { statut, structure_id, date_debut, date_fin } = req.query

        const where = {}
        if (statut)       where.statut = statut
        if (structure_id) where.id_structure_emmetrice = parseInt(structure_id)
        if (date_debut || date_fin) {
            where.date_commande = {}
            if (date_debut) where.date_commande.gte = new Date(date_debut)
            if (date_fin)   where.date_commande.lte = new Date(date_fin)
        }

        const commandes = await prisma.commande_cib.findMany({
            where,
            include: {
                ligne_commande_cib: { include: { type_tpe: true } },
                structure: { select: { nom_structure: true, code: true, idstructure: true } },
                station:   { select: { nom_station: true, code_station: true, wilaya: true } },
            },
            orderBy: { date_commande: 'desc' },
        })

        const commandesAvecStats = commandes.map(cmd => ({
            ...cmd,
            quantite_totale: cmd.ligne_commande_cib.reduce((sum, l) => sum + (l.quantite || 0), 0),
        }))

        res.json({ success: true, commandes: commandesAvecStats })

    } catch (error) {
        console.error('getCommandes error:', error)
        res.status(500).json({ error: 'Erreur lors de la récupération des commandes.' })
    }
}


// ================================
// GET /api/commandes/stats
// Statistiques dashboard — à placer AVANT /:id pour ne pas confondre la route
// ================================
const getCommandesStats = async (req, res) => {
    try {
        const [total, enCours, recues, annulees] = await Promise.all([
            prisma.commande_cib.count(),
            prisma.commande_cib.count({ where: { statut: 'En cours' } }),
            prisma.commande_cib.count({ where: { statut: 'Reçue' } }),
            prisma.commande_cib.count({ where: { statut: 'Annulée' } }),
        ])

        res.json({
            success: true,
            stats: {
                total,
                en_cours:          enCours,
                recues,
                annulees,
                taux_realisation:  total > 0 ? ((recues / total) * 100).toFixed(1) : 0,
            },
        })
    } catch (error) {
        console.error('getCommandesStats error:', error)
        res.status(500).json({ error: 'Erreur lors de la récupération des statistiques.' })
    }
}


// ================================
// GET /api/commandes/:id
// Détail d'une commande avec TPE reçus
// ================================
const getCommandeById = async (req, res) => {
    const { id } = req.params

    try {
        const commande = await prisma.commande_cib.findUnique({
            where: { id: parseInt(id) },
            include: {
                ligne_commande_cib: { include: { type_tpe: true } },
                structure: {
                    select: { nom_structure: true, code: true, idstructure: true, adresse: true, type_structure: true }
                },
                station: {
                    select: { nom_station: true, code_station: true, wilaya: true, adresse: true, n_compte_bancaire: true }
                },
                email_queue: { orderBy: { date_creation: 'desc' } },
            },
        })

        if (!commande) {
            return res.status(404).json({ error: 'Commande non trouvée.' })
        }

        // TPE réellement reçus liés à cette commande via n_contrat
        const tpesRecus = await prisma.stock_tpe.findMany({
            where: { n_contrat: commande.numero_commande },
            include: { station: true },
        })

        const quantiteTotale = commande.ligne_commande_cib.reduce((sum, l) => sum + (l.quantite || 0), 0)

        res.json({
            success: true,
            commande: {
                ...commande,
                quantite_totale:       quantiteTotale,
                quantite_recue:        tpesRecus.length,
                quantite_restante:     quantiteTotale - tpesRecus.length,
                tpes_recus:            tpesRecus,
                pourcentage_realisation: quantiteTotale > 0
                    ? ((tpesRecus.length / quantiteTotale) * 100).toFixed(1)
                    : 0,
            },
        })
    } catch (error) {
        console.error('getCommandeById error:', error)
        res.status(500).json({ error: 'Erreur lors de la récupération de la commande.' })
    }
}


// ================================
// POST /api/commandes
// Créer une commande
// ================================
const creerCommande = async (req, res) => {
    const {
        numero_commande,
        code_station,
        raison_sociale,
        adresse,
        n_compte_bancaire,
        id_structure_emmetrice,
        lignes,
        email_destinataire,
    } = req.body

    if (!numero_commande || !lignes || !Array.isArray(lignes) || lignes.length === 0) {
        return res.status(400).json({
            error: 'numero_commande et lignes (tableau non vide) sont obligatoires.',
        })
    }

    try {
        // Auto-créer les modèles TPE manquants (utile pour imports CSV / commandes legacy
        // dont le libellé ne préexiste pas dans type_tpe).
        const modeles = [...new Set(lignes.map(l => l.modele_tpe).filter(Boolean))]
        if (modeles.length === 0) {
            return res.status(400).json({ error: 'Au moins un modèle TPE est requis dans les lignes.' })
        }
        const typesExistants = await prisma.type_tpe.findMany({
            where:  { libelle: { in: modeles } },
            select: { libelle: true },
        })
        const modelesExistants = new Set(typesExistants.map(t => t.libelle))
        const modelesManquants = modeles.filter(m => !modelesExistants.has(m))
        if (modelesManquants.length > 0) {
            await prisma.type_tpe.createMany({
                data: modelesManquants.map(libelle => ({ libelle })),
                skipDuplicates: true,
            })
        }

        if (id_structure_emmetrice) {
            const structure = await prisma.structure.findUnique({ where: { idstructure: parseInt(id_structure_emmetrice) } })
            if (!structure) return res.status(404).json({ error: 'Structure émettrice non trouvée.' })
        }

        if (code_station) {
            const station = await prisma.station.findUnique({ where: { code_station } })
            if (!station) return res.status(404).json({ error: `Station ${code_station} non trouvée.` })
        }

        const result = await prisma.$transaction(async (tx) => {
            const commande = await tx.commande_cib.create({
                data: {
                    numero_commande,
                    code_station:           code_station           || null,
                    raison_sociale:         raison_sociale || adresse || null, 
                    n_compte_bancaire:      n_compte_bancaire      || null,
                    id_structure_emmetrice: id_structure_emmetrice ? parseInt(id_structure_emmetrice) : null,
                    date_commande:          new Date(),
                },
            })

            await tx.ligne_commande_cib.createMany({
                data: lignes.map(l => ({
                    id_commande: commande.id,
                    modele_tpe:  l.modele_tpe,
                    quantite:    parseInt(l.quantite) || 1,
                })),
            })

            if (email_destinataire) {
                const resumeLignes = lignes.map(l => `- ${l.modele_tpe} x${l.quantite}`).join('\n')
                await tx.email_queue.create({
                    data: {
                        destinataire:  email_destinataire,
                        sujet:         `Nouvelle commande CIB : ${numero_commande}`,
                        corps_message: `Nouvelle commande créée.\n\nNuméro : ${numero_commande}\nStatut : En cours\n\nLignes :\n${resumeLignes}`,
                        statut:        'EN_ATTENTE',
                        id_commande:   commande.id,
                    },
                })
            }

            return commande
        })

        await logAuditAction('Création commande TPE', `Commande ${numero_commande}`, null, req)
        res.status(201).json({ success: true, message: 'Commande créée avec succès.', commande: result })

    } catch (error) {
        if (error.code === 'P2002') return res.status(409).json({ error: 'Ce numéro de commande existe déjà.' })
        console.error('creerCommande error:', error)
        res.status(500).json({ error: 'Erreur lors de la création de la commande.' })
    }
}


// ================================
// PUT /api/commandes/:id/statut
// Changer le statut d'une commande
// ================================
// L'id de commande peut arriver comme entier (PK BD) ou comme `numero_commande` (référence métier).
const findCommandeByIdOrRef = async (idOrRef, include = {}) => {
    const idInt = parseInt(idOrRef)
    const where = !Number.isNaN(idInt) && /^\d+$/.test(String(idOrRef))
        ? { id: idInt }
        : { numero_commande: String(idOrRef) }
    return prisma.commande_cib.findUnique({ where, include })
}

const changerStatutCommande = async (req, res) => {
    const { id }     = req.params
    const { statut } = req.body

    // L'utilisateur valide la réception via /confirmer (ce qui insère les stock_tpe).
    // Cet endpoint n'accepte donc plus que les transitions purement administratives.
    const statutsValides = ['En cours', 'Annulée']
    if (!statut || !statutsValides.includes(statut)) {
        return res.status(400).json({
            error: `Statut invalide. Pour confirmer la réception, utilisez POST /tpe/commandes/:id/confirmer (intégration au stock).`,
        })
    }

    try {
        const commande = await findCommandeByIdOrRef(id)
        if (!commande) return res.status(404).json({ error: 'Commande non trouvée.' })

        const updated = await prisma.commande_cib.update({
            where: { id: commande.id },
            data: { statut },
        })
        await logAuditAction(
            statut === 'Annulée' ? 'Annulation commande TPE' : 'Modification commande TPE',
            `Commande ${commande.numero_commande} — ${statut}`,
            null, req
        )
        res.json({ success: true, message: `Statut mis à jour : ${statut}`, commande: updated })

    } catch (error) {
        console.error('changerStatutCommande error:', error)
        res.status(500).json({ error: 'Erreur lors de la mise à jour du statut.' })
    }
}


// ================================
// POST /api/tpe/commandes/:id/confirmer
// Le membre DPE valide la réception : insère N stock_tpe et passe la commande à 'Reçue'.
// last updated: 5/7/2026
// ================================
const confirmerCommande = async (req, res) => {
    const { id } = req.params
    const { tpes: tpesInput, date_reception } = req.body || {}

    try {
        const commande = await findCommandeByIdOrRef(id, {
            ligne_commande_cib: true,
            structure:          true,
        })
        if (!commande) return res.status(404).json({ error: 'Commande non trouvée.' })
        if (commande.statut === 'Reçue')   return res.status(409).json({ error: 'Commande déjà confirmée.' })
        if (commande.statut === 'Annulée') return res.status(409).json({ error: 'Commande annulée — confirmation impossible.' })

        const quantiteTotale = commande.ligne_commande_cib.reduce((s, l) => s + (l.quantite || 0), 0)
        if (quantiteTotale === 0) {
            return res.status(400).json({ error: 'Commande sans lignes — quantité totale = 0.' })
        }

        const dotationDefaut = commande.ligne_commande_cib[0]?.modele_tpe || null

        let codeStationDefaut = commande.code_station || null
        if (!codeStationDefaut) {
            const fallbackStation = await prisma.station.findFirst({ select: { code_station: true } })
            codeStationDefaut = fallbackStation?.code_station || null
        }

        let districtDefaut = commande.structure?.nom_structure || null
        if (!districtDefaut) {
            const fallbackStructure = await prisma.structure.findFirst({ select: { nom_structure: true } })
            districtDefaut = fallbackStructure?.nom_structure || null
        }

        if (!codeStationDefaut) return res.status(400).json({ error: 'Aucune station disponible — créez-en une avant de confirmer.' })
        if (!districtDefaut)    return res.status(400).json({ error: 'Aucune structure disponible — créez-en une avant de confirmer.' })
        if (!dotationDefaut)    return res.status(400).json({ error: 'Aucun modèle TPE sur la commande — impossible de générer les stocks.' })

        const safeRef = String(commande.numero_commande).replace(/[^A-Za-z0-9_-]/g, '')
        const genSerial = (i) => `TPE-${safeRef}-${String(i + 1).padStart(3, '0')}`
        let tpes = Array.isArray(tpesInput) && tpesInput.length > 0 ? tpesInput : []
        if (tpes.length === 0) {
            tpes = Array.from({ length: quantiteTotale }, (_, i) => ({ numeroserietpe: genSerial(i) }))
        } else if (tpes.length !== quantiteTotale) {
            return res.status(400).json({
                error: `Le nombre de TPE fournis (${tpes.length}) ne correspond pas à la quantité commandée (${quantiteTotale}).`,
            })
        }
        tpes = tpes.map((t, i) => ({ ...t, numeroserietpe: t?.numeroserietpe || genSerial(i) }))

        const seen = new Set()
        for (const t of tpes) {
            if (seen.has(t.numeroserietpe)) {
                return res.status(400).json({ error: `Numéro de série dupliqué : ${t.numeroserietpe}.` })
            }
            seen.add(t.numeroserietpe)
        }

        const dateReception = date_reception ? new Date(date_reception) : new Date()

        await prisma.etat_tpe.upsert({
            where:  { libelle: 'En_stock' },
            update: {},
            create: { libelle: 'En_stock' },
        })

        // ✅ ÉTAPE 1 : Charger toutes les stations AVANT la transaction bcs ca bug si on essaye de faire ça DANS la transaction (prisma ne trouve pas les stations créées dans la même transaction).
        const stationsMap = new Map()
        for (const t of tpes) {
            const codeStationPropre = (t.code_station || codeStationDefaut)?.replace(/"/g, '').trim()
            if (!stationsMap.has(codeStationPropre)) {
                const stationInfo = await prisma.station.findUnique({
                    where: { code_station: codeStationPropre },
                    include: { structure: true }
                })
                if (!stationInfo) {
                    return res.status(404).json({ error: `Station "${codeStationPropre}" introuvable.` })
                }
                stationsMap.set(codeStationPropre, stationInfo)
            }
        }

        // ✅ ÉTAPE 2 : Transaction rapide — juste des insertions
        const result = await prisma.$transaction(async (tx) => {
            for (const t of tpes) {
                const codeStationPropre = (t.code_station || codeStationDefaut)?.replace(/"/g, '').trim()
                const stationInfo = stationsMap.get(codeStationPropre)

                await tx.stock_tpe.create({
                    data: {
                        numeroserietpe:         t.numeroserietpe,
                        idtpe:                  t.idtpe || null,
                        operateur_mobile:       t.operateur_mobile || null,
                        nomcommercial:          t.nomcommercial || null,
                        date_reception:         dateReception,
                        date_expiration:        t.date_expiration ? new Date(t.date_expiration) : null,
                        amortissement:          t.amortissement != null ? parseInt(t.amortissement) : null,
                        n_contrat:              commande.numero_commande,
                        adresse:                t.adresse || null,
                        code_structure:         stationInfo?.structure?.code || null, 
                        raisonsocialestructure: stationInfo?.structure?.nom_structure || null, 
                        district:               stationInfo?.structure?.nom_structure || districtDefaut,
                        wilaya:                 t.wilaya || null,
                        code_station:           codeStationPropre,
                        numero_serie_sim:       t.numero_serie_sim || '',
                        adresse_IP_SIM:         t.adresse_IP_SIM   || '',
                        n_telephone_SIM:        t.n_telephone_SIM  || '',
                        date_remise:            t.date_remise ? new Date(t.date_remise) : null,
                        dotation:               t.dotation || dotationDefaut,
                        etat_tpe:               'En_stock',
                    },
                })
            }
            
            return tx.commande_cib.update({
                where: { id: commande.id },
                data: {
                    statut:            'Reçue',
                    id_validateur_dpe: req.user?.id ? parseInt(req.user.id) : undefined,
                    date_validation:   new Date(),
                },
            })
        })

        await logAuditAction('Confirmation commande TPE', `Commande ${commande.numero_commande} — ${tpes.length} TPE intégré(s) au stock`, null, req)
        res.json({
            success: true,
            message: `Commande confirmée — ${tpes.length} TPE intégré(s) au stock.`,
            commande: result,
            tpes_inseres: tpes.length,
        })

    } catch (error) {
        if (error.code === 'P2002') return res.status(409).json({ error: 'Un numéro de série existe déjà dans le stock.' })
        if (error.code === 'P2003') return res.status(400).json({ error: 'Référence invalide (station, structure, district, dotation, ou état "En_stock" absent dans etat_tpe).' })
        console.error('confirmerCommande error:', error)
        res.status(500).json({ error: 'Erreur lors de la confirmation de la commande.' })
    }
}

// ================================
// GET /api/commandes/export/bea
// Exporter les commandes validées vers BEA (format JSON)
// ================================
const exporterVersBEA = async (req, res) => {
    try {
        const { date_debut, date_fin, statut } = req.query

        const where = { statut: statut || 'Reçue' }
        if (date_debut || date_fin) {
            where.date_commande = {}
            if (date_debut) where.date_commande.gte = new Date(date_debut)
            if (date_fin)   where.date_commande.lte = new Date(date_fin)
        }

        const commandes = await prisma.commande_cib.findMany({
            where,
            include: {
                ligne_commande_cib: { include: { type_tpe: true } },
                structure: { select: { nom_structure: true, code: true, adresse: true } },
                station:   { select: { nom_station: true, code_station: true, wilaya: true, adresse: true } },
            },
            orderBy: { date_commande: 'desc' },
        })

        const exportBEA = commandes.map(cmd => ({
            NUMERO_COMMANDE: cmd.numero_commande,
            DATE_COMMANDE:   cmd.date_commande?.toISOString().split('T')[0],
            STRUCTURE:       cmd.structure?.nom_structure || '-',
            CODE_STRUCTURE:  cmd.structure?.code          || '-',
            STATION:         cmd.station?.nom_station     || '-',
            CODE_STATION:    cmd.station?.code_station    || '-',
            WILAYA:          cmd.station?.wilaya           || '-',
            STATUT:          cmd.statut,
            DATE_VALIDATION: cmd.date_validation?.toISOString().split('T')[0] || '-',
            MODELES:         cmd.ligne_commande_cib.map(l => `${l.modele_tpe}:${l.quantite}`).join(';'),
            QUANTITE_TOTALE: cmd.ligne_commande_cib.reduce((s, l) => s + (l.quantite || 0), 0),
        }))

        res.json({
            success: true,
            message:          `Export BEA — ${exportBEA.length} commandes`,
            date_export:      new Date().toISOString(),
            total_commandes:  exportBEA.length,
            commandes:        exportBEA,
        })

    } catch (error) {
        console.error('exporterVersBEA error:', error)
        res.status(500).json({ error: "Erreur lors de l'export vers BEA." })
    }
}


// ================================================================
// POST /api/commandes/regrouper
// Regroupe plusieurs commandes "En cours" → 1 commande globale + PDF
//
// Body :
// {
//   ids_commandes: [1, 2, 3],       ← obligatoire, minimum 2
//   id_validateur_dpe: 5,           ← optionnel
//   email_bea: "bea@naftal.dz"      ← optionnel
// }
// ================================================================
const regrouperEtExporter = async (req, res) => {
    const { ids_commandes, id_validateur_dpe, email_bea } = req.body

    // ── Validation ──
    if (!ids_commandes || !Array.isArray(ids_commandes) || ids_commandes.length < 2) {
        return res.status(400).json({
            success: false,
            message: 'ids_commandes doit être un tableau d\'au moins 2 IDs.',
        })
    }

    try {
        // ── ÉTAPE 1 : Récupérer les commandes ──
        const commandes = await prisma.commande_cib.findMany({
            where: { id: { in: ids_commandes.map(id => parseInt(id)) } },
            include: {
                ligne_commande_cib: { include: { type_tpe: true } },
                structure: { select: { nom_structure: true, code: true, adresse: true } },
                station:   { select: { nom_station: true, code_station: true, wilaya: true, adresse: true } },
            },
        })

        // Vérifier que toutes les commandes existent
        if (commandes.length !== ids_commandes.length) {
            const idsTrouves   = commandes.map(c => c.id)
            const idsManquants = ids_commandes.filter(id => !idsTrouves.includes(parseInt(id)))
            return res.status(404).json({
                success: false,
                message: `Commandes introuvables : IDs ${idsManquants.join(', ')}`,
            })
        }

        // Vérifier que toutes sont "En cours"
        const commandesNonValides = commandes.filter(c => c.statut !== 'En cours')
        if (commandesNonValides.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Ces commandes ne sont pas "En cours" : ${commandesNonValides.map(c => `${c.numero_commande} (${c.statut})`).join(', ')}`,
            })
        }

        // ── ÉTAPE 2 : Générer le numéro global CMD-YYYYMMDD-XXX ──
        const maintenant = new Date()
        const dateStr    = maintenant.toISOString().slice(0, 10).replace(/-/g, '')

        const nbCommandesDuJour = await prisma.commande_cib.count({
            where: { numero_commande: { startsWith: `CMD-${dateStr}` } },
        })
        const suffixe      = String(nbCommandesDuJour + 1).padStart(3, '0')
        const numeroGlobal = `CMD-${dateStr}-${suffixe}`

        // ── ÉTAPE 3 : Préparer les données ──
        // Pour le PDF : une ligne par commande x modele
        const lignesDetail = []
        commandes.forEach(cmd => {
            cmd.ligne_commande_cib.forEach(ligne => {
                lignesDetail.push({
                    modele_tpe:        ligne.modele_tpe || 'N/A',
                    quantite:          ligne.quantite || 0,
                    commande_origine:  cmd.numero_commande,
                    structure_origine: cmd.structure?.nom_structure || cmd.raison_sociale || 'N/A',
                    station_origine:   cmd.station?.nom_station     || 'N/A',
                    code_station:      cmd.station?.code_station    || cmd.code_station   || 'N/A',
                    wilaya:            cmd.station?.wilaya           || 'N/A',
                })
            })
        })

        const quantiteTotale = lignesDetail.reduce((sum, l) => sum + l.quantite, 0)

        // ── ÉTAPE 4 : Transaction Prisma ──
        await prisma.$transaction(async (tx) => {

            // 4a. Créer la commande globale
            const nouvelleCommande = await tx.commande_cib.create({
                data: {
                    numero_commande:   numeroGlobal,
                    raison_sociale:    `Commande groupee BEA — ${commandes.length} demandes`,
                    statut:            'Reçue',              // statut existant dans Status
                    date_commande:     maintenant,
                    date_validation:   maintenant,
                    id_validateur_dpe: id_validateur_dpe ? parseInt(id_validateur_dpe) : null,
                },
            })

            // 4b. Regrouper les lignes par modele_tpe et copier vers la nouvelle commande
            const lignesGroupees = {}
            commandes.forEach(cmd => {
                cmd.ligne_commande_cib.forEach(ligne => {
                    const cle = ligne.modele_tpe || 'INCONNU'
                    if (!lignesGroupees[cle]) {
                        lignesGroupees[cle] = {
                            id_commande:  nouvelleCommande.id,
                            modele_tpe:   ligne.modele_tpe,
                            quantite:     0,
                            tarification: ligne.tarification || null,
                        }
                    }
                    lignesGroupees[cle].quantite += (ligne.quantite || 0)
                })
            })

            await tx.ligne_commande_cib.createMany({
                data: Object.values(lignesGroupees),
            })

            // 4c. Passer les anciennes commandes à "Annulée"
            // ("Annulée" est déjà dans votre table Status)
            await tx.commande_cib.updateMany({
                where: { id: { in: ids_commandes.map(id => parseInt(id)) } },
                data:  { statut: 'Annulée' },
            })

            // 4d. Email optionnel pour la BEA
            if (email_bea) {
                const resumeModeles = Object.values(lignesGroupees)
                    .map(l => `  - ${l.modele_tpe} : ${l.quantite} unite(s)`)
                    .join('\n')

                await tx.email_queue.create({
                    data: {
                        destinataire:  email_bea,
                        sujet:         `Commande groupee BEA : ${numeroGlobal}`,
                        corps_message: `Bonjour,\n\nLa DPE vous transmet une commande groupee.\n\nNumero : ${numeroGlobal}\nDate : ${maintenant.toLocaleDateString('fr-FR')}\nNombre de demandes : ${commandes.length}\n\nRecapitulatif :\n${resumeModeles}\n\nQuantite totale : ${quantiteTotale} TPE\n\nCordialement,\nDPE NAFTAL`,
                        statut:        'EN_ATTENTE',
                        id_commande:   nouvelleCommande.id,
                    },
                })
            }
        })

        // ── ÉTAPE 5 : Générer le PDF ──
        const dateFormatee = maintenant.toLocaleDateString('fr-FR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
        })

        const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 50, right: 50 } })

        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', `attachment; filename="commande-bea-${numeroGlobal}.pdf"`)
        doc.pipe(res)

        // ── En-tête ──
        doc.font('Helvetica-Bold').fontSize(10)
           .text('NAFTAL SPA',                      50, 45)
        doc.font('Helvetica').fontSize(9)
           .text('Branche Commercialisation',        50, 58)
           .text('Direction Paiement Electronique',  50, 71)

        doc.rect(155, 42, 305, 40).stroke()
        doc.font('Helvetica-Bold').fontSize(11)
           .text('COMMANDE GROUPEE TPE CIB', 160, 50, { width: 295, align: 'center' })
           .text('DESTINEE A LA BEA',        160, 64, { width: 295, align: 'center' })

        doc.font('Helvetica').fontSize(9).text('P 1 / 1', 470, 45)
        doc.moveTo(50, 90).lineTo(545, 90).stroke()

        // ── Infos commande ──
        doc.font('Helvetica-Bold').fontSize(10)
           .text(`N Commande Globale : ${numeroGlobal}`, 50, 105)
        doc.font('Helvetica').fontSize(9)
           .text(`Date d'emission : ${dateFormatee}`,                        50, 120)
           .text(`Nombre de demandes regroupees : ${commandes.length}`,      50, 134)
           .text(`Quantite totale de TPE commandes : ${quantiteTotale}`,     50, 148)

        // Commandes d'origine à droite
        doc.font('Helvetica-Bold').fontSize(9).text('Commandes d\'origine :', 310, 105)
        doc.font('Helvetica').fontSize(8)
        commandes.forEach((cmd, i) => {
            doc.text(`  ${i + 1}. ${cmd.numero_commande}`, 315, 118 + i * 13)
        })

        doc.moveTo(50, 175).lineTo(545, 175).stroke()

        // ── Titre tableau ──
        doc.font('Helvetica-Bold').fontSize(10)
           .text('DETAIL DES DEMANDES PAR STRUCTURE', 50, 185, { width: 495, align: 'center' })

        let y = 204

        // En-têtes colonnes
        const cX = { num: 50, cmd: 75, str: 175, sta: 280, mod: 375, qte: 468 }
        doc.rect(50, y, 495, 18).fill('#cccccc').stroke()
        doc.fillColor('black').font('Helvetica-Bold').fontSize(8)
        doc.text('N',           cX.num, y + 5)
        doc.text('Commande',    cX.cmd, y + 5)
        doc.text('Structure',   cX.str, y + 5)
        doc.text('Station',     cX.sta, y + 5)
        doc.text('Modele TPE',  cX.mod, y + 5)
        doc.text('Qte',         cX.qte, y + 5)
        y += 18

        // Lignes
        doc.font('Helvetica').fontSize(8)
        lignesDetail.forEach((ligne, index) => {
            // Fond alterné
            if (index % 2 === 0) {
                doc.rect(50, y, 495, 15).fill('#f2f2f2').stroke()
            } else {
                doc.rect(50, y, 495, 15).stroke()
            }
            doc.fillColor('black')
            doc.text(String(index + 1),        cX.num, y + 4, { width: 20 })
            doc.text(ligne.commande_origine,    cX.cmd, y + 4, { width: 96,  ellipsis: true })
            doc.text(ligne.structure_origine,   cX.str, y + 4, { width: 100, ellipsis: true })
            doc.text(ligne.code_station,        cX.sta, y + 4, { width: 90,  ellipsis: true })
            doc.text(ligne.modele_tpe,          cX.mod, y + 4, { width: 88,  ellipsis: true })
            doc.text(String(ligne.quantite),    cX.qte, y + 4, { width: 30,  align: 'center' })
            y += 15
            if (y > 740) { doc.addPage(); y = 50 }
        })

        // Ligne total
        y += 3
        doc.rect(50, y, 495, 18).fill('#cccccc').stroke()
        doc.fillColor('black').font('Helvetica-Bold').fontSize(9)
        doc.text('TOTAL', cX.num, y + 5)
        doc.text(String(quantiteTotale), cX.qte, y + 5, { width: 30, align: 'center' })
        y += 25

        // ── Récap par modèle ──
        doc.font('Helvetica-Bold').fontSize(10).text('RECAPITULATIF PAR MODELE', 50, y)
        y += 15
        doc.font('Helvetica').fontSize(9)

        // Recalculer le regroupement par modele pour l'affichage
        const recapModele = {}
        lignesDetail.forEach(l => {
            recapModele[l.modele_tpe] = (recapModele[l.modele_tpe] || 0) + l.quantite
        })
        Object.entries(recapModele).forEach(([modele, qte]) => {
            doc.text(`  - ${modele} : ${qte} unite(s)`, 60, y)
            y += 14
        })

        y += 10

        // ── Zone signatures ──
        if (y > 680) { doc.addPage(); y = 50 }
        doc.moveTo(50, y).lineTo(545, y).stroke()
        y += 12

        doc.font('Helvetica').fontSize(9)
        doc.text('Le Responsable DPE NAFTAL :', 50, y)
        doc.text('Le BENEFICIAIRE (BEA) :',     330, y)
        y += 14
        doc.font('Helvetica-Bold').fontSize(8)
        doc.text('Nom et Signature :',  50,  y)
        doc.text('Nom et Signature :', 330,  y)
        y += 50
        doc.moveTo(50,  y).lineTo(220, y).stroke()
        doc.moveTo(330, y).lineTo(500, y).stroke()

        y += 18
        doc.font('Helvetica').fontSize(7).fillColor('gray')
        doc.text(
            `Document genere le ${dateFormatee} — Ref. : ${numeroGlobal} — NAFTAL DPE`,
            50, y, { align: 'center', width: 495 }
        )

        doc.end()

    } catch (error) {
        console.error('regrouperEtExporter error:', error)
        if (!res.headersSent) {
            if (error.code === 'P2002') {
                return res.status(409).json({
                    success: false,
                    message: 'Numéro de commande déjà existant. Réessayez dans quelques secondes.',
                })
            }
            return res.status(500).json({
                success: false,
                message: 'Erreur lors du regroupement.',
                erreur: error.message,
            })
        }
        res.end()
    }
}


// ================================================================
// EXPORTS
// ================================================================
module.exports = {
    getCommandes,
    getCommandeById,
    creerCommande,
    changerStatutCommande,
    confirmerCommande,
    getCommandesStats,
    exporterVersBEA,
    regrouperEtExporter,
}