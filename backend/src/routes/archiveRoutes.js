const express = require("express");
const router = express.Router();
const archiveController = require("../controllers/ArchiveController");
const { authMiddleware } = require("../middlewares/auth");

router.use(authMiddleware);

router.get("/", archiveController.getArchivedCards);
router.post("/", archiveController.archiveCard);
router.delete("/:id", archiveController.restoreArchivedCard);
router.delete("/", archiveController.clearArchives);

module.exports = router;
