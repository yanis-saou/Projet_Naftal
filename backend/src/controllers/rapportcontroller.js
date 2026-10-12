const prisma = require('../config/prisma');

// ============================================================
//   RAPPORTS TPE+CARTE  —  analyses détaillées avec filtres
//     Endpoint : GET /api/rapports/tpe
//     Tous les filtres période / date / état / numéroSérie ici
// ============================================================
const getRapportsTPE = async (req, res) => {
    try {
        const userRole = req.user?.role?.toUpperCase();
        const userId = req.user?.id_utilisateur;

        // ============================
        //  ROLES
        // ============================
        const allowedRoles = [
            "ADMIN_DPE",
            "CONSULTANT_DPE",
            "MEMBRE_DISTRICT",
            "CONSULTANT_DISTRICT",
            "MEMBRE_ANTENNE",
            "CONSULTANT_ANTENNE",
            "MEMBRE_AGENCE",
            "CONSULTANT_AGENCE"
        ];

        if (!allowedRoles.includes(userRole)) {
            return res.status(403).json({ error: "Accès refusé" });
        }

        // ============================
        //  FILTRES  (exclusifs aux rapports)
        // ============================
        const { periode, dateDebut, dateFin, etat, numeroSerie } = req.query;

        let startDate = null;
        let endDate = new Date();

        if (periode === "jour") {
            startDate = new Date();
            startDate.setHours(0, 0, 0, 0);
        } else if (periode === "mois") {
            startDate = new Date();
            startDate.setDate(1);
        } else if (periode === "annee") {
            startDate = new Date();
            startDate.setMonth(0, 1);
        } else if (dateDebut && dateFin) {
            startDate = new Date(dateDebut);
            endDate = new Date(dateFin);
        }

        // ============================
        //  FILTRE STRUCTURE
        // ============================
        let whereCondition = {};

        if (!["ADMIN_DPE", "CONSULTANT_DPE"].includes(userRole)) {
            const user = await prisma.utilisateur.findUnique({
                where: { id_utilisateur: userId },
                select: { id_structure: true }
            });

            const structure = await prisma.structure.findUnique({
                where: { idstructure: user.id_structure }
            });

            if (userRole.includes("ANTENNE") || userRole.includes("AGENCE")) {
                whereCondition.code_structure = structure.code;
            }

            if (userRole.includes("DISTRICT")) {
                const structures = await prisma.structure.findMany({
                    where: { code_parent: structure.code },
                    select: { code: true }
                });
                whereCondition.code_structure = {
                    in: structures.map(s => s.code)
                };
            }
        }

        // ============================
        //  DATA (TPE + CARTE) (avec tous les filtres)
        // ============================
        const [
            stockTPE, maintenanceTPE, circulationTPE, restitutionTPE,
            stockCarte, maintenanceCarte, circulationCarte
        ] = await Promise.all([
            prisma.stock_tpe.findMany({
                where: {
                    ...whereCondition,
                    ...(numeroSerie && { numeroserietpe: numeroSerie }),
                    ...(etat && { etat_tpe: etat })
                }
            }),

            prisma.suivi_maintenance_tpe.findMany({
                where: {
                    ...whereCondition,
                    ...(startDate && { date_panne: { gte: startDate, lte: endDate } })
                }
            }),

            prisma.circulation_tpe.findMany({ where: whereCondition }),
            prisma.restitution_reconfig_tpe.findMany({ where: whereCondition }),

            prisma.stock_carte.findMany({ where: whereCondition }),
            prisma.suivi_maintenance_cartes.findMany({ where: whereCondition }),
            prisma.circulation_carte.findMany({ where: whereCondition })
        ]);

        // ============================
        //  LOGIQUE MÉTIER
        // ============================
        const isPanne = (e) =>
            e && (e.toUpperCase().includes("PANNE") || e.toUpperCase().includes("EN_COURS"));

        const isNonFonctionnel = (e) =>
            e && (
                e.toUpperCase().includes("VOLE") ||
                e.toUpperCase().includes("ENDOMMAGE") ||
                e.toUpperCase().includes("PERDU") ||
                e.toUpperCase().includes("PANNE") ||
                e.toUpperCase().includes("TRAITEMENT") ||
                e.toUpperCase().includes("RAPAT")
            );

        // ============================
        //  TPE
        // ============================
        const totalTPE = stockTPE.length;

        const panneSetTPE = new Set(maintenanceTPE.filter(m => isPanne(m.etat_panne)).map(m => m.numeroserietpe));
        const nonFonctionnelSetTPE = new Set(maintenanceTPE.filter(m => isNonFonctionnel(m.etat_panne)).map(m => m.numeroserietpe));
        const circulationSetTPE = new Set(circulationTPE.map(c => c.numero_serie_tpe).filter(Boolean));
        const restitutionSetTPE = new Set(restitutionTPE.map(r => r.n_serie_tpe).filter(Boolean));

        const tauxPanneTPE = totalTPE ? ((panneSetTPE.size / totalTPE) * 100).toFixed(2) : 0;

        // ============================
        //  CARTE
        // ============================
        const totalCarte = stockCarte.length;

        const panneSetCarte = new Set(maintenanceCarte.filter(m => isPanne(m.etat_carte)).map(m => m.numero_carte));
        const nonFonctionnelSetCarte = new Set(maintenanceCarte.filter(m => isNonFonctionnel(m.etat_carte)).map(m => m.numero_carte));
        const circulationSetCarte = new Set(circulationCarte.filter(c => c.etat?.includes("CIRCULATION")).map(c => c.numero_carte));

        const tauxPanneCarte = totalCarte ? ((panneSetCarte.size / totalCarte) * 100).toFixed(2) : 0;

        // ============================
        //  STATS PAR STRUCTURE  (détail rapports)
        // ============================
        const statsStructure = {};

        stockTPE.forEach(t => {
            const key = t.code_structure || "UNKNOWN";
            if (!statsStructure[key]) {
                statsStructure[key] = { total: 0, pannes: 0 };
            }
            statsStructure[key].total++;
        });

        maintenanceTPE.forEach(m => {
            if (isPanne(m.etat_panne)) {
                const key = m.structure_concerne || "UNKNOWN";
                if (!statsStructure[key]) {
                    statsStructure[key] = { total: 0, pannes: 0 };
                }
                statsStructure[key].pannes++;
            }
        });

        // ============================
        //  TOP & WORST STATIONS  (détail rapports)
        // ============================
        const stationMap = {};
        maintenanceTPE.forEach(m => {
            const station = m.code_station || "UNKNOWN";
            stationMap[station] = (stationMap[station] || 0) + 1;
        });

        const topStations = Object.entries(stationMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([station, count]) => ({ station, count }));

        const worstStations = Object.entries(stationMap)
            .sort((a, b) => b[1] - a[1])
            .slice(-5)
            .map(([station, count]) => ({ station, count }));

        // ============================
        //  DÉCHARGE PAR JOUR  (détail rapports)
        // ============================
        const dechargeData = await prisma.ligne_decharge_tpe_type1.findMany({
            select: { numero_decharge: true }
        });

        const dechargeMap = {};
        dechargeData.forEach(d => {
            const key = d.numero_decharge;
            dechargeMap[key] = (dechargeMap[key] || 0) + 1;
        });

        const dechargeParJour = Object.entries(dechargeMap).map(([k, v]) => ({
            jour: k,
            total: v
        }));
        // ============================
        //  ALERTES (TPE + CARTE)
        // ============================
        const now = new Date();
        const alertes = [];

        const buildAlertes = (maintenanceData, typePrefix) => {
            const incidentsMap = {};

            maintenanceData.forEach(m => {
                const numero = typePrefix === "TPE" ? m.numeroserietpe : m.numero_carte;
                const etatField = typePrefix === "TPE" ? m.etat_panne : m.etat_carte;

                if (!numero) return;

                incidentsMap[numero] = (incidentsMap[numero] || 0) + 1;

                //  Non réparé > 25 jours (TPE + CARTE)
                if (m.date_panne) {
                    const diff = (now - new Date(m.date_panne)) / (1000 * 60 * 60 * 24);
                    if (diff >= 25) {
                        alertes.push({
                            type: `${typePrefix}_NON_REPARE`,
                            numero,
                            jours: Math.floor(diff)
                        });
                    }
                }

                //  Non fonctionnel
                if (isNonFonctionnel(etatField)) {
                    alertes.push({
                        type: `${typePrefix}_NON_FONCTIONNEL`,
                        numero
                    });
                }
            });

            //  Récurent >=3
            Object.entries(incidentsMap).forEach(([numero, count]) => {
                if (count >= 3) {
                    alertes.push({
                        type: `${typePrefix}_RECURRENT`,
                        numero,
                        count
                    });
                }
            });
        };

        buildAlertes(maintenanceTPE, "TPE");
        buildAlertes(maintenanceCarte, "CARTE");
        // ============================
        // PIE CHART  (aussi disponible dans rapports)
        // ============================
        const pieChart = [
            { name: "TPE_EN_PANNE", value: panneSetTPE.size },
            { name: "TPE_NON_FONCTIONNEL", value: nonFonctionnelSetTPE.size },
            { name: "TPE_EN_CIRCULATION", value: circulationSetTPE.size },
            { name: "TPE_RESTITUE", value: restitutionSetTPE.size },
            { name: "CARTE_EN_PANNE", value: panneSetCarte.size },
            { name: "CARTE_NON_FONCTIONNEL", value: nonFonctionnelSetCarte.size },
            { name: "CARTE_EN_CIRCULATION", value: circulationSetCarte.size }
        ];
        // ============================
        //  EVOLUTION DES PANNES PAR MOIS (TPE + CARTE)
        // ============================

        const evolutionMap = {};

        //  TPE
        maintenanceTPE.forEach(m => {
            if (!m.date_panne) return;

            const d = new Date(m.date_panne);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

            if (!evolutionMap[key]) {
                evolutionMap[key] = { mois: key, TPE: 0, CARTE: 0 };
            }

            if (isPanne(m.etat_panne)) {
                evolutionMap[key].TPE++;
            }
        });

        //  CARTE
        maintenanceCarte.forEach(m => {
            if (!m.date_panne) return;

            const d = new Date(m.date_panne);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

            if (!evolutionMap[key]) {
                evolutionMap[key] = { mois: key, TPE: 0, CARTE: 0 };
            }

            if (isPanne(m.etat_carte)) {
                evolutionMap[key].CARTE++;
            }
        });

        //  convertir en tableau trié
        const evolutionPannes = Object.values(evolutionMap)
            .sort((a, b) => a.mois.localeCompare(b.mois));

        // ============================
        //  RÉPONSE RAPPORTS
        // ============================
        res.json({
            rapports: {

                //  TPE
                TPE: {
                    total: totalTPE,
                    taux_panne: tauxPanneTPE + "%",
                    en_panne: panneSetTPE.size,
                    non_fonctionnel: nonFonctionnelSetTPE.size,
                    en_circulation: circulationSetTPE.size,
                    restitue: restitutionSetTPE.size
                },

                // CARTE
                CARTE: {
                    total: totalCarte,
                    taux_panne: tauxPanneCarte + "%",
                    en_panne: panneSetCarte.size,
                    non_fonctionnel: nonFonctionnelSetCarte.size,
                    en_circulation: circulationSetCarte.size
                },

                //  GLOBAL 
                global: {
                    total_tpe: totalTPE,
                    total_carte: totalCarte
                },

                // Détails exclusifs aux rapports
                structures: statsStructure,
                top_stations: topStations,
                worst_stations: worstStations,
                decharge_par_jour: dechargeParJour,
                evolution_pannes: evolutionPannes,
                alertes,
                pieChart,

                filtres_appliques: {
                    periode: periode || null,
                    dateDebut: dateDebut || null,
                    dateFin: dateFin || null,
                    etat: etat || null,
                    numeroSerie: numeroSerie || null
                }
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = { getRapportsTPE };