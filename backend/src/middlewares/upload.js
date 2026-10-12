const multer = require('multer');
const path = require('path');

const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'text/csv',
            'application/csv',
            'text/plain',
        ];
        const ext = path.extname(file.originalname).toLowerCase();
        const allowedExts = ['.xlsx', '.xls', '.csv'];

        if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Seuls les fichiers Excel (.xlsx / .xls) ou CSV (.csv) sont acceptés.'), false);
        }
    },
    limits: { fileSize: 5 * 1024 * 1024 }
});

module.exports = upload;