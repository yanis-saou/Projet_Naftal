BEGIN;

-- ==========================================================
-- 1. ANALYSE DES STRUCTURES (NAFTAL HIERARCHY)
-- ==========================================================

-- Districts
SELECT idStructure, code, nom_structure
FROM STRUCTURE
WHERE type_structure = 'DISTRICT';

-- Hiérarchie complète (Récursive)
WITH RECURSIVE hier AS (
    SELECT idStructure, code, nom_structure, type_structure, id_parent, 1 AS niveau
    FROM STRUCTURE
    WHERE type_structure = 'DPE'
    UNION ALL
    SELECT s.idStructure, s.code, s.nom_structure, s.type_structure, s.id_parent, h.niveau + 1
    FROM STRUCTURE s
    JOIN hier h ON s.id_parent = h.idStructure
)
SELECT * FROM hier ORDER BY niveau, idStructure;

-- Antennes de SETIF
SELECT s.nom_structure AS antenne, s.code
FROM STRUCTURE s
JOIN STRUCTURE d ON s.id_parent = d.idStructure
WHERE d.nom_structure LIKE '%SETIF%'
  AND s.type_structure = 'ANTENNE';

-- ==========================================================
-- 2. SUIVI DU STOCK (CARTES & TPE)
-- ==========================================================

-- Nombre total d’équipements par type
SELECT type_entite, COUNT(*) AS total
FROM STOCK_EQUIPEMENT
GROUP BY type_entite;

-- Pourcentage de CARTES par état
SELECT 
    etat, 
    COUNT(*) as nombre,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) || '%' as pourcentage
FROM STOCK_EQUIPEMENT
WHERE type_entite = 'CARTE'
GROUP BY etat;

-- Liste des cartes et leur localisation (Jointure Vitale)
SELECT 
    dc.numeroCarte, 
    dc.raisonSocialeClient, 
    e.etat, 
    s.nom_structure as localisation
FROM STOCK_EQUIPEMENT e
JOIN DETAIL_CARTE dc ON e.idEquipement = dc.idEquipement
JOIN STRUCTURE s ON e.idStructureActuelle = s.idStructure
WHERE e.type_entite = 'CARTE';

-- TPE sans informations bancaires (Erreur Import Excel)
SELECT e.idEquipement, dt.numeroSerieTPE, dt.idTPE
FROM STOCK_EQUIPEMENT e
JOIN DETAIL_TPE dt ON e.idEquipement = dt.idEquipement
WHERE dt.numeroCompteBancaire IS NULL OR dt.numeroCompteBancaire = '';

-- ==========================================================
-- 3. GESTION DES ANOMALIES & DÉLAIS
-- ==========================================================

-- Liste des équipements en panne avec diagnostic
SELECT 
    e.type_entite, 
    e.etat, 
    se.dateOperation, 
    se.diagnostic, 
    s.nom_structure
FROM SUIVI_EQUIPEMENT se
JOIN STOCK_EQUIPEMENT e ON se.idEquipement = e.idEquipement
JOIN STRUCTURE s ON e.idStructureActuelle = s.idStructure
WHERE e.etat = 'En panne';

-- Calcul des délais de traitement (Ancienneté de la panne)
SELECT 
    idEquipement,
    diagnostic,
    AGE(CURRENT_TIMESTAMP, dateOperation) as anciennete_panne
FROM SUIVI_EQUIPEMENT
WHERE etat_constate = 'En panne';

-- ==========================================================
-- 4. MOUVEMENTS & DÉCHARGES
-- ==========================================================

-- Afficher les décharges émises cette année
SELECT numeroDecharge, dateEmission, destinataire_nom, statut
FROM DECHARGE
WHERE annee = EXTRACT(YEAR FROM CURRENT_DATE);

-- Historique des 10 derniers mouvements
SELECT 
    h.type_entite, 
    h.ancien_etat, 
    h.nouvel_etat, 
    s1.nom_structure as de, 
    s2.nom_structure as vers, 
    h.dateMouvement
FROM HISTORIQUE_MOUVEMENTS h
LEFT JOIN STRUCTURE s1 ON h.ancienne_structure_id = s1.idStructure
LEFT JOIN STRUCTURE s2 ON h.nouvelle_structure_id = s2.idStructure
ORDER BY h.dateMouvement DESC
LIMIT 10;

--- DETAIL_TPE
SELECT 
    dt.numeroSerieTPE, 
    dt.idTPE, 
    dt.dateInstallation,
    CURRENT_DATE - dt.dateInstallation AS jours_en_service
FROM DETAIL_TPE dt
WHERE dt.dateInstallation < (CURRENT_DATE - INTERVAL '730 days')
ORDER BY jours_en_service DESC;

-- Nombre d'équipements total par District
SELECT 
    d.nom_structure AS district, 
    COUNT(e.idEquipement) AS volume_total
FROM STRUCTURE s
JOIN STRUCTURE d ON s.id_parent = d.idStructure
JOIN STOCK_EQUIPEMENT e ON e.idStructureActuelle = s.idStructure
WHERE d.type_structure = 'DISTRICT'
GROUP BY d.nom_structure
ORDER BY volume_total DESC;

-- Historique complet pour un équipement précis (ex: numeroSerie 'TPE-99')
SELECT 
    h.dateMouvement, 
    h.ancien_etat, 
    h.nouvel_etat,
    s_old.nom_structure AS provenance,
    s_new.nom_structure AS destination,
    h.commentaire
FROM HISTORIQUE_MOUVEMENTS h
LEFT JOIN STRUCTURE s_old ON h.ancienne_structure_id = s_old.idStructure
LEFT JOIN STRUCTURE s_new ON h.nouvelle_structure_id = s_new.idStructure
JOIN DETAIL_TPE dt ON h.idEquipement = dt.idEquipement
WHERE dt.numeroSerieTPE = 'METTRE_UN_NUMERO_ICI'
ORDER BY h.dateMouvement ASC;

-- Cartes en circulation sans structure d'attache (Erreur logique)
SELECT dc.numeroCarte, e.etat
FROM STOCK_EQUIPEMENT e
JOIN DETAIL_CARTE dc ON e.idEquipement = dc.idEquipement
WHERE e.etat = 'En circulation' 
  AND e.idStructureActuelle IS NULL;

  -- État des lieux des transferts
SELECT 
    d.statut, 
    COUNT(DISTINCT d.idDecharge) as nombre_decharges,
    COUNT(ld.idLigne) as total_equipements_transferees
FROM DECHARGE d
LEFT JOIN LIGNE_DECHARGE ld ON d.idDecharge = ld.idDecharge
GROUP BY d.statut;
COMMIT;