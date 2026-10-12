require('dotenv').config();
console.log("Ma database URL est :", process.env.DATABASE_URL ? "TROUVÉE ✅" : "VIDE ❌");
