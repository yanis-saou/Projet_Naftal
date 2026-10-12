const prisma = require('./src/config/prisma');

async function main() {
  // Voir les statuts existants
  const statuts = await prisma.Status.findMany();
  console.log('Statuts existants:', statuts);
  
  // Créer les statuts manquants
  const statutsNecessaires = ['EN_COURS', 'En attente', 'Reçue', 'Annulée'];
  for (const libelle of statutsNecessaires) {
    await prisma.Status.upsert({
      where: { libelle },
      update: {},
      create: { libelle },
    });
  }
  console.log('Statuts créés/vérifiés ✅');
}

main().finally(() => prisma.$disconnect());
