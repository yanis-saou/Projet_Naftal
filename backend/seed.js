const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Démarrage du seeding...");

  // Vérifions d'abord les types de cartes existants
  console.log("📝 Vérification des types de cartes...");
  
  // Récupérer les IDs des types existants (optionnel, juste pour info)
  const nominatif = await prisma.type_carte.findFirst({ 
    where: { libelle: "Nominatif" } 
  });
  const matricule = await prisma.type_carte.findFirst({ 
    where: { libelle: "Matriculé" } 
  });
  const numerote = await prisma.type_carte.findFirst({ 
    where: { libelle: "Numéroté" } 
  });

  console.log("IDs des types:", {
    nominatif: nominatif?.id_type,
    matricule: matricule?.id_type,
    numerote: numerote?.id_type
  });

  // 1. Update existing cards with NULL nature_carte to "Nouvelle"
  const updateNatureResult = await prisma.stock_carte.updateMany({
    where: { nature_carte: null },
    data: {
      nature_carte: "Nouvelle",
      etat: "En_stock",
    },
  });
  console.log(`✅ ${updateNatureResult.count} cartes mises à jour avec nature_carte="Nouvelle"`);

  // 2. Add diverse test cards if they don't exist
  const testCards = [
    {
      numerocarte: "2026-TEST-001",
      nature_carte: "Nouvelle",
      type_carte: "Nominatif",  // String, pas un objet
      etat: "En_stock",
      statut: "Entree",
      seuil_minimum: 10,
      date_reception: new Date("2026-04-11"),
      date_expiration: new Date("2029-04-11"),
    },
    {
      numerocarte: "2026-TEST-002",
      nature_carte: "Renouveler",
      type_carte: "Matriculé",  // String
      etat: "En_circulation",
      statut: "Sortie",
      seuil_minimum: 5,
      date_reception: new Date("2023-04-11"),
      date_expiration: new Date("2026-04-11"),
    },
    {
      numerocarte: "2026-TEST-003",
      nature_carte: "Nouvelle",
      type_carte: "Nominatif",  // String
      etat: "En_stock",
      statut: "Entree",
      seuil_minimum: 20,
      date_reception: new Date("2026-04-01"),
      date_expiration: new Date("2029-04-01"),
    },
    {
      numerocarte: "2026-TEST-004",
      nature_carte: "Renouveler",
      type_carte: "Numéroté",  // String
      etat: "Expirée",
      statut: "Entree",
      seuil_minimum: 15,
      date_reception: new Date("2022-04-11"),
      date_expiration: new Date("2025-04-11"),
    },
  ];

  for (const card of testCards) {
    const exists = await prisma.stock_carte.findUnique({
      where: { numerocarte: card.numerocarte },
    });

    if (!exists) {
      await prisma.stock_carte.create({ data: card });
      console.log(`✅ Carte créée: ${card.numerocarte} (${card.type_carte})`);
    } else {
      console.log(`⏭️ Carte déjà existante: ${card.numerocarte}`);
    }
  }

  // 3. Statistiques
  const stats = await prisma.stock_carte.groupBy({
    by: ["nature_carte", "etat"],
    _count: true,
  });

  console.log("\n📊 Statistiques après seeding:");
  stats.forEach((stat) => {
    console.log(`  • nature_carte="${stat.nature_carte}" | etat="${stat.etat}" → ${stat._count} cartes`);
  });

  console.log("\n✨ Seeding complété!");
}

main()
  .catch((e) => {
    console.error("❌ Erreur durant le seeding:", e);
    process.exit(1);
  })
  .finally(async () => await prisma.$disconnect());