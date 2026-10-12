/*
  Warnings:

  - You are about to drop the column `id_parent` on the `structure` table. All the data in the column will be lost.
  - The primary key for the `utilisateur` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `actif` on the `utilisateur` table. All the data in the column will be lost.
  - You are about to drop the column `datecreation` on the `utilisateur` table. All the data in the column will be lost.
  - You are about to drop the column `idstructure` on the `utilisateur` table. All the data in the column will be lost.
  - You are about to drop the column `idutilisateur` on the `utilisateur` table. All the data in the column will be lost.
  - You are about to drop the column `motdepasse` on the `utilisateur` table. All the data in the column will be lost.
  - You are about to drop the column `telephone` on the `utilisateur` table. All the data in the column will be lost.
  - You are about to alter the column `role` on the `utilisateur` table. The data in that column could be lost. The data in that column will be cast from `VarChar(50)` to `VarChar(20)`.
  - You are about to drop the `carte_import` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `decharge` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `detail_carte` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `detail_tpe` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `historique_mouvements` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ligne_decharge` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `stock_equipement` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `structure_import` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `suivi_carte` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `suivi_equipement` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `suivi_tpe` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `tpe_import` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `mot_de_passe` to the `utilisateur` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "decharge" DROP CONSTRAINT "decharge_iddestination_fkey";

-- DropForeignKey
ALTER TABLE "decharge" DROP CONSTRAINT "decharge_idsource_fkey";

-- DropForeignKey
ALTER TABLE "detail_carte" DROP CONSTRAINT "detail_carte_idequipement_fkey";

-- DropForeignKey
ALTER TABLE "detail_tpe" DROP CONSTRAINT "detail_tpe_idequipement_fkey";

-- DropForeignKey
ALTER TABLE "historique_mouvements" DROP CONSTRAINT "historique_mouvements_ancienne_structure_id_fkey";

-- DropForeignKey
ALTER TABLE "historique_mouvements" DROP CONSTRAINT "historique_mouvements_idequipement_fkey";

-- DropForeignKey
ALTER TABLE "historique_mouvements" DROP CONSTRAINT "historique_mouvements_nouvelle_structure_id_fkey";

-- DropForeignKey
ALTER TABLE "ligne_decharge" DROP CONSTRAINT "ligne_decharge_iddecharge_fkey";

-- DropForeignKey
ALTER TABLE "ligne_decharge" DROP CONSTRAINT "ligne_decharge_idequipement_fkey";

-- DropForeignKey
ALTER TABLE "stock_equipement" DROP CONSTRAINT "stock_equipement_idstructureactuelle_fkey";

-- DropForeignKey
ALTER TABLE "structure" DROP CONSTRAINT "structure_id_parent_fkey";

-- DropForeignKey
ALTER TABLE "suivi_carte" DROP CONSTRAINT "suivi_carte_idsuivi_fkey";

-- DropForeignKey
ALTER TABLE "suivi_equipement" DROP CONSTRAINT "suivi_equipement_idequipement_fkey";

-- DropForeignKey
ALTER TABLE "suivi_tpe" DROP CONSTRAINT "suivi_tpe_idsuivi_fkey";

-- DropForeignKey
ALTER TABLE "utilisateur" DROP CONSTRAINT "utilisateur_idstructure_fkey";

-- DropIndex
DROP INDEX "idx_structure_code";

-- AlterTable
ALTER TABLE "structure" DROP COLUMN "id_parent",
ADD COLUMN     "code_parent" VARCHAR(50);

-- AlterTable
ALTER TABLE "utilisateur" DROP CONSTRAINT "utilisateur_pkey",
DROP COLUMN "actif",
DROP COLUMN "datecreation",
DROP COLUMN "idstructure",
DROP COLUMN "idutilisateur",
DROP COLUMN "motdepasse",
DROP COLUMN "telephone",
ADD COLUMN     "cree_par_id" INTEGER,
ADD COLUMN     "date_creation" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "date_suppression" TIMESTAMP(6),
ADD COLUMN     "id_structure" INTEGER,
ADD COLUMN     "id_utilisateur" SERIAL NOT NULL,
ADD COLUMN     "mot_de_passe" TEXT NOT NULL,
ADD COLUMN     "structure_cree" VARCHAR(255),
ADD COLUMN     "supprime" BOOLEAN DEFAULT false,
ADD COLUMN     "supprime_par" INTEGER,
ALTER COLUMN "nom" DROP NOT NULL,
ALTER COLUMN "prenom" DROP NOT NULL,
ALTER COLUMN "role" SET DATA TYPE VARCHAR(20),
ADD CONSTRAINT "utilisateur_pkey" PRIMARY KEY ("id_utilisateur");

-- DropTable
DROP TABLE "carte_import";

-- DropTable
DROP TABLE "decharge";

-- DropTable
DROP TABLE "detail_carte";

-- DropTable
DROP TABLE "detail_tpe";

-- DropTable
DROP TABLE "historique_mouvements";

-- DropTable
DROP TABLE "ligne_decharge";

-- DropTable
DROP TABLE "stock_equipement";

-- DropTable
DROP TABLE "structure_import";

-- DropTable
DROP TABLE "suivi_carte";

-- DropTable
DROP TABLE "suivi_equipement";

-- DropTable
DROP TABLE "suivi_tpe";

-- DropTable
DROP TABLE "tpe_import";

-- CreateTable
CREATE TABLE "commande_cib" (
    "id" SERIAL NOT NULL,
    "numero_commande" VARCHAR(50) NOT NULL,
    "code_station" VARCHAR(50),
    "nomcommercial" VARCHAR(255),
    "tarification" VARCHAR(20) DEFAULT 'STANDARD',
    "n_compte_bancaire" VARCHAR(50),
    "date_commande" DATE DEFAULT CURRENT_DATE,
    "statut" VARCHAR(20) DEFAULT 'EN_COURS',
    "id_structure_emmetrice" INTEGER,
    "id_validateur_dpe" INTEGER,
    "date_validation" TIMESTAMP(6),

    CONSTRAINT "commande_cib_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historique_carte" (
    "id_historique" SERIAL NOT NULL,
    "numerocarte" VARCHAR(50),
    "ancienetat" VARCHAR(50),
    "nouveletat" VARCHAR(50),
    "dateoperation" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "commentaire" TEXT,
    "id_utilisateur" INTEGER,
    "structure_ancienne" TEXT,
    "structure_actuelle" TEXT,

    CONSTRAINT "historique_carte_pkey" PRIMARY KEY ("id_historique")
);

-- CreateTable
CREATE TABLE "ligne_decharge_carte_type1" (
    "id_ligne_c1" SERIAL NOT NULL,
    "numero_decharge" VARCHAR(50),
    "numero_carte" VARCHAR(50),
    "structure_concernee" VARCHAR(100),
    "district_concerne" VARCHAR(100),
    "commentaire" TEXT,

    CONSTRAINT "ligne_decharge_carte_type1_pkey" PRIMARY KEY ("id_ligne_c1")
);

-- CreateTable
CREATE TABLE "ligne_decharge_carte_type2" (
    "id_ligne_c2" SERIAL NOT NULL,
    "numero_decharge" VARCHAR(50),
    "numero_carte" VARCHAR(50),
    "anomalie_constatee" TEXT,

    CONSTRAINT "ligne_decharge_carte_type2_pkey" PRIMARY KEY ("id_ligne_c2")
);

-- CreateTable
CREATE TABLE "ligne_decharge_carte_type3" (
    "id_ligne_c3" SERIAL NOT NULL,
    "numero_decharge" VARCHAR(50),
    "numero_carte_origine" VARCHAR(50),
    "carte_substitution" VARCHAR(50),
    "diagnostic_carte" TEXT,
    "etat_final" VARCHAR(50),

    CONSTRAINT "ligne_decharge_carte_type3_pkey" PRIMARY KEY ("id_ligne_c3")
);

-- CreateTable
CREATE TABLE "ligne_decharge_tpe_type1" (
    "id_ligne_t1" SERIAL NOT NULL,
    "numero_decharge" VARCHAR(50),
    "numero_serie_tpe" VARCHAR(50),
    "id_tpe_logiciel" VARCHAR(50),
    "structure_concernee" VARCHAR(100),
    "district_concerne" VARCHAR(100),
    "commentaire" TEXT,

    CONSTRAINT "ligne_decharge_tpe_type1_pkey" PRIMARY KEY ("id_ligne_t1")
);

-- CreateTable
CREATE TABLE "ligne_decharge_tpe_type2" (
    "id_ligne_t2" SERIAL NOT NULL,
    "numero_decharge" VARCHAR(50),
    "numero_serie_tpe" VARCHAR(50),
    "anomalie_constatee" TEXT,

    CONSTRAINT "ligne_decharge_tpe_type2_pkey" PRIMARY KEY ("id_ligne_t2")
);

-- CreateTable
CREATE TABLE "ligne_decharge_tpe_type3" (
    "id_ligne_t3" SERIAL NOT NULL,
    "numero_decharge" VARCHAR(50),
    "numero_serie_tpe" VARCHAR(50),
    "diagnostic_tpe" TEXT,
    "etat_final" VARCHAR(50),

    CONSTRAINT "ligne_decharge_tpe_type3_pkey" PRIMARY KEY ("id_ligne_t3")
);

-- CreateTable
CREATE TABLE "sim" (
    "numerosim" VARCHAR(50) NOT NULL,
    "idstation" INTEGER,
    "statut" VARCHAR(50) DEFAULT 'ACTIF',
    "numeroserietpe" VARCHAR(50),

    CONSTRAINT "sim_pkey" PRIMARY KEY ("numerosim")
);

-- CreateTable
CREATE TABLE "station" (
    "idstation" SERIAL NOT NULL,
    "code_station" VARCHAR(50) NOT NULL,
    "nom_station" VARCHAR(255),
    "idstructure" INTEGER,
    "district" VARCHAR(100),
    "wilaya" VARCHAR(100),
    "adresse" TEXT,
    "geo_longitude" DECIMAL(9,6),
    "geo_latitude" DECIMAL(9,6),
    "n_compte_bancaire" VARCHAR(50) NOT NULL,

    CONSTRAINT "station_pkey" PRIMARY KEY ("idstation")
);

-- CreateTable
CREATE TABLE "stock_carte" (
    "numerocarte" VARCHAR(50) NOT NULL,
    "idstation" INTEGER,
    "district" VARCHAR(100),
    "code_structure" VARCHAR(50),
    "raisonsocialestructure" VARCHAR(255),
    "code_client" VARCHAR(50),
    "raisonsocialeclient" VARCHAR(255),
    "numeroporteur" VARCHAR(50),
    "libelle_entite" VARCHAR(255),
    "motmeth" VARCHAR(50),
    "date_reception" DATE DEFAULT CURRENT_DATE,
    "date_expiration" DATE,
    "date_remise" DATE,
    "amortissement" INTEGER,
    "etat_carte" VARCHAR(50) DEFAULT 'EN_STOCK',
    "idstk" VARCHAR(50),
    "statut" VARCHAR(50) DEFAULT 'Entree',
    "numerocartesubstitution" VARCHAR(50),
    "seuil_minimum" INTEGER DEFAULT 10,

    CONSTRAINT "stock_carte_pkey" PRIMARY KEY ("numerocarte")
);

-- CreateTable
CREATE TABLE "stock_tpe" (
    "numeroserietpe" VARCHAR(50) NOT NULL,
    "idstation" INTEGER,
    "idtpe" VARCHAR(50),
    "modele" VARCHAR(50),
    "nomcommercial" VARCHAR(255),
    "datereception" DATE DEFAULT CURRENT_DATE,
    "dateexpiration" DATE,
    "amortissement" INTEGER,
    "n_compte" VARCHAR(50),
    "n_contrat" VARCHAR(50),
    "etat_tpe" VARCHAR(50) DEFAULT 'EN_STOCK',
    "libelle_tpe" VARCHAR(50),
    "adresse" TEXT,
    "tarification" VARCHAR(50),
    "version_logiciel" VARCHAR(50),
    "type_connexion" VARCHAR(20),

    CONSTRAINT "stock_tpe_pkey" PRIMARY KEY ("numeroserietpe")
);

-- CreateTable
CREATE TABLE "suivi_maintenance_cartes" (
    "id_suivi" SERIAL NOT NULL,
    "district" VARCHAR(100),
    "numerocarte" VARCHAR(50),
    "date_anomalie" DATE DEFAULT CURRENT_DATE,
    "etat_panne" VARCHAR(50),
    "numerocartesubstitution" VARCHAR(50),
    "date_remise_client" DATE,

    CONSTRAINT "suivi_maintenance_cartes_pkey" PRIMARY KEY ("id_suivi")
);

-- CreateTable
CREATE TABLE "suivi_maintenance_tpe" (
    "id_maintenance" SERIAL NOT NULL,
    "idtpe" VARCHAR(50),
    "date_panne" DATE DEFAULT CURRENT_DATE,
    "diagnostic" TEXT,
    "etat_reparation" VARCHAR(50) DEFAULT 'EN_COURS',
    "date_fin_reparation" DATE,
    "technicien" VARCHAR(100),
    "duree_trait" INTEGER,
    "duree_immobilisation" INTEGER,

    CONSTRAINT "suivi_maintenance_tpe_pkey" PRIMARY KEY ("id_maintenance")
);

-- CreateTable
CREATE TABLE "decharge_carte" (
    "id_decharge_carte" SERIAL NOT NULL,
    "numero_decharge" VARCHAR(50) NOT NULL,
    "source" VARCHAR(100),
    "destination" VARCHAR(100),
    "nom_beneficiaire" VARCHAR(100),
    "fonction_beneficiaire" VARCHAR(100),
    "date_sortie" DATE DEFAULT CURRENT_DATE,
    "date_creation" DATE,
    "motif_transfert" VARCHAR(100),

    CONSTRAINT "decharge_carte_pkey" PRIMARY KEY ("id_decharge_carte")
);

-- CreateTable
CREATE TABLE "decharge_tpe" (
    "id_decharge_tpe" SERIAL NOT NULL,
    "numero_decharge" VARCHAR(50) NOT NULL,
    "source" VARCHAR(100),
    "destination" VARCHAR(100),
    "nom_beneficiaire" VARCHAR(100),
    "fonction_beneficiaire" VARCHAR(100),
    "date_sortie" DATE DEFAULT CURRENT_DATE,
    "date_creation" DATE,
    "etat_materiel_sortie" VARCHAR(50) DEFAULT 'BON_ETAT',

    CONSTRAINT "decharge_tpe_pkey" PRIMARY KEY ("id_decharge_tpe")
);

-- CreateTable
CREATE TABLE "historique_tpe" (
    "id_historique" SERIAL NOT NULL,
    "numeroserietpe" VARCHAR(50),
    "ancienetat" VARCHAR(50),
    "nouveletat" VARCHAR(50),
    "dateoperation" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "commentaire" TEXT,
    "id_utilisateur" INTEGER,

    CONSTRAINT "historique_tpe_pkey" PRIMARY KEY ("id_historique")
);

-- CreateTable
CREATE TABLE "email_queue" (
    "id_email" SERIAL NOT NULL,
    "destinataire" VARCHAR(150),
    "sujet" VARCHAR(255),
    "corps_message" TEXT,
    "statut" VARCHAR(20) DEFAULT 'EN_ATTENTE',
    "date_creation" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "date_envoi" TIMESTAMP(6),
    "id_commande" INTEGER,

    CONSTRAINT "email_queue_pkey" PRIMARY KEY ("id_email")
);

-- CreateTable
CREATE TABLE "ligne_commande_cib" (
    "id_ligne" SERIAL NOT NULL,
    "id_commande" INTEGER,
    "modele_tpe" VARCHAR(50),
    "quantite" INTEGER DEFAULT 1,

    CONSTRAINT "ligne_commande_cib_pkey" PRIMARY KEY ("id_ligne")
);

-- CreateIndex
CREATE UNIQUE INDEX "commande_cib_numero_commande_key" ON "commande_cib"("numero_commande");

-- CreateIndex
CREATE UNIQUE INDEX "station_code_station_key" ON "station"("code_station");

-- CreateIndex
CREATE UNIQUE INDEX "unique_compte_bancaire" ON "station"("n_compte_bancaire");

-- CreateIndex
CREATE UNIQUE INDEX "stock_carte_numerocarte_key" ON "stock_carte"("numerocarte");

-- CreateIndex
CREATE UNIQUE INDEX "stock_tpe_idtpe_key" ON "stock_tpe"("idtpe");

-- CreateIndex
CREATE UNIQUE INDEX "decharge_carte_numero_decharge_key" ON "decharge_carte"("numero_decharge");

-- CreateIndex
CREATE UNIQUE INDEX "decharge_tpe_numero_decharge_key" ON "decharge_tpe"("numero_decharge");

-- AddForeignKey
ALTER TABLE "structure" ADD CONSTRAINT "structure_code_parent_fkey" FOREIGN KEY ("code_parent") REFERENCES "structure"("code") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "commande_cib" ADD CONSTRAINT "commande_cib_code_station_fkey" FOREIGN KEY ("code_station") REFERENCES "station"("code_station") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "commande_cib" ADD CONSTRAINT "commande_cib_id_structure_emmetrice_fkey" FOREIGN KEY ("id_structure_emmetrice") REFERENCES "structure"("idstructure") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ligne_decharge_carte_type1" ADD CONSTRAINT "ligne_decharge_carte_type1_numero_carte_fkey" FOREIGN KEY ("numero_carte") REFERENCES "stock_carte"("numerocarte") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ligne_decharge_carte_type2" ADD CONSTRAINT "ligne_decharge_carte_type2_numero_carte_fkey" FOREIGN KEY ("numero_carte") REFERENCES "stock_carte"("numerocarte") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ligne_decharge_carte_type3" ADD CONSTRAINT "ligne_decharge_carte_type3_numero_carte_origine_fkey" FOREIGN KEY ("numero_carte_origine") REFERENCES "stock_carte"("numerocarte") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ligne_decharge_tpe_type1" ADD CONSTRAINT "ligne_decharge_tpe_type1_numero_serie_tpe_fkey" FOREIGN KEY ("numero_serie_tpe") REFERENCES "stock_tpe"("numeroserietpe") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ligne_decharge_tpe_type2" ADD CONSTRAINT "ligne_decharge_tpe_type2_numero_serie_tpe_fkey" FOREIGN KEY ("numero_serie_tpe") REFERENCES "stock_tpe"("numeroserietpe") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ligne_decharge_tpe_type3" ADD CONSTRAINT "ligne_decharge_tpe_type3_numero_serie_tpe_fkey" FOREIGN KEY ("numero_serie_tpe") REFERENCES "stock_tpe"("numeroserietpe") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sim" ADD CONSTRAINT "sim_idstation_fkey" FOREIGN KEY ("idstation") REFERENCES "station"("idstation") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sim" ADD CONSTRAINT "sim_numeroserietpe_fkey" FOREIGN KEY ("numeroserietpe") REFERENCES "stock_tpe"("numeroserietpe") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "station" ADD CONSTRAINT "station_idstructure_fkey" FOREIGN KEY ("idstructure") REFERENCES "structure"("idstructure") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_carte" ADD CONSTRAINT "stock_carte_code_structure_fkey" FOREIGN KEY ("code_structure") REFERENCES "structure"("code") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_carte" ADD CONSTRAINT "stock_carte_idstation_fkey" FOREIGN KEY ("idstation") REFERENCES "station"("idstation") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_tpe" ADD CONSTRAINT "stock_tpe_idstation_fkey" FOREIGN KEY ("idstation") REFERENCES "station"("idstation") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "email_queue" ADD CONSTRAINT "email_queue_id_commande_fkey" FOREIGN KEY ("id_commande") REFERENCES "commande_cib"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ligne_commande_cib" ADD CONSTRAINT "ligne_commande_cib_id_commande_fkey" FOREIGN KEY ("id_commande") REFERENCES "commande_cib"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "utilisateur" ADD CONSTRAINT "fk_supprime_par" FOREIGN KEY ("supprime_par") REFERENCES "utilisateur"("id_utilisateur") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "utilisateur" ADD CONSTRAINT "fk_utilisateur_createur" FOREIGN KEY ("cree_par_id") REFERENCES "utilisateur"("id_utilisateur") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "utilisateur" ADD CONSTRAINT "utilisateur_id_structure_fkey" FOREIGN KEY ("id_structure") REFERENCES "structure"("idstructure") ON DELETE NO ACTION ON UPDATE NO ACTION;
