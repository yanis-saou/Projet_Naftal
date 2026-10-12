BEGIN;

-- 1. STRUCTURES
INSERT INTO STRUCTURE (code, nom_structure, type_structure)
SELECT DISTINCT TRIM(code), TRIM(nom_structure), UPPER(TRIM(type_structure))
FROM structure_import
WHERE code IS NOT NULL 
ON CONFLICT (code) DO NOTHING;

-- 2. MIGRATION DES TPE (Sécurisée)
WITH clean_tpe AS (
    SELECT DISTINCT ON (TRIM("N_serie TPE")) *
    FROM tpe_import 
    WHERE "N_serie TPE" NOT LIKE 'Ex:%' 
      AND "N_serie TPE" IS NOT NULL
),
ins_stock_tpe AS (
    -- Étape A : Insertion dans la table parente (STOCK_EQUIPEMENT)
    INSERT INTO STOCK_EQUIPEMENT (type_entite, etat, idStructureActuelle, dateReception)
    SELECT 
        'TPE', 
        'Neuf', 
        s.idStructure, 
        CURRENT_DATE
    FROM clean_tpe t
    JOIN STRUCTURE s ON TRIM(t."Libelle_TPE") = TRIM(s.nom_structure) 
    RETURNING idEquipement
)
-- Étape B : Insertion dans la table enfant (DETAIL_TPE)
INSERT INTO DETAIL_TPE (
    idEquipement, 
    numeroSerieTPE, 
    idTPE, 
    numeroCompteBancaire, 
    nom_commercial, 
    numeroContrat
)
SELECT 
    i.idEquipement, 
    TRIM(c."N_serie TPE"), 
    TRIM(c."ID_Terminal"), 
    TRIM(c."N_ Compte"), 
    TRIM(c."Nom_Commercial"), 
    TRIM(c."N_Contrat")
FROM (SELECT idEquipement, row_number() OVER () as rn FROM ins_stock_tpe) i
JOIN (
    SELECT "N_serie TPE", "ID_Terminal", "N_ Compte", "Nom_Commercial", "N_Contrat", 
    row_number() OVER () as rn 
    FROM clean_tpe
) c ON i.rn = c.rn
ON CONFLICT (numeroSerieTPE) DO NOTHING;

-- 3. MIGRATION DES CARTES (Sécurisée)
WITH clean_carte AS (
    SELECT DISTINCT ON (TRIM("Porteur (N)")) * FROM carte_import
    WHERE "Code_Entite" IS NOT NULL 
    AND "Porteur (N)" NOT LIKE 'Ex:%'
),
ins_stock_carte AS (
    INSERT INTO STOCK_EQUIPEMENT (type_entite, etat, idstructureactuelle, datereception)
    SELECT 'CARTE', 'En stock', s.idstructure, CURRENT_DATE
    FROM clean_carte c
    JOIN STRUCTURE s ON TRIM(c."Code_Entite") = s.code
    RETURNING idequipement
)
INSERT INTO DETAIL_CARTE (idequipement, numerocarte, typecarte, codeclient, raisonsocialeclient)
SELECT 
    i.idequipement, 
    TRIM(c."Porteur (N)"), 
    'Véhiculé', 
    TRIM(c."Code_Entite"), 
    TRIM(c."Raison_Client")
FROM (SELECT idequipement, row_number() OVER () as rn FROM ins_stock_carte) i
JOIN (SELECT "Porteur (N)", "Code_Entite", "Raison_Client", row_number() OVER () as rn FROM clean_carte) c ON i.rn = c.rn
ON CONFLICT (numerocarte) DO NOTHING;

COMMIT;