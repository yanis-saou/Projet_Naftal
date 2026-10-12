const prisma = require('../config/prisma');

// 🔹 Récupère un DPE avec toute sa hiérarchie et les stats
const getDPEWithDistricts = async (req, res) => {
    try {
        const { idOrCode } = req.params;
        const user = req.user;
        if (!user) return res.status(401).json({ error: "Non autorisé" });

        const { role, id_structure: userStructureId } = user;

        const userStructure = await prisma.structure.findUnique({
            where: { idstructure: userStructureId }
        });
        if (!userStructure) return res.status(404).json({ error: "Structure utilisateur introuvable" });

        // Définir la clause WHERE pour identifier le DPE ou la structure
        const whereClause = isNaN(parseInt(idOrCode))
            ? { code: idOrCode }
            : { OR: [{ idstructure: parseInt(idOrCode) }, { code: idOrCode }] };

        // Récupérer la structure demandée
        const dpe = await prisma.structure.findFirst({
            where: whereClause,
            include: {
                utilisateur: { select: { nom: true, prenom: true, email: true, role: true } },
                other_structure: {
                    include: {
                        structure: {
                            include: {
                                stock_carte: true,
                                stock_tpe_stock_tpe_code_structureTostructure: true,
                                stock_tpe_stock_tpe_districtTostructure: true,
                                ligne_decharge_tpe_type1: true,
                                ligne_decharge_tpe_type2_ligne_decharge_tpe_type2_structureTostructure: true,
                                ligne_decharge_tpe_type3: true,
                                ligne_decharge_tpe_type4_ligne_decharge_tpe_type4_str_ancienneTostructure: true,
                                ligne_decharge_tpe_type4_ligne_decharge_tpe_type4_str_nouvelleTostructure: true,
                                ligne_decharge_carte_type1: true,
                                ligne_decharge_carte_type2_ligne_decharge_carte_type2_structureTostructure: true,
                                ligne_decharge_carte_type3_ligne_decharge_carte_type3_structureTostructure: true,
                                suivi_maintenance_tpe_suivi_maintenance_tpe_districtTostructure: true,
                                suivi_maintenance_tpe_suivi_maintenance_tpe_structure_concerneTostructure: true,
                                suivi_maintenance_cartes: true,
                                station: true
                            }
                        },
                        other_structure: {
                            include: {
                                structure: {
                                    include: {
                                        stock_carte: true,
                                        stock_tpe_stock_tpe_code_structureTostructure: true,
                                        stock_tpe_stock_tpe_districtTostructure: true,
                                        ligne_decharge_tpe_type1: true,
                                        ligne_decharge_tpe_type2_ligne_decharge_tpe_type2_structureTostructure: true,
                                        ligne_decharge_tpe_type3: true,
                                        ligne_decharge_tpe_type4_ligne_decharge_tpe_type4_str_ancienneTostructure: true,
                                        ligne_decharge_tpe_type4_ligne_decharge_tpe_type4_str_nouvelleTostructure: true,
                                        ligne_decharge_carte_type1: true,
                                        ligne_decharge_carte_type2_ligne_decharge_carte_type2_structureTostructure: true,
                                        ligne_decharge_carte_type3_ligne_decharge_carte_type3_structureTostructure: true,
                                        suivi_maintenance_tpe_suivi_maintenance_tpe_districtTostructure: true,
                                        suivi_maintenance_tpe_suivi_maintenance_tpe_structure_concerneTostructure: true,
                                        suivi_maintenance_cartes: true,
                                        station: true
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!dpe) return res.status(404).json({ error: "DPE introuvable" });

        // ========================================
        // 🔐 Filtrage par rôle
        // ========================================
        let districts = dpe.other_structure || [];

        if (["ADMIN_DPE", "CONSULTANT_DPE"].includes(role)) {
            // accès total → rien à filtrer
        } else if (["MEMBRE_DISTRICT", "CONSULTANT_DISTRICT"].includes(role)) {
            districts = districts.filter(d => d.idstructure === userStructureId);
        } else if (["MEMBRE_ANTENNE", "CONSULTANT_ANTENNE"].includes(role)) {
            districts = districts.map(d => ({
                ...d,
                other_structure: (d.other_structure || []).filter(a => a.idstructure === userStructureId)
            })).filter(d => d.other_structure.length > 0);
        } else if (["MEMBRE_AGENCE", "CONSULTANT_AGENCE"].includes(role)) {
            districts = districts.map(d => ({
                ...d,
                other_structure: (d.other_structure || []).map(a => ({
                    ...a,
                    station: (a.structure ? [a.structure] : []).filter(s => s.idstructure === userStructureId)
                })).filter(a => a.station.length > 0)
            })).filter(d => d.other_structure.length > 0);
        } else {
            return res.status(403).json({ error: "Accès refusé" });
        }

        // ========================================
        // 🔹 Traitement des stats
        // ========================================
        let totalTPE = 0;
        let totalCartes = 0;

        const tpeStats = {};
        const carteStats = {};
        const incidentsReccurents = {};
        let cartesRenouvelees = 0;

        const isPanne = etat => etat && ["PANNE", "COURS", "DEFECT"].some(e => etat.toUpperCase().includes(e));

        const processStructures = (structures) => {
            if (!structures) return [];

            // ✅ transformer en tableau si objet
            if (!Array.isArray(structures)) {
                structures = [structures];
            }
            const processedStations = new Set();
            return structures.map(s => {
                if (!s) return null;

                if (processedStations.has(s.code_station)) return null;
                processedStations.add(s.code_station);
                totalTPE += s.stock_tpe?.length || 0;
                totalCartes += s.stock_carte?.length || 0;

                s.stock_tpe?.forEach(t => {
                    tpeStats[t.etat_tpe || "Inconnu"] = (tpeStats[t.etat_tpe] || 0) + 1;
                });

                s.stock_carte?.forEach(c => {
                    carteStats[c.etat || "Inconnu"] = (carteStats[c.etat] || 0) + 1;
                    if (c.date_remise && c.date_expiration) cartesRenouvelees++;
                });

                return s;
            });
        };

        districts.forEach(d => {
            d.other_structure?.forEach(a => {
                a.structureProcessed = processStructures(a.structure ? [a.structure] : []);
            });
            d.structureProcessed = processStructures(d.structure ? [d.structure] : []);
        });

        // ========================================
        // 🔹 Réponse finale
        // ========================================
        res.json({
            dpe: {
                id: dpe.idstructure,
                nom: dpe.nom_structure,
                code: dpe.code,
                type: dpe.type_structure,
                adresse: dpe.adresse,
                wilaya: dpe.wilaya,
                utilisateurs: dpe.utilisateur
            },
            stats: {
                total_tpe: totalTPE,
                total_cartes: totalCartes,
                repartition_tpe: tpeStats,
                repartition_cartes: carteStats,
                taux_renouvellement_cartes: totalCartes > 0 ? ((cartesRenouvelees / totalCartes) * 100).toFixed(2) + "%" : "0%"
            },
            districts
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

module.exports = {
    getDPEWithDistricts
};
//renvoie toutes les structures avec seulement les champs de base.

const getAllStructures = async (req, res) => {
    try {

        const user = req.user;

        if (!user) {
            return res.status(401).json({ error: "Non autorisé" });
        }

        const role = user.role;
        const userStructureId = user.id_structure;

        let structures;

        //  ADMIN → tout
        if (["ADMIN_DPE", "CONSULTANT_DPE"].includes(role)) {
            structures = await prisma.structure.findMany({
                select: {
                    idstructure: true,
                    nom_structure: true,
                    code: true,
                    type_structure: true
                }
            });
        }

        //  DISTRICT → district + enfants
        else if (["MEMBRE_DISTRICT", "CONSULTANT_DISTRICT"].includes(role)) {

            const district = await prisma.structure.findUnique({
                where: { idstructure: userStructureId },
                include: { other_structure: true }
            });

            structures = [
                district,
                ...district.other_structure
            ];
        }

        //  ANTENNE / AGENCE → seulement lui
        else {
            structures = await prisma.structure.findMany({
                where: { idstructure: userStructureId },
                select: {
                    idstructure: true,
                    nom_structure: true,
                    code: true,
                    type_structure: true
                }
            });
        }

        res.json({ structures });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};
//détails d’une structure spécifique selon idOrCode
const getStructureDetails = async (req, res) => {
    try {
        const { idOrCode } = req.params;
        const user = req.user;

        if (!user) {
            return res.status(401).json({ error: "Non autorisé" });
        }


        // récupérer la structure demandée
        const structure = await prisma.structure.findFirst({
            where: {
                OR: [
                    { idstructure: Number(idOrCode) || 0 },
                    { code: idOrCode }
                ]
            },
            include: {
                other_structure: {
                    include: {
                        other_structure: true,
                        station: true
                    }
                },
                station: true
            }
        });

        if (!structure) {
            return res.status(404).json({ error: "Structure introuvable" });
        }

        const role = user.role;
        const userStructureId = user.id_structure;

        // récupérer la structure de l'utilisateur
        const userStructure = await prisma.structure.findUnique({
            where: { idstructure: userStructureId },
            include: { other_structure: true }
        });

        // ============================
        //  FILTRAGE PAR ROLE
        // ============================

        //  ADMIN DPE / CONSULTANT DPE → accès total
        if (["ADMIN_DPE", "CONSULTANT_DPE"].includes(role)) {
            return res.json({ structure });
        }

        //  DISTRICT
        if (["MEMBRE_DISTRICT", "CONSULTANT_DISTRICT"].includes(role)) {

            // vérifier que la structure appartient à son district
            if (structure.code !== userStructure.code &&
                structure.code_parent !== userStructure.code) {
                return res.status(403).json({ error: "Accès refusé" });
            }

            return res.json({ structure });
        }

        //  ANTENNE
        if (["MEMBRE_ANTENNE", "CONSULTANT_ANTENNE"].includes(role)) {

            if (structure.idstructure !== userStructureId) {
                return res.status(403).json({ error: "Accès refusé" });
            }

            return res.json({ structure });
        }

        //  AGENCE
        if (["MEMBRE_AGENCE", "CONSULTANT_AGENCE"].includes(role)) {

            if (structure.idstructure !== userStructureId) {
                return res.status(403).json({ error: "Accès refusé" });
            }

            return res.json({ structure });
        }

        return res.status(403).json({ error: "Rôle non reconnu" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};
module.exports = {
    getDPEWithDistricts,
    getAllStructures,
    getStructureDetails
};
