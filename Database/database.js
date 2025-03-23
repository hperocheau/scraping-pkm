const path = require('path');
const fs = require('fs');
const dbPath = path.join(__dirname, 'data.json');

class Database {
    constructor() {
        this.ensureFileExists();
        this.data = this.loadData();
    }

    ensureFileExists() {
        if (!fs.existsSync(dbPath)) {
            fs.writeFileSync(dbPath, JSON.stringify([], null, 2));
        }
    }

    loadData() {
        try {
            const data = fs.readFileSync(dbPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Erreur lors de la lecture du fichier:', error);
            return [];
        }
    }

    getData() {
        return this.data;
    }

    saveData(newData) {
        try {
            fs.writeFileSync(dbPath, JSON.stringify(newData, null, 2));
            this.data = newData;
        } catch (error) {
            console.error('Erreur lors de la sauvegarde des données:', error);
            throw error;
        }
    }
}

module.exports = new Database();
